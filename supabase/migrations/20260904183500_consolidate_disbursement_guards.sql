-- Consolidate overlapping disbursement triggers without changing authorization.
-- Canonical charge guard: private.guard_charge_disbursement()
-- Canonical client-credit refund guard: private.enforce_client_credit_refund_disbursement()

drop trigger if exists trg_enforce_charge_disbursement on public.charges;
drop trigger if exists trg_guard_supplier_payment_disbursement on public.charges;
drop trigger if exists client_credit_refunds_require_disbursement on public.client_credit_refunds;

drop function if exists private.enforce_charge_disbursement();
drop function if exists private.guard_supplier_payment_disbursement();
drop function if exists private.guard_client_credit_refund_disbursement();
