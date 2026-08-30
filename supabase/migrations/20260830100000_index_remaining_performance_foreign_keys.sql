-- Performance hardening for relational checks and return-side joins.
-- Schema-only: no historical business rows are rewritten.

create index if not exists client_credit_refunds_operator_id_idx
  on public.client_credit_refunds (operator_id);

create index if not exists stock_entries_return_invoice_line_idx
  on public.stock_entries (return_invoice_line_id);
