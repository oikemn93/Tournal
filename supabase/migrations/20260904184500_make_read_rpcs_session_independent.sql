-- Read-only RPCs must remain available when the short-lived app session expires.
-- Authorization still requires an active platform user plus the assigned read right.

create or replace function public.get_dashboard_summary(
  p_boutique_id text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_from timestamptz:=coalesce(p_from,date_trunc('day',now())-interval '6 days');
  v_to timestamptz:=coalesce(p_to,now()+interval '1 second');
  v_can_margin boolean; v_sales numeric:=0; v_collected numeric:=0; v_outstanding numeric:=0; v_charges numeric:=0;
  v_sales_count bigint:=0; v_clients_count bigint:=0; v_low_stock bigint:=0; v_margin numeric:=null; v_stock_value numeric:=null; v_series jsonb:='[]'::jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'dashboard') then raise exception 'forbidden'; end if;
  if v_to<=v_from then raise exception 'invalid dashboard period'; end if;
  v_can_margin:=private.auth_has_read_permission(p_boutique_id,'marges');
  select coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0),count(*) filter(where lower(trim(coalesce(i.type,'')))<>'retour'),count(distinct i.client_id) filter(where i.client_id is not null)
  into v_sales,v_sales_count,v_clients_count
  from public.invoices i
  where i.boutique_id=p_boutique_id and i.invoice_date>=v_from and i.invoice_date<v_to and coalesce(i.status,'')<>'annulée';
  select coalesce(sum(ip.amount),0) into v_collected from public.invoice_payments ip where ip.boutique_id=p_boutique_id and ip.paid_at>=v_from and ip.paid_at<v_to;
  select coalesce(sum(greatest(i.montant-coalesce(p.paid,0),0)),0) into v_outstanding
  from public.invoices i left join (select invoice_id,sum(amount) paid from public.invoice_payments where boutique_id=p_boutique_id group by invoice_id)p on p.invoice_id=i.id
  where i.boutique_id=p_boutique_id and coalesce(i.status,'')<>'annulée' and lower(trim(coalesce(i.type,'')))<>'retour';
  select coalesce(sum(c.paid_amount),0) into v_charges from public.charges c where c.boutique_id=p_boutique_id and c.charge_date>=v_from and c.charge_date<v_to;
  select count(*) into v_low_stock from public.products p where p.boutique_id=p_boutique_id and coalesce(p.actif,true) and p.stock<=coalesce(p.low_stock_threshold,0);
  select coalesce(jsonb_agg(jsonb_build_object('date',d.bucket_day::date,'sales',d.net_sales) order by d.bucket_day),'[]'::jsonb) into v_series
  from (select date_trunc('day',i.invoice_date) as bucket_day,coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0) as net_sales from public.invoices i where i.boutique_id=p_boutique_id and i.invoice_date>=v_from and i.invoice_date<v_to and coalesce(i.status,'')<>'annulée' group by 1)d;
  if v_can_margin then
    select coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -1 else 1 end*((coalesce(l.sell_qty,l.qty)*l.prix_unit)-(l.qty*coalesce(l.prix_achat,0)))),0) into v_margin
    from public.invoices i join public.invoice_lines l on l.boutique_id=i.boutique_id and l.invoice_id=i.id
    where i.boutique_id=p_boutique_id and i.invoice_date>=v_from and i.invoice_date<v_to and coalesce(i.status,'')<>'annulée';
    select coalesce(sum(greatest(p.stock,0)*coalesce(p.prix_achat,0)),0) into v_stock_value from public.products p where p.boutique_id=p_boutique_id and coalesce(p.actif,true);
  end if;
  return jsonb_build_object('from',v_from,'to',v_to,'sales',v_sales,'collected',v_collected,'outstanding',v_outstanding,'charges',v_charges,'sales_count',v_sales_count,'clients_count',v_clients_count,'low_stock_count',v_low_stock,'margin',v_margin,'stock_value',v_stock_value,'series',v_series);
end;
$function$;

