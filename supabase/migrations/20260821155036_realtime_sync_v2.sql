-- Realtime Sync v2 is additive. The legacy Postgres Changes subscription and
-- full boutique snapshot stay available until the client feature flag is
-- explicitly switched to v2.

create schema if not exists private;

create table if not exists private.boutique_sync_revisions (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Disabled unless an administrator explicitly enables v2 for a boutique. This
-- makes the schema safe to install before any production user is migrated.
create table if not exists private.boutique_sync_settings (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists private.boutique_sync_events (
  id uuid primary key default gen_random_uuid(),
  boutique_id text not null references public.boutiques(id) on delete cascade,
  revision bigint not null,
  domain text not null,
  entity_type text not null,
  entity_id text not null,
  record_id text,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  occurred_at timestamptz not null default now(),
  unique (boutique_id, revision)
);

create index if not exists boutique_sync_events_boutique_revision_idx
  on private.boutique_sync_events (boutique_id, revision desc);

alter table private.boutique_sync_revisions enable row level security;
alter table private.boutique_sync_settings enable row level security;
alter table private.boutique_sync_events enable row level security;
revoke all on table private.boutique_sync_revisions from public, anon, authenticated;
revoke all on table private.boutique_sync_settings from public, anon, authenticated;
revoke all on table private.boutique_sync_events from public, anon, authenticated;

-- This is the only writer for v2 messages. It stores an auditable, lightweight
-- event before asking Realtime to deliver it. No client can publish a business
-- change and no sensitive business row is put in the WebSocket payload.
create or replace function private.emit_boutique_sync_event(
  p_boutique_id text,
  p_domain text,
  p_entity_type text,
  p_entity_id text,
  p_record_id text,
  p_operation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_event_id uuid;
begin
  if p_boutique_id is null or p_boutique_id = '' then
    raise exception 'sync event requires boutique_id';
  end if;

  if not coalesce((
    select s.enabled
    from private.boutique_sync_settings s
    where s.boutique_id = p_boutique_id
  ), false) then
    return null;
  end if;

  insert into private.boutique_sync_revisions (boutique_id, revision, updated_at)
  values (p_boutique_id, 1, now())
  on conflict (boutique_id) do update
    set revision = private.boutique_sync_revisions.revision + 1,
        updated_at = excluded.updated_at
  returning revision into v_revision;

  insert into private.boutique_sync_events (
    boutique_id, revision, domain, entity_type, entity_id, record_id, operation
  ) values (
    p_boutique_id, v_revision, p_domain, p_entity_type, p_entity_id, p_record_id, p_operation
  ) returning id into v_event_id;

  perform realtime.send(
    jsonb_build_object(
      'event_id', v_event_id,
      'revision', v_revision,
      'domain', p_domain,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'record_id', p_record_id,
      'operation', p_operation
    ),
    'sync',
    'tournal:v2:' || p_boutique_id,
    true
  );

  return v_event_id;
end;
$$;

-- Generic table trigger. Arguments are: boutique column, entity column,
-- fallback entity column, record column, domain, entity type. The entity identifies the UI aggregate to refresh;
-- the record identifies a precise row to add or remove.
create or replace function private.emit_boutique_row_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_boutique_id text;
  v_entity_id text;
  v_record_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_boutique_id := v_row ->> tg_argv[0];
  v_entity_id := coalesce(v_row ->> tg_argv[1], v_row ->> tg_argv[2]);
  v_record_id := v_row ->> tg_argv[3];

  if v_boutique_id is not null and v_entity_id is not null then
    perform private.emit_boutique_sync_event(
      v_boutique_id,
      tg_argv[4],
      tg_argv[5],
      v_entity_id,
      v_record_id,
      tg_op
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- A transfer belongs to both shops. Its lines are intentionally not subscribed
-- independently: a header event is enough to fetch the canonical transfer with
-- all lines after commit.
create or replace function private.emit_stock_transfer_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_transfer_id text;
  v_from_boutique_id text;
  v_to_boutique_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_transfer_id := v_row ->> 'id';
  v_from_boutique_id := v_row ->> 'from_boutique_id';
  v_to_boutique_id := v_row ->> 'to_boutique_id';

  if v_from_boutique_id is not null then
    perform private.emit_boutique_sync_event(v_from_boutique_id, 'transfers', 'stock_transfer', v_transfer_id, v_transfer_id, tg_op);
  end if;
  if v_to_boutique_id is not null and v_to_boutique_id is distinct from v_from_boutique_id then
    perform private.emit_boutique_sync_event(v_to_boutique_id, 'transfers', 'stock_transfer', v_transfer_id, v_transfer_id, tg_op);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Same public API shape as the existing app session functions: exposed only to
-- authenticated callers and guarded by the current Supabase Auth session plus
-- the app-level lock/expiry check.
create or replace function public.get_boutique_sync_revision(p_boutique_id text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.revision
    from private.boutique_sync_revisions r
    where r.boutique_id = p_boutique_id
  ), 0)
  where private.auth_is_super_admin()
     or (private.auth_is_assigned_to(p_boutique_id) and private.auth_has_active_app_session(p_boutique_id));
$$;

revoke all on function private.emit_boutique_sync_event(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.emit_boutique_row_sync() from public, anon, authenticated;
revoke all on function private.emit_stock_transfer_sync() from public, anon, authenticated;
revoke all on function public.get_boutique_sync_revision(text) from public, anon;
grant execute on function public.get_boutique_sync_revision(text) to authenticated;

-- Realtime authorization is evaluated when a socket joins a private channel.
-- A locked, expired, unassigned, or suspended session cannot join a shop topic.
drop policy if exists "tournal v2 sync receive" on realtime.messages;
create policy "tournal v2 sync receive"
on realtime.messages for select to authenticated
using (
  realtime.topic() like 'tournal:v2:%'
  and (
    private.auth_is_super_admin()
    or (
      private.auth_is_assigned_to(substr(realtime.topic(), length('tournal:v2:') + 1))
      and private.auth_has_active_app_session(substr(realtime.topic(), length('tournal:v2:') + 1))
    )
  )
);

drop trigger if exists tournal_sync_products on public.products;
create trigger tournal_sync_products after insert or update or delete on public.products
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'catalogue', 'product');

drop trigger if exists tournal_sync_categories on public.categories;
create trigger tournal_sync_categories after insert or update or delete on public.categories
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'catalogue', 'category');

drop trigger if exists tournal_sync_stock_entries on public.stock_entries;
create trigger tournal_sync_stock_entries after insert or update or delete on public.stock_entries
for each row execute function private.emit_boutique_row_sync('boutique_id', 'product_id', 'product_id', 'id', 'stock', 'stock_entry');

drop trigger if exists tournal_sync_invoices on public.invoices;
create trigger tournal_sync_invoices after insert or update or delete on public.invoices
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'sales', 'invoice');

drop trigger if exists tournal_sync_invoice_lines on public.invoice_lines;
create trigger tournal_sync_invoice_lines after insert or update or delete on public.invoice_lines
for each row execute function private.emit_boutique_row_sync('boutique_id', 'invoice_id', 'invoice_id', 'id', 'sales', 'invoice_line');

drop trigger if exists tournal_sync_invoice_payments on public.invoice_payments;
create trigger tournal_sync_invoice_payments after insert or update or delete on public.invoice_payments
for each row execute function private.emit_boutique_row_sync('boutique_id', 'invoice_id', 'invoice_id', 'id', 'sales', 'invoice_payment');

drop trigger if exists tournal_sync_clients on public.clients;
create trigger tournal_sync_clients after insert or update or delete on public.clients
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'clients', 'client');

