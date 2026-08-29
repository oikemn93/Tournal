-- Extend the existing future-return integrity guard to later mutations as well.
-- Historical rows remain untouched; only attempts to modify return-defining fields
-- are validated from this point forward.

drop trigger if exists trg_guard_future_return_invoice_integrity on public.invoices;
create trigger trg_guard_future_return_invoice_integrity
before insert or update of
  boutique_id,
  type,
  return_of_invoice_id,
  client_id,
  montant,
  return_refund_amount,
  return_receivable_reduction,
  return_credit_restore
on public.invoices
for each row
execute function private.guard_future_return_invoice_integrity();
