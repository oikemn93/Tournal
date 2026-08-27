-- Supports audit lookups and the foreign-key check for the user that
-- cancelled a document without imposing a sequential scan on invoices.
create index if not exists invoices_cancelled_by_idx
  on public.invoices (cancelled_by)
  where cancelled_by is not null;
