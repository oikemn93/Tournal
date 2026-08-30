-- Harden return immutability checks without rewriting historical data.
-- Treat return invoice types case-insensitively, consistent with the rest of the return guards.

create or replace function private.guard_return_invoice_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if lower(coalesce(old.type, '')) = 'retour' then
    raise exception 'return credit notes are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_invoice_immutability() from public, anon;
grant execute on function private.guard_return_invoice_immutability() to authenticated, service_role;

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

  if lower(coalesce(v_type, '')) = 'retour' then
    raise exception 'return credit note lines are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_line_immutability() from public, anon;
grant execute on function private.guard_return_line_immutability() to authenticated, service_role;
