-- Bind the quick PIN to the current Supabase Auth session so refreshing or
-- calling start_app_session with the same JWT cannot clear an idle lock.

alter table private.app_sessions add column if not exists session_id uuid;
alter table private.app_sessions add column if not exists locked_at timestamptz;

create or replace function private.auth_has_active_app_session(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from private.app_sessions s
    where s.user_id=auth.uid()
      and s.boutique_id=p_boutique_id
      and s.expires_at>now()
      and s.locked_at is null
      and (s.session_id is null or s.session_id=nullif(auth.jwt()->>'session_id','')::uuid)
  );
$$;
revoke all on function private.auth_has_active_app_session(text) from public, anon, authenticated;

create or replace function public.start_app_session(p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  v_minutes int;
  v_expires timestamptz;
begin
  if v_user is null or not private.auth_has_boutique_access(p_boutique_id) then raise exception 'forbidden'; end if;
  select coalesce(session_minutes,720) into v_minutes from public.auth_settings where boutique_id=p_boutique_id;
  v_expires:=now()+make_interval(mins=>coalesce(v_minutes,720));

  insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id,locked_at)
  values(v_user,p_boutique_id,v_expires,now(),v_sid,null)
  on conflict(user_id,boutique_id) do update
    set expires_at=excluded.expires_at,
        last_seen_at=excluded.last_seen_at,
        locked_at=case
          when private.app_sessions.session_id is distinct from excluded.session_id then null
          else private.app_sessions.locked_at
        end,
        session_id=excluded.session_id;

  return jsonb_build_object(
    'expires_at',v_expires,
    'locked',coalesce((select locked_at is not null from private.app_sessions where user_id=v_user and boutique_id=p_boutique_id),false)
  );
end;
$$;

create or replace function public.lock_app_session(p_boutique_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  update private.app_sessions
  set locked_at=now(),last_seen_at=now()
  where user_id=v_uid
    and boutique_id=p_boutique_id
    and (session_id is null or session_id=v_sid);
end;
$$;

create or replace function public.validate_app_session(p_boutique_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.auth_has_boutique_access(p_boutique_id) then return false; end if;
  return private.auth_has_active_app_session(p_boutique_id);
end;
$$;

create or replace function public.verify_quick_pin(p_pin text,p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  v_row private.user_pins%rowtype;
  v_next integer;
  v_lock timestamptz;
  v_minutes int;
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if p_boutique_id is null or not private.auth_has_boutique_access(p_boutique_id) then raise exception 'Accès refusé'; end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then
    return jsonb_build_object('ok',false,'configured',true,'attemptsRemaining',0);
  end if;
  if not exists(select 1 from public.platform_users u where u.id=v_uid and coalesce(u.is_suspended,false)=false) then
    raise exception 'Compte inactif';
  end if;

  select * into v_row from private.user_pins where user_id=v_uid for update;
  if not found then return jsonb_build_object('ok',false,'configured',false,'attemptsRemaining',0); end if;
  if v_row.locked_until is not null and v_row.locked_until>now() then
    return jsonb_build_object('ok',false,'configured',true,'lockedUntil',v_row.locked_until,'attemptsRemaining',0);
  end if;

  if extensions.crypt(p_pin,v_row.pin_hash)=v_row.pin_hash then
    update private.user_pins set failed_attempts=0,locked_until=null,updated_at=now() where user_id=v_uid;
    select coalesce(session_minutes,720) into v_minutes from public.auth_settings where boutique_id=p_boutique_id;
    v_expires:=now()+make_interval(mins=>coalesce(v_minutes,720));
    insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id,locked_at)
    values(v_uid,p_boutique_id,v_expires,now(),v_sid,null)
    on conflict(user_id,boutique_id) do update
      set expires_at=excluded.expires_at,last_seen_at=excluded.last_seen_at,session_id=excluded.session_id,locked_at=null;
    return jsonb_build_object('ok',true,'configured',true,'attemptsRemaining',5);
  end if;

  v_next:=coalesce(v_row.failed_attempts,0)+1;
  if v_next>=5 then
    v_lock:=now()+interval '15 minutes';
    update private.user_pins set failed_attempts=0,locked_until=v_lock,updated_at=now() where user_id=v_uid;
    return jsonb_build_object('ok',false,'configured',true,'lockedUntil',v_lock,'attemptsRemaining',0);
  end if;
  update private.user_pins set failed_attempts=v_next,locked_until=null,updated_at=now() where user_id=v_uid;
  return jsonb_build_object('ok',false,'configured',true,'attemptsRemaining',5-v_next);
end;
$$;

revoke all on function public.lock_app_session(text) from public, anon;
revoke all on function public.verify_quick_pin(text,text) from public, anon;
grant execute on function public.lock_app_session(text) to authenticated;
grant execute on function public.verify_quick_pin(text,text) to authenticated;
