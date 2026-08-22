-- Keep the Realtime V2 replay ledger bounded. Clients receive live broadcasts
-- and reconcile canonical REST slices, so a 48-hour window is sufficient for
-- temporary disconnects while avoiding unbounded event growth.
create or replace function private.purge_old_boutique_sync_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from private.boutique_sync_events
  where occurred_at < now() - interval '48 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.purge_old_boutique_sync_events() from public, anon, authenticated, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-old-boutique-sync-events';

select cron.schedule(
  'purge-old-boutique-sync-events',
  '23 * * * *',
  $$select private.purge_old_boutique_sync_events();$$
);

create index if not exists stock_entries_boutique_entry_date_id_desc_idx
  on public.stock_entries (boutique_id, entry_date desc, id desc);
