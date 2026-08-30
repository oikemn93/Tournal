-- Once a sale has an issued return, its recorded payments and stock movements
-- are part of the accounting provenance of that return. Keep those historical
-- side effects immutable without rewriting or backfilling uncertain legacy rows.

create or replace function private.protect_source_sale_payment_after_return()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if exists (
    select 1 from public.invoices r
    where r.boutique_id = old.boutique_id
      and r.return_of_invoice_id = old.invoice_id
      and lower(coalesce(r.type,'')) = 'retour'
  ) then
    raise exception 'source sale payments with issued return are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_protect_source_sale_payment_after_return on public.invoice_payments;
create trigger trg_protect_source_sale_payment_after_return
before update or delete on public.invoice_payments
for each row execute function private.protect_source_sale_payment_after_return();

create or replace function private.protect_source_sale_stock_after_return()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_source_invoice_id text := old.source_invoice_id;
begin
  if v_source_invoice_id is not null and exists (
    select 1 from public.invoices r
    where r.boutique_id = old.boutique_id
      and r.return_of_invoice_id = v_source_invoice_id
      and lower(coalesce(r.type,'')) = 'retour'
  ) then
    raise exception 'source sale stock movements with issued return are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_protect_source_sale_stock_after_return on public.stock_entries;
create trigger trg_protect_source_sale_stock_after_return
before update or delete on public.stock_entries
for each row execute function private.protect_source_sale_stock_after_return();
