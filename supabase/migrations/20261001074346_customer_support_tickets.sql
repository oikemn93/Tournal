-- Allow authenticated boutique users to open and read support tickets for boutiques they can access.
-- Support/manager Ops policies retain exclusive update/delete authority.
drop policy if exists ops_tickets_read on public.ops_tickets;
create policy ops_tickets_read on public.ops_tickets for select to authenticated
using (
  (select private.auth_is_super_admin())
  or (select private.auth_is_ops_staff())
  or private.auth_has_boutique_access(boutique_id)
);
drop policy if exists ops_tickets_insert on public.ops_tickets;
create policy ops_tickets_insert on public.ops_tickets for insert to authenticated
with check (
  (
    (select private.auth_is_super_admin())
    or (select private.auth_is_ops_staff())
  )
  and (created_by is null or created_by=(select auth.uid()))
  or (
    private.auth_has_active_app_session(boutique_id)
    and created_by=(select auth.uid())
  )
);
