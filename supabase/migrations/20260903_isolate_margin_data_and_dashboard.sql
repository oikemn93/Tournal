-- Isolate cost/margin data from the browser-facing tables and move Dashboard
-- reads to a purpose-built aggregate RPC. The underlying tables remain the
-- canonical write model; browser reads use explicit application views.

-- ---------------------------------------------------------------------------
-- Browser-safe catalogue view
-- ---------------------------------------------------------------------------
drop view if exists public.products_app;
create view public.products_app
with (security_barrier = true)
as
select
  p.id,
  p.boutique_id,
  p.nom,
  p.category_id,
  case when private.auth_has_permission(p.boutique_id, 'marges') then p.prix_achat else null end as prix_achat,
  p.prix_vente,
  p.stock,
  p.unit,
  p.sell_unit,
  p.sell_qty,
  p.low_stock_threshold,
  p.barcode,
  p.actif,
  p.created_at,
  p.updated_at,
  p.image_url,
  p.supplier_name,
  p.pieces_per_lot,
  p.length_per_piece
from public.products p
where private.auth_has_any_permission(
  p.boutique_id,
  array['stock','vente','inventaire','transferts','fournisseurs']
);

revoke all on public.products_app from public, anon;
grant select on public.products_app to authenticated;

-- ---------------------------------------------------------------------------
-- Browser-safe stock movement view. Unit acquisition cost is margin-sensitive.
-- Operational receipt totals can still be handled by dedicated charge/RPC flows.
-- ---------------------------------------------------------------------------
drop view if exists public.stock_entries_app;
create view public.stock_entries_app
with (security_barrier = true)
as
select
  s.id,
  s.boutique_id,
  s.product_id,
  s.type,
  s.qty,
  case when private.auth_has_permission(s.boutique_id, 'marges') then s.prix_unit else null end as prix_unit,
  s.entry_date,
  s.operator_id,
  s.note,
  s.created_at,
  s.supplier_id,
  s.reference,
  s.source_invoice_id,
  s.source_invoice_line_id,
  s.return_invoice_id,
  s.return_invoice_line_id,
  s.transfer_id,
  s.transfer_line_id
from public.stock_entries s
where private.auth_has_any_permission(
  s.boutique_id,
  array['stock','inventaire','transferts','fournisseurs']
);

revoke all on public.stock_entries_app from public, anon;
grant select on public.stock_entries_app to authenticated;

-- ---------------------------------------------------------------------------
-- Invoice view with embedded, cost-masked lines. This replaces PostgREST's
-- direct invoice_lines embedding for application reads.
-- ---------------------------------------------------------------------------
drop view if exists public.invoices_app;
create view public.invoices_app
with (security_barrier = true)
as
select
  i.*,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'boutique_id', l.boutique_id,
          'invoice_id', l.invoice_id,
          'product_id', l.product_id,
          'nom', l.nom,
          'qty', l.qty,
          'unit', l.unit,
          'prix_unit', l.prix_unit,
          'sell_unit', l.sell_unit,
          'sell_qty', l.sell_qty,
          'created_at', l.created_at,
          'prix_achat', case when private.auth_has_permission(l.boutique_id, 'marges') then l.prix_achat else null end,
          'source_invoice_line_id', l.source_invoice_line_id
        )
        order by l.id
      )
      from public.invoice_lines l
      where l.boutique_id = i.boutique_id
        and l.invoice_id = i.id
    ),
    '[]'::jsonb
  ) as invoice_lines
from public.invoices i
where private.auth_has_any_permission(
  i.boutique_id,
  array['factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts']
);

revoke all on public.invoices_app from public, anon;
grant select on public.invoices_app to authenticated;

-- ---------------------------------------------------------------------------
-- Remove direct browser access to cost columns. Keep safe column-level SELECT
-- grants so existing narrow writes that return identifiers continue to work.
-- ---------------------------------------------------------------------------
revoke select on public.products from authenticated;
grant select (
  id,boutique_id,nom,category_id,prix_vente,stock,unit,sell_unit,sell_qty,
  low_stock_threshold,barcode,actif,created_at,updated_at,image_url,supplier_name,
  pieces_per_lot,length_per_piece
) on public.products to authenticated;

revoke select on public.invoice_lines from authenticated;
grant select (
  id,boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit,sell_unit,sell_qty,
  created_at,source_invoice_line_id
) on public.invoice_lines to authenticated;

revoke select on public.stock_entries from authenticated;
grant select (
  id,boutique_id,product_id,type,qty,entry_date,operator_id,note,created_at,
  supplier_id,reference,source_invoice_id,source_invoice_line_id,return_invoice_id,
  return_invoice_line_id,transfer_id,transfer_line_id
) on public.stock_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard aggregate API. No raw client, invoice-line, charge or stock rows are
-- exposed to a dashboard-only user. Margin metrics are returned only when the
-- separate `marges` permission is active.
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_summary(
  p_boutique_id text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()) - interval '6 days');
  v_to timestamptz := coalesce(p_to, now() + interval '1 second');
  v_can_margin boolean;
  v_sales numeric := 0;
  v_collected numeric := 0;
  v_outstanding numeric := 0;
  v_charges numeric := 0;
  v_sales_count bigint := 0;
  v_clients_count bigint := 0;
  v_low_stock bigint := 0;
  v_margin numeric := null;
  v_stock_value numeric := null;
  v_series jsonb := '[]'::jsonb;
