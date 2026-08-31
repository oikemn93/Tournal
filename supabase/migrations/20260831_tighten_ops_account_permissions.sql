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
      select p.role from public.ops_staff_profiles p
      join public.platform_users u on u.id=p.user_id
      where p.user_id=auth.uid() and p.active and coalesce(u.is_suspended,false)=false
      limit 1
    )
  end;
$$;

create or replace function private.guard_ops_account_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare r text;
begin
  r := private.auth_ops_role();
  if r in ('superadmin','manager') then return new; end if;
  if r='sales' then
    if new.id is distinct from old.id
       or new.name is distinct from old.name
       or new.sales_owner_id is distinct from old.sales_owner_id
       or new.service_owner_id is distinct from old.service_owner_id
       or new.support_owner_id is distinct from old.support_owner_id
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at then
      raise exception 'Sales can only update account stage and health';
    end if;
    return new;
  end if;
  raise exception 'Not allowed to update customer account';
end;
$$;

drop trigger if exists trg_guard_ops_account_update on public.ops_accounts;
create trigger trg_guard_ops_account_update before update on public.ops_accounts
for each row execute function private.guard_ops_account_update();

drop policy if exists ops_accounts_access on public.ops_accounts;
drop policy if exists ops_accounts_read on public.ops_accounts;
drop policy if exists ops_accounts_insert on public.ops_accounts;
drop policy if exists ops_accounts_update on public.ops_accounts;
drop policy if exists ops_accounts_delete on public.ops_accounts;
create policy ops_accounts_read on public.ops_accounts for select to authenticated
using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_accounts_insert on public.ops_accounts for insert to authenticated
with check ((select private.auth_ops_role()) in ('superadmin','manager'));
create policy ops_accounts_update on public.ops_accounts for update to authenticated
using ((select private.auth_ops_role()) in ('superadmin','manager','sales'))
with check ((select private.auth_ops_role()) in ('superadmin','manager','sales'));
create policy ops_accounts_delete on public.ops_accounts for delete to authenticated
using ((select private.auth_ops_role()) in ('superadmin','manager'));

drop policy if exists ops_account_boutiques_access on public.ops_account_boutiques;
drop policy if exists ops_account_boutiques_read on public.ops_account_boutiques;
drop policy if exists ops_account_boutiques_write on public.ops_account_boutiques;
create policy ops_account_boutiques_read on public.ops_account_boutiques for select to authenticated
using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_account_boutiques_write on public.ops_account_boutiques for all to authenticated
using ((select private.auth_ops_role()) in ('superadmin','manager'))
with check ((select private.auth_ops_role()) in ('superadmin','manager'));

drop policy if exists ops_contacts_access on public.ops_contacts;
drop policy if exists ops_contacts_read on public.ops_contacts;
drop policy if exists ops_contacts_insert on public.ops_contacts;
drop policy if exists ops_contacts_update on public.ops_contacts;
drop policy if exists ops_contacts_delete on public.ops_contacts;
create policy ops_contacts_read on public.ops_contacts for select to authenticated
using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_contacts_insert on public.ops_contacts for insert to authenticated
with check ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_contacts_update on public.ops_contacts for update to authenticated
using ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()))
with check ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff()));
create policy ops_contacts_delete on public.ops_contacts for delete to authenticated
using ((select private.auth_ops_role()) in ('superadmin','manager'));
