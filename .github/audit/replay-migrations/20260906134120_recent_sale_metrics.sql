-- Compact sale metadata preserves last-price assistance and bestseller sorting
-- without restoring full invoice-line payloads to the bootstrap.
create or replace function private.read_recent_sale_metrics(
  p_boutique_id text,
  p_from timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_read boolean;
  v_result jsonb;
begin
  if p_boutique_id is null or p_from is null then
    return jsonb_build_object('prices','[]'::jsonb,'counts','[]'::jsonb);
  end if;
  if p_from < (current_date - 31)::timestamptz then
    raise exception 'sale metrics read exceeds 31 days' using errcode = '22023';
  end if;

  v_can_read := private.auth_can_read_boutique(
    p_boutique_id,
    array['vente','factures','clients','dashboard']::text[]
  );
  if not coalesce(v_can_read, false) then
    return jsonb_build_object('prices','[]'::jsonb,'counts','[]'::jsonb);
  end if;

  with recent as materialized (
    select i.id as invoice_id,
           i.invoice_date,
           l.id as line_id,
           l.product_id,
           coalesce(nullif(trim(l.sell_unit),''), l.unit, '') as sale_unit,
           l.prix_unit
    from public.invoices i
    join public.invoice_lines l
      on l.boutique_id=i.boutique_id
     and l.invoice_id=i.id
    where i.boutique_id=p_boutique_id
      and i.invoice_date>=p_from
      and lower(coalesce(i.type,''))<>'retour'
      and i.status<>'annulée'
  ), latest_prices as (
    select distinct on (product_id,sale_unit)
           product_id,sale_unit,prix_unit,invoice_date,line_id
    from recent
    where prix_unit>0
    order by product_id,sale_unit,invoice_date desc,line_id desc
  ), product_counts as (
    select product_id,count(distinct invoice_id)::integer as invoice_count
    from recent
    group by product_id
  )
  select jsonb_build_object(
    'prices', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',product_id,
      'sale_unit',sale_unit,
      'prix_unit',prix_unit,
      'invoice_date',invoice_date
    ) order by product_id,sale_unit) from latest_prices),'[]'::jsonb),
    'counts', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id',product_id,
      'invoice_count',invoice_count
    ) order by product_id) from product_counts),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function private.read_recent_sale_metrics(text,timestamptz) from public,anon,authenticated;
grant execute on function private.read_recent_sale_metrics(text,timestamptz) to authenticated;

create or replace function public.read_recent_sale_metrics(
  p_boutique_id text,
  p_from timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select private.read_recent_sale_metrics(p_boutique_id,p_from);
$$;
revoke all on function public.read_recent_sale_metrics(text,timestamptz) from public,anon;
grant execute on function public.read_recent_sale_metrics(text,timestamptz) to authenticated;
comment on function public.read_recent_sale_metrics(text,timestamptz) is
  'Compact 31-day sale metadata for configured-price assistance and bestseller sorting without invoice-line bootstrap payloads.';
