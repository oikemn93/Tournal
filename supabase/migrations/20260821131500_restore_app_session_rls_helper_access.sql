-- This helper is deliberately private and returns only the caller's own
-- application-session status for a supplied boutique. RLS policies invoke it
-- directly, so authenticated needs EXECUTE even though the function itself is
-- not exposed through PostgREST's public schema.
--
-- Keep the function unavailable to anonymous users and remove the default
-- PUBLIC grant. Its SECURITY DEFINER body remains constrained to auth.uid(),
-- the JWT session_id and a boolean result.
revoke all on function private.auth_has_active_app_session(text) from public, anon;
grant execute on function private.auth_has_active_app_session(text) to authenticated;
