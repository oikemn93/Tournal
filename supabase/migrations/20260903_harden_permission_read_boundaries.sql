-- Harden read access so an active boutique assignment is not, by itself,
-- sufficient to download every business table. Keep the dependency unions
-- explicit because some screens legitimately compose several domains.

create or replace function private.auth_has_any_permission(
  p_boutique_id text,
  p_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_is_super_admin()
      or exists (
        select 1
        from unnest(coalesce(p_permissions, '{}'::text[])) as requested(permission)
        where private.auth_has_permission(p_boutique_id, requested.permission)
      );
$$;

revoke all on function private.auth_has_any_permission(text,text[]) from public;
grant execute on function private.auth_has_any_permission(text,text[]) to authenticated;

-- Catalogue / stock. POS, inventory, dashboard and transfers need a catalogue;
-- supplier screens need stock receipt provenance. A plain boutique assignment
-- no longer grants direct catalogue/history access.
drop policy if exists "categories: select" on public.categories;
create policy "categories: select permitted"
on public.categories for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts','dashboard']));

drop policy if exists "products: select" on public.products;
create policy "products: select permitted"
on public.products for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts','dashboard','fournisseurs']));

drop policy if exists "stock_entries: select" on public.stock_entries;
create policy "stock_entries: select permitted"
on public.stock_entries for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','inventaire','transferts','dashboard','fournisseurs']));

-- Client rows are normally a Clients-domain read. Dashboard remains in the
-- compatibility union until its customer KPI moves to an aggregate-only RPC;
-- this avoids changing visible dashboard counts in the security rollout.
drop policy if exists "clients: select" on public.clients;
create policy "clients: select permitted"
on public.clients for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['clients','dashboard']));

-- Supplier directory can be required from stock receipts and charge workflows.
drop policy if exists "suppliers: select" on public.suppliers;
create policy "suppliers: select permitted"
on public.suppliers for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['fournisseurs','stock','charges','transferts']));

-- Sales history is shared by invoice, client, POS, dashboard and accounting
-- workflows. Explicit action rights also need to resolve the target invoice.
drop policy if exists "invoices: select" on public.invoices;
create policy "invoices: select permitted"
on public.invoices for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','dashboard','vente','compta','encaissement_vente',
  'remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_lines: select" on public.invoice_lines;
create policy "invoice_lines: select permitted"
on public.invoice_lines for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','dashboard','vente','compta','encaissement_vente',
  'remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_payments: select" on public.invoice_payments;
create policy "invoice_payments: select permitted"
on public.invoice_payments for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','dashboard','compta','encaissement_vente','remboursement','transferts'
]));

-- Client money balances are not general boutique data.
drop policy if exists "client_advances: select" on public.client_advances;
create policy "client_advances: select permitted"
on public.client_advances for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['clients','encaissement_vente','remboursement','compta']));

drop policy if exists "client_credit_refunds: select" on public.client_credit_refunds;
create policy "client_credit_refunds: select permitted"
on public.client_credit_refunds for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['clients','remboursement','compta']));

drop policy if exists "client_credit_refund_allocations: select" on public.client_credit_refund_allocations;
create policy "client_credit_refund_allocations: select permitted"
on public.client_credit_refund_allocations for select to authenticated
using (
  exists (
    select 1
    from public.client_credit_refunds refund
    where refund.id = client_credit_refund_allocations.refund_id
      and private.auth_has_any_permission(refund.boutique_id, array['clients','remboursement','compta'])
  )
);

-- Financial details remain available to the screens that currently consume
-- them. Dashboard is included for compatibility with its existing KPI model;
-- a future aggregate-only RPC can remove that dependency without UI breakage.
drop policy if exists "charges: select" on public.charges;
create policy "charges: select permitted"
on public.charges for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['charges','compta','fournisseurs','stock','dashboard']));

drop policy if exists "caisse_sessions: select" on public.caisse_sessions;
create policy "caisse_sessions: select permitted"
on public.caisse_sessions for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['dashboard','encaissement_vente','charges','compta']));

-- Partner directory is a transfer concern only.
drop policy if exists "partners_read_authorized" on public.boutique_partners;
create policy "partners_read_authorized"
on public.boutique_partners for select to authenticated
using (private.auth_has_permission(boutique_id, 'transferts'));
