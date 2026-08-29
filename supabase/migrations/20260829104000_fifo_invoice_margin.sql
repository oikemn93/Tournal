create or replace function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text)
returns jsonb
language plpgsql security definer
set search_path to pg_catalog, public, private
as $$
declare v_result jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'marges') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id) then raise exception 'invoice_not_found'; end if;
  with dedup_lines as (
    select distinct i.id invoice_id,i.montant,i.stock_deducted_at,i.invoice_date,il.product_id,il.nom product_name,il.qty,il.prix_unit,il.sell_qty,il.sell_unit
    from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    where i.boutique_id=p_boutique_id and i.id=p_invoice_id and lower(i.type)='vente' and i.status<>'annulée'
  ), grouped as (
    select invoice_id,max(invoice_date) invoice_date,max(montant) invoice_amount,max(stock_deducted_at) stock_deducted_at,product_id,max(product_name) product_name,sum(qty) base_qty,
      sum((case when sell_qty is not null then sell_qty else qty end)*prix_unit) gross_line_revenue
    from dedup_lines group by invoice_id,product_id
  ), weighted as (
    select g.*,sum(gross_line_revenue) over(partition by invoice_id) invoice_gross from grouped g
  ), sales as (
    select w.*,case when invoice_gross>0 then invoice_amount*(gross_line_revenue/invoice_gross) else 0 end allocated_revenue,se.id stock_entry_id,
      case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,w.product_id,se.id) end fifo_cost
    from weighted w left join lateral (
      select s.id from public.stock_entries s where s.boutique_id=p_boutique_id and s.product_id=w.product_id and s.qty<0
        and (s.note='Vente '||w.invoice_id or s.note like '%| '||w.invoice_id or s.reference=w.invoice_id)
      order by abs((-s.qty)-w.base_qty),case when s.note='Vente '||w.invoice_id then 0 else 1 end,abs(extract(epoch from (s.entry_date-coalesce(w.stock_deducted_at,w.invoice_date)))),s.entry_date,s.id limit 1
    ) se on true
  ), totals as (
    select coalesce(sum(allocated_revenue),0) gross_revenue,coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0) valued_revenue,
      coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0) fifo_cost,count(*) line_count,count(*) filter(where stock_entry_id is null) unmatched_lines from sales
  )
  select jsonb_build_object('invoiceId',p_invoice_id,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_revenue<>0 then t.valued_revenue/t.gross_revenue*100 else 100 end,'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by (x->>'grossRevenue')::numeric desc) from (
      select jsonb_build_object('productId',product_id,'productName',max(product_name),'qty',sum(base_qty),'grossRevenue',sum(allocated_revenue),
        'revenue',coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0),'fifoCost',coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0),
        'realizedMargin',coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0),'unmatchedLines',count(*) filter(where stock_entry_id is null)) x
      from sales group by product_id) q),'[]'::jsonb)) into v_result from totals t;
  return v_result;
end $$;
revoke all on function public.get_fifo_invoice_margin(text,text) from public,anon;
grant execute on function public.get_fifo_invoice_margin(text,text) to authenticated;
