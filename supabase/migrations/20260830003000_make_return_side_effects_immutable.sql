-- Future-only hardening: financial and stock side effects created by a return
-- become append-only once written. This migration does not rewrite, backfill,
-- or infer any historical data.

create or replace function private.guard_return_payment_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_old_is_return boolean := false;
  v_new_is_return boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select exists (
      select 1
      from public.invoices i
      where i.boutique_id = old.boutique_id
        and i.id = old.invoice_id
        and lower(coalesce(i.type, '')) = 'retour'
    ) into v_old_is_return;
  end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.invoices i
      where i.boutique_id = new.boutique_id
        and i.id = new.invoice_id
        and lower(coalesce(i.type, '')) = 'retour'
    ) into v_new_is_return;
  end if;

  if v_old_is_return or v_new_is_return then
    raise exception 'return payment is immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_payment_immutability() from public, anon;

drop trigger if exists trg_return_payment_immutable on public.invoice_payments;
create trigger trg_return_payment_immutable
before update or delete on public.invoice_payments
for each row execute function private.guard_return_payment_immutability();

create or replace function private.guard_return_stock_entry_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_old_is_return boolean := false;
  v_new_is_return boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.return_invoice_id is not null then
    select exists (
      select 1
      from public.invoices i
      where i.boutique_id = old.boutique_id
        and i.id = old.return_invoice_id
        and lower(coalesce(i.type, '')) = 'retour'
    ) into v_old_is_return;
  end if;

  if tg_op = 'UPDATE' and new.return_invoice_id is not null then
    select exists (
      select 1
      from public.invoices i
      where i.boutique_id = new.boutique_id
        and i.id = new.return_invoice_id
        and lower(coalesce(i.type, '')) = 'retour'
    ) into v_new_is_return;
  end if;

  if v_old_is_return or v_new_is_return then
    raise exception 'return stock movement is immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_return_stock_entry_immutability() from public, anon;

drop trigger if exists trg_return_stock_entry_immutable on public.stock_entries;
create trigger trg_return_stock_entry_immutable
before update or delete on public.stock_entries
for each row execute function private.guard_return_stock_entry_immutability();

create or replace function private.guard_client_credit_refund_immutability()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  raise exception 'client credit refund is immutable';
end;
$$;

revoke all on function private.guard_client_credit_refund_immutability() from public, anon;

drop trigger if exists trg_client_credit_refund_immutable on public.client_credit_refunds;
create trigger trg_client_credit_refund_immutable
before update or delete on public.client_credit_refunds
for each row execute function private.guard_client_credit_refund_immutability();
