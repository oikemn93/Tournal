begin;

-- Realtime must not broaden audit visibility. Only boutique owners and
-- SuperAdmin may read audit rows and therefore receive audit Postgres Changes.
drop policy if exists "audit_log: select" on public.audit_log;
create policy "audit_log: select"
on public.audit_log
for select
to authenticated
using (
  private.auth_is_super_admin()
  or private.auth_is_owner_of(boutique_id)
);

-- Realtime Postgres Changes requires SELECT privilege in addition to RLS.
-- boutique_partners stays protected by its existing RLS policy.
grant select on public.boutique_partners to authenticated;
revoke all on public.boutique_partners from anon;

-- Add the missing boutique-scoped business/security tables idempotently.
do $$
declare
  t text;
begin
  foreach t in array array[
    'suppliers',
    'categories',
    'boutique_partners',
    'boutique_assignments',
    'audit_log'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
