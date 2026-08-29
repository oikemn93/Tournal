-- Return-aware FIFO profitability and immutable stock history.
-- Returns reverse revenue and COGS on the date of the credit note. Missing historical cost
-- remains explicitly unmatched rather than being silently invented.

drop policy if exists "products: delete" on public.products;

create or replace function public.get_fifo_invoice_margin(p_boutique_id text,p_invoice_id text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare v_result jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'marges') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id and lower(coalesce(type,''))<>'retour') then raise exception 'invoice_not_found'; end if;
  with source_invoice as (
    select * from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id and status<>'annulée'
  ), sale_raw as (
    select il.id line_id,il.product_id,il.nom product_name,il.qty base_qty,(coalesce(il.sell_qty,il.qty)*il.prix_unit) raw_revenue,i.montant invoice_amount,
      sum(coalesce(il.sell_qty,il.qty)*il.prix_unit) over(partition by i.id) invoice_gross
    from source_invoice i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
  ), sale_rows as (
    select 1::numeric sign,s.line_id,s.product_id,s.product_name,s.base_qty,case when s.invoice_gross>0 then s.invoice_amount*(s.raw_revenue/s.invoice_gross) else 0 end allocated_revenue,
      se.id stock_entry_id,case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,s.product_id,se.id) end row_cost
    from sale_raw s left join lateral (
      select e.id from public.stock_entries e where e.boutique_id=p_boutique_id and e.qty<0 and e.product_id=s.product_id and e.source_invoice_line_id=s.line_id order by e.entry_date,e.id limit 1
    ) se on true
  ), return_raw as (
    select rl.id line_id,rl.product_id,rl.nom product_name,rl.qty base_qty,(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) raw_revenue,r.montant invoice_amount,
      sum(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) over(partition by r.id) invoice_gross,rl.prix_achat,rse.prix_unit return_unit_cost
    from public.invoices r join public.invoice_lines rl on rl.boutique_id=r.boutique_id and rl.invoice_id=r.id
    left join public.stock_entries rse on rse.boutique_id=r.boutique_id and rse.return_invoice_line_id=rl.id and rse.type='retour'
    where r.boutique_id=p_boutique_id and r.type='Retour' and r.return_of_invoice_id=p_invoice_id
  ), return_rows as (
    select (-1)::numeric sign,line_id,product_id,product_name,base_qty,case when invoice_gross>0 then invoice_amount*(raw_revenue/invoice_gross) else 0 end allocated_revenue,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then line_id else null end stock_entry_id,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then base_qty*coalesce(prix_achat,return_unit_cost) else null end row_cost
    from return_raw
  ), rows as (
    select sign,line_id,product_id,product_name,sign*base_qty signed_qty,sign*allocated_revenue signed_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end signed_cost from sale_rows
    union all
    select sign,line_id,product_id,product_name,sign*base_qty,sign*allocated_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end from return_rows
  ), totals as (
    select coalesce(sum(signed_revenue),0) gross_revenue,coalesce(sum(signed_revenue) filter(where signed_cost is not null),0) valued_revenue,
      coalesce(sum(signed_cost) filter(where signed_cost is not null),0) fifo_cost,coalesce(sum(abs(signed_revenue)),0) gross_abs,
      coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0) valued_abs,count(*) line_count,count(*) filter(where signed_cost is null) unmatched_lines from rows
  )
  select jsonb_build_object(
    'invoiceId',p_invoice_id,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_abs<>0 then t.valued_abs/t.gross_abs*100 else 100 end,'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by abs((x->>'grossRevenue')::numeric) desc) from (
      select jsonb_build_object('productId',product_id,'productName',max(product_name),'qty',sum(signed_qty),'grossRevenue',sum(signed_revenue),
        'revenue',coalesce(sum(signed_revenue) filter(where signed_cost is not null),0),'fifoCost',coalesce(sum(signed_cost) filter(where signed_cost is not null),0),
        'realizedMargin',coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0),
        'marginRate',case when coalesce(sum(signed_revenue) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_revenue) filter(where signed_cost is not null))*100 else 0 end,
        'markupRate',case when coalesce(sum(signed_cost) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_cost) filter(where signed_cost is not null))*100 else 0 end,
        'coverageRate',case when sum(abs(signed_revenue))<>0 then coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0)/sum(abs(signed_revenue))*100 else 100 end,
        'unmatchedLines',count(*) filter(where signed_cost is null)) x from rows group by product_id
    ) q),'[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end $$;

