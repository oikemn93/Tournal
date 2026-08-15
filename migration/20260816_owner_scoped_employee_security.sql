-- Tournal: owner-scoped employee administration and express-payment authorization.
-- Apply only after reviewing against the live schema. This migration is idempotent.

alter table if exists public.boutique_assignments
  drop constraint if exists boutique_assignments_role_check;
alter table if exists public.boutique_assignments
  add constraint boutique_assignments_role_check check (role in ('owner','manager','employee'));

alter table if exists public.boutique_assignments enable row level security;
alter table if exists public.platform_users enable row level security;

-- Replace broad table policies with owner-scoped policies. Existing policy names
-- are removed defensively; ownership is always derived from boutiques.owner_id.
do $do$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('platform_users','boutique_assignments') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $do$;

create policy platform_users_select_authenticated on public.platform_users
  for select to authenticated using (
    id = (select auth.uid())
    or exists (select 1 from public.boutique_assignments ba join public.boutiques b on b.id=ba.boutique_id where ba.user_id=platform_users.id and b.owner_id=(select auth.uid()))
  );

create policy boutique_assignments_owner_select on public.boutique_assignments
  for select to authenticated using (
    user_id=(select auth.uid()) or exists (select 1 from public.boutiques b where b.id=boutique_assignments.boutique_id and b.owner_id=(select auth.uid()))
  );
create policy boutique_assignments_owner_insert on public.boutique_assignments
  for insert to authenticated with check (
    role <> 'owner' and exists (select 1 from public.boutiques b where b.id=boutique_assignments.boutique_id and b.owner_id=(select auth.uid()))
  );
create policy boutique_assignments_owner_update on public.boutique_assignments
  for update to authenticated using (
    role <> 'owner' and exists (select 1 from public.boutiques b where b.id=boutique_assignments.boutique_id and b.owner_id=(select auth.uid()))
  ) with check (
    role <> 'owner' and exists (select 1 from public.boutiques b where b.id=boutique_assignments.boutique_id and b.owner_id=(select auth.uid()))
  );
create policy boutique_assignments_owner_delete on public.boutique_assignments
  for delete to authenticated using (
    role <> 'owner' and exists (select 1 from public.boutiques b where b.id=boutique_assignments.boutique_id and b.owner_id=(select auth.uid()))
  );

revoke all on public.platform_users from anon;
revoke all on public.boutique_assignments from anon;
grant select on public.platform_users to authenticated;
grant select, insert, update, delete on public.boutique_assignments to authenticated;

create or replace function public.record_express_payment(
  p_boutique_id text, p_invoice_id text, p_idempotency_key uuid,
  p_amount numeric, p_payment_method text
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_allowed boolean;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select exists(select 1 from public.boutique_assignments ba where ba.boutique_id=p_boutique_id and ba.user_id=v_user and coalesce((ba.droits->>'encaissement_vente')::boolean,false)) into v_allowed;
  if not v_allowed then raise exception 'express payment permission required'; end if;
  return public.record_payment(p_boutique_id,p_invoice_id,p_idempotency_key,p_amount,p_payment_method);
end;
$fn$;
revoke all on function public.record_express_payment(text,text,uuid,numeric,text) from public;
grant execute on function public.record_express_payment(text,text,uuid,numeric,text) to authenticated;

-- Keep normal invoice collection on the existing record_payment authorization.
-- The explicit express RPC above prevents a caller from selecting the wrong path.

-- Post-deployment check: review with Supabase advisors and confirm function
-- signatures before applying if the live schema differs from this repository.
select 'owner_scoped_employee_security migration ready' as status;
