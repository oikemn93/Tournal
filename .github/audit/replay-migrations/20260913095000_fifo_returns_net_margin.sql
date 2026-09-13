CREATE OR REPLACE FUNCTION private.fifo_realized_margin_core(p_boutique_id text, p_from_at timestamptz, p_to_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
      lower(trim(coalesce(i.type,''))) invoice_type,
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
      and lower(trim(coalesce(i.type,''))) in ('vente','retour')
      and coalesce(i.status,'') <> 'annulée'
      and i.invoice_date >= p_from_at
      and i.invoice_date < p_to_at
  ), grouped as (
    select
      invoice_id,
      max(invoice_date) invoice_date,
      max(invoice_type) invoice_type,
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
  ), valued as (
    select
      w.*,
      case when w.invoice_type='retour' then -1 else 1 end event_sign,
      case when w.invoice_gross > 0
        then (case when w.invoice_type='retour' then -1 else 1 end)
             * w.invoice_amount * (w.gross_line_revenue / w.invoice_gross)
        else 0
      end allocated_revenue,
      coalesce(sale_cost.entry_count,0) sale_entry_count,
      coalesce(sale_cost.fifo_cost,0) sale_fifo_cost,
      coalesce(return_cost.entry_count,0) return_entry_count,
      coalesce(return_cost.fifo_cost,0) return_fifo_cost
    from weighted w
    left join lateral (
      select
        count(*)::bigint entry_count,
        coalesce(sum(private.fifo_outflow_cost(p_boutique_id,w.product_id,se.id)),0) fifo_cost
      from public.stock_entries se
      where w.invoice_type='vente'
        and se.boutique_id=p_boutique_id
        and se.product_id=w.product_id
        and se.qty<0
        and (
          se.source_invoice_id=w.invoice_id
          or se.note='Vente '||w.invoice_id
          or se.note like '%| '||w.invoice_id
          or se.reference=w.invoice_id
        )
    ) sale_cost on true
    left join lateral (
      select
        count(*)::bigint entry_count,
        coalesce(sum(se.qty * coalesce(se.prix_unit,0)),0) fifo_cost
      from public.stock_entries se
      where w.invoice_type='retour'
        and se.boutique_id=p_boutique_id
        and se.product_id=w.product_id
        and se.qty>0
        and se.return_invoice_id=w.invoice_id
    ) return_cost on true
  ), events as (
    select
      v.*,
      case when v.invoice_type='retour' then v.return_entry_count>0 else v.sale_entry_count>0 end matched,
      case when v.invoice_type='retour' then -v.return_fifo_cost else v.sale_fifo_cost end signed_fifo_cost,
      case when v.invoice_type='retour' then -v.base_qty else v.base_qty end signed_qty
    from valued v
  ), totals as (
    select
      coalesce(sum(allocated_revenue),0) gross_revenue,
      coalesce(sum(allocated_revenue) filter(where matched),0) valued_revenue,
      coalesce(sum(signed_fifo_cost) filter(where matched),0) fifo_cost,
      coalesce(sum(abs(allocated_revenue)),0) coverage_gross,
      coalesce(sum(abs(allocated_revenue)) filter(where matched),0) coverage_valued,
      count(*) line_count,
      count(*) filter(where not matched) unmatched_lines
    from events
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
    'coverageRate',case when t.coverage_gross <> 0 then t.coverage_valued/t.coverage_gross*100 else 100 end,
    'lineCount',t.line_count,
    'unmatchedLines',t.unmatched_lines,
    'products',coalesce((
      select jsonb_agg(x order by abs((x->>'grossRevenue')::numeric) desc)
      from (
        select jsonb_build_object(
          'productId',product_id,
          'productName',max(product_name),
          'qty',sum(signed_qty),
          'grossRevenue',sum(allocated_revenue),
          'revenue',coalesce(sum(allocated_revenue) filter(where matched),0),
          'fifoCost',coalesce(sum(signed_fifo_cost) filter(where matched),0),
          'realizedMargin',coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0),
          'marginRate',case when coalesce(sum(allocated_revenue) filter(where matched),0) <> 0
            then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0)
              / sum(allocated_revenue) filter(where matched) * 100 else 0 end,
          'markupRate',case when coalesce(sum(signed_fifo_cost) filter(where matched),0) <> 0
            then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0)
              / sum(signed_fifo_cost) filter(where matched) * 100 else 0 end,
          'coverageRate',case when coalesce(sum(abs(allocated_revenue)),0) <> 0
            then coalesce(sum(abs(allocated_revenue)) filter(where matched),0) / sum(abs(allocated_revenue)) * 100 else 100 end,
          'unmatchedLines',count(*) filter(where not matched)
        ) x
        from events
        group by product_id
      ) q
    ),'[]'::jsonb)
  ) into v_result
  from totals t;

  return v_result;
end
$function$;

revoke all on function private.fifo_realized_margin_core(text,timestamptz,timestamptz) from public,anon,authenticated;
