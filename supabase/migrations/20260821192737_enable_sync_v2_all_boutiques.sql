-- Sync V2 has already been exercised on the isolated lab boutique.  Enabling it
-- now is intentionally a data-only rollout: the V1 listener stays available in
-- the client as a compatibility fallback for sessions opened before a refresh.
begin;

set local lock_timeout = '10s';

insert into private.boutique_sync_settings (boutique_id, enabled, updated_at)
select id, true, now()
from public.boutiques
on conflict (boutique_id) do update
set enabled = excluded.enabled,
    updated_at = excluded.updated_at
where private.boutique_sync_settings.enabled is distinct from true;

commit;
