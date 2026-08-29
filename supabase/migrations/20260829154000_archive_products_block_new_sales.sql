-- Preserve stock/accounting history by archiving products instead of deleting them.
-- Archived products remain readable for old invoices, returns and inventory history,
-- but cannot be inserted into a new non-return sales document.
create or replace function private.enforce_active_product_on_sale_line()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare v_invoice_type text; v_active boolean;
begin
  if new.product_id is null then return new; end if;
  select i.type into v_invoice_type
  from public.invoices i
  where i.boutique_id=new.boutique_id and i.id=new.invoice_id;
  if lower(coalesce(v_invoice_type,''))='retour' then return new; end if;
  select coalesce(p.actif,true) into v_active
  from public.products p
  where p.boutique_id=new.boutique_id and p.id=new.product_id;
  if not coalesce(v_active,false) then
    raise exception 'product_archived' using hint='Réactivez le produit avant de l’ajouter à une nouvelle vente.';
  end if;
  return new;
end $$;
drop trigger if exists trg_invoice_lines_active_product on public.invoice_lines;
create trigger trg_invoice_lines_active_product
before insert on public.invoice_lines
for each row execute function private.enforce_active_product_on_sale_line();
