-- A lock must not be extendable by a page reload or an automatic heartbeat.
-- Once the configured inactivity duration has elapsed, the quick PIN no
-- longer reopens the session: a full Supabase Auth sign-in is required.

create or replace function public.start_app_session(p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id','')::uuid;
  v_minutes int;
  v_expires timestamptz;
  v_effective_expires timestamptz;
  v_locked boolean;
begin
  if v_user is null or v_sid is null or not private.auth_has_boutique_access(p_boutique_id) then
    raise exception 'forbidden';
  end if;

  select coalesce(session_minutes, 720) into v_minutes
  from public.auth_settings
  where boutique_id = p_boutique_id;
  v_expires := now() + make_interval(mins => coalesce(v_minutes, 720));

  insert into private.app_sessions(user_id, boutique_id, expires_at, last_seen_at, session_id, locked_at)
  values(v_user, p_boutique_id, v_expires, now(), v_sid, null)
  on conflict (user_id, boutique_id, session_id) do update
  set expires_at = case when private.app_sessions.locked_at is null then excluded.expires_at else private.app_sessions.expires_at end,
      last_seen_at = case when private.app_sessions.locked_at is null then excluded.last_seen_at else private.app_sessions.last_seen_at end
  returning expires_at, locked_at is not null into v_effective_expires, v_locked;

  insert into private.notification_session_context(session_id, user_id, boutique_id, updated_at)
  values(v_sid, v_user, p_boutique_id, now())
  on conflict (session_id) do update
  set user_id = excluded.user_id, boutique_id = excluded.boutique_id, updated_at = now();

  return jsonb_build_object('expires_at', v_effective_expires, 'locked', coalesce(v_locked, false));
end;
$$;

create or replace function public.verify_quick_pin(p_pin text, p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id','')::uuid;
  v_row private.user_pins%rowtype;
  v_next integer;
  v_lock timestamptz;
  v_minutes int;
  v_expires timestamptz;
begin
  if v_uid is null or v_sid is null then raise exception 'Connexion requise'; end if;
  if p_boutique_id is null or not private.auth_has_boutique_access(p_boutique_id) then raise exception 'Accès refusé'; end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'configured', true, 'attemptsRemaining', 0);
  end if;
  if not exists(select 1 from public.platform_users u where u.id = v_uid and coalesce(u.is_suspended, false) = false) then
    raise exception 'Compte inactif';
  end if;
  if not exists(
    select 1 from private.app_sessions s
    where s.user_id = v_uid and s.boutique_id = p_boutique_id and s.session_id = v_sid and s.expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'configured', true, 'sessionExpired', true);
  end if;

  select * into v_row from private.user_pins where user_id = v_uid for update;
  if not found then return jsonb_build_object('ok', false, 'configured', false, 'attemptsRemaining', 0); end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'configured', true, 'lockedUntil', v_row.locked_until, 'attemptsRemaining', 0);
  end if;

  if extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash then
    update private.user_pins set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = v_uid;
    select coalesce(session_minutes, 720) into v_minutes from public.auth_settings where boutique_id = p_boutique_id;
    v_expires := now() + make_interval(mins => coalesce(v_minutes, 720));
    insert into private.app_sessions(user_id, boutique_id, expires_at, last_seen_at, session_id, locked_at)
    values(v_uid, p_boutique_id, v_expires, now(), v_sid, null)
    on conflict (user_id, boutique_id, session_id) do update
    set expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at, locked_at = null;
    return jsonb_build_object('ok', true, 'configured', true, 'attemptsRemaining', 5);
  end if;

  v_next := coalesce(v_row.failed_attempts, 0) + 1;
  if v_next >= 5 then
    v_lock := now() + interval '15 minutes';
    update private.user_pins set failed_attempts = 0, locked_until = v_lock, updated_at = now() where user_id = v_uid;
    return jsonb_build_object('ok', false, 'configured', true, 'lockedUntil', v_lock, 'attemptsRemaining', 0);
  end if;
  update private.user_pins set failed_attempts = v_next, locked_until = null, updated_at = now() where user_id = v_uid;
  return jsonb_build_object('ok', false, 'configured', true, 'attemptsRemaining', 5 - v_next);
end;
$$;

revoke all on function public.start_app_session(text) from public, anon;
revoke all on function public.verify_quick_pin(text, text) from public, anon;
grant execute on function public.start_app_session(text) to authenticated;
grant execute on function public.verify_quick_pin(text, text) to authenticated;
