create or replace function public.get_client_report(
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
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid client report period';
  end if;

  if not (
    private.auth_has_read_permission(p_boutique_id,'clients')
    or private.auth_has_read_permission(p_boutique_id,'compta')
  ) then
    raise exception 'forbidden';
  end if;

  with client_base as (
    select c.id,c.nom,c.type,c.payment_terms_days,c.last_invoice_at
    from public.clients c
    where c.boutique_id=p_boutique_id
  ), period_invoices as (
    select i.client_id,
      coalesce(sum(case when lower(trim(coalesce(i.type,'')))='retour' then -i.montant else i.montant end),0) as invoiced_revenue,
      count(*) filter(where lower(trim(coalesce(i.type,'')))<>'retour') as sales_count,
      count(*) filter(where lower(trim(coalesce(i.type,'')))='retour') as returns_count
    from public.invoices i
    where i.boutique_id=p_boutique_id
      and i.client_id is not null
      and i.invoice_date>=p_from and i.invoice_date<p_to
      and coalesce(i.status,'')<>'annulée'
    group by i.client_id
  ), period_cash as (
    select i.client_id,coalesce(sum(ip.amount),0) as collected_cash
    from public.invoice_payments ip
    join public.invoices i on i.boutique_id=ip.boutique_id and i.id=ip.invoice_id
    where ip.boutique_id=p_boutique_id
      and i.client_id is not null
      and ip.paid_at>=p_from and ip.paid_at<p_to
    group by i.client_id
  ), global_receivables as (
    select i.client_id,
      coalesce(sum(private.invoice_net_due(i.boutique_id,i.id)),0) as outstanding_global,
      coalesce(sum(case when i.due_date is not null and i.due_date<current_date then private.invoice_net_due(i.boutique_id,i.id) else 0 end),0) as overdue_global
    from public.invoices i
    where i.boutique_id=p_boutique_id
      and i.client_id is not null
      and lower(trim(coalesce(i.type,'')))<>'retour'
      and coalesce(i.status,'')<>'annulée'
    group by i.client_id
  ), global_credit as (
    select a.client_id,
      coalesce(sum(greatest(a.amount-coalesce(a.allocated_amount,0),0)),0) as credit_available
    from public.client_advances a
    where a.boutique_id=p_boutique_id
    group by a.client_id
  ), rows as (
    select cb.id as client_id,
      cb.nom as client_name,
      cb.type as client_type,
      cb.payment_terms_days,
      cb.last_invoice_at,
      coalesce(pi.invoiced_revenue,0) as invoiced_revenue,
      coalesce(pi.sales_count,0) as sales_count,
      coalesce(pi.returns_count,0) as returns_count,
      coalesce(pc.collected_cash,0) as collected_cash,
      coalesce(gr.outstanding_global,0) as outstanding_global,
      coalesce(gr.overdue_global,0) as overdue_global,
      coalesce(gc.credit_available,0) as credit_available
    from client_base cb
    left join period_invoices pi on pi.client_id=cb.id
    left join period_cash pc on pc.client_id=cb.id
    left join global_receivables gr on gr.client_id=cb.id
    left join global_credit gc on gc.client_id=cb.id
  )
  select jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'clients_count',(select count(*) from rows),
    'active_clients_period',(select count(*) from rows where sales_count>0 or returns_count>0),
    'clients_with_outstanding',(select count(*) from rows where outstanding_global>0.005),
    'clients_overdue',(select count(*) from rows where overdue_global>0.005),
    'registered_invoiced_revenue',(select coalesce(sum(invoiced_revenue),0) from rows),
    'registered_collected_cash',(select coalesce(sum(collected_cash),0) from rows),
    'customer_outstanding_global',(select coalesce(sum(outstanding_global),0) from rows),
    'overdue_global',(select coalesce(sum(overdue_global),0) from rows),
    'credit_available_global',(select coalesce(sum(credit_available),0) from rows),
    'clients',coalesce((select jsonb_agg(jsonb_build_object(
      'client_id',r.client_id,
      'client_name',r.client_name,
      'client_type',r.client_type,
      'payment_terms_days',r.payment_terms_days,
      'last_invoice_at',r.last_invoice_at,
      'invoiced_revenue',r.invoiced_revenue,
      'sales_count',r.sales_count,
      'returns_count',r.returns_count,
      'collected_cash',r.collected_cash,
      'outstanding_global',r.outstanding_global,
      'overdue_global',r.overdue_global,
      'credit_available',r.credit_available
    ) order by r.invoiced_revenue desc,r.client_name) from rows r),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.get_client_report(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_client_report(text,timestamptz,timestamptz) to authenticated;
