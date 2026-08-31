create index if not exists invoices_ops_sale_activity_idx
  on public.invoices (boutique_id, invoice_date desc)
  where coalesce(type,'') not in ('Retour','Transfert interne','B2B Achat');

create index if not exists stock_entries_ops_receipt_idx
  on public.stock_entries (boutique_id, entry_date)
  where type = 'achat' and qty > 0;

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
  select b.id,
         (select count(*)::bigint from public.products p where p.boutique_id = b.id),
         (select count(*)::bigint from public.boutique_assignments a where a.boutique_id = b.id),
         (select count(*)::bigint from public.boutique_assignments a where a.boutique_id = b.id and a.role = 'owner'),
         (select min(i.invoice_date) from public.invoices i where i.boutique_id = b.id and coalesce(i.type,'') not in ('Retour','Transfert interne','B2B Achat')),
         (select max(i.invoice_date) from public.invoices i where i.boutique_id = b.id and coalesce(i.type,'') not in ('Retour','Transfert interne','B2B Achat')),
         (select min(s.entry_date) from public.stock_entries s where s.boutique_id = b.id and s.type = 'achat' and s.qty > 0),
         (select max(s.entry_date) from public.stock_entries s where s.boutique_id = b.id)
  from public.boutiques b
  order by b.nom;
end;
$$;

revoke all on function public.get_ops_boutique_overview() from public;
grant execute on function public.get_ops_boutique_overview() to authenticated;