begin
  if not private.auth_has_permission(p_boutique_id, 'dashboard') then
    raise exception 'forbidden';
  end if;

  if v_to <= v_from then
    raise exception 'invalid dashboard period';
  end if;

  v_can_margin := private.auth_has_permission(p_boutique_id, 'marges');

  select
    coalesce(sum(case when lower(trim(coalesce(i.type,''))) = 'retour' then -i.montant else i.montant end),0),
    count(*) filter (where lower(trim(coalesce(i.type,''))) <> 'retour'),
    count(distinct i.client_id) filter (where i.client_id is not null)
  into v_sales, v_sales_count, v_clients_count
  from public.invoices i
  where i.boutique_id = p_boutique_id
    and i.invoice_date >= v_from
    and i.invoice_date < v_to
    and coalesce(i.status,'') <> 'annulée';

  select coalesce(sum(ip.amount),0)
  into v_collected
  from public.invoice_payments ip
  where ip.boutique_id = p_boutique_id
    and ip.paid_at >= v_from
    and ip.paid_at < v_to;

  select coalesce(sum(greatest(i.montant - coalesce(p.paid,0),0)),0)
  into v_outstanding
  from public.invoices i
  left join (
    select invoice_id, sum(amount) paid
    from public.invoice_payments
    where boutique_id = p_boutique_id
    group by invoice_id
  ) p on p.invoice_id = i.id
  where i.boutique_id = p_boutique_id
    and coalesce(i.status,'') <> 'annulée'
    and lower(trim(coalesce(i.type,''))) <> 'retour';

  select coalesce(sum(c.paid_amount),0)
  into v_charges
  from public.charges c
  where c.boutique_id = p_boutique_id
    and c.charge_date >= v_from
    and c.charge_date < v_to;

  select count(*)
  into v_low_stock
  from public.products p
  where p.boutique_id = p_boutique_id
    and coalesce(p.actif,true)
    and p.stock <= coalesce(p.low_stock_threshold,0);

  select coalesce(jsonb_agg(jsonb_build_object('date', d.bucket_day::date, 'sales', d.net_sales) order by d.bucket_day), '[]'::jsonb)
  into v_series
  from (
    select date_trunc('day', i.invoice_date) as bucket_day,
           coalesce(sum(case when lower(trim(coalesce(i.type,''))) = 'retour' then -i.montant else i.montant end),0) net_sales
    from public.invoices i
    where i.boutique_id = p_boutique_id
      and i.invoice_date >= v_from
      and i.invoice_date < v_to
      and coalesce(i.status,'') <> 'annulée'
    group by 1
  ) d;

  if v_can_margin then
    select coalesce(sum(
      case when lower(trim(coalesce(i.type,''))) = 'retour' then -1 else 1 end
      * ((coalesce(l.sell_qty,l.qty) * l.prix_unit) - (l.qty * coalesce(l.prix_achat,0)))
    ),0)
    into v_margin
    from public.invoices i
    join public.invoice_lines l
      on l.boutique_id=i.boutique_id and l.invoice_id=i.id
    where i.boutique_id = p_boutique_id
      and i.invoice_date >= v_from
      and i.invoice_date < v_to
      and coalesce(i.status,'') <> 'annulée';

    select coalesce(sum(greatest(p.stock,0) * coalesce(p.prix_achat,0)),0)
    into v_stock_value
    from public.products p
    where p.boutique_id = p_boutique_id and coalesce(p.actif,true);
  end if;

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'sales', v_sales,
    'collected', v_collected,
    'outstanding', v_outstanding,
    'charges', v_charges,
    'sales_count', v_sales_count,
    'clients_count', v_clients_count,
    'low_stock_count', v_low_stock,
    'margin', v_margin,
    'stock_value', v_stock_value,
    'series', v_series
  );
end;
$$;

revoke all on function public.get_dashboard_summary(text,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_dashboard_summary(text,timestamptz,timestamptz) to authenticated;

-- Dashboard now reads only from the aggregate RPC. Remove it from raw-table
-- visibility unions introduced by the previous compatibility migration.
drop policy if exists "categories: select permitted" on public.categories;
create policy "categories: select permitted" on public.categories for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts']));

drop policy if exists "products: select permitted" on public.products;
create policy "products: select permitted" on public.products for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','vente','inventaire','transferts','fournisseurs']));

drop policy if exists "stock_entries: select permitted" on public.stock_entries;
create policy "stock_entries: select permitted" on public.stock_entries for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['stock','inventaire','transferts','fournisseurs']));

drop policy if exists "clients: select permitted" on public.clients;
create policy "clients: select permitted" on public.clients for select to authenticated
using (private.auth_has_permission(boutique_id, 'clients'));

drop policy if exists "invoices: select permitted" on public.invoices;
create policy "invoices: select permitted" on public.invoices for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_lines: select permitted" on public.invoice_lines;
create policy "invoice_lines: select permitted" on public.invoice_lines for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','vente','compta','encaissement_vente','remboursement','annulation_commande','transferts'
]));

drop policy if exists "invoice_payments: select permitted" on public.invoice_payments;
create policy "invoice_payments: select permitted" on public.invoice_payments for select to authenticated
using (private.auth_has_any_permission(boutique_id, array[
  'factures','clients','compta','encaissement_vente','remboursement','transferts'
]));

drop policy if exists "charges: select permitted" on public.charges;
create policy "charges: select permitted" on public.charges for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['charges','compta','fournisseurs','stock']));

drop policy if exists "caisse_sessions: select permitted" on public.caisse_sessions;
create policy "caisse_sessions: select permitted" on public.caisse_sessions for select to authenticated
using (private.auth_has_any_permission(boutique_id, array['encaissement_vente','charges','compta']));
