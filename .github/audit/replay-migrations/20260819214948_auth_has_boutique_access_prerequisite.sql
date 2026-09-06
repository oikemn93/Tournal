-- Audit-only reconstruction of structure introduced by the lost production
-- migration 20260819214948_superadmin_global_user_controls.

create or replace function private.auth_has_boutique_access(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
  select private.auth_is_super_admin()
      or (private.auth_is_active_user() and exists(
        select 1 from public.boutique_assignments a
        where a.boutique_id=p_boutique_id and a.user_id=auth.uid()
      ));
$$;
