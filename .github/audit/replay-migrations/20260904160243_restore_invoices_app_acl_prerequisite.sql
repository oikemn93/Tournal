-- Audit-only replay compatibility shim.
-- Production public.invoices_app is owned by postgres and grants the standard
-- Supabase table/view privilege set to authenticated and service_role. The
-- preceding audit-only drop intentionally loses those ACLs, so restore them
-- immediately after the canonical production view definition.
-- This file must not be merged to main.

grant all privileges on table public.invoices_app to authenticated, service_role;
