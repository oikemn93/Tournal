-- A dedicated cross-cutting permission is required for every operation that
-- creates an outgoing cash movement. Existing historical rows are deliberately
-- left untouched: the guard only applies to new writes after this migration.

create or replace function private.auth_can_disburse(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
  select private.auth_has_permission(p_boutique_id, 'decaissement');
$$;

revoke all on function private.auth_can_disburse(text) from public, anon;
grant execute on function private.auth_can_disburse(text) to authenticated;

create or replace function private.guard_charge_disbursement()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_old_paid numeric := case when tg_op = 'UPDATE' then coalesce(old.paid_amount, 0) else 0 end;
  v_new_paid numeric := coalesce(new.paid_amount, 0);
  v_cash_out numeric := greatest(v_new_paid - v_old_paid, 0);
begin
  -- Paid manual charges and supplier-payment ledger rows are cash outflows.
  -- Supplier receipts / transfer payables with paid_amount = 0 remain creatable
  -- without this right; the right is checked when they are actually settled.
  if tg_op = 'INSERT'
     and coalesce(new.source, 'manual') in ('manual', 'supplier_payment')
     and v_new_paid <= 0
     and coalesce(new.status, '') in ('paid', 'payé') then
    v_cash_out := greatest(coalesce(new.montant, 0), 0);
  end if;

  if v_cash_out > 0 and not private.auth_can_disburse(new.boutique_id) then
    raise exception 'disbursement access denied';
  end if;
  return new;
end;
$$;

drop trigger if exists charges_require_disbursement on public.charges;
create trigger charges_require_disbursement
before insert or update of paid_amount, status, montant on public.charges
for each row execute function private.guard_charge_disbursement();

create or replace function private.guard_client_credit_refund_disbursement()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if coalesce(new.amount, 0) > 0 and not private.auth_can_disburse(new.boutique_id) then
    raise exception 'disbursement access denied';
  end if;
  return new;
end;
$$;

drop trigger if exists client_credit_refunds_require_disbursement on public.client_credit_refunds;
create trigger client_credit_refunds_require_disbursement
before insert on public.client_credit_refunds
for each row execute function private.guard_client_credit_refund_disbursement();

create or replace function private.guard_return_payment_disbursement()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_invoice_type text;
begin
  if coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  select i.type into v_invoice_type
  from public.invoices i
  where i.boutique_id = new.boutique_id
    and i.id = new.invoice_id;

  if lower(coalesce(v_invoice_type, '')) = 'retour'
     and not private.auth_can_disburse(new.boutique_id) then
    raise exception 'disbursement access denied';
  end if;
  return new;
end;
$$;

drop trigger if exists return_invoice_payments_require_disbursement on public.invoice_payments;
create trigger return_invoice_payments_require_disbursement
before insert on public.invoice_payments
for each row execute function private.guard_return_payment_disbursement();
