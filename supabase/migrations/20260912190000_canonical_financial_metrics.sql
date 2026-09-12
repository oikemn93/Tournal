-- Canonical financial metrics for Dashboard and Rapport.
-- This migration is additive: existing read surfaces remain available while the
-- frontend switches to this RPC. No production data is mutated.

create or replace function private.fifo_realized_margin_core(
  p_boutique_id text,
  p_from_at timestamptz,
  p_to_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_result jsonb;
begin
  if p_from_at is null or p_to_at is null or p_to_at <= p_from_at then
    raise exception 'invalid period';
  end if;

  with dedup_lines as (
    select distinct
      i.id invoice_id,
      i.invoice_date,
      i.montant,
      i.stock_deducted_at,
      il.product_id,
      il.nom product_name,
      il.qty,
      il.prix_unit,
      il.sell_qty
    from public.invoices i
    join public.invoice_lines il
      on il.boutique_id = i.boutique_id
     and il.invoice_id = i.id
    where i.boutique_id = p_boutique_id
      and lower(trim(coalesce(i.type,''))) = 'vente'
      and coalesce(i.status,'') <> 'annulée'
      and i.invoice_date >= p_from_at
      and i.invoice_date < p_to_at
  ), grouped as (
    select
      invoice_id,
      max(invoice_date) invoice_date,
      max(montant) invoice_amount,
      max(stock_deducted_at) stock_deducted_at,
      product_id,
      max(product_name) product_name,
      sum(qty) base_qty,
      sum(coalesce(sell_qty,qty) * prix_unit) gross_line_revenue
    from dedup_lines
    group by invoice_id,product_id
  ), weighted as (
    select g.*, sum(gross_line_revenue) over(partition by invoice_id) invoice_gross
    from grouped g
  ), sales as (
    select
      w.*,
      case when invoice_gross > 0
        then invoice_amount * (gross_line_revenue / invoice_gross)
        else 0
      end allocated_revenue,
      se.id stock_entry_id,
      case when se.id is null then null
        else private.fifo_outflow_cost(p_boutique_id,w.product_id,se.id)
      end fifo_cost
    from weighted w
    left join lateral (
      select s.id
      from public.stock_entries s
      where s.boutique_id = p_boutique_id
        and s.product_id = w.product_id
        and s.qty < 0
        and (
          s.note = 'Vente ' || w.invoice_id
          or s.note like '%| ' || w.invoice_id
          or s.reference = w.invoice_id
        )
      order by
        abs((-s.qty) - w.base_qty),
        case when s.note = 'Vente ' || w.invoice_id then 0 else 1 end,
        abs(extract(epoch from (s.entry_date - coalesce(w.stock_deducted_at,w.invoice_date)))),
        s.entry_date,
        s.id
      limit 1
    ) se on true
  ), totals as (
    select
      coalesce(sum(allocated_revenue),0) gross_revenue,
      coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0) valued_revenue,
      coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0) fifo_cost,
      count(*) line_count,
      count(*) filter(where stock_entry_id is null) unmatched_lines
    from sales
  )
  select jsonb_build_object(
    'fromAt',p_from_at,
    'toAt',p_to_at,
    'grossRevenue',t.gross_revenue,
    'revenue',t.valued_revenue,
    'fifoCost',t.fifo_cost,
    'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue <> 0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost <> 0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_revenue <> 0 then t.valued_revenue/t.gross_revenue*100 else 100 end,
    'lineCount',t.line_count,
    'unmatchedLines',t.unmatched_lines,
    'products',coalesce((
      select jsonb_agg(x order by (x->>'grossRevenue')::numeric desc)
      from (
        select jsonb_build_object(
          'productId',product_id,
          'productName',max(product_name),
          'qty',sum(base_qty),
          'grossRevenue',sum(allocated_revenue),
          'revenue',coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0),
          'fifoCost',coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0),
          'realizedMargin',coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0),
          'marginRate',case when coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0) <> 0
            then coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0)
              / sum(allocated_revenue) filter(where stock_entry_id is not null) * 100 else 0 end,
          'markupRate',case when coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0) <> 0
            then coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0)
              / sum(fifo_cost) filter(where stock_entry_id is not null) * 100 else 0 end,
          'coverageRate',case when sum(allocated_revenue) <> 0
            then coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0) / sum(allocated_revenue) * 100 else 100 end,
          'unmatchedLines',count(*) filter(where stock_entry_id is null)
        ) x
        from sales
        group by product_id
      ) q
    ),'[]'::jsonb)
  ) into v_result
  from totals t;

  return v_result;
