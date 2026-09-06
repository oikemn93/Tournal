-- Audit-only reconstruction of invoice sequencing and stock lifecycle columns
-- introduced before the retained Git history. No historical invoice rows are
-- renumbered or backfilled on this clean replay database.

alter table public.invoices
  add column if not exists numero bigint,
  add column if not exists stock_deducted_at timestamptz;

alter table public.invoices alter column numero set not null;
create unique index if not exists invoices_boutique_numero_key on public.invoices(boutique_id,numero);

create or replace function private.next_invoice_number(p_boutique_id text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_numero bigint;
begin
  insert into private.invoice_number_counters as c (boutique_id,last_numero)
  values (p_boutique_id,1)
  on conflict (boutique_id) do update
    set last_numero=c.last_numero+1,
        updated_at=now()
  returning last_numero into v_numero;
  return v_numero;
end;
$$;

revoke all on function private.next_invoice_number(text) from public;
