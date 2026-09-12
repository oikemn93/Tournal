create or replace function public.get_employee_performance_report(
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
    raise exception 'invalid employee report period';
  end if;

  if not private.auth_has_read_permission(p_boutique_id,'marges')
     or not (
       private.auth_has_read_permission(p_boutique_id,'dashboard')
       or private.auth_has_read_permission(p_boutique_id,'compta')
     ) then
    raise exception 'forbidden';
  end if;

  with invoice_events as (
    select
      i.operator_id,
      coalesce(nullif(i.operator_nom_snapshot,''),u.nom,'Non attribué') as operator_name,
      lower(trim(coalesce(i.type,''))) as invoice_type,
      coalesce(i.montant,0) as amount
    from public.invoices i
    left join public.platform_users u on u.id=i.operator_id
    where i.boutique_id=p_boutique_id
      and i.invoice_date>=p_from
      and i.invoice_date<p_to
      and coalesce(i.status,'')<>'annulée'
      and lower(trim(coalesce(i.type,''))) in ('vente','retour')
  ), employee_rows as (
    select
      operator_id,
      max(operator_name) as operator_name,
      sum(case when invoice_type='retour' then -amount else amount end) as invoiced_revenue,
      sum(case when invoice_type='vente' then amount else 0 end) as sale_revenue,
      count(*) filter(where invoice_type='vente')::bigint as sales_count,
      count(*) filter(where invoice_type='retour')::bigint as returns_count
    from invoice_events
    group by operator_id
  )
  select jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'invoiced_revenue',coalesce((select sum(e.invoiced_revenue) from employee_rows e),0),
    'employees',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'operator_id',e.operator_id,
          'operator_name',e.operator_name,
          'invoiced_revenue',e.invoiced_revenue,
          'sales_count',e.sales_count,
          'average_basket',case when e.sales_count>0 then e.sale_revenue/e.sales_count else 0 end,
          'returns_count',e.returns_count,
          'return_rate',case when e.sales_count>0 then (e.returns_count::numeric/e.sales_count::numeric)*100 else null end
        ) order by e.invoiced_revenue desc,e.operator_name
      )
      from employee_rows e
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.get_employee_performance_report(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_employee_performance_report(text,timestamptz,timestamptz) to authenticated;
