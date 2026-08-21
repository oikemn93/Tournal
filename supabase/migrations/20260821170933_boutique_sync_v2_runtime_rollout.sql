-- Keep V2 rollout per boutique. A deployment can therefore contain both
-- clients: boutiques not explicitly enabled remain on the proven V1 listener.
-- The function deliberately returns false for callers without an active,
-- assigned session so the private setting cannot be enumerated through the API.

create or replace function public.is_boutique_sync_v2_enabled(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.auth_is_super_admin()
      or (
        private.auth_is_assigned_to(p_boutique_id)
        and private.auth_has_active_app_session(p_boutique_id)
      )
    then coalesce((
      select s.enabled
      from private.boutique_sync_settings s
      where s.boutique_id = p_boutique_id
    ), false)
    else false
  end;
$$;

revoke all on function public.is_boutique_sync_v2_enabled(text) from public, anon;
grant execute on function public.is_boutique_sync_v2_enabled(text) to authenticated;
