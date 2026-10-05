-- Editable recipients for automatic access-request emails.

create table if not exists private.access_request_email_recipients (
  email text primary key,
  created_at timestamptz not null default now(),
  created_by uuid
);

create or replace function public.get_access_request_email_recipients()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emails text[];
begin
  if auth.uid() is null or not private.auth_is_super_admin() then
    raise exception 'superadmin_required' using errcode='42501';
  end if;

  select coalesce(array_agg(r.email order by r.email), array[]::text[])
  into v_emails
  from private.access_request_email_recipients r;

  return v_emails;
end;
$$;

create or replace function public.set_access_request_email_recipients(p_emails text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emails text[];
  v_email text;
begin
  if auth.uid() is null or not private.auth_is_super_admin() then
    raise exception 'superadmin_required' using errcode='42501';
  end if;

  select coalesce(array_agg(distinct lower(trim(value)) order by lower(trim(value))), array[]::text[])
  into v_emails
  from unnest(coalesce(p_emails, array[]::text[])) as value
  where nullif(trim(value),'') is not null;

  if cardinality(v_emails) < 1 then
    raise exception 'at_least_one_recipient_required' using errcode='22023';
  end if;
  if cardinality(v_emails) > 20 then
    raise exception 'too_many_recipients' using errcode='22023';
  end if;

  foreach v_email in array v_emails loop
    if length(v_email) > 254
       or v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
      raise exception 'invalid_email' using errcode='22023';
    end if;
  end loop;

  delete from private.access_request_email_recipients;
  insert into private.access_request_email_recipients(email,created_by)
  select e,auth.uid() from unnest(v_emails) e;

  return v_emails;
end;
$$;

revoke all on function public.get_access_request_email_recipients() from public,anon,authenticated;
revoke all on function public.set_access_request_email_recipients(text[]) from public,anon,authenticated;
grant execute on function public.get_access_request_email_recipients() to authenticated;
grant execute on function public.set_access_request_email_recipients(text[]) to authenticated;

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
  ), recipients as (
    select coalesce(jsonb_agg(email order by email), '[]'::jsonb) as emails
    from private.access_request_email_recipients
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'lease', c.lease_token,
    'created_at', r.created_at,
    'nom', r.nom,
    'societe', r.societe,
    'telephone', r.telephone,
    'type_activite', r.type_activite,
    'message', r.message,
    'recipients', recipients.emails
  )), '[]'::jsonb)
  into v_jobs
  from claimed c
  join public.access_requests r on r.id = c.request_id
  cross join recipients;

  return v_jobs;
end;
$$;

revoke all on function public.access_email_claim() from public,anon,authenticated;
grant execute on function public.access_email_claim() to service_role;
