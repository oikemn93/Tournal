-- Sync v2 broadcasts contain only record identifiers/revisions; actual rows are
-- fetched afterwards through REST under table RLS. Requiring the short-lived
-- app_session at websocket JOIN time created a race during login/reconnect.
-- Keep boutique assignment + active-account authorization on the channel, while
-- business reads/writes continue to require their normal RLS/app-session gates.

drop policy if exists "tournal v2 sync receive" on realtime.messages;

create policy "tournal v2 sync receive"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like 'tournal:v2:%'
  and (
    private.auth_is_super_admin()
    or private.auth_is_assigned_to(
      substr(realtime.topic(), length('tournal:v2:') + 1)
    )
  )
);
