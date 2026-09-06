-- Audit-only replay shim.
-- The retained 20260817 transfer migration defines
-- public.accept_stock_transfer(uuid,uuid) with p_idempotency_key DEFAULT NULL.
-- The later production migration 20260829164332 intentionally redefines the
-- same signature without that default. PostgreSQL cannot remove argument
-- defaults via CREATE OR REPLACE FUNCTION, so remove only the legacy function
-- immediately before replaying the authoritative FIFO/caisse implementation.
-- This file must not be merged to main as a production migration.

drop function if exists public.accept_stock_transfer(uuid, uuid);
