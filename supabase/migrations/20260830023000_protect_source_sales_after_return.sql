-- Once an issued return references a source sale, keep the commercial/accounting
-- source immutable. Existing historical rows are not rewritten; this only
-- constrains future updates/deletes. Automatic status synchronization remains
-- allowed because status/updated_at are intentionally not frozen here.

create or replace function private.protect_source_sale_after_return()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if not exists (
    select 1
    from public.invoices r
    where r.boutique_id = old.boutique_id
      and r.return_of_invoice_id = old.id
      and lower(coalesce(r.type, '')) = 'retour'
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'source sale with issued return is immutable';
  end if;

  if new.boutique_id is distinct from old.boutique_id
     or new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.client_nom is distinct from old.client_nom
     or new.client_tel is distinct from old.client_tel
     or new.montant is distinct from old.montant
     or new.acompte is distinct from old.acompte
     or new.invoice_date is distinct from old.invoice_date
     or new.type is distinct from old.type
     or new.payment_method is distinct from old.payment_method
     or new.stock_deducted_at is distinct from old.stock_deducted_at
     or new.cancel_reason is distinct from old.cancel_reason
     or new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.return_of_invoice_id is distinct from old.return_of_invoice_id
     or new.origin is distinct from old.origin
  then
    raise exception 'source sale with issued return is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_source_sale_after_return on public.invoices;
create trigger trg_protect_source_sale_after_return
before update or delete on public.invoices
for each row execute function private.protect_source_sale_after_return();

create or replace function private.protect_source_sale_line_after_return()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_boutique_id text := old.boutique_id;
  v_invoice_id text := old.invoice_id;
begin
  if exists (
    select 1
    from public.invoices r
    where r.boutique_id = v_boutique_id
      and r.return_of_invoice_id = v_invoice_id
      and lower(coalesce(r.type, '')) = 'retour'
  ) then
    raise exception 'source sale lines with issued return are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_protect_source_sale_line_after_return on public.invoice_lines;
create trigger trg_protect_source_sale_line_after_return
before update or delete on public.invoice_lines
for each row execute function private.protect_source_sale_line_after_return();