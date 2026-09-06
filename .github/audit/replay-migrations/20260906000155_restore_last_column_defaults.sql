-- AUDIT ONLY: align the last default expressions with current production.

alter table public.invoice_payments
  alter column batch_id drop default,
  alter column operator_name drop default,
  alter column payment_method drop default;

-- Production currently contains this historical mojibake literal byte-for-byte.
-- Reproduce it in the audit replay for schema fingerprint equivalence; do not
-- silently change production semantics as part of reconciliation.
alter table public.products
  alter column unit set default 'unitÃ©'::text;
