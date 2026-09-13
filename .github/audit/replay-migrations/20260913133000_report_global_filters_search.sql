create or replace function private.report_filtered_sales_events(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_category_id text default null,
  p_operator_id uuid default null,
  p_payment_method text default null,
  p_client_type text default null
) returns table(
  invoice_id text,
  invoice_date timestamptz,
  invoice_type text,
  operator_id uuid,
  operator_name text,
  client_id bigint,
  client_name text,
  client_type text,
  product_id bigint,
  product_name text,
  category_id text,
  category_name text,
  signed_qty numeric,
  allocated_revenue numeric,
  signed_fifo_cost numeric,
  matched boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
  with dedup_lines as (
    select distinct
      i.id invoice_id,
      i.invoice_date,
      lower(trim(coalesce(i.type,''))) invoice_type,
      i.montant invoice_amount,
      i.operator_id,
      coalesce(nullif(i.operator_nom_snapshot,''),u.nom,'Non attribué') operator_name,
      i.client_id,
      coalesce(c.nom,'Client comptoir') client_name,
      coalesce(nullif(trim(c.type),''),'Comptoir') client_type,
      il.product_id,
      il.nom product_name,
      il.qty,
      il.prix_unit,
      il.sell_qty
    from public.invoices i
    join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
    left join public.platform_users u on u.id=i.operator_id
    left join public.clients c on c.boutique_id=i.boutique_id and c.id=i.client_id
    where i.boutique_id=p_boutique_id
      and i.invoice_date>=p_from and i.invoice_date<p_to
      and coalesce(i.status,'')<>'annulée'
      and lower(trim(coalesce(i.type,''))) in ('vente','retour')
      and (p_operator_id is null or i.operator_id=p_operator_id)
      and (p_client_type is null or coalesce(nullif(trim(c.type),''),'Comptoir')=p_client_type)
      and (
        p_payment_method is null
        or exists (
          select 1 from public.invoice_payments ip
          where ip.boutique_id=i.boutique_id and ip.invoice_id=i.id
            and ip.paid_at>=p_from and ip.paid_at<p_to
            and coalesce(nullif(trim(ip.payment_method),''),'Autre')=p_payment_method
        )
      )
  ), grouped as (
    select invoice_id,max(invoice_date) invoice_date,max(invoice_type) invoice_type,max(invoice_amount) invoice_amount,
      max(operator_id) operator_id,max(operator_name) operator_name,max(client_id) client_id,max(client_name) client_name,max(client_type) client_type,
      product_id,max(product_name) product_name,sum(qty) base_qty,sum(coalesce(sell_qty,qty)*prix_unit) gross_line_revenue
    from dedup_lines
    group by invoice_id,product_id
  ), weighted as (
    select g.*,sum(gross_line_revenue) over(partition by invoice_id) invoice_gross
    from grouped g
  ), valued as (
    select w.*,
      case when w.invoice_type='retour' then -1 else 1 end event_sign,
      case when w.invoice_gross>0 then (case when w.invoice_type='retour' then -1 else 1 end)*w.invoice_amount*(w.gross_line_revenue/w.invoice_gross) else 0 end allocated_revenue,
      coalesce(sale_cost.entry_count,0) sale_entry_count,coalesce(sale_cost.fifo_cost,0) sale_fifo_cost,
      coalesce(return_cost.entry_count,0) return_entry_count,coalesce(return_cost.fifo_cost,0) return_fifo_cost
    from weighted w
    left join lateral (
      select count(*)::bigint entry_count,coalesce(sum(private.fifo_outflow_cost(p_boutique_id,w.product_id,se.id)),0) fifo_cost
      from public.stock_entries se
      where w.invoice_type='vente' and se.boutique_id=p_boutique_id and se.product_id=w.product_id and se.qty<0
        and (se.source_invoice_id=w.invoice_id or se.note='Vente '||w.invoice_id or se.note like '%| '||w.invoice_id or se.reference=w.invoice_id)
    ) sale_cost on true
    left join lateral (
      select count(*)::bigint entry_count,coalesce(sum(se.qty*coalesce(se.prix_unit,0)),0) fifo_cost
      from public.stock_entries se
      where w.invoice_type='retour' and se.boutique_id=p_boutique_id and se.product_id=w.product_id and se.qty>0 and se.return_invoice_id=w.invoice_id
    ) return_cost on true
  ), events as (
    select v.*,p.category_id,coalesce(cat.nom,'Sans catégorie') category_name,
      case when v.invoice_type='retour' then v.return_entry_count>0 else v.sale_entry_count>0 end matched,
      case when v.invoice_type='retour' then -v.return_fifo_cost else v.sale_fifo_cost end signed_fifo_cost,
      case when v.invoice_type='retour' then -v.base_qty else v.base_qty end signed_qty
    from valued v
    left join public.products p on p.boutique_id=p_boutique_id and p.id=v.product_id
    left join public.categories cat on cat.boutique_id=p_boutique_id and cat.id=p.category_id
  )
  select e.invoice_id,e.invoice_date,e.invoice_type,e.operator_id,e.operator_name,e.client_id,e.client_name,e.client_type,
    e.product_id,e.product_name,e.category_id,e.category_name,e.signed_qty,e.allocated_revenue,e.signed_fifo_cost,e.matched
  from events e
  where p_category_id is null or coalesce(e.category_id,'')=p_category_id;
$function$;

revoke all on function private.report_filtered_sales_events(text,timestamptz,timestamptz,text,uuid,text,text) from public,anon,authenticated;

create or replace function public.get_report_filter_options(
  p_boutique_id text,p_from timestamptz,p_to timestamptz
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'invalid report filter period'; end if;
  if not (private.auth_has_read_permission(p_boutique_id,'dashboard') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by q.name) from (
      select distinct coalesce(p.category_id,'') id,coalesce(c.nom,'Sans catégorie') name
      from public.invoices i join public.invoice_lines il on il.boutique_id=i.boutique_id and il.invoice_id=i.id
      left join public.products p on p.boutique_id=i.boutique_id and p.id=il.product_id
      left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id
      where i.boutique_id=p_boutique_id and i.invoice_date>=p_from and i.invoice_date<p_to and coalesce(i.status,'')<>'annulée'
      order by 2 limit 200
    ) q),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by q.name) from (
      select distinct i.operator_id::text id,coalesce(nullif(i.operator_nom_snapshot,''),u.nom,'Non attribué') name
      from public.invoices i left join public.platform_users u on u.id=i.operator_id
      where i.boutique_id=p_boutique_id and i.invoice_date>=p_from and i.invoice_date<p_to and coalesce(i.status,'')<>'annulée' and i.operator_id is not null
      order by 2 limit 100
    ) q),'[]'::jsonb),
    'payment_methods',coalesce((select jsonb_agg(q.payment_method order by q.payment_method) from (
      select distinct coalesce(nullif(trim(ip.payment_method),''),'Autre') payment_method
      from public.invoice_payments ip
      where ip.boutique_id=p_boutique_id and ip.paid_at>=p_from and ip.paid_at<p_to
      order by 1 limit 50
    ) q),'[]'::jsonb),
    'client_types',coalesce((select jsonb_agg(q.client_type order by q.client_type) from (
      select distinct coalesce(nullif(trim(c.type),''),'Comptoir') client_type
      from public.invoices i left join public.clients c on c.boutique_id=i.boutique_id and c.id=i.client_id
      where i.boutique_id=p_boutique_id and i.invoice_date>=p_from and i.invoice_date<p_to and coalesce(i.status,'')<>'annulée'
      order by 1 limit 50
    ) q),'[]'::jsonb)
  );
