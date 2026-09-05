-- Audit-only historical prerequisite for clean schema replay.
-- The remote 20260819205051 add_inter_entity_boutique_directory migration
-- depends on private.auth_has_write_access(text). This function originated in
-- 20260813025950 and was moved/hardened in 20260813030039. Recreate the exact
-- historical authorization semantics before replaying the directory migration.
-- This file must not be merged to main.

create or replace function private.auth_has_write_access(p_boutique_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return exists (
    select 1
    from public.boutique_assignments
    where boutique_id = p_boutique_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
end;
$$;

revoke all on function private.auth_has_write_access(text) from public, anon, authenticated;
grant execute on function private.auth_has_write_access(text) to authenticated;
