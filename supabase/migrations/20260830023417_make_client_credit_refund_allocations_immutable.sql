-- Refund allocations are part of the accounting provenance of an issued client-credit refund.
-- Keep existing rows untouched, but prevent any later rewrite or deletion.
create or replace function private.guard_client_credit_refund_allocation_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  raise exception 'client credit refund allocations are immutable';
end;
$$;

drop trigger if exists trg_client_credit_refund_allocation_immutable on public.client_credit_refund_allocations;
create trigger trg_client_credit_refund_allocation_immutable
before update or delete on public.client_credit_refund_allocations
for each row execute function private.guard_client_credit_refund_allocation_immutability();