drop trigger if exists tournal_sync_suppliers on public.suppliers;
create trigger tournal_sync_suppliers after insert or update or delete on public.suppliers
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'suppliers', 'supplier');

drop trigger if exists tournal_sync_charges on public.charges;
create trigger tournal_sync_charges after insert or update or delete on public.charges
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'charges', 'charge');

drop trigger if exists tournal_sync_caisse_sessions on public.caisse_sessions;
create trigger tournal_sync_caisse_sessions after insert or update or delete on public.caisse_sessions
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'caisse', 'caisse_session');

drop trigger if exists tournal_sync_audit_log on public.audit_log;
create trigger tournal_sync_audit_log after insert or update or delete on public.audit_log
for each row execute function private.emit_boutique_row_sync('boutique_id', 'id', 'id', 'id', 'audit', 'audit_log');

drop trigger if exists tournal_sync_boutique_assignments on public.boutique_assignments;
create trigger tournal_sync_boutique_assignments after insert or update or delete on public.boutique_assignments
for each row execute function private.emit_boutique_row_sync('boutique_id', 'user_id', 'user_id', 'id', 'access', 'assignment');

drop trigger if exists tournal_sync_stock_transfers on public.stock_transfers;
create trigger tournal_sync_stock_transfers after insert or update or delete on public.stock_transfers
for each row execute function private.emit_stock_transfer_sync();
