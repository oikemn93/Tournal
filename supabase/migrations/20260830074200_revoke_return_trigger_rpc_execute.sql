-- Return-related trigger helpers are internal implementation details, not RPCs.
-- Keep trigger execution intact while preventing direct Data API invocation.

revoke all on function public.enforce_return_invoice_disbursement() from public, anon, authenticated;
grant execute on function public.enforce_return_invoice_disbursement() to postgres, service_role;

revoke all on function public.enforce_return_line_provenance() from public, anon, authenticated;
grant execute on function public.enforce_return_line_provenance() to postgres, service_role;

revoke all on function public.link_return_client_advance() from public, anon, authenticated;
grant execute on function public.link_return_client_advance() to postgres, service_role;

revoke all on function public.protect_return_client_advance() from public, anon, authenticated;
grant execute on function public.protect_return_client_advance() to postgres, service_role;
