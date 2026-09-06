-- Audit-only replay shim.
-- A retained pre-hardening migration leaves a DEFAULT on
-- public.reject_stock_transfer(uuid,uuid). PostgreSQL cannot remove argument
-- defaults via CREATE OR REPLACE FUNCTION, while the production definition that
-- preceded the 20260829164304 hardening had no default. Drop only the legacy
-- function immediately before replaying the authoritative hardening migration.
-- This file must not be merged to main as a production migration.

drop function if exists public.reject_stock_transfer(uuid, uuid);
