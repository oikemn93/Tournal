-- Harden future return lines without rewriting uncertain historical rows.
-- Return lines must preserve the source commercial snapshot while allowing
-- FIFO-derived cost (prix_achat) to remain independently calculated.

create or replace function private.guard_return_line_provenance()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_return public.invoices%rowtype;
  v_source public.invoice_lines%rowtype;
  v_already_returned numeric;
  v_expected_sell_qty numeric;
begin
  select * into v_return
  from public.invoices
  where boutique_id = new.boutique_id and id = new.invoice_id;

  if not found or lower(coalesce(v_return.type, '')) <> 'retour' then
    return new;
  end if;

  if v_return.return_of_invoice_id is null then
    raise exception 'return source invoice required';
  end if;
  if new.source_invoice_line_id is null then
    raise exception 'return source line required';
  end if;
  if coalesce(new.qty, 0) <= 0 then
    raise exception 'invalid return quantity';
  end if;

  select * into v_source
  from public.invoice_lines
  where id = new.source_invoice_line_id
    and boutique_id = new.boutique_id
    and invoice_id = v_return.return_of_invoice_id
  for update;

  if not found then
    raise exception 'return source line does not belong to source invoice';
  end if;
  if v_source.product_id <> new.product_id then
    raise exception 'return product does not match source line';
  end if;

  if new.nom is distinct from v_source.nom
     or new.unit is distinct from v_source.unit
     or new.prix_unit is distinct from v_source.prix_unit
     or new.sell_unit is distinct from v_source.sell_unit then
    raise exception 'return line commercial snapshot does not match source line';
  end if;

  v_expected_sell_qty := case
    when v_source.sell_unit is null or v_source.sell_qty is null or coalesce(v_source.qty, 0) <= 0 then null
    else round(v_source.sell_qty * new.qty / v_source.qty, 3)
  end;

  if new.sell_qty is distinct from v_expected_sell_qty then
    raise exception 'return sell quantity does not match source line proportion';
  end if;

  select coalesce(sum(rl.qty), 0)
    into v_already_returned
  from public.invoice_lines rl
  join public.invoices ri
    on ri.boutique_id = rl.boutique_id
   and ri.id = rl.invoice_id
  where rl.boutique_id = new.boutique_id
    and lower(coalesce(ri.type, '')) = 'retour'
    and ri.return_of_invoice_id = v_return.return_of_invoice_id
    and rl.source_invoice_line_id = new.source_invoice_line_id
    and (tg_op <> 'UPDATE' or rl.id <> new.id);

  if v_already_returned + new.qty > v_source.qty + 0.0005 then
    raise exception 'return quantity exceeds remaining quantity for source line %', new.source_invoice_line_id;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_return_line_provenance() from public, anon;
grant execute on function private.guard_return_line_provenance() to authenticated, service_role;

drop trigger if exists invoice_lines_guard_return_provenance on public.invoice_lines;
create trigger invoice_lines_guard_return_provenance
before insert or update of boutique_id, invoice_id, source_invoice_line_id, product_id, nom, qty, unit, prix_unit, sell_unit, sell_qty
on public.invoice_lines
for each row execute function private.guard_return_line_provenance();
