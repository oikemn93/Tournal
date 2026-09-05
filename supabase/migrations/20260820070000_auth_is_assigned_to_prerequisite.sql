-- Audit-only reconstruction prerequisite.
-- Restores the historical authorization helper before policies that reference it.
create or replace function private.auth_is_assigned_to(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.auth_is_active_user()
     and exists(
       select 1
       from public.boutique_assignments a
       where a.boutique_id = p_boutique_id
         and a.user_id = auth.uid()
     );
$$;

revoke all on function private.auth_is_assigned_to(text) from public, anon;
grant execute on function private.auth_is_assigned_to(text) to authenticated;
