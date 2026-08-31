-- Restrict Tournal Ops and custom transfer SECURITY DEFINER RPCs from anonymous callers.
-- Authorization inside the Ops RPCs continues to enforce SuperAdmin/Ops staff access.

revoke execute on function public.get_my_ops_profile() from public, anon;
grant execute on function public.get_my_ops_profile() to authenticated;

revoke execute on function public.get_ops_attention_counts() from public, anon;
grant execute on function public.get_ops_attention_counts() to authenticated;

revoke execute on function public.get_ops_boutique_overview() from public, anon;
grant execute on function public.get_ops_boutique_overview() to authenticated;

revoke execute on function public.get_ops_manager_metrics() from public, anon;
grant execute on function public.get_ops_manager_metrics() to authenticated;

revoke execute on function public.get_ops_shell() from public, anon;
grant execute on function public.get_ops_shell() to authenticated;

revoke execute on function public.accept_stock_transfer_custom(uuid, uuid, jsonb) from public, anon;
grant execute on function public.accept_stock_transfer_custom(uuid, uuid, jsonb) to authenticated;
