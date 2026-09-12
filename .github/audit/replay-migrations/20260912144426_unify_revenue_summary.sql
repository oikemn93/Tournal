-- Shared revenue contract for Accueil and Rapport. Bounds are [from, to).
-- Invoice settlements are dated exclusively by paid_at, never invoice_date.
create or replace function public.get_revenue_summary(
  p_boutique_id text, p_from timestamptz, p_to timestamptz
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not coalesce(
    private.auth_has_read_permission(p_boutique_id, 'dashboard')
    or private.auth_has_read_permission(p_boutique_id, 'compta'), false
  ) then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid revenue period';
  end if;

  with eligible_invoices as (
    select i.id, i.invoice_date, i.montant, lower(trim(i.type)) as type
    from public.invoices i
    where i.boutique_id = p_boutique_id
      and coalesce(i.status, '') <> 'annulée'
      and lower(trim(i.type)) in ('vente', 'retour')
      -- Commercial B2B sales count; moving stock within one owner's shops does not.
      and not exists (
        select 1 from public.stock_transfers t
        where t.from_boutique_id = i.boutique_id
          and t.invoice_id = coalesce(i.return_of_invoice_id, i.id)
          and t.relationship_type = 'same_owner'
      )
  ), cash_events as (
    select p.invoice_id, p.payment_method,
      case when i.type = 'retour' then -p.amount else p.amount end as amount,
      i.type = 'vente' and p.amount > 0 as sale_payment
    from public.invoice_payments p
    join eligible_invoices i on i.id = p.invoice_id
    where p.boutique_id = p_boutique_id
      and p.paid_at >= p_from and p.paid_at < p_to
      and p.payment_method is distinct from 'Avoir client'
    union all
    select null::text, r.payment_method, -r.amount, false
    from public.client_credit_refunds r
    where r.boutique_id = p_boutique_id
      and r.refunded_at >= p_from and r.refunded_at < p_to
  ), methods as (
    select coalesce(payment_method, 'Autre') as method, sum(amount) as total, count(*) as count
    from cash_events group by 1
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'collected', coalesce((select sum(amount) from cash_events), 0),
    'invoiced', coalesce((select sum(case when type = 'retour' then -montant else montant end)
      from eligible_invoices where invoice_date >= p_from and invoice_date < p_to), 0),
    'paid_sales_count', (select count(distinct invoice_id) from cash_events where sale_payment),
    'gross_collected', coalesce((select sum(amount) from cash_events where sale_payment), 0),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'total', total, 'count', count) order by method) from methods), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_revenue_summary(text,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_revenue_summary(text,timestamptz,timestamptz) to authenticated;
