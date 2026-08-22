-- Existing projects may have default table privileges for authenticated.
-- This append-only financial ledger is writable only through its checked RPC.
begin;

revoke all on table public.client_advances from public, anon, authenticated;
grant select on table public.client_advances to authenticated;

commit;