create or replace function public.get_boutique_partners(p_boutique_id text)
returns table(boutique_id text, nom text, ville text, tel text, transfer_count bigint)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if auth.uid() is null or not private.auth_has_read_permission(p_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  return query select b.id,b.nom,coalesce(b.ville,''),coalesce(b.tel,''),(select count(*) from public.stock_transfers st where (st.from_boutique_id=p_boutique_id and st.to_boutique_id=b.id) or (st.to_boutique_id=p_boutique_id and st.from_boutique_id=b.id)) from public.boutique_partners bp join public.boutiques b on b.id=bp.partner_boutique_id where bp.boutique_id=p_boutique_id order by 5 desc,b.nom asc;
end;
$function$;

create or replace function public.search_boutique_directory(p_source_boutique_id text, p_query text default null)
returns table(boutique_id text, nom text, ville text, tel text, is_partner boolean, transfer_count bigint)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_digits text:=regexp_replace(coalesce(p_query,''),'[^0-9]','','g'); v_last9 text;
begin
  if auth.uid() is null or not private.auth_has_read_permission(p_source_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  if length(v_digits)<9 then return; end if; v_last9:=right(v_digits,9);
  return query select b.id,b.nom,coalesce(b.ville,''),coalesce(b.tel,''),exists(select 1 from public.boutique_partners bp where bp.boutique_id=p_source_boutique_id and bp.partner_boutique_id=b.id),(select count(*) from public.stock_transfers st where (st.from_boutique_id=p_source_boutique_id and st.to_boutique_id=b.id) or (st.to_boutique_id=p_source_boutique_id and st.from_boutique_id=b.id)) from public.boutiques b where b.id<>p_source_boutique_id and b.directory_visible=true and length(regexp_replace(coalesce(b.tel,''),'[^0-9]','','g'))>=9 and right(regexp_replace(coalesce(b.tel,''),'[^0-9]','','g'),9)=v_last9 order by 5 desc,6 desc,b.nom asc limit 10;
end;
$function$;

create or replace function public.get_fifo_invoice_margin(p_boutique_id text, p_invoice_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_result jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'marges') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id and lower(coalesce(type,''))<>'retour') then raise exception 'invoice_not_found'; end if;

  with source_invoice as (
    select * from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id and status<>'annulée'
  ), sale_raw as (
    select il.id line_id,il.product_id,il.nom product_name,il.qty base_qty,
      (coalesce(il.sell_qty,il.qty)*il.prix_unit) raw_revenue,
      i.montant invoice_amount,
      sum(coalesce(il.sell_qty,il.qty)*il.prix_unit) over(partition by i.id) invoice_gross
    from source_invoice i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
  ), sale_rows as (
    select 1::numeric sign,s.line_id,s.product_id,s.product_name,s.base_qty,
      case when s.invoice_gross>0 then s.invoice_amount*(s.raw_revenue/s.invoice_gross) else 0 end allocated_revenue,
      se.id stock_entry_id,
      case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,s.product_id,se.id) end row_cost
    from sale_raw s
    left join lateral (
      select e.id from public.stock_entries e
      where e.boutique_id=p_boutique_id and e.qty<0 and e.product_id=s.product_id
        and e.source_invoice_line_id=s.line_id
      order by e.entry_date,e.id limit 1
    ) se on true
  ), return_raw as (
    select rl.id line_id,rl.product_id,rl.nom product_name,rl.qty base_qty,
      (coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) raw_revenue,
      r.montant invoice_amount,
      sum(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) over(partition by r.id) invoice_gross,
      rl.prix_achat,
      rse.prix_unit return_unit_cost
    from public.invoices r
    join public.invoice_lines rl on rl.boutique_id=r.boutique_id and rl.invoice_id=r.id
    left join public.stock_entries rse on rse.boutique_id=r.boutique_id and rse.return_invoice_line_id=rl.id and rse.type='retour'
    where r.boutique_id=p_boutique_id and r.type='Retour' and r.return_of_invoice_id=p_invoice_id
  ), return_rows as (
    select (-1)::numeric sign,line_id,product_id,product_name,base_qty,
      case when invoice_gross>0 then invoice_amount*(raw_revenue/invoice_gross) else 0 end allocated_revenue,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then line_id else null end stock_entry_id,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then base_qty*coalesce(prix_achat,return_unit_cost) else null end row_cost
    from return_raw
  ), rows as (
    select sign,line_id,product_id,product_name,sign*base_qty signed_qty,sign*allocated_revenue signed_revenue,
      stock_entry_id,case when row_cost is null then null else sign*row_cost end signed_cost
    from sale_rows
    union all
    select sign,line_id,product_id,product_name,sign*base_qty,sign*allocated_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end
    from return_rows
  ), totals as (
    select coalesce(sum(signed_revenue),0) gross_revenue,
      coalesce(sum(signed_revenue) filter(where signed_cost is not null),0) valued_revenue,
      coalesce(sum(signed_cost) filter(where signed_cost is not null),0) fifo_cost,
      coalesce(sum(abs(signed_revenue)),0) gross_abs,
      coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0) valued_abs,
      count(*) line_count,count(*) filter(where signed_cost is null) unmatched_lines
    from rows
  )
  select jsonb_build_object(
    'invoiceId',p_invoice_id,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,
    'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_abs<>0 then t.valued_abs/t.gross_abs*100 else 100 end,
    'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by abs((x->>'grossRevenue')::numeric) desc) from (
      select jsonb_build_object(
        'productId',product_id,'productName',max(product_name),'qty',sum(signed_qty),
        'grossRevenue',sum(signed_revenue),
        'revenue',coalesce(sum(signed_revenue) filter(where signed_cost is not null),0),
        'fifoCost',coalesce(sum(signed_cost) filter(where signed_cost is not null),0),
        'realizedMargin',coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0),
        'marginRate',case when coalesce(sum(signed_revenue) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_revenue) filter(where signed_cost is not null))*100 else 0 end,
        'markupRate',case when coalesce(sum(signed_cost) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_cost) filter(where signed_cost is not null))*100 else 0 end,
        'coverageRate',case when sum(abs(signed_revenue))<>0 then coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0)/sum(abs(signed_revenue))*100 else 100 end,
        'unmatchedLines',count(*) filter(where signed_cost is null)
      ) x from rows group by product_id
    ) q),'[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end;