end
$function$;
revoke all on function public.get_report_filter_options(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_report_filter_options(text,timestamptz,timestamptz) to authenticated;

create or replace function public.get_sales_product_report_filtered(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,
  p_category_id text default null,p_operator_id uuid default null,p_payment_method text default null,p_client_type text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_can_margin boolean; v_result jsonb;
begin
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'invalid sales report period'; end if;
  if not (private.auth_has_read_permission(p_boutique_id,'dashboard') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  v_can_margin:=private.auth_has_read_permission(p_boutique_id,'marges');
  with events as (
    select * from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,p_category_id,p_operator_id,p_payment_method,p_client_type)
  ), products as (
    select product_id,max(product_name) product_name,max(category_id) category_id,max(category_name) category_name,
      sum(signed_qty) quantity,sum(allocated_revenue) invoiced_revenue,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo,
      case when v_can_margin then case when coalesce(sum(abs(allocated_revenue)),0)<>0 then coalesce(sum(abs(allocated_revenue)) filter(where matched),0)/sum(abs(allocated_revenue))*100 else 100 end else null end margin_coverage_rate,
      case when v_can_margin then count(*) filter(where not matched) else null end margin_unmatched_lines
    from events group by product_id
  ), invoice_ids as (
    select distinct invoice_id,invoice_type from events
  ), payment_summary as (
    select coalesce(nullif(trim(ip.payment_method),''),'Autre') payment_method,
      sum(case when ids.invoice_type='retour' then -ip.amount else ip.amount end) amount,count(*)::bigint events_count
    from invoice_ids ids join public.invoice_payments ip on ip.boutique_id=p_boutique_id and ip.invoice_id=ids.invoice_id
    where ip.paid_at>=p_from and ip.paid_at<p_to and (p_payment_method is null or coalesce(nullif(trim(ip.payment_method),''),'Autre')=p_payment_method)
    group by 1
  )
  select jsonb_build_object('from',p_from,'to',p_to,
    'invoiced_revenue',coalesce((select sum(invoiced_revenue) from products),0),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',product_id,'product_name',product_name,'category_id',category_id,'category_name',category_name,
      'quantity',quantity,'invoiced_revenue',invoiced_revenue,'realized_margin_fifo',realized_margin_fifo,
      'margin_coverage_rate',margin_coverage_rate,'margin_unmatched_lines',margin_unmatched_lines
    ) order by invoiced_revenue desc,product_name) from products),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x order by x->>'name') from (select distinct jsonb_build_object('id',coalesce(category_id,''),'name',category_name) x from products) q),'[]'::jsonb),
    'payment_methods',coalesce((select jsonb_agg(jsonb_build_object('payment_method',payment_method,'amount',amount,'events_count',events_count) order by abs(amount) desc,payment_method) from payment_summary),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;
revoke all on function public.get_sales_product_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) from public,anon;
grant execute on function public.get_sales_product_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) to authenticated;

