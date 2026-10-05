create schema if not exists private;

create table private.access_request_email_outbox (
  request_id uuid primary key references public.access_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  sent_at timestamptz,
  last_error text check (last_error = 'send_failed')
);

create index access_request_email_pending_idx
  on private.access_request_email_outbox(next_attempt_at)
  where sent_at is null;

create or replace function private.enqueue_access_request_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.access_request_email_outbox(request_id) values (new.id);
  return new;
end;
$$;

create trigger access_request_email_enqueue
after insert on public.access_requests
for each row execute function private.enqueue_access_request_email();

create or replace function public.access_email_claim()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobs jsonb;
begin
  with candidates as (
    select o.request_id
    from private.access_request_email_outbox o
    join public.access_requests r on r.id = o.request_id
    where o.sent_at is null
      and o.next_attempt_at <= now()
      and r.anonymized_at is null
    order by o.next_attempt_at, o.request_id
    limit 5
    for update of o skip locked
  ), claimed as (
    update private.access_request_email_outbox o
    set lease_token = gen_random_uuid(),
        attempts = o.attempts + 1,
        next_attempt_at = now() + interval '15 minutes'
    from candidates c
    where o.request_id = c.request_id
    returning o.request_id, o.lease_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'lease', c.lease_token,
    'created_at', r.created_at,
    'nom', r.nom,
    'societe', r.societe,
    'telephone', r.telephone,
    'type_activite', r.type_activite,
    'message', r.message
  )), '[]'::jsonb)
  into v_jobs
  from claimed c
  join public.access_requests r on r.id = c.request_id;

  return v_jobs;
end;
$$;

create or replace function public.access_email_complete(
  p_id uuid,
  p_lease uuid,
  p_success boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_success is null then
    raise exception 'success required';
  end if;

  update private.access_request_email_outbox
  set sent_at = case when p_success then now() else null end,
      next_attempt_at = now() + make_interval(
        mins => least(60, (power(2, least(attempts, 6)))::integer)
      ),
      last_error = case when p_success then null else 'send_failed' end,
      lease_token = null
  where request_id = p_id
    and lease_token = p_lease
    and sent_at is null;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on private.access_request_email_outbox from public, anon, authenticated, service_role;
revoke execute on function private.enqueue_access_request_email() from public, anon, authenticated, service_role;
revoke execute on function public.access_email_claim() from public, anon, authenticated;
revoke execute on function public.access_email_complete(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.access_email_claim() to service_role;
grant execute on function public.access_email_complete(uuid, uuid, boolean) to service_role;
