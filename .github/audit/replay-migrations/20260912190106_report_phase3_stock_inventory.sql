create or replace function public.get_stock_inventory_report(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_dormant_days integer default 60
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_can_margin boolean;
  v_result jsonb;
  v_dormant_from timestamptz;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid stock report period'; end if;
  if p_dormant_days is null or p_dormant_days < 1 or p_dormant_days > 3650 then raise exception 'invalid dormant threshold'; end if;
  if not (
    private.auth_has_read_permission(p_boutique_id,'stock')
    or private.auth_has_read_permission(p_boutique_id,'inventaire')
    or private.auth_has_read_permission(p_boutique_id,'compta')
  ) then raise exception 'forbidden'; end if;
  v_can_margin := private.auth_has_read_permission(p_boutique_id,'marges');
  v_dormant_from := now()-(p_dormant_days||' days')::interval;

  with period_moves as (
    select se.product_id,
      sum(case when se.source_invoice_id is not null and se.qty < 0 then -se.qty else 0 end) as sold_qty,
      sum(case when se.return_invoice_id is not null and se.qty > 0 then se.qty else 0 end) as returned_qty
    from public.stock_entries se
    where se.boutique_id=p_boutique_id and se.entry_date>=p_from and se.entry_date<p_to
    group by se.product_id
  ), recent_sales as (
    select se.product_id,max(se.entry_date) as last_sale_at
    from public.stock_entries se
    where se.boutique_id=p_boutique_id
      and se.entry_date>=v_dormant_from and se.entry_date<now()+interval '1 second'
      and se.source_invoice_id is not null and se.qty<0
    group by se.product_id
  ), products_report as (
    select p.id as product_id,p.nom as product_name,p.category_id,coalesce(c.nom,'Sans catégorie') as category_name,
      coalesce(p.stock,0) as current_stock,
      greatest(coalesce(pm.sold_qty,0)-coalesce(pm.returned_qty,0),0) as net_sold_qty,
      rs.last_sale_at,
      case when rs.last_sale_at is null then null else floor(extract(epoch from (now()-rs.last_sale_at))/86400)::int end as days_since_last_sale,
      (rs.last_sale_at is null) as dormant,
      case when v_can_margin then private.fifo_stock_value(p_boutique_id,p.id,now(),greatest(coalesce(p.stock,0),0)) else null end as fifo_stock_value
    from public.products p
    left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id
    left join period_moves pm on pm.product_id=p.id
    left join recent_sales rs on rs.product_id=p.id
    where p.boutique_id=p_boutique_id and coalesce(p.actif,true)
  ), ranked as (
    select pr.*,percent_rank() over(order by pr.net_sold_qty) as rotation_rank
    from products_report pr
  ), inventory_rows as (
    select s.id,s.finalized_at,s.scope_label,
      coalesce(sum(abs(coalesce(l.difference_qty,0))),0) as variance_qty_abs,
      case when v_can_margin then coalesce(s.total_variance_cost,0) else null end as variance_cost
    from public.inventory_sessions s
    left join public.inventory_lines l on l.session_id=s.id
    where s.boutique_id=p_boutique_id and s.status='completed'
      and s.finalized_at>=p_from and s.finalized_at<p_to
    group by s.id,s.finalized_at,s.scope_label,s.total_variance_cost
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'dormant_days',p_dormant_days,
    'stock_value_fifo',case when v_can_margin then coalesce((select sum(r.fifo_stock_value) from ranked r),0) else null end,
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',r.product_id,'product_name',r.product_name,'category_id',r.category_id,'category_name',r.category_name,
      'current_stock',r.current_stock,'net_sold_qty',r.net_sold_qty,
      'rotation_class',case when r.net_sold_qty<=0 then 'dormant' when r.rotation_rank>=0.67 then 'rapide' when r.rotation_rank<=0.33 then 'lente' else 'moyenne' end,
      'last_sale_at',r.last_sale_at,'days_since_last_sale',r.days_since_last_sale,'dormant',r.dormant,
      'fifo_stock_value',r.fifo_stock_value
    ) order by r.net_sold_qty desc,r.product_name) from ranked r),'[]'::jsonb),
    'inventory_variances',coalesce((select jsonb_agg(jsonb_build_object(
      'session_id',i.id,'finalized_at',i.finalized_at,'scope_label',coalesce(i.scope_label,'Inventaire'),
      'variance_qty_abs',i.variance_qty_abs,'variance_cost',i.variance_cost
    ) order by i.finalized_at) from inventory_rows i),'[]'::jsonb)
  ) into v_result;
  return v_result;
end
$function$;

revoke all on function public.get_stock_inventory_report(text,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_stock_inventory_report(text,timestamptz,timestamptz,integer) to authenticated;
