create or replace function private.guard_return_stock_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_return public.invoices%rowtype;
  v_line public.invoice_lines%rowtype;
begin
  if new.return_invoice_id is null then
    return new;
  end if;

  select * into v_return
  from public.invoices i
  where i.boutique_id = new.boutique_id
    and i.id = new.return_invoice_id
    and lower(coalesce(i.type,'')) = 'retour';
  if not found then
    raise exception 'invalid return stock movement invoice';
  end if;

  if new.return_invoice_line_id is null then
    raise exception 'return stock movement requires return invoice line';
  end if;

  select * into v_line
  from public.invoice_lines il
  where il.id = new.return_invoice_line_id
    and il.boutique_id = new.boutique_id
    and il.invoice_id = new.return_invoice_id;
  if not found then
    raise exception 'invalid return stock movement line';
  end if;

  if new.product_id is distinct from v_line.product_id then
    raise exception 'return stock movement product mismatch';
  end if;
  if new.source_invoice_id is distinct from v_return.return_of_invoice_id then
    raise exception 'return stock movement source invoice mismatch';
  end if;
  if new.source_invoice_line_id is distinct from v_line.source_invoice_line_id then
    raise exception 'return stock movement source line mismatch';
  end if;
  if lower(coalesce(new.type,'')) <> 'retour' then
    raise exception 'invalid return stock movement type';
  end if;
  if abs(coalesce(new.qty,0) - coalesce(v_line.qty,0)) > 0.0005 then
    raise exception 'return stock movement quantity mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_return_stock_provenance on public.stock_entries;
create trigger trg_guard_return_stock_provenance
before insert or update of boutique_id, product_id, type, qty, source_invoice_id, source_invoice_line_id, return_invoice_id, return_invoice_line_id
on public.stock_entries
for each row execute function private.guard_return_stock_provenance();
