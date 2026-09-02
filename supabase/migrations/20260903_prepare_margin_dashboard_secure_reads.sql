-- Phase 1 (zero-downtime): add browser-safe read surfaces before the frontend
-- switches to them. Existing raw-table grants/policies remain untouched here.

create or replace view public.products_app
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

create or replace view public.stock_entries_app
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

create or replace view public.invoices_app
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

  select coalesce(
    jsonb_agg(jsonb_build_object('date', d.bucket_day::date, 'sales', d.net_sales) order by d.bucket_day),
    '[]'::jsonb
  )
  into v_series
  from (
    select
      date_trunc('day', i.invoice_date) as bucket_day,
      coalesce(sum(case when lower(trim(coalesce(i.type,''))) = 'retour' then -i.montant else i.montant end),0) as net_sales
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
    where p.boutique_id = p_boutique_id
      and coalesce(p.actif,true);
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
