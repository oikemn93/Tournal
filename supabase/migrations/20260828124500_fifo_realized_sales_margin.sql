create or replace function private.fifo_outflow_cost(
  p_boutique_id text,
  p_product_id bigint,
  p_outflow_entry_id bigint
) returns numeric
language plpgsql stable
set search_path to pg_catalog, public, private
as $$
declare r record; v_qties numeric[]:=array[]::numeric[]; v_costs numeric[]:=array[]::numeric[]; v_qty numeric; v_take numeric; v_i int; v_cost numeric:=0; v_fallback numeric:=0; v_found boolean:=false;
begin
  for r in select id,qty,coalesce(prix_unit,0) cost from public.stock_entries where boutique_id=p_boutique_id and product_id=p_product_id and id<=p_outflow_entry_id order by entry_date,id loop
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
  with sales as (
    select i.id invoice_id,i.invoice_date,il.product_id,il.nom product_name,il.qty,il.prix_unit,il.qty*il.prix_unit revenue,se.id stock_entry_id,
      case when se.id is null then 0 else private.fifo_outflow_cost(p_boutique_id,il.product_id,se.id) end fifo_cost
    from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    left join lateral (select s.id from public.stock_entries s where s.boutique_id=i.boutique_id and s.product_id=il.product_id and s.qty<0 and s.note=('Vente '||i.id) order by abs(s.qty+il.qty),s.entry_date,s.id limit 1) se on true
    where i.boutique_id=p_boutique_id and lower(i.type)='vente' and i.status<>'annulée' and i.invoice_date>=p_from_at and i.invoice_date<p_to_at
  ), totals as (
    select coalesce(sum(revenue),0) revenue,coalesce(sum(fifo_cost),0) fifo_cost,coalesce(sum(revenue-fifo_cost),0) margin,count(*) line_count,count(*) filter(where stock_entry_id is null) unmatched_lines from sales
  )
  select jsonb_build_object('fromAt',p_from_at,'toAt',p_to_at,'revenue',t.revenue,'fifoCost',t.fifo_cost,'realizedMargin',t.margin,'marginRate',case when t.revenue<>0 then t.margin/t.revenue*100 else 0 end,'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,'products',coalesce((select jsonb_agg(x order by (x->>'revenue')::numeric desc) from (select jsonb_build_object('productId',product_id,'productName',max(product_name),'qty',sum(qty),'revenue',sum(revenue),'fifoCost',sum(fifo_cost),'realizedMargin',sum(revenue-fifo_cost),'unmatchedLines',count(*) filter(where stock_entry_id is null)) x from sales group by product_id) q),'[]'::jsonb)) into v_result from totals t;
  return v_result;
end $$;
revoke all on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) to authenticated;
comment on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) is 'Realized sales margin for a period using FIFO cost reconstructed from canonical stock movements; unmatchedLines exposes sales lacking a matching stock outflow.';