create or replace function public.get_employee_performance_report_filtered(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,
  p_category_id text default null,p_operator_id uuid default null,p_payment_method text default null,p_client_type text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_result jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'marges') or not (private.auth_has_read_permission(p_boutique_id,'dashboard') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  with events as (
    select * from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,p_category_id,p_operator_id,p_payment_method,p_client_type)
  ), rows as (
    select operator_id,max(operator_name) operator_name,sum(allocated_revenue) invoiced_revenue,
      count(distinct invoice_id) filter(where invoice_type='vente')::bigint sales_count,
      count(distinct invoice_id) filter(where invoice_type='retour')::bigint returns_count,
      coalesce(sum(allocated_revenue) filter(where invoice_type='vente'),0) sale_revenue
    from events group by operator_id
  )
  select jsonb_build_object('from',p_from,'to',p_to,'invoiced_revenue',coalesce((select sum(invoiced_revenue) from rows),0),
    'employees',coalesce((select jsonb_agg(jsonb_build_object(
      'operator_id',operator_id,'operator_name',operator_name,'invoiced_revenue',invoiced_revenue,'sales_count',sales_count,
      'average_basket',case when sales_count>0 then sale_revenue/sales_count else 0 end,'returns_count',returns_count,
      'return_rate',case when sales_count>0 then returns_count::numeric/sales_count::numeric*100 else null end
    ) order by invoiced_revenue desc,operator_name) from rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;
revoke all on function public.get_employee_performance_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) from public,anon;
grant execute on function public.get_employee_performance_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) to authenticated;

create or replace function public.get_client_report_filtered(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,
  p_category_id text default null,p_operator_id uuid default null,p_payment_method text default null,p_client_type text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_result jsonb;
begin
  if not (private.auth_has_read_permission(p_boutique_id,'clients') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  with events as (
    select * from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,p_category_id,p_operator_id,p_payment_method,p_client_type)
  ), selected_invoices as (
    select invoice_id,max(client_id) client_id,max(invoice_type) invoice_type,sum(allocated_revenue) selected_revenue from events group by invoice_id
  ), period_rows as (
    select client_id,sum(allocated_revenue) invoiced_revenue,
      count(distinct invoice_id) filter(where invoice_type='vente')::bigint sales_count,
      count(distinct invoice_id) filter(where invoice_type='retour')::bigint returns_count
    from events where client_id is not null group by client_id
  ), cash as (
    select si.client_id,sum((case when si.invoice_type='retour' then -ip.amount else ip.amount end) * least(1,case when abs(i.montant)>0 then abs(si.selected_revenue/i.montant) else 0 end)) collected_cash
    from selected_invoices si join public.invoices i on i.boutique_id=p_boutique_id and i.id=si.invoice_id
    join public.invoice_payments ip on ip.boutique_id=i.boutique_id and ip.invoice_id=i.id
    where si.client_id is not null and ip.paid_at>=p_from and ip.paid_at<p_to
      and (p_payment_method is null or coalesce(nullif(trim(ip.payment_method),''),'Autre')=p_payment_method)
    group by si.client_id
  ), paid as (
    select invoice_id,sum(amount) paid from public.invoice_payments where boutique_id=p_boutique_id group by invoice_id
  ), receivables as (
    select i.client_id,sum(greatest(i.montant-coalesce(p.paid,0),0)) outstanding_global,
      sum(case when i.due_date is not null and i.due_date<current_date then greatest(i.montant-coalesce(p.paid,0),0) else 0 end) overdue_global
    from public.invoices i left join paid p on p.invoice_id=i.id left join public.clients c on c.boutique_id=i.boutique_id and c.id=i.client_id
    where i.boutique_id=p_boutique_id and i.client_id is not null and lower(trim(coalesce(i.type,'')))<>'retour' and coalesce(i.status,'')<>'annulée'
      and (p_client_type is null or coalesce(nullif(trim(c.type),''),'Comptoir')=p_client_type)
    group by i.client_id
  ), credit as (
    select client_id,sum(greatest(amount-coalesce(allocated_amount,0),0)) credit_available from public.client_advances where boutique_id=p_boutique_id group by client_id
  ), rows as (
    select c.id client_id,c.nom client_name,coalesce(nullif(trim(c.type),''),'Comptoir') client_type,c.payment_terms_days,c.last_invoice_at,
      coalesce(pr.invoiced_revenue,0) invoiced_revenue,coalesce(pr.sales_count,0) sales_count,coalesce(pr.returns_count,0) returns_count,
      coalesce(ca.collected_cash,0) collected_cash,coalesce(r.outstanding_global,0) outstanding_global,coalesce(r.overdue_global,0) overdue_global,coalesce(cr.credit_available,0) credit_available
    from public.clients c
    left join period_rows pr on pr.client_id=c.id left join cash ca on ca.client_id=c.id left join receivables r on r.client_id=c.id left join credit cr on cr.client_id=c.id
    where c.boutique_id=p_boutique_id and (p_client_type is null or coalesce(nullif(trim(c.type),''),'Comptoir')=p_client_type)
      and (pr.client_id is not null or r.client_id is not null or cr.client_id is not null)
  )
  select jsonb_build_object('from',p_from,'to',p_to,'clients_count',(select count(*) from rows),
    'active_clients_period',(select count(*) from rows where sales_count>0 or returns_count>0),
    'clients_with_outstanding',(select count(*) from rows where outstanding_global>0.005),'clients_overdue',(select count(*) from rows where overdue_global>0.005),
    'registered_invoiced_revenue',coalesce((select sum(invoiced_revenue) from rows),0),'registered_collected_cash',coalesce((select sum(collected_cash) from rows),0),
    'customer_outstanding_global',coalesce((select sum(outstanding_global) from rows),0),'overdue_global',coalesce((select sum(overdue_global) from rows),0),'credit_available_global',coalesce((select sum(credit_available) from rows),0),
    'clients',coalesce((select jsonb_agg(jsonb_build_object('client_id',client_id,'client_name',client_name,'client_type',client_type,'payment_terms_days',payment_terms_days,
      'last_invoice_at',last_invoice_at,'invoiced_revenue',invoiced_revenue,'sales_count',sales_count,'returns_count',returns_count,'collected_cash',collected_cash,
      'outstanding_global',outstanding_global,'overdue_global',overdue_global,'credit_available',credit_available) order by invoiced_revenue desc,client_name) from rows),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;
revoke all on function public.get_client_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) from public,anon;
grant execute on function public.get_client_report_filtered(text,timestamptz,timestamptz,text,uuid,text,text) to authenticated;

create or replace function public.get_stock_inventory_report_filtered(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,p_dormant_days integer default 60,p_category_id text default null
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_base jsonb; v_products jsonb; v_value numeric;
begin
  v_base:=public.get_stock_inventory_report(p_boutique_id,p_from,p_to,p_dormant_days);
  if p_category_id is null then return v_base; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb),coalesce(sum((x->>'fifo_stock_value')::numeric),0)
    into v_products,v_value from jsonb_array_elements(coalesce(v_base->'products','[]'::jsonb)) x
    where coalesce(x->>'category_id','')=p_category_id;
  return jsonb_set(jsonb_set(v_base,'{products}',v_products,true),'{stock_value_fifo}',to_jsonb(v_value),true);
end
$function$;
revoke all on function public.get_stock_inventory_report_filtered(text,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.get_stock_inventory_report_filtered(text,timestamptz,timestamptz,integer,text) to authenticated;

create or replace function public.search_report_entities(
  p_boutique_id text,p_from timestamptz,p_to timestamptz,p_query text,
  p_category_id text default null,p_operator_id uuid default null,p_payment_method text default null,p_client_type text default null,p_limit integer default 8
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_can_margin boolean; v_q text; v_limit integer;
begin
  if not (private.auth_has_read_permission(p_boutique_id,'dashboard') or private.auth_has_read_permission(p_boutique_id,'compta')) then raise exception 'forbidden'; end if;
  v_can_margin:=private.auth_has_read_permission(p_boutique_id,'marges'); v_q:='%'||lower(trim(coalesce(p_query,'')))||'%'; v_limit:=greatest(1,least(coalesce(p_limit,8),20));
  if length(trim(coalesce(p_query,'')))<2 then return jsonb_build_object('hits','[]'::jsonb); end if;
  return (with events as (
    select * from private.report_filtered_sales_events(p_boutique_id,p_from,p_to,p_category_id,p_operator_id,p_payment_method,p_client_type)
  ), product_hits as (
    select 'product' kind,product_id::text id,max(product_name) label,max(category_name) subtitle,'sales' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where lower(product_name) like v_q group by product_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), employee_hits as (
    select 'employee' kind,coalesce(operator_id::text,'') id,max(operator_name) label,'Équipe' subtitle,'team' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where lower(operator_name) like v_q group by operator_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), client_hits as (
    select 'client' kind,client_id::text id,max(client_name) label,max(client_type) subtitle,'clients' section,
      sum(allocated_revenue) invoiced_revenue,sum(signed_qty) quantity,
      case when v_can_margin then coalesce(sum(allocated_revenue-signed_fifo_cost) filter(where matched),0) else null end realized_margin_fifo
    from events where client_id is not null and lower(client_name) like v_q group by client_id order by abs(sum(allocated_revenue)) desc limit v_limit
  ), hits as (select * from product_hits union all select * from employee_hits union all select * from client_hits)
  select jsonb_build_object('hits',coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'label',label,'subtitle',subtitle,'section',section,
    'invoiced_revenue',invoiced_revenue,'quantity',quantity,'realized_margin_fifo',realized_margin_fifo) order by abs(invoiced_revenue) desc),'[]'::jsonb)) from hits);
end
$function$;
revoke all on function public.search_report_entities(text,timestamptz,timestamptz,text,text,uuid,text,text,integer) from public,anon;
grant execute on function public.search_report_entities(text,timestamptz,timestamptz,text,text,uuid,text,text,integer) to authenticated;
