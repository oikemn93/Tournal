-- Prospective-only integrity check for newly emitted return credit notes.
-- Existing historical returns are not updated or revalidated.
create or replace function private.guard_new_return_line_totals()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_count bigint;
  v_lines_total numeric;
begin
  if lower(coalesce(new.type, '')) <> 'retour' then
    return new;
  end if;

  select count(*), coalesce(sum(
    case
      when coalesce(l.qty,0) > 0 then
        coalesce(l.qty,0) * case
          when coalesce(l.qty,0) > 0 and l.sell_qty is not null
            then (coalesce(l.sell_qty,0) * coalesce(l.prix_unit,0)) / l.qty
          else coalesce(l.prix_unit,0)
        end
      else 0
    end
  ),0)
  into v_count, v_lines_total
  from public.invoice_lines l
  where l.boutique_id = new.boutique_id
    and l.invoice_id = new.id;

  if v_count = 0 then
    raise exception 'return credit note must contain at least one line';
  end if;
  if abs(round(v_lines_total,2) - round(coalesce(new.montant,0),2)) > 0.01 then
    raise exception 'return credit note total must equal return line total';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_new_return_line_totals() from public, anon;
grant execute on function private.guard_new_return_line_totals() to authenticated;

drop trigger if exists trg_new_return_line_totals on public.invoices;
create constraint trigger trg_new_return_line_totals
after insert on public.invoices
deferrable initially deferred
for each row execute function private.guard_new_return_line_totals();
