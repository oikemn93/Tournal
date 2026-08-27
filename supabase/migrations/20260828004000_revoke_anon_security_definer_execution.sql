-- Security hardening: these RPCs already reject unauthenticated callers in their bodies,
-- but leaving EXECUTE granted to anon unnecessarily exposes SECURITY DEFINER entry points.
revoke execute on function public.delete_client_if_unused(text,bigint) from anon;
revoke execute on function public.dismiss_all_notifications(text) from anon;
revoke execute on function public.mark_all_notifications_read(text) from anon;
revoke execute on function public.update_client_profile(text,bigint,text,text,text,text,text,text) from anon;