end
$function$;

revoke all on function private.fifo_realized_margin_core(text,timestamptz,timestamptz) from public,anon,authenticated;

-- Preserve the existing public FIFO API, but make it a thin authorization
-- wrapper over the single canonical FIFO implementation above.
create or replace function public.get_fifo_realized_margin(
  p_boutique_id text,
  p_from_at timestamptz,
  p_to_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if not private.auth_has_read_permission(p_boutique_id,'marges') then
    raise exception 'forbidden';
  end if;
  return private.fifo_realized_margin_core(p_boutique_id,p_from_at,p_to_at);
end
$function$;

revoke all on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) to authenticated;

create or replace function public.get_financial_metrics(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_invoiced_revenue numeric := 0;
  v_sale_revenue numeric := 0;
  v_collected_cash numeric := 0;
  v_customer_outstanding_global numeric := 0;
  v_period_outstanding numeric := 0;
  v_cash_expenses numeric := 0;
  v_operating_cash_expenses numeric := 0;
  v_sales_count bigint := 0;
  v_average_basket numeric := 0;
  v_clients_count bigint := 0;
  v_low_stock_count bigint := 0;
  v_margin jsonb := null;
  v_sales_series jsonb := '[]'::jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid financial period';
  end if;
  if not (
    private.auth_has_read_permission(p_boutique_id,'dashboard')
    or private.auth_has_read_permission(p_boutique_id,'compta')
  ) then
    raise exception 'forbidden';
  end if;

  select
    coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0),
    coalesce(sum(i.montant) filter(where lower(trim(coalesce(i.type,''))) <> 'retour'),0),
    count(*) filter(where lower(trim(coalesce(i.type,''))) <> 'retour'),
    count(distinct i.client_id) filter(where lower(trim(coalesce(i.type,''))) <> 'retour' and i.client_id is not null)
  into v_invoiced_revenue,v_sale_revenue,v_sales_count,v_clients_count
  from public.invoices i
  where i.boutique_id = p_boutique_id
    and i.invoice_date >= p_from
    and i.invoice_date < p_to
    and coalesce(i.status,'') <> 'annulée';

  v_average_basket := case when v_sales_count > 0 then v_sale_revenue / v_sales_count else 0 end;

  select coalesce(sum(
    case when lower(trim(coalesce(i.type,'')))='retour' then -ip.amount else ip.amount end
  ),0)
  into v_collected_cash
  from public.invoice_payments ip
  join public.invoices i
    on i.boutique_id = ip.boutique_id
   and i.id = ip.invoice_id
  where ip.boutique_id = p_boutique_id
    and ip.paid_at >= p_from
    and ip.paid_at < p_to
    and coalesce(i.status,'') <> 'annulée';

  select v_collected_cash - coalesce(sum(r.amount),0)
  into v_collected_cash
  from public.client_credit_refunds r
  where r.boutique_id = p_boutique_id
    and r.refunded_at >= p_from
    and r.refunded_at < p_to;

  with paid as (
    select invoice_id,coalesce(sum(amount),0) paid
    from public.invoice_payments
    where boutique_id = p_boutique_id
    group by invoice_id
  )
  select coalesce(sum(greatest(i.montant-coalesce(p.paid,0),0)),0)
  into v_customer_outstanding_global
  from public.invoices i
  left join paid p on p.invoice_id = i.id
  where i.boutique_id = p_boutique_id
    and coalesce(i.status,'') <> 'annulée'
    and lower(trim(coalesce(i.type,''))) <> 'retour';

  with paid as (
    select invoice_id,coalesce(sum(amount),0) paid
    from public.invoice_payments
    where boutique_id = p_boutique_id
    group by invoice_id
  )
  select coalesce(sum(greatest(i.montant-coalesce(p.paid,0),0)),0)
  into v_period_outstanding
  from public.invoices i
  left join paid p on p.invoice_id = i.id
  where i.boutique_id = p_boutique_id
    and i.invoice_date >= p_from
    and i.invoice_date < p_to
    and coalesce(i.status,'') <> 'annulée'
    and lower(trim(coalesce(i.type,''))) <> 'retour';

  select
    coalesce(sum(case
      when c.source = 'supplier_receipt' then 0
      when c.source = 'transfer' then coalesce(c.paid_amount,0)
      else c.montant
    end),0),
    coalesce(sum(case
      when c.source = 'supplier_receipt' then 0
      when c.categorie = 'Achat stock' then 0
      when c.source = 'transfer' then coalesce(c.paid_amount,0)
      else c.montant
    end),0)
  into v_cash_expenses,v_operating_cash_expenses
  from public.charges c
  where c.boutique_id = p_boutique_id
    and c.charge_date >= p_from
    and c.charge_date < p_to;

  select count(*)
  into v_low_stock_count
  from public.products p
  where p.boutique_id = p_boutique_id
    and coalesce(p.actif,true)
    and p.stock <= coalesce(p.low_stock_threshold,0);

  select coalesce(jsonb_agg(jsonb_build_object('date',d.bucket_day::date,'sales',d.net_sales) order by d.bucket_day),'[]'::jsonb)
  into v_sales_series
  from (
    select date_trunc('day',i.invoice_date) bucket_day,
      coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0) net_sales
    from public.invoices i
    where i.boutique_id = p_boutique_id
      and i.invoice_date >= p_from
      and i.invoice_date < p_to
      and coalesce(i.status,'') <> 'annulée'
    group by 1
  ) d;

  if private.auth_has_read_permission(p_boutique_id,'marges') then
    v_margin := private.fifo_realized_margin_core(p_boutique_id,p_from,p_to);
  end if;

  return jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'invoiced_revenue',v_invoiced_revenue,
    'collected_cash',v_collected_cash,
    'customer_outstanding_global',v_customer_outstanding_global,
    'period_outstanding',v_period_outstanding,
    'cash_expenses',v_cash_expenses,
    'operating_cash_expenses',v_operating_cash_expenses,
    'sales_count',v_sales_count,
    'average_basket',v_average_basket,
    'clients_count',v_clients_count,
    'low_stock_count',v_low_stock_count,
    'realized_margin_fifo',case when v_margin is null then null else (v_margin->>'realizedMargin')::numeric end,
    'margin_rate',case when v_margin is null then null else (v_margin->>'marginRate')::numeric end,
    'fifo_cost',case when v_margin is null then null else (v_margin->>'fifoCost')::numeric end,
    'margin_revenue',case when v_margin is null then null else (v_margin->>'revenue')::numeric end,
    'margin_gross_revenue',case when v_margin is null then null else (v_margin->>'grossRevenue')::numeric end,
    'margin_coverage_rate',case when v_margin is null then null else (v_margin->>'coverageRate')::numeric end,
    'margin_line_count',case when v_margin is null then null else (v_margin->>'lineCount')::bigint end,
    'margin_unmatched_lines',case when v_margin is null then null else (v_margin->>'unmatchedLines')::bigint end,
    'sales_series',v_sales_series
  );
end
$function$;

revoke all on function public.get_financial_metrics(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_financial_metrics(text,timestamptz,timestamptz) to authenticated;
