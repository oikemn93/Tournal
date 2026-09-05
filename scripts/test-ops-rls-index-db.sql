\if :{?assert_patched}
do $test$
declare
  v_policy_count integer;
  v_uid_count integer;
  v_definition text;
  v_item record;
begin
  for v_item in
    select * from (values
      ('ops_access_requests_approved_by_idx', 'ops_access_requests', 'approved_by'),
      ('ops_accounts_sales_owner_idx', 'ops_accounts', 'sales_owner_id'),
      ('ops_accounts_service_owner_idx', 'ops_accounts', 'service_owner_id'),
      ('ops_accounts_support_owner_idx', 'ops_accounts', 'support_owner_id'),
      ('ops_contacts_boutique_idx', 'ops_contacts', 'boutique_id'),
      ('ops_contacts_created_by_idx', 'ops_contacts', 'created_by'),
      ('ops_interactions_actor_idx', 'ops_interactions', 'actor_id'),
      ('ops_interactions_related_task_idx', 'ops_interactions', 'related_task_id'),
      ('ops_interactions_related_ticket_idx', 'ops_interactions', 'related_ticket_id'),
      ('ops_onboarding_service_owner_idx', 'ops_onboarding', 'service_owner_id'),
      ('ops_tasks_created_by_idx', 'ops_tasks', 'created_by'),
      ('ops_tickets_assignee_idx', 'ops_tickets', 'assignee_id'),
      ('ops_tickets_created_by_idx', 'ops_tickets', 'created_by')
    ) expected(index_name, table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_class i
      join pg_namespace n on n.oid = i.relnamespace
      join pg_index ix on ix.indexrelid = i.oid
      join pg_class t on t.oid = ix.indrelid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ix.indkey[0]
      where n.nspname = 'public'
        and i.relname = v_item.index_name
        and t.relname = v_item.table_name
        and a.attname = v_item.column_name
    ) then
      raise exception 'missing covering index % on %.%', v_item.index_name, v_item.table_name, v_item.column_name;
    end if;
  end loop;

  select count(*),
         coalesce(sum(regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'select\s+auth\.uid\(\)', 1, 'i')), 0),
         string_agg(coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' ')
  into v_policy_count, v_uid_count, v_definition
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'ops_access_requests_read', 'ops_access_requests_create',
      'ops_interactions_insert', 'ops_interactions_update', 'ops_interactions_delete',
      'ops_tasks_insert', 'ops_tasks_update',
      'ops_tickets_insert', 'ops_tickets_update'
    );

  if v_policy_count <> 9 then
    raise exception 'expected 9 optimized policies, found %', v_policy_count;
  end if;
  if v_uid_count <> 12 then
    raise exception 'expected 12 cached auth.uid() calls, found %', v_uid_count;
  end if;

  v_definition := regexp_replace(
    v_definition,
    '\(\s*SELECT\s+auth\.uid\(\)(\s+AS\s+uid)?\s*\)',
    '',
    'gi'
  );
  if v_definition ~* 'auth\.uid\(\)' then
    raise exception 'an Ops policy still evaluates auth.uid() per row';
  end if;
end
$test$;
\else
create or replace function private.auth_is_ops_staff()
returns boolean language sql stable as $$ select true $$;
create or replace function private.auth_ops_role()
returns text language sql stable as $$ select 'manager'::text $$;

create table if not exists public.ops_access_requests (
  id uuid primary key,
  approved_by uuid references public.platform_users(id),
  requester_id uuid,
  status text
);
create table if not exists public.ops_accounts (
  id uuid primary key,
  sales_owner_id uuid references public.platform_users(id),
  service_owner_id uuid references public.platform_users(id),
  support_owner_id uuid references public.platform_users(id)
);
create table if not exists public.ops_contacts (
  id uuid primary key,
  boutique_id text references public.boutiques(id),
  created_by uuid references public.platform_users(id)
);
create table if not exists public.ops_onboarding (
  boutique_id text primary key references public.boutiques(id),
  service_owner_id uuid references public.platform_users(id)
);
create table if not exists public.ops_tasks (
  id uuid primary key,
  created_by uuid references public.platform_users(id),
  assignee_id uuid,
  team text
);
create table if not exists public.ops_tickets (
  id uuid primary key,
  assignee_id uuid references public.platform_users(id),
  created_by uuid references public.platform_users(id)
);
create table if not exists public.ops_interactions (
  id uuid primary key,
  actor_id uuid references public.platform_users(id),
  related_task_id uuid references public.ops_tasks(id),
  related_ticket_id uuid references public.ops_tickets(id)
);

alter table public.ops_access_requests enable row level security;
alter table public.ops_interactions enable row level security;
alter table public.ops_tasks enable row level security;
alter table public.ops_tickets enable row level security;

drop policy if exists ops_access_requests_read on public.ops_access_requests;
create policy ops_access_requests_read on public.ops_access_requests for select to authenticated
  using ((select private.auth_is_super_admin()) or requester_id = auth.uid());
drop policy if exists ops_access_requests_create on public.ops_access_requests;
create policy ops_access_requests_create on public.ops_access_requests for insert to authenticated
  with check ((select private.auth_is_ops_staff()) and requester_id = auth.uid() and status = 'pending');

drop policy if exists ops_interactions_insert on public.ops_interactions;
create policy ops_interactions_insert on public.ops_interactions for insert to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (actor_id is null or actor_id = auth.uid()));
drop policy if exists ops_interactions_update on public.ops_interactions;
create policy ops_interactions_update on public.ops_interactions for update to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = auth.uid())
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = auth.uid());
drop policy if exists ops_interactions_delete on public.ops_interactions;
create policy ops_interactions_delete on public.ops_interactions for delete to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or actor_id = auth.uid());

drop policy if exists ops_tasks_insert on public.ops_tasks;
create policy ops_tasks_insert on public.ops_tasks for insert to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by = auth.uid()));
drop policy if exists ops_tasks_update on public.ops_tasks;
create policy ops_tasks_update on public.ops_tasks for update to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or assignee_id = auth.uid() or ((select private.auth_ops_role()) = 'sales' and team = 'sales') or ((select private.auth_ops_role()) = 'service' and team in ('service','success')) or ((select private.auth_ops_role()) = 'support' and team = 'support'))
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) = 'manager' or assignee_id = auth.uid() or ((select private.auth_ops_role()) = 'sales' and team = 'sales') or ((select private.auth_ops_role()) = 'service' and team in ('service','success')) or ((select private.auth_ops_role()) = 'support' and team = 'support'));

drop policy if exists ops_tickets_insert on public.ops_tickets;
create policy ops_tickets_insert on public.ops_tickets for insert to authenticated
  with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by = auth.uid()));
drop policy if exists ops_tickets_update on public.ops_tickets;
create policy ops_tickets_update on public.ops_tickets for update to authenticated
  using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id = auth.uid())
  with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id = auth.uid());
\endif
