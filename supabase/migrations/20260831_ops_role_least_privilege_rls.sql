create or replace function private.auth_ops_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when private.auth_is_super_admin() then 'superadmin'
    else (
      select p.role
      from public.ops_staff_profiles p
      where p.user_id = auth.uid() and p.active
      limit 1
    )
  end;
$$;

revoke all on function private.auth_ops_role() from public, anon;
grant execute on function private.auth_ops_role() to authenticated;

create or replace function private.auth_is_ops_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.auth_is_active_user() and exists (
    select 1 from public.ops_staff_profiles p
    where p.user_id = auth.uid() and p.active
  );
$$;

revoke all on function private.auth_is_ops_staff() from public, anon;
grant execute on function private.auth_is_ops_staff() to authenticated;

do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname='public' and tablename in (
    'ops_accounts','ops_account_boutiques','ops_contacts','ops_interactions','ops_onboarding','ops_staff_profiles','ops_tasks','ops_tickets'
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy ops_accounts_read on public.ops_accounts for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_accounts_write on public.ops_accounts for all to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('sales','manager')) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('sales','manager'));
create policy ops_account_boutiques_read on public.ops_account_boutiques for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_account_boutiques_write on public.ops_account_boutiques for all to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager') with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager');
create policy ops_contacts_read on public.ops_contacts for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_contacts_insert on public.ops_contacts for insert to authenticated with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by=auth.uid()));
create policy ops_contacts_update on public.ops_contacts for update to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('sales','service','support','manager')) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('sales','service','support','manager'));
create policy ops_contacts_delete on public.ops_contacts for delete to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('sales','manager'));
create policy ops_interactions_read on public.ops_interactions for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_interactions_insert on public.ops_interactions for insert to authenticated with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (actor_id is null or actor_id=auth.uid()));
create policy ops_interactions_update on public.ops_interactions for update to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager' or actor_id=auth.uid()) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager' or actor_id=auth.uid());
create policy ops_interactions_delete on public.ops_interactions for delete to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager' or actor_id=auth.uid());
create policy ops_onboarding_read on public.ops_onboarding for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_onboarding_write on public.ops_onboarding for all to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('service','manager')) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('service','manager'));
create policy ops_staff_read on public.ops_staff_profiles for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_staff_insert on public.ops_staff_profiles for insert to authenticated with check ((select private.auth_is_super_admin()));
create policy ops_staff_update on public.ops_staff_profiles for update to authenticated using ((select private.auth_is_super_admin())) with check ((select private.auth_is_super_admin()));
create policy ops_staff_delete on public.ops_staff_profiles for delete to authenticated using ((select private.auth_is_super_admin()));
create policy ops_tasks_read on public.ops_tasks for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_tasks_insert on public.ops_tasks for insert to authenticated with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by=auth.uid()));
create policy ops_tasks_update on public.ops_tasks for update to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager' or assignee_id=auth.uid() or ((select private.auth_ops_role())='sales' and team='sales') or ((select private.auth_ops_role())='service' and team in ('service','success')) or ((select private.auth_ops_role())='support' and team='support')) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager' or assignee_id=auth.uid() or ((select private.auth_ops_role())='sales' and team='sales') or ((select private.auth_ops_role())='service' and team in ('service','success')) or ((select private.auth_ops_role())='support' and team='support'));
create policy ops_tasks_delete on public.ops_tasks for delete to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager');
create policy ops_tickets_read on public.ops_tickets for select to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_tickets_insert on public.ops_tickets for insert to authenticated with check (((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) and (created_by is null or created_by=auth.uid()));
create policy ops_tickets_update on public.ops_tickets for update to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id=auth.uid()) with check ((select private.auth_is_super_admin()) or (select private.auth_ops_role()) in ('support','manager') or assignee_id=auth.uid());
create policy ops_tickets_delete on public.ops_tickets for delete to authenticated using ((select private.auth_is_super_admin()) or (select private.auth_ops_role())='manager');