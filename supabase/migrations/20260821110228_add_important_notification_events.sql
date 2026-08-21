-- High-signal operational notifications.
--
-- Sales and low-stock alerts already have dedicated triggers.  Payments are
-- deliberately excluded: creating a paid sale already emits the sale alert,
-- so a payment alert would notify the same recipients twice.

alter table public.notifications
  add column if not exists source_event_key text;

create unique index if not exists notifications_source_event_user_unique_idx
  on public.notifications(source_event_key, user_id)
  where source_event_key is not null;

create index if not exists notifications_active_boutique_user_created_idx
  on public.notifications(boutique_id, user_id, created_at desc)
  where dismissed_at is null and in_app_enabled;

create or replace function private.emit_important_notification(
  p_boutique_id text,
  p_category text,
  p_title text,
  p_body text,
  p_icon text,
  p_action_tab text,
  p_action_filter jsonb,
  p_source_event_key text,
  p_allow_push boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app boolean;
  v_push boolean;
begin
  v_in_app := private.notification_channel_enabled(p_boutique_id, p_category, 'in_app');
  v_push := coalesce(p_allow_push, false)
    and private.notification_channel_enabled(p_boutique_id, p_category, 'push');

  if not v_in_app and not v_push then
    return;
  end if;

  insert into public.notifications(
    user_id, boutique_id, category, title, body, icon, action_tab,
    action_filter, source_event_key, in_app_enabled, push_enabled
  )
  select r.user_id, p_boutique_id, p_category, p_title, p_body, p_icon,
    p_action_tab, p_action_filter, p_source_event_key, v_in_app, v_push
  from (
    select distinct a.user_id
    from public.boutique_assignments a
    join public.platform_users u
      on u.id = a.user_id and not coalesce(u.is_suspended, false)
    where a.boutique_id = p_boutique_id
      and (
        a.role = 'owner'
        or (p_category = 'refund' and (
          coalesce((a.droits ->> 'factures')::boolean, false)
          or coalesce((a.droits ->> 'remboursement')::boolean, false)
        ))
        or (p_category = 'charge' and coalesce((a.droits ->> 'charges')::boolean, false))
        or (p_category = 'caisse' and (
          coalesce((a.droits ->> 'vente')::boolean, false)
          or coalesce((a.droits ->> 'encaissement_vente')::boolean, false)
        ))
      )
    union
    select u.id
    from public.platform_users u
    where u.is_super_admin = true and not coalesce(u.is_suspended, false)
  ) r
  on conflict (source_event_key, user_id)
    where source_event_key is not null do nothing;
end;
$$;
revoke all on function private.emit_important_notification(text,text,text,text,text,text,jsonb,text,boolean)
  from public, anon, authenticated;

create or replace function private.emit_invoice_return_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  if lower(trim(coalesce(new.type, ''))) <> 'retour' then
    return new;
  end if;

  v_body := 'Retour ' || new.id || ' · '
    || trim(to_char(coalesce(new.montant, 0), 'FM999G999G999G990D00')) || ' F';
  if nullif(trim(coalesce(new.client_nom, '')), '') is not null then
    v_body := v_body || ' · ' || trim(new.client_nom);
  end if;

  perform private.emit_important_notification(
    new.boutique_id,
    'refund',
    'Retour enregistré',
    v_body,
    '↩️',
    'factures',
    jsonb_build_object('invoiceId', new.id),
    'invoice-return:' || new.boutique_id || ':' || new.id,
    true
  );
  return new;
end;
$$;
revoke all on function private.emit_invoice_return_notification() from public, anon, authenticated;

create or replace function private.emit_charge_created_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  v_body := coalesce(nullif(trim(new.label), ''), 'Charge') || ' · '
    || trim(to_char(coalesce(new.montant, 0), 'FM999G999G999G990D00')) || ' F';
  if nullif(trim(coalesce(new.categorie, '')), '') is not null then
    v_body := v_body || ' · ' || trim(new.categorie);
  end if;

  perform private.emit_important_notification(
    new.boutique_id,
    'charge',
    'Nouvelle charge',
    v_body,
    '💸',
    'charges',
    jsonb_build_object('chargeId', new.id),
    'charge:' || new.boutique_id || ':' || new.id::text,
    false
  );
  return new;
end;
$$;
revoke all on function private.emit_charge_created_notification() from public, anon, authenticated;

create or replace function private.emit_caisse_closed_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
begin
  if old.closed_at is not null or new.closed_at is null then
    return new;
  end if;

  v_body := 'Session ' || new.id || ' · Ventes : '
    || trim(to_char(coalesce(new.total_ventes, 0), 'FM999G999G999G990D00')) || ' F'
    || ' · Charges : '
    || trim(to_char(coalesce(new.total_charges, 0), 'FM999G999G999G990D00')) || ' F';

  perform private.emit_important_notification(
    new.boutique_id,
    'caisse',
    'Caisse clôturée',
    v_body,
    '🔒',
    'dashboard',
    jsonb_build_object('caisseSessionId', new.id),
    'caisse-closed:' || new.boutique_id || ':' || new.id,
    true
  );
  return new;
end;
$$;
revoke all on function private.emit_caisse_closed_notification() from public, anon, authenticated;

drop trigger if exists invoices_emit_return_notification on public.invoices;
create trigger invoices_emit_return_notification
  after insert on public.invoices
  for each row execute function private.emit_invoice_return_notification();

drop trigger if exists charges_emit_created_notification on public.charges;
create trigger charges_emit_created_notification
  after insert on public.charges
  for each row execute function private.emit_charge_created_notification();

drop trigger if exists caisse_sessions_emit_closed_notification on public.caisse_sessions;
create trigger caisse_sessions_emit_closed_notification
  after update of closed_at on public.caisse_sessions
  for each row execute function private.emit_caisse_closed_notification();

create or replace function private.purge_old_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.notifications
  where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.purge_old_notifications() from public, anon, authenticated;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'purge-old-notifications'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'purge-old-notifications',
    '17 3 * * *',
    $job$select private.purge_old_notifications();$job$
  );
end;
$$;
