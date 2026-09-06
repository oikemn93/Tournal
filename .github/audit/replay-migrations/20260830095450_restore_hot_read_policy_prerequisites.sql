-- Audit-only replay prerequisite.
-- The original 20260813 foundation created these boutique-scoped SELECT
-- policies, and the later client ledger migrations created the two authenticated
-- variants. Those early migrations are missing from the retained Git history,
-- while 20260830095506 expects to ALTER the policies in place for performance.
-- Recreate only absent policies with their historical authorization semantics.
-- This file must not be merged to main as a production migration.

do $audit$
declare
  r record;
  v_role_clause text;
begin
  for r in
    select * from (values
      ('invoices',              'invoices: select',              false),
      ('invoice_lines',         'invoice_lines: select',         false),
      ('invoice_payments',      'invoice_payments: select',      false),
      ('stock_entries',         'stock_entries: select',         false),
      ('products',              'products: select',              false),
      ('categories',            'categories: select',            false),
      ('clients',               'clients: select',               false),
      ('suppliers',             'suppliers: select',             false),
      ('charges',               'charges: select',               false),
      ('caisse_sessions',       'caisse_sessions: select',       false),
      ('client_advances',       'client_advances: select',       true),
      ('client_credit_refunds', 'client_credit_refunds: select', true)
    ) as p(table_name, policy_name, authenticated_only)
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = r.table_name
        and policyname = r.policy_name
    ) then
      v_role_clause := case when r.authenticated_only then ' to authenticated' else '' end;
      execute format(
        'create policy %I on public.%I for select%s using (private.auth_is_assigned_to(boutique_id) or private.auth_is_super_admin())',
        r.policy_name,
        r.table_name,
        v_role_clause
      );
    end if;
  end loop;
end
$audit$;
