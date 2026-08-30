-- Prospectively harden sale-return accounting without rewriting uncertain legacy rows.
-- NOT VALID preserves historical rows while enforcing the constraint for new writes.

alter table public.invoices
  add constraint invoices_return_financial_invariants_v2
  check (
    lower(coalesce(type,'')) <> 'retour'
    or (
      return_of_invoice_id is not null
      and coalesce(montant,0) > 0
      and coalesce(return_refund_amount,0) >= 0
      and coalesce(return_receivable_reduction,0) >= 0
      and greatest(coalesce(return_client_credit_amount,0),coalesce(return_credit_restore,0)) >= 0
      and abs(
        coalesce(montant,0)
        - (
          coalesce(return_refund_amount,0)
          + coalesce(return_receivable_reduction,0)
          + greatest(coalesce(return_client_credit_amount,0),coalesce(return_credit_restore,0))
        )
      ) <= 0.01
      and (
        (client_id is null and greatest(coalesce(return_client_credit_amount,0),coalesce(return_credit_restore,0)) = 0)
        or
        (client_id is not null and coalesce(return_refund_amount,0) = 0)
      )
    )
  ) not valid;
