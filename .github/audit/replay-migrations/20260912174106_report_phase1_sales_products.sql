create or replace function public.get_sales_product_report(
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
  v_margin jsonb := null;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid sales report period';
  end if;

  if not (
    private.auth_has_read_permission(p_boutique_id,'dashboard')
    or private.auth_has_read_permission(p_boutique_id,'compta')
  ) then
    raise exception 'forbidden';
  end if;

  if private.auth_has_read_permission(p_boutique_id,'marges') then
    v_margin := private.fifo_realized_margin_core(p_boutique_id,p_from,p_to);
  end if;

  with invoice_product_lines as (
    select
      i.id as invoice_id,
      i.type as invoice_type,
      i.montant as invoice_amount,
      il.product_id,
      max(il.nom) as product_name,
      sum(coalesce(il.qty,0)) as base_qty,
      sum(coalesce(il.sell_qty,il.qty,0) * coalesce(il.prix_unit,0)) as gross_line_revenue
    from public.invoices i
    join public.invoice_lines il
      on il.boutique_id=i.boutique_id
     and il.invoice_id=i.id
    where i.boutique_id=p_boutique_id
      and i.invoice_date>=p_from
      and i.invoice_date<p_to
      and coalesce(i.status,'')<>'annulée'
      and lower(trim(coalesce(i.type,''))) in ('vente','retour')
    group by i.id,i.type,i.montant,il.product_id
  ), weighted as (
    select
      l.*,
      sum(l.gross_line_revenue) over(partition by l.invoice_id) as invoice_gross,
      case when lower(trim(coalesce(l.invoice_type,'')))='retour' then -1 else 1 end as sign
    from invoice_product_lines l
  ), allocated as (
    select
      w.product_id,
      max(w.product_name) as product_name,
      sum(w.sign * w.base_qty) as net_qty,
      sum(
        w.sign * case
          when w.invoice_gross>0 then w.invoice_amount * (w.gross_line_revenue/w.invoice_gross)
          else 0
        end
      ) as invoiced_revenue
    from weighted w
    group by w.product_id
  ), margin_products as (
    select
      (x->>'productId')::bigint as product_id,
      (x->>'realizedMargin')::numeric as realized_margin,
      (x->>'coverageRate')::numeric as coverage_rate,
      (x->>'unmatchedLines')::bigint as unmatched_lines
    from jsonb_array_elements(coalesce(v_margin->'products','[]'::jsonb)) x
  ), enriched as (
    select
      a.product_id,
      a.product_name,
      p.category_id,
      c.nom as category_name,
      a.net_qty,
      a.invoiced_revenue,
      case when v_margin is null then null else coalesce(mp.realized_margin,0) end as realized_margin,
      case when v_margin is null then null else coalesce(mp.coverage_rate,100) end as margin_coverage_rate,
      case when v_margin is null then null else coalesce(mp.unmatched_lines,0) end as margin_unmatched_lines
    from allocated a
    left join public.products p
      on p.boutique_id=p_boutique_id
     and p.id=a.product_id
    left join public.categories c
      on c.boutique_id=p_boutique_id
     and c.id=p.category_id
    left join margin_products mp on mp.product_id=a.product_id
  )
  select jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'invoiced_revenue',coalesce((select sum(e.invoiced_revenue) from enriched e),0),
    'products',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id',e.product_id,
          'product_name',e.product_name,
          'category_id',e.category_id,
          'category_name',coalesce(e.category_name,'Sans catégorie'),
          'quantity',e.net_qty,
          'invoiced_revenue',e.invoiced_revenue,
          'realized_margin_fifo',e.realized_margin,
          'margin_coverage_rate',e.margin_coverage_rate,
          'margin_unmatched_lines',e.margin_unmatched_lines
        ) order by e.invoiced_revenue desc,e.product_name
      )
      from enriched e
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(x order by x->>'name')
      from (
        select distinct jsonb_build_object(
          'id',coalesce(e.category_id,''),
          'name',coalesce(e.category_name,'Sans catégorie')
        ) as x
        from enriched e
      ) q
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.get_sales_product_report(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_sales_product_report(text,timestamptz,timestamptz) to authenticated;
