create or replace function private.fifo_outflow_cost(
  p_boutique_id text,
  p_product_id bigint,
  p_outflow_entry_id bigint
) returns numeric
language plpgsql stable
set search_path to pg_catalog, public, private
as $$
declare
  r record;
  v_target_date timestamptz;
  v_qties numeric[]:=array[]::numeric[];
  v_costs numeric[]:=array[]::numeric[];
  v_qty numeric;
  v_take numeric;
  v_i int;
  v_cost numeric:=0;
  v_fallback numeric:=0;
  v_found boolean:=false;
begin
  select entry_date into v_target_date from public.stock_entries
  where id=p_outflow_entry_id and boutique_id=p_boutique_id and product_id=p_product_id;
  if not found then return 0; end if;
  for r in
    select id,qty,coalesce(prix_unit,0) cost,entry_date from public.stock_entries
    where boutique_id=p_boutique_id and product_id=p_product_id
      and (entry_date<v_target_date or (entry_date=v_target_date and id<=p_outflow_entry_id))
    order by entry_date,id
  loop
    if r.qty>0 then
      if r.cost>0 then v_fallback:=r.cost; end if;
      v_qties:=array_append(v_qties,r.qty);
      v_costs:=array_append(v_costs,case when r.cost>0 then r.cost else v_fallback end);
    elsif r.qty<0 then
      v_qty:=-r.qty; v_i:=1;
      while v_qty>0 and v_i<=coalesce(array_length(v_qties,1),0) loop
        if v_qties[v_i]>0 then
          v_take:=least(v_qty,v_qties[v_i]);
          if r.id=p_outflow_entry_id then v_cost:=v_cost+v_take*coalesce(v_costs[v_i],v_fallback,0); end if;
          v_qties[v_i]:=v_qties[v_i]-v_take; v_qty:=v_qty-v_take;
        end if;
        v_i:=v_i+1;
      end loop;
      if r.id=p_outflow_entry_id then
        if v_qty>0 then v_cost:=v_cost+v_qty*v_fallback; end if;
        v_found:=true; exit;
      end if;
    end if;
  end loop;
  if not v_found then return 0; end if;
  return coalesce(v_cost,0);
end $$;

create or replace function public.get_fifo_realized_margin(p_boutique_id text,p_from_at timestamptz,p_to_at timestamptz) returns jsonb
language plpgsql security definer
set search_path to pg_catalog, public, private
as $$
declare v_result jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if p_from_at is null or p_to_at is null or p_to_at<=p_from_at then raise exception 'invalid period'; end if;
  with dedup_lines as (
    select distinct i.id invoice_id,i.invoice_date,i.montant,i.stock_deducted_at,il.product_id,il.nom product_name,il.qty,il.prix_unit,il.sell_qty,il.sell_unit
    from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    where i.boutique_id=p_boutique_id and lower(i.type)='vente' and i.status<>'annulée' and i.invoice_date>=p_from_at and i.invoice_date<p_to_at
  ), grouped as (
    select invoice_id,max(invoice_date) invoice_date,max(montant) invoice_amount,max(stock_deducted_at) stock_deducted_at,product_id,max(product_name) product_name,sum(qty) base_qty,sum((case when sell_qty is not null then sell_qty else qty end)*prix_unit) gross_line_revenue
    from dedup_lines group by invoice_id,product_id
  ), weighted as (
    select g.*,sum(gross_line_revenue) over(partition by invoice_id) invoice_gross from grouped g
  ), sales as (
    select w.*,case when invoice_gross>0 then invoice_amount*(gross_line_revenue/invoice_gross) else 0 end allocated_revenue,se.id stock_entry_id,case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,w.product_id,se.id) end fifo_cost
    from weighted w
    left join lateral (
      select s.id from public.stock_entries s
      where s.boutique_id=p_boutique_id and s.product_id=w.product_id and s.qty<0 and (s.note='Vente '||w.invoice_id or s.note like '%| '||w.invoice_id or s.reference=w.invoice_id)
      order by abs((-s.qty)-w.base_qty),case when s.note='Vente '||w.invoice_id then 0 else 1 end,abs(extract(epoch from (s.entry_date-coalesce(w.stock_deducted_at,w.invoice_date)))),s.entry_date,s.id limit 1
    ) se on true
  ), totals as (
    select coalesce(sum(allocated_revenue),0) gross_revenue,coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0) valued_revenue,coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0) fifo_cost,count(*) line_count,count(*) filter(where stock_entry_id is null) unmatched_lines from sales
  )
  select jsonb_build_object(
    'fromAt',p_from_at,'toAt',p_to_at,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_revenue<>0 then t.valued_revenue/t.gross_revenue*100 else 100 end,
    'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by (x->>'grossRevenue')::numeric desc) from (
      select jsonb_build_object('productId',product_id,'productName',max(product_name),'qty',sum(base_qty),'grossRevenue',sum(allocated_revenue),'revenue',coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0),'fifoCost',coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0),'realizedMargin',coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0),'marginRate',case when coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0)<>0 then coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0)/sum(allocated_revenue) filter(where stock_entry_id is not null)*100 else 0 end,'markupRate',case when coalesce(sum(fifo_cost) filter(where stock_entry_id is not null),0)<>0 then coalesce(sum(allocated_revenue-fifo_cost) filter(where stock_entry_id is not null),0)/sum(fifo_cost) filter(where stock_entry_id is not null)*100 else 0 end,'coverageRate',case when sum(allocated_revenue)<>0 then coalesce(sum(allocated_revenue) filter(where stock_entry_id is not null),0)/sum(allocated_revenue)*100 else 100 end,'unmatchedLines',count(*) filter(where stock_entry_id is null)) x from sales group by product_id
    ) q),'[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end $$;
revoke all on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) to authenticated;
