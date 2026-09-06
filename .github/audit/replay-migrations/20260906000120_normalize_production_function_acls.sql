-- AUDIT ONLY: normalize ACLs inherited by CREATE OR REPLACE FUNCTION.
-- Bodies already match production; this removes stale grants from the synthetic replay.

revoke all on function public.create_charge(text,uuid,text,numeric,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_charge(text,uuid,text,numeric,text,text) to service_role, authenticated;

revoke all on function public.create_charge(text,uuid,text,numeric,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_charge(text,uuid,text,numeric,text,text,text) to service_role, authenticated;

revoke all on function public.create_client(text,uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_client(text,uuid,text,text,text,text,text) to service_role, authenticated;

revoke all on function public.create_supplier(text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_supplier(text,uuid,text,text,text) to service_role, authenticated;

revoke all on function public.record_express_payment(text,text,uuid,numeric,text) from public, anon, authenticated, service_role;
grant execute on function public.record_express_payment(text,text,uuid,numeric,text) to service_role, authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
grant execute on function public.rls_auto_enable() to service_role;