create or replace function public.get_fifo_realized_margin(p_boutique_id text,p_from_at timestamptz,p_to_at timestamptz)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare v_result jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'marges') then raise exception 'forbidden'; end if;
  if p_from_at is null or p_to_at is null or p_to_at<=p_from_at then raise exception 'invalid period'; end if;
  with sale_raw as (
    select i.id invoice_id,il.id line_id,il.product_id,il.nom product_name,il.qty base_qty,(coalesce(il.sell_qty,il.qty)*il.prix_unit) raw_revenue,i.montant invoice_amount,
      sum(coalesce(il.sell_qty,il.qty)*il.prix_unit) over(partition by i.id) invoice_gross
    from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    where i.boutique_id=p_boutique_id and lower(i.type)='vente' and i.status<>'annulée' and i.invoice_date>=p_from_at and i.invoice_date<p_to_at
  ), sale_rows as (
    select 1::numeric sign,s.invoice_id,s.line_id,s.product_id,s.product_name,s.base_qty,case when s.invoice_gross>0 then s.invoice_amount*(s.raw_revenue/s.invoice_gross) else 0 end allocated_revenue,
      se.id stock_entry_id,case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,s.product_id,se.id) end row_cost
    from sale_raw s left join lateral (
      select e.id from public.stock_entries e where e.boutique_id=p_boutique_id and e.qty<0 and e.product_id=s.product_id and e.source_invoice_line_id=s.line_id order by e.entry_date,e.id limit 1
    ) se on true
  ), return_raw as (
    select r.id invoice_id,rl.id line_id,rl.product_id,rl.nom product_name,rl.qty base_qty,(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) raw_revenue,r.montant invoice_amount,
      sum(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) over(partition by r.id) invoice_gross,rl.prix_achat,rse.prix_unit return_unit_cost
    from public.invoices r join public.invoice_lines rl on rl.boutique_id=r.boutique_id and rl.invoice_id=r.id
    left join public.stock_entries rse on rse.boutique_id=r.boutique_id and rse.return_invoice_line_id=rl.id and rse.type='retour'
    where r.boutique_id=p_boutique_id and r.type='Retour' and r.invoice_date>=p_from_at and r.invoice_date<p_to_at
  ), return_rows as (
    select (-1)::numeric sign,invoice_id,line_id,product_id,product_name,base_qty,case when invoice_gross>0 then invoice_amount*(raw_revenue/invoice_gross) else 0 end allocated_revenue,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then line_id else null end stock_entry_id,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then base_qty*coalesce(prix_achat,return_unit_cost) else null end row_cost from return_raw
  ), rows as (
    select sign,invoice_id,line_id,product_id,product_name,sign*base_qty signed_qty,sign*allocated_revenue signed_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end signed_cost from sale_rows
    union all
    select sign,invoice_id,line_id,product_id,product_name,sign*base_qty,sign*allocated_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end from return_rows
  ), totals as (
    select coalesce(sum(signed_revenue),0) gross_revenue,coalesce(sum(signed_revenue) filter(where signed_cost is not null),0) valued_revenue,
      coalesce(sum(signed_cost) filter(where signed_cost is not null),0) fifo_cost,coalesce(sum(abs(signed_revenue)),0) gross_abs,
      coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0) valued_abs,count(*) line_count,count(*) filter(where signed_cost is null) unmatched_lines from rows
  )
  select jsonb_build_object(
    'fromAt',p_from_at,'toAt',p_to_at,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_abs<>0 then t.valued_abs/t.gross_abs*100 else 100 end,'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by abs((x->>'grossRevenue')::numeric) desc) from (
      select jsonb_build_object('productId',product_id,'productName',max(product_name),'qty',sum(signed_qty),'grossRevenue',sum(signed_revenue),
        'revenue',coalesce(sum(signed_revenue) filter(where signed_cost is not null),0),'fifoCost',coalesce(sum(signed_cost) filter(where signed_cost is not null),0),
        'realizedMargin',coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0),
        'marginRate',case when coalesce(sum(signed_revenue) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_revenue) filter(where signed_cost is not null))*100 else 0 end,
        'markupRate',case when coalesce(sum(signed_cost) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_cost) filter(where signed_cost is not null))*100 else 0 end,
        'coverageRate',case when sum(abs(signed_revenue))<>0 then coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0)/sum(abs(signed_revenue))*100 else 100 end,
        'unmatchedLines',count(*) filter(where signed_cost is null)) x from rows group by product_id
    ) q),'[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end $$;

revoke all on function public.get_fifo_invoice_margin(text,text) from public,anon;
grant execute on function public.get_fifo_invoice_margin(text,text) to authenticated,service_role;
revoke all on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_fifo_realized_margin(text,timestamptz,timestamptz) to authenticated,service_role;
