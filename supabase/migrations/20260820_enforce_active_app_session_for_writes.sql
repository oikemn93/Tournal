-- Apply only once the frontend establishes/locks app sessions. Reads stay
-- available through normal RLS, but ordinary owner/employee writes require an
-- active, unlocked application session bound to the current Auth session_id.

create or replace function private.auth_has_permission(p_boutique_id text,p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or (
        private.auth_is_active_user()
        and private.auth_has_active_app_session(p_boutique_id)
        and exists(
          select 1 from public.boutique_assignments ba
          where ba.boutique_id=p_boutique_id
            and ba.user_id=auth.uid()
            and (ba.role='owner' or coalesce((ba.droits->>p_permission)::boolean,false))
        )
      );
$$;

create or replace function private.auth_can_collect_payment(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or (
        private.auth_is_active_user()
        and private.auth_has_active_app_session(p_boutique_id)
        and exists(
          select 1 from public.boutique_assignments ba
          where ba.boutique_id=p_boutique_id
            and ba.user_id=auth.uid()
            and (ba.role='owner' or coalesce((ba.droits->>'encaissement_vente')::boolean,false))
        )
      );
$$;

create or replace function private.auth_has_write_access(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or (
        private.auth_is_active_user()
        and private.auth_has_active_app_session(p_boutique_id)
        and exists(
          select 1 from public.boutique_assignments ba
          where ba.boutique_id=p_boutique_id
            and ba.user_id=auth.uid()
            and (
              ba.role='owner'
              or coalesce((ba.droits->>'vente')::boolean,false)
              or coalesce((ba.droits->>'factures')::boolean,false)
              or coalesce((ba.droits->>'stock')::boolean,false)
              or coalesce((ba.droits->>'clients')::boolean,false)
              or coalesce((ba.droits->>'fournisseurs')::boolean,false)
              or coalesce((ba.droits->>'charges')::boolean,false)
              or coalesce((ba.droits->>'inventaire')::boolean,false)
            )
        )
      );
$$;

-- Audit events must also come from an unlocked app session (except superadmin).
drop policy if exists "audit_log: insert" on public.audit_log;
create policy "audit_log: insert" on public.audit_log for insert to authenticated
with check (
  auth.uid()=user_id
  and (
    private.auth_is_super_admin()
    or (private.auth_has_active_app_session(boutique_id) and private.auth_is_assigned_to(boutique_id))
  )
);

-- Owner-scoped administrative writes.
drop policy if exists "auth_settings: insert" on public.auth_settings;
create policy "auth_settings: insert" on public.auth_settings for insert to authenticated
with check (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));
drop policy if exists "auth_settings: update" on public.auth_settings;
create policy "auth_settings: update" on public.auth_settings for update to authenticated
using (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)))
with check (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));
drop policy if exists "auth_settings: delete" on public.auth_settings;
create policy "auth_settings: delete" on public.auth_settings for delete to authenticated
using (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));

drop policy if exists "boutiques: update" on public.boutiques;
create policy "boutiques: update" on public.boutiques for update to authenticated
using (private.auth_is_super_admin() or (private.auth_has_active_app_session(id) and private.auth_is_owner_of(id)))
with check (private.auth_is_super_admin() or (private.auth_has_active_app_session(id) and private.auth_is_owner_of(id)));
drop policy if exists "boutiques: delete" on public.boutiques;
create policy "boutiques: delete" on public.boutiques for delete to authenticated
using (private.auth_is_super_admin() or (private.auth_has_active_app_session(id) and private.auth_is_owner_of(id)));

drop policy if exists "boutique_assignments_owner_insert" on public.boutique_assignments;
create policy "boutique_assignments_owner_insert" on public.boutique_assignments for insert to authenticated
with check (
  role<>'owner'
  and private.auth_has_active_app_session(boutique_id)
  and exists(select 1 from public.boutiques b where b.id=boutique_id and b.owner_id=auth.uid())
);
drop policy if exists "boutique_assignments_owner_update" on public.boutique_assignments;
create policy "boutique_assignments_owner_update" on public.boutique_assignments for update to authenticated
using (
  role<>'owner'
  and private.auth_has_active_app_session(boutique_id)
  and exists(select 1 from public.boutiques b where b.id=boutique_id and b.owner_id=auth.uid())
)
with check (
  role<>'owner'
  and private.auth_has_active_app_session(boutique_id)
  and exists(select 1 from public.boutiques b where b.id=boutique_id and b.owner_id=auth.uid())
);
drop policy if exists "boutique_assignments_owner_delete" on public.boutique_assignments;
create policy "boutique_assignments_owner_delete" on public.boutique_assignments for delete to authenticated
using (
  role<>'owner'
  and private.auth_has_active_app_session(boutique_id)
  and exists(select 1 from public.boutiques b where b.id=boutique_id and b.owner_id=auth.uid())
);

drop policy if exists "export_import_log: insert" on public.export_import_log;
drop policy if exists "eil: insert" on public.export_import_log;
create policy "eil: insert" on public.export_import_log for insert to authenticated
with check (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));

-- Legacy compatibility state is still protected in case an old screen reaches it.
drop policy if exists "boutique_state: insert" on public.boutique_state;
create policy "boutique_state: insert" on public.boutique_state for insert to authenticated
with check (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));
drop policy if exists "boutique_state: update" on public.boutique_state;
create policy "boutique_state: update" on public.boutique_state for update to authenticated
using (private.auth_is_super_admin() or private.auth_has_write_access(boutique_id))
with check (private.auth_is_super_admin() or private.auth_has_write_access(boutique_id));
drop policy if exists "boutique_state: delete" on public.boutique_state;
create policy "boutique_state: delete" on public.boutique_state for delete to authenticated
using (private.auth_is_super_admin() or (private.auth_has_active_app_session(boutique_id) and private.auth_is_owner_of(boutique_id)));
