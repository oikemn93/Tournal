-- Cover every Ops foreign key reported by the Supabase performance advisor.
-- These tables are currently small, so regular transactional index creation
-- avoids the deployment constraints of CREATE INDEX CONCURRENTLY.
create index if not exists ops_access_requests_approved_by_idx
  on public.ops_access_requests (approved_by);
create index if not exists ops_accounts_sales_owner_idx
  on public.ops_accounts (sales_owner_id);
create index if not exists ops_accounts_service_owner_idx
  on public.ops_accounts (service_owner_id);
create index if not exists ops_accounts_support_owner_idx
  on public.ops_accounts (support_owner_id);
create index if not exists ops_contacts_boutique_idx
  on public.ops_contacts (boutique_id);
create index if not exists ops_contacts_created_by_idx
  on public.ops_contacts (created_by);
create index if not exists ops_interactions_actor_idx
  on public.ops_interactions (actor_id);
create index if not exists ops_interactions_related_task_idx
  on public.ops_interactions (related_task_id);
create index if not exists ops_interactions_related_ticket_idx
  on public.ops_interactions (related_ticket_id);
create index if not exists ops_onboarding_service_owner_idx
  on public.ops_onboarding (service_owner_id);
create index if not exists ops_tasks_created_by_idx
  on public.ops_tasks (created_by);
create index if not exists ops_tickets_assignee_idx
  on public.ops_tickets (assignee_id);
create index if not exists ops_tickets_created_by_idx
  on public.ops_tickets (created_by);

-- Cache auth.uid() once per statement instead of evaluating it for every row.
-- Only the evaluation strategy changes; the authorization predicates remain
-- byte-for-byte equivalent around the wrapped identity lookup.
alter policy ops_access_requests_read on public.ops_access_requests
  to authenticated
  using ((select private.auth_is_super_admin()) or requester_id = (select auth.uid()));

alter policy ops_access_requests_create on public.ops_access_requests
  to authenticated
  with check ((select private.auth_is_ops_staff()) and requester_id = (select auth.uid()) and status = 'pending');

alter policy ops_interactions_insert on public.ops_interactions
  to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (actor_id is null or actor_id = (select auth.uid())));

alter policy ops_interactions_update on public.ops_interactions
  to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = (select auth.uid()))
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = (select auth.uid()));

alter policy ops_interactions_delete on public.ops_interactions
  to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = (select auth.uid()));

alter policy ops_tasks_insert on public.ops_tasks
  to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by = (select auth.uid())));

alter policy ops_tasks_update on public.ops_tasks
  to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or assignee_id = (select auth.uid()) or ((select private.auth_ops_role()) = 'sales' and team = 'sales') or ((select private.auth_ops_role()) = 'service' and team in ('service','success')) or ((select private.auth_ops_role()) = 'support' and team = 'support'))
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or assignee_id = (select auth.uid()) or ((select private.auth_ops_role()) = 'sales' and team = 'sales') or ((select private.auth_ops_role()) = 'service' and team in ('service','success')) or ((select private.auth_ops_role()) = 'support' and team = 'support'));

alter policy ops_tickets_insert on public.ops_tickets
  to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by = (select auth.uid())));

alter policy ops_tickets_update on public.ops_tickets
  to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id = (select auth.uid()))
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id = (select auth.uid()));
