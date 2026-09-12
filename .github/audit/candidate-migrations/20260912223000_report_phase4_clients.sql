create or replace function public.get_client_report(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_inactive_days integer default 60
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_result jsonb;
  v_inactive_from timestamptz;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid client report period'; end if;
  if p_inactive_days is null or p_inactive_days < 1 or p_inactive_days > 3650 then raise exception 'invalid inactive threshold'; end if;
  if not private.auth_has_read_permission(p_boutique_id,'clients') then raise exception 'forbidden'; end if;

  v_inactive_from := now()-(p_inactive_days||' days')::interval;

  with period_invoices as (
    select i.client_id,
      coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0) invoiced_revenue,
      coalesce(sum(i.montant) filter(where lower(trim(coalesce(i.type,'')))='vente'),0) sale_revenue,
      count(*) filter(where lower(trim(coalesce(i.type,'')))='vente') sales_count,
      count(*) filter(where lower(trim(coalesce(i.type,'')))='retour') returns_count,
      coalesce(sum(i.montant) filter(where lower(trim(coalesce(i.type,'')))='retour'),0) returns_amount
    from public.invoices i
    where i.boutique_id=p_boutique_id
      and i.client_id is not null
      and i.invoice_date>=p_from and i.invoice_date<p_to
      and coalesce(i.status,'')<>'annulée'
    group by i.client_id
  ), period_payments as (
    select i.client_id,
      coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -ip.amount else ip.amount end),0) collected_cash
    from public.invoice_payments ip
    join public.invoices i on i.boutique_id=ip.boutique_id and i.id=ip.invoice_id
    where ip.boutique_id=p_boutique_id
      and i.client_id is not null
      and ip.paid_at>=p_from and ip.paid_at<p_to
      and coalesce(i.status,'')<>'annulée'
    group by i.client_id
  ), period_refunds as (
    select r.client_id,coalesce(sum(r.amount),0) refunded_cash
    from public.client_credit_refunds r
    where r.boutique_id=p_boutique_id and r.refunded_at>=p_from and r.refunded_at<p_to
    group by r.client_id
  ), paid_by_invoice as (
    select ip.invoice_id,coalesce(sum(ip.amount),0) paid
    from public.invoice_payments ip
    where ip.boutique_id=p_boutique_id
    group by ip.invoice_id
  ), open_by_client as (
    select i.client_id,
      coalesce(sum(greatest(i.montant-coalesce(p.paid,0),0)),0) outstanding_global,
      coalesce(sum(greatest(i.montant-coalesce(p.paid,0),0)) filter(where
        greatest(i.montant-coalesce(p.paid,0),0)>0
        and coalesce(i.due_date,(i.invoice_date::date + coalesce(c.payment_terms_days,0))) < current_date
      ),0) overdue_global
    from public.invoices i
    join public.clients c on c.boutique_id=i.boutique_id and c.id=i.client_id
    left join paid_by_invoice p on p.invoice_id=i.id
    where i.boutique_id=p_boutique_id
      and i.client_id is not null
      and coalesce(i.status,'')<>'annulée'
      and lower(trim(coalesce(i.type,'')))='vente'
    group by i.client_id
  ), last_sales as (
    select i.client_id,max(i.invoice_date) last_sale_at
    from public.invoices i
    where i.boutique_id=p_boutique_id
      and i.client_id is not null
      and coalesce(i.status,'')<>'annulée'
      and lower(trim(coalesce(i.type,'')))='vente'
    group by i.client_id
  ), rows as (
    select c.id client_id,c.nom client_name,c.type client_type,
      coalesce(pi.invoiced_revenue,0) invoiced_revenue,
      coalesce(pi.sales_count,0) sales_count,
      case when coalesce(pi.sales_count,0)>0 then coalesce(pi.sale_revenue,0)/pi.sales_count else 0 end average_basket,
      coalesce(pp.collected_cash,0)-coalesce(pr.refunded_cash,0) collected_cash,
      coalesce(ob.outstanding_global,0) outstanding_global,
      coalesce(ob.overdue_global,0) overdue_global,
      coalesce(pi.returns_count,0) returns_count,
      coalesce(pi.returns_amount,0) returns_amount,
      ls.last_sale_at,
      (ls.last_sale_at is null or ls.last_sale_at<v_inactive_from) inactive,
      (c.created_at>=p_from and c.created_at<p_to) created_in_period
    from public.clients c
    left join period_invoices pi on pi.client_id=c.id
    left join period_payments pp on pp.client_id=c.id
    left join period_refunds pr on pr.client_id=c.id
    left join open_by_client ob on ob.client_id=c.id
    left join last_sales ls on ls.client_id=c.id
    where c.boutique_id=p_boutique_id
  ), totals as (
    select
      coalesce(sum(invoiced_revenue),0) registered_invoiced_revenue,
      coalesce(sum(collected_cash),0) registered_collected_cash,
      count(*) filter(where sales_count>0) active_clients,
      count(*) filter(where created_in_period) new_clients,
      count(*) inactive_clients,
      coalesce(sum(outstanding_global),0) registered_outstanding_global,
      coalesce(sum(overdue_global),0) overdue_global,
      coalesce(sum(returns_count),0) returns_count
    from rows
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,'inactive_days',p_inactive_days,
    'registered_invoiced_revenue',t.registered_invoiced_revenue,
    'registered_collected_cash',t.registered_collected_cash,
    'active_clients',t.active_clients,
    'new_clients',t.new_clients,
    'inactive_clients_count',t.inactive_clients,
    'registered_outstanding_global',t.registered_outstanding_global,
    'overdue_global',t.overdue_global,
    'returns_count',t.returns_count,
    'top_clients',coalesce((select jsonb_agg(jsonb_build_object(
      'client_id',r.client_id,'client_name',r.client_name,'client_type',r.client_type,
      'invoiced_revenue',r.invoiced_revenue,'sales_count',r.sales_count,'average_basket',r.average_basket,
      'collected_cash',r.collected_cash,'outstanding_global',r.outstanding_global,'overdue_global',r.overdue_global,
      'returns_count',r.returns_count,'returns_amount',r.returns_amount,'last_sale_at',r.last_sale_at,'inactive',r.inactive
    ) order by r.invoiced_revenue desc,r.client_name) from (select * from rows where invoiced_revenue<>0 or sales_count>0 order by invoiced_revenue desc,client_name limit 10) r),'[]'::jsonb),
    'debtors',coalesce((select jsonb_agg(jsonb_build_object(
      'client_id',r.client_id,'client_name',r.client_name,'client_type',r.client_type,
      'invoiced_revenue',r.invoiced_revenue,'sales_count',r.sales_count,'average_basket',r.average_basket,
      'collected_cash',r.collected_cash,'outstanding_global',r.outstanding_global,'overdue_global',r.overdue_global,
      'returns_count',r.returns_count,'returns_amount',r.returns_amount,'last_sale_at',r.last_sale_at,'inactive',r.inactive
    ) order by r.overdue_global desc,r.outstanding_global desc,r.client_name) from (select * from rows where outstanding_global>0 order by overdue_global desc,outstanding_global desc,client_name limit 10) r),'[]'::jsonb),
    'inactive_clients',coalesce((select jsonb_agg(jsonb_build_object(
      'client_id',r.client_id,'client_name',r.client_name,'client_type',r.client_type,
      'invoiced_revenue',r.invoiced_revenue,'sales_count',r.sales_count,'average_basket',r.average_basket,
      'collected_cash',r.collected_cash,'outstanding_global',r.outstanding_global,'overdue_global',r.overdue_global,
      'returns_count',r.returns_count,'returns_amount',r.returns_amount,'last_sale_at',r.last_sale_at,'inactive',r.inactive
    ) order by r.last_sale_at nulls first,r.client_name) from (select * from rows where inactive order by last_sale_at nulls first,client_name limit 10) r),'[]'::jsonb)
  ) into v_result
  from totals t;

  return v_result;
end
$function$;

revoke all on function public.get_client_report(text,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_client_report(text,timestamptz,timestamptz,integer) to authenticated;
