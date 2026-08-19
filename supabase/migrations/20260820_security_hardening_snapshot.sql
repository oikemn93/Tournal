-- Security hardening snapshot for Tournal.
-- Idempotent: reasserts the access-control guarantees audited on 2026-08-20.

create or replace function private.auth_has_permission(p_boutique_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.auth_is_super_admin()
      or (private.auth_is_active_user() and exists(
        select 1
        from public.boutique_assignments ba
        where ba.boutique_id = p_boutique_id
          and ba.user_id = auth.uid()
          and (
            ba.role = 'owner'
            or coalesce((ba.droits ->> p_permission)::boolean, false)
          )
      ));
$$;

-- Browser users must never receive anonymous database execution rights.
revoke all privileges on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema private from anon;
revoke usage on schema private from anon;

-- SQL capabilities not required by the Data API are explicitly removed.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Only one owner assignment may exist per boutique.
create unique index if not exists idx_ba_one_owner
  on public.boutique_assignments (boutique_id)
  where role = 'owner';

-- Core exposed tables always run with RLS.
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.charges enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.stock_entries enable row level security;
alter table public.audit_log enable row level security;
alter table public.caisse_sessions enable row level security;

-- Granular write permissions: one permission never implies another.
drop policy if exists "products: insert" on public.products;
drop policy if exists "products: update" on public.products;
drop policy if exists "products: delete" on public.products;
create policy "products: insert" on public.products for insert to authenticated
  with check (private.auth_has_permission(boutique_id,'stock'));
create policy "products: update" on public.products for update to authenticated
  using (private.auth_has_permission(boutique_id,'stock'))
  with check (private.auth_has_permission(boutique_id,'stock'));
create policy "products: delete" on public.products for delete to authenticated
  using (private.auth_has_permission(boutique_id,'stock'));

drop policy if exists "categories: insert" on public.categories;
drop policy if exists "categories: update" on public.categories;
drop policy if exists "categories: delete" on public.categories;
create policy "categories: insert" on public.categories for insert to authenticated
  with check (private.auth_has_permission(boutique_id,'stock'));
create policy "categories: update" on public.categories for update to authenticated
  using (private.auth_has_permission(boutique_id,'stock'))
  with check (private.auth_has_permission(boutique_id,'stock'));
create policy "categories: delete" on public.categories for delete to authenticated
  using (private.auth_has_permission(boutique_id,'stock'));

drop policy if exists "clients: insert" on public.clients;
drop policy if exists "clients: update" on public.clients;
drop policy if exists "clients: delete" on public.clients;
create policy "clients: insert" on public.clients for insert to authenticated
  with check (private.auth_has_permission(boutique_id,'clients'));
create policy "clients: update" on public.clients for update to authenticated
  using (private.auth_has_permission(boutique_id,'clients'))
  with check (private.auth_has_permission(boutique_id,'clients'));
create policy "clients: delete" on public.clients for delete to authenticated
  using (private.auth_has_permission(boutique_id,'clients'));

drop policy if exists "suppliers: insert" on public.suppliers;
drop policy if exists "suppliers: update" on public.suppliers;
drop policy if exists "suppliers: delete" on public.suppliers;
create policy "suppliers: insert" on public.suppliers for insert to authenticated
  with check (private.auth_has_permission(boutique_id,'fournisseurs'));
create policy "suppliers: update" on public.suppliers for update to authenticated
  using (private.auth_has_permission(boutique_id,'fournisseurs'))
  with check (private.auth_has_permission(boutique_id,'fournisseurs'));
create policy "suppliers: delete" on public.suppliers for delete to authenticated
  using (private.auth_has_permission(boutique_id,'fournisseurs'));

-- Audit authorship is derived from the JWT identity and cannot be forged.
drop policy if exists "audit_log: insert" on public.audit_log;
create policy "audit_log: insert" on public.audit_log for insert to authenticated
  with check (
    auth.uid() = user_id
    and (private.auth_is_assigned_to(boutique_id) or private.auth_is_super_admin())
  );

-- Financial ledgers are append-only through audited SECURITY DEFINER RPCs.
-- Direct writes are intentionally absent for charges, payments and stock entries.
drop policy if exists "charges: insert" on public.charges;
drop policy if exists "charges: update" on public.charges;
drop policy if exists "charges: delete" on public.charges;
drop policy if exists "invoice_payments: insert" on public.invoice_payments;
drop policy if exists "invoice_payments: update" on public.invoice_payments;
drop policy if exists "invoice_payments: delete" on public.invoice_payments;
drop policy if exists "stock_entries: insert" on public.stock_entries;
drop policy if exists "stock_entries: update" on public.stock_entries;
drop policy if exists "stock_entries: delete" on public.stock_entries;

-- Unpaid invoices may still be edited/cancelled before any payment or stock deduction.
drop policy if exists "invoices: insert" on public.invoices;
drop policy if exists "invoices: update" on public.invoices;
drop policy if exists "invoices: delete" on public.invoices;
drop policy if exists "invoices: update pending only" on public.invoices;
drop policy if exists "invoices: delete pending only" on public.invoices;
create policy "invoices: update pending only" on public.invoices for update to authenticated
  using (private.auth_has_permission(boutique_id,'factures') and status='en_attente' and acompte=0 and stock_deducted_at is null)
  with check (private.auth_has_permission(boutique_id,'factures') and status='en_attente' and acompte=0 and stock_deducted_at is null);
create policy "invoices: delete pending only" on public.invoices for delete to authenticated
  using (private.auth_has_permission(boutique_id,'factures') and status='en_attente' and acompte=0 and stock_deducted_at is null);

-- Invoice lines follow the same pending-invoice constraint.
drop policy if exists "invoice_lines: insert" on public.invoice_lines;
drop policy if exists "invoice_lines: update" on public.invoice_lines;
drop policy if exists "invoice_lines: delete" on public.invoice_lines;
drop policy if exists "invoice_lines: insert pending only" on public.invoice_lines;
drop policy if exists "invoice_lines: update pending only" on public.invoice_lines;
drop policy if exists "invoice_lines: delete pending only" on public.invoice_lines;
create policy "invoice_lines: insert pending only" on public.invoice_lines for insert to authenticated
  with check (
    private.auth_has_permission(boutique_id,'factures')
    and exists (
      select 1 from public.invoices i
      where i.boutique_id=invoice_lines.boutique_id
        and i.id=invoice_lines.invoice_id
        and i.status='en_attente' and i.acompte=0 and i.stock_deducted_at is null
    )
  );
create policy "invoice_lines: update pending only" on public.invoice_lines for update to authenticated
  using (
    private.auth_has_permission(boutique_id,'factures')
    and exists (
      select 1 from public.invoices i
      where i.boutique_id=invoice_lines.boutique_id
        and i.id=invoice_lines.invoice_id
        and i.status='en_attente' and i.acompte=0 and i.stock_deducted_at is null
    )
  )
  with check (
    private.auth_has_permission(boutique_id,'factures')
    and exists (
      select 1 from public.invoices i
      where i.boutique_id=invoice_lines.boutique_id
        and i.id=invoice_lines.invoice_id
        and i.status='en_attente' and i.acompte=0 and i.stock_deducted_at is null
    )
  );
create policy "invoice_lines: delete pending only" on public.invoice_lines for delete to authenticated
  using (
    private.auth_has_permission(boutique_id,'factures')
    and exists (
      select 1 from public.invoices i
      where i.boutique_id=invoice_lines.boutique_id
        and i.id=invoice_lines.invoice_id
        and i.status='en_attente' and i.acompte=0 and i.stock_deducted_at is null
    )
  );

-- Cash operations require the dedicated collection permission.
drop policy if exists "caisse_sessions: insert" on public.caisse_sessions;
drop policy if exists "caisse_sessions: update" on public.caisse_sessions;
drop policy if exists "caisse_sessions: delete" on public.caisse_sessions;
create policy "caisse_sessions: insert" on public.caisse_sessions for insert to authenticated
  with check (private.auth_can_collect_payment(boutique_id) or private.auth_is_super_admin());
create policy "caisse_sessions: update" on public.caisse_sessions for update to authenticated
  using (private.auth_can_collect_payment(boutique_id) or private.auth_is_super_admin())
  with check (private.auth_can_collect_payment(boutique_id) or private.auth_is_super_admin());
create policy "caisse_sessions: delete" on public.caisse_sessions for delete to authenticated
  using (private.auth_can_collect_payment(boutique_id) or private.auth_is_super_admin());
