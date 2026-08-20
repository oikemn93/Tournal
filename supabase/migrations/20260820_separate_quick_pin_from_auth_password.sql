-- Separate the 6-digit quick-unlock PIN from the Supabase Auth password.
-- PIN material is private, bcrypt-hashed, rate-limited and never exposed through Data API.

create table if not exists private.user_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.user_pins from public, anon, authenticated;

create or replace function public.get_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row private.user_pins%rowtype;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if not exists (
    select 1 from public.platform_users u
    where u.id=v_uid and coalesce(u.is_suspended,false)=false
  ) then raise exception 'Compte inactif'; end if;

  select * into v_row from private.user_pins where user_id=v_uid;
  if not found then return jsonb_build_object('configured',false,'lockedUntil',null); end if;
  return jsonb_build_object(
    'configured',true,
    'lockedUntil',case when v_row.locked_until>now() then v_row.locked_until else null end
  );
end;
$$;

create or replace function public.set_quick_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then raise exception 'Le PIN doit contenir exactement 6 chiffres'; end if;
  if not exists (
    select 1 from public.platform_users u
    where u.id=v_uid
      and coalesce(u.is_suspended,false)=false
      and coalesce(u.must_change_password,false)=false
  ) then raise exception 'Compte non prêt pour la configuration du PIN'; end if;

  insert into private.user_pins(user_id,pin_hash,failed_attempts,locked_until,updated_at)
  values(v_uid,extensions.crypt(p_pin,extensions.gen_salt('bf',12)),0,null,now())
  on conflict(user_id) do update
    set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();
end;
$$;

create or replace function public.verify_quick_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row private.user_pins%rowtype;
  v_next integer;
  v_lock timestamptz;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
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

create or replace function public.reset_user_quick_pin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_target_is_owner boolean := false;
  v_authorized boolean := false;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if p_user_id is null then raise exception 'Utilisateur requis'; end if;

  select coalesce(u.is_super_admin,false) and not coalesce(u.is_suspended,false)
    into v_is_super from public.platform_users u where u.id=v_uid;
  select exists(select 1 from public.boutique_assignments a where a.user_id=p_user_id and a.role='owner')
    into v_target_is_owner;

  if v_is_super then
    v_authorized:=true;
  elsif not v_target_is_owner then
    select exists(
      select 1 from public.boutique_assignments target_a
      join public.boutique_assignments caller_a
        on caller_a.boutique_id=target_a.boutique_id
       and caller_a.user_id=v_uid
       and caller_a.role='owner'
      where target_a.user_id=p_user_id
    ) into v_authorized;
  end if;

  if not v_authorized then raise exception 'Accès refusé'; end if;
  delete from private.user_pins where user_id=p_user_id;
end;
$$;

revoke all on function public.get_pin_status() from public, anon;
revoke all on function public.set_quick_pin(text) from public, anon;
revoke all on function public.verify_quick_pin(text) from public, anon;
revoke all on function public.reset_user_quick_pin(uuid) from public, anon;
grant execute on function public.get_pin_status() to authenticated;
grant execute on function public.set_quick_pin(text) to authenticated;
grant execute on function public.verify_quick_pin(text) to authenticated;
grant execute on function public.reset_user_quick_pin(uuid) to authenticated;
