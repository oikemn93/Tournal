create or replace function public.get_ops_boutique_overview()
returns table (
  boutique_id text,
  product_count bigint,
  user_count bigint,
  owner_count bigint,
  first_sale_at timestamptz,
  last_sale_at timestamptz,
  first_receipt_at timestamptz,
  last_stock_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not ((select private.auth_is_super_admin()) or (select private.auth_is_ops_staff())) then
    raise exception 'Ops access required' using errcode = '42501';
  end if;

  return query
  with product_counts as (
    select p.boutique_id, count(*)::bigint as product_count
    from public.products p
    group by p.boutique_id
  ), user_counts as (
    select a.boutique_id,
           count(*)::bigint as user_count,
           count(*) filter (where a.role = 'owner')::bigint as owner_count
    from public.boutique_assignments a
    group by a.boutique_id
  ), sales as (
    select i.boutique_id,
           min(i.invoice_date) filter (where coalesce(i.type,'') not in ('Retour','Transfert interne','B2B Achat')) as first_sale_at,
           max(i.invoice_date) filter (where coalesce(i.type,'') not in ('Retour','Transfert interne','B2B Achat')) as last_sale_at
    from public.invoices i
    group by i.boutique_id
  ), stock as (
    select s.boutique_id,
           min(s.entry_date) filter (where s.type = 'achat' and s.qty > 0) as first_receipt_at,
           max(s.entry_date) as last_stock_activity_at
    from public.stock_entries s
    group by s.boutique_id
  )
  select b.id,
         coalesce(pc.product_count,0),
         coalesce(uc.user_count,0),
         coalesce(uc.owner_count,0),
         sa.first_sale_at,
         sa.last_sale_at,
         st.first_receipt_at,
         st.last_stock_activity_at
  from public.boutiques b
  left join product_counts pc on pc.boutique_id=b.id
  left join user_counts uc on uc.boutique_id=b.id
  left join sales sa on sa.boutique_id=b.id
  left join stock st on st.boutique_id=b.id
  order by b.nom;
end;
$$;

revoke all on function public.get_ops_boutique_overview() from public;
grant execute on function public.get_ops_boutique_overview() to authenticated;
