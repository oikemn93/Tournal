-- Audit-only replay shim.
-- The CI baseline defines private.fifo_outflow_cost(text,bigint,bigint) as a stub
-- with a historical parameter name. PostgreSQL does not allow CREATE OR REPLACE
-- FUNCTION to rename input parameters for an existing signature. Drop only that
-- synthetic stub immediately before the real FIFO implementation is replayed.
-- This file must not be merged to main as a production migration.

drop function if exists private.fifo_outflow_cost(text, bigint, bigint);
