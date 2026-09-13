create or replace function public.get_charge_report(
  p_boutique_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid charge report period';
  end if;
  if not (
    private.auth_has_read_permission(p_boutique_id,'dashboard')
    or private.auth_has_read_permission(p_boutique_id,'compta')
  ) then
    raise exception 'forbidden';
  end if;

  with events as (
    select
      ('charge:' || c.id::text) as id,
      c.charge_date as event_at,
      coalesce(nullif(c.label,''),'Charge') as label,
      coalesce(nullif(c.categorie,''),'Autre') as category,
      c.montant::numeric as amount,
      coalesce(nullif(c.source,''),'manual') as source,
      nullif(c.payment_method,'') as payment_method,
      nullif(c.note,'') as note
    from public.charges c
    where c.boutique_id = p_boutique_id
      and c.charge_date >= p_from
      and c.charge_date < p_to
      and c.source not in ('supplier_receipt','transfer')
      and coalesce(c.categorie,'') <> 'Achat stock'

    union all

    select
      ('transfer:' || tcp.id::text) as id,
      tcp.paid_at as event_at,
      coalesce(nullif(c.label,''),'Règlement transfert') as label,
      coalesce(nullif(c.categorie,''),'Autre') as category,
      tcp.amount::numeric as amount,
      'transfer'::text as source,
      nullif(tcp.payment_method,'') as payment_method,
      nullif(c.note,'') as note
    from public.transfer_charge_payments tcp
    left join public.charges c
      on c.boutique_id = tcp.boutique_id
     and c.id = tcp.charge_id
    where tcp.boutique_id = p_boutique_id
      and tcp.paid_at >= p_from
      and tcp.paid_at < p_to
      and coalesce(c.categorie,'') <> 'Achat stock'
  ), categories as (
    select category, sum(amount)::numeric as amount, count(*)::bigint as entries
    from events
    group by category
  ), detail as (
    select * from events order by event_at desc, id desc limit 500
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'operating_total', coalesce((select sum(amount) from events),0),
    'entries_count', (select count(*) from events),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category',category,'amount',amount,'entries',entries) order by amount desc, category)
      from categories
    ), '[]'::jsonb),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,
        'event_at',event_at,
        'label',label,
        'category',category,
        'amount',amount,
        'source',source,
        'payment_method',payment_method,
        'note',note
      ) order by event_at desc, id desc)
      from detail
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_charge_report(text,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_charge_report(text,timestamptz,timestamptz) to authenticated;
