-- Audit-only replay compatibility shim.
-- Earlier retained migrations build invoices_app from i.*, so the synthetic CI
-- baseline's different physical invoice-column order leaks into the view's
-- output order. Production's 20260904160242 optimization explicitly defines
-- the canonical output order. Drop only the disposable local view immediately
-- before that canonical CREATE OR REPLACE so PostgreSQL does not interpret the
-- reordered columns as renames. The next audit shim restores production ACLs.
-- This file must not be merged to main.

drop view if exists public.invoices_app;
