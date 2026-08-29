-- Credit notes are accounting documents. Once emitted, they must not be
-- rewritten or deleted. This is prospective enforcement only: no historical
-- return row or line is modified by this migration.

create or replace function private.guard_return_invoice_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if old.type = 'Retour' then
    raise exception 'return credit notes are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_invoice_immutability() from public, anon;
grant execute on function private.guard_return_invoice_immutability() to authenticated;

drop trigger if exists trg_return_invoice_immutable on public.invoices;
create trigger trg_return_invoice_immutable
before update or delete on public.invoices
for each row execute function private.guard_return_invoice_immutability();

create or replace function private.guard_return_line_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_type text;
begin
  select i.type into v_type
  from public.invoices i
  where i.boutique_id = old.boutique_id
    and i.id = old.invoice_id;

  if v_type = 'Retour' then
    raise exception 'return credit note lines are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_line_immutability() from public, anon;
grant execute on function private.guard_return_line_immutability() to authenticated;

drop trigger if exists trg_return_line_immutable on public.invoice_lines;
create trigger trg_return_line_immutable
before update or delete on public.invoice_lines
for each row execute function private.guard_return_line_immutability();
