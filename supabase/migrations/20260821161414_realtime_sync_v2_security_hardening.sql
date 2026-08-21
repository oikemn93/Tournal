-- The initial V2 migration created this RPC as a possible client-side revision
-- probe. The client does not use it: keeping it public would add an unnecessary
-- SECURITY DEFINER surface to the Data API.
revoke all on function public.get_boutique_sync_revision(text) from public, anon, authenticated;
drop function if exists public.get_boutique_sync_revision(text);

-- V2 only sends database-originated Broadcast messages. Explicitly limiting
-- the receive policy to that extension makes the channel unusable for Presence
-- or another Realtime feature unless a future migration authorizes it on purpose.
drop policy if exists "tournal v2 sync receive" on realtime.messages;
create policy "tournal v2 sync receive"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'tournal:v2:%'
  and (
    private.auth_is_super_admin()
    or (
      private.auth_is_assigned_to(substr(realtime.topic(), length('tournal:v2:') + 1))
      and private.auth_has_active_app_session(substr(realtime.topic(), length('tournal:v2:') + 1))
    )
  )
);