$function$;

create or replace function public.get_fifo_realized_margin(p_boutique_id text, p_from_at timestamptz, p_to_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_result jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'marges') then raise exception 'forbidden'; end if;
  if p_from_at is null or p_to_at is null or p_to_at<=p_from_at then raise exception 'invalid period'; end if;

  with sale_raw as (
    select i.id invoice_id,il.id line_id,il.product_id,il.nom product_name,il.qty base_qty,
      (coalesce(il.sell_qty,il.qty)*il.prix_unit) raw_revenue,i.montant invoice_amount,
      sum(coalesce(il.sell_qty,il.qty)*il.prix_unit) over(partition by i.id) invoice_gross
    from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    where i.boutique_id=p_boutique_id and lower(i.type)='vente' and i.status<>'annulée'
      and i.invoice_date>=p_from_at and i.invoice_date<p_to_at
  ), sale_rows as (
    select 1::numeric sign,s.invoice_id,s.line_id,s.product_id,s.product_name,s.base_qty,
      case when s.invoice_gross>0 then s.invoice_amount*(s.raw_revenue/s.invoice_gross) else 0 end allocated_revenue,
      se.id stock_entry_id,
      case when se.id is null then null else private.fifo_outflow_cost(p_boutique_id,s.product_id,se.id) end row_cost
    from sale_raw s
    left join lateral (
      select e.id from public.stock_entries e
      where e.boutique_id=p_boutique_id and e.qty<0 and e.product_id=s.product_id and e.source_invoice_line_id=s.line_id
      order by e.entry_date,e.id limit 1
    ) se on true
  ), return_raw as (
    select r.id invoice_id,rl.id line_id,rl.product_id,rl.nom product_name,rl.qty base_qty,
      (coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) raw_revenue,r.montant invoice_amount,
      sum(coalesce(rl.sell_qty,rl.qty)*rl.prix_unit) over(partition by r.id) invoice_gross,
      rl.prix_achat,rse.prix_unit return_unit_cost
    from public.invoices r
    join public.invoice_lines rl on rl.boutique_id=r.boutique_id and rl.invoice_id=r.id
    left join public.stock_entries rse on rse.boutique_id=r.boutique_id and rse.return_invoice_line_id=rl.id and rse.type='retour'
    where r.boutique_id=p_boutique_id and r.type='Retour'
      and r.invoice_date>=p_from_at and r.invoice_date<p_to_at
  ), return_rows as (
    select (-1)::numeric sign,invoice_id,line_id,product_id,product_name,base_qty,
      case when invoice_gross>0 then invoice_amount*(raw_revenue/invoice_gross) else 0 end allocated_revenue,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then line_id else null end stock_entry_id,
      case when coalesce(prix_achat,return_unit_cost,0)>0 then base_qty*coalesce(prix_achat,return_unit_cost) else null end row_cost
    from return_raw
  ), rows as (
    select sign,invoice_id,line_id,product_id,product_name,sign*base_qty signed_qty,sign*allocated_revenue signed_revenue,
      stock_entry_id,case when row_cost is null then null else sign*row_cost end signed_cost
    from sale_rows
    union all
    select sign,invoice_id,line_id,product_id,product_name,sign*base_qty,sign*allocated_revenue,stock_entry_id,case when row_cost is null then null else sign*row_cost end
    from return_rows
  ), totals as (
    select coalesce(sum(signed_revenue),0) gross_revenue,
      coalesce(sum(signed_revenue) filter(where signed_cost is not null),0) valued_revenue,
      coalesce(sum(signed_cost) filter(where signed_cost is not null),0) fifo_cost,
      coalesce(sum(abs(signed_revenue)),0) gross_abs,
      coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0) valued_abs,
      count(*) line_count,count(*) filter(where signed_cost is null) unmatched_lines
    from rows
  )
  select jsonb_build_object(
    'fromAt',p_from_at,'toAt',p_to_at,'grossRevenue',t.gross_revenue,'revenue',t.valued_revenue,'fifoCost',t.fifo_cost,
    'realizedMargin',t.valued_revenue-t.fifo_cost,
    'marginRate',case when t.valued_revenue<>0 then (t.valued_revenue-t.fifo_cost)/t.valued_revenue*100 else 0 end,
    'markupRate',case when t.fifo_cost<>0 then (t.valued_revenue-t.fifo_cost)/t.fifo_cost*100 else 0 end,
    'coverageRate',case when t.gross_abs<>0 then t.valued_abs/t.gross_abs*100 else 100 end,
    'lineCount',t.line_count,'unmatchedLines',t.unmatched_lines,
    'products',coalesce((select jsonb_agg(x order by abs((x->>'grossRevenue')::numeric) desc) from (
      select jsonb_build_object(
        'productId',product_id,'productName',max(product_name),'qty',sum(signed_qty),
        'grossRevenue',sum(signed_revenue),'revenue',coalesce(sum(signed_revenue) filter(where signed_cost is not null),0),
        'fifoCost',coalesce(sum(signed_cost) filter(where signed_cost is not null),0),
        'realizedMargin',coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0),
        'marginRate',case when coalesce(sum(signed_revenue) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_revenue) filter(where signed_cost is not null))*100 else 0 end,
        'markupRate',case when coalesce(sum(signed_cost) filter(where signed_cost is not null),0)<>0 then coalesce(sum(signed_revenue-signed_cost) filter(where signed_cost is not null),0)/(sum(signed_cost) filter(where signed_cost is not null))*100 else 0 end,
        'coverageRate',case when sum(abs(signed_revenue))<>0 then coalesce(sum(abs(signed_revenue)) filter(where signed_cost is not null),0)/sum(abs(signed_revenue))*100 else 100 end,
        'unmatchedLines',count(*) filter(where signed_cost is null)
      ) x from rows group by product_id
    ) q),'[]'::jsonb)
  ) into v_result from totals t;
  return v_result;
end;
$function$;
