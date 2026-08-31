create unique index if not exists ops_access_requests_one_pending_idx
  on public.ops_access_requests (boutique_id, requester_id)
  where status = 'pending';

create or replace function private.auth_has_active_ops_access(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.auth_is_super_admin()
    or exists (
      select 1
      from public.ops_access_requests r
      where r.boutique_id = p_boutique_id
        and r.requester_id = auth.uid()
        and r.status = 'approved'
        and r.expires_at is not null
        and r.expires_at > now()
    );
$$;
revoke all on function private.auth_has_active_ops_access(text) from public;

create or replace function public.request_ops_boutique_access(
  p_boutique_id text,
  p_reason text,
  p_requested_minutes integer default 30
) returns public.ops_access_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.ops_access_requests;
  v_minutes integer;
begin
  if auth.uid() is null or not private.auth_is_ops_staff() then
    raise exception 'ops_staff_required';
  end if;
  if nullif(trim(p_reason),'') is null then
    raise exception 'reason_required';
  end if;
  if not exists (select 1 from public.boutiques b where b.id = p_boutique_id) then
    raise exception 'boutique_not_found';
  end if;
  v_minutes := greatest(5, least(coalesce(p_requested_minutes,30), 120));
  select * into v_row
  from public.ops_access_requests r
  where r.boutique_id=p_boutique_id and r.requester_id=auth.uid() and r.status='pending'
  order by r.created_at desc limit 1;
  if found then return v_row; end if;
  insert into public.ops_access_requests(boutique_id,requester_id,reason,status,requested_minutes)
  values (p_boutique_id,auth.uid(),trim(p_reason),'pending',v_minutes)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.decide_ops_access_request(
  p_request_id bigint,
  p_approve boolean,
  p_note text default null
) returns public.ops_access_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row public.ops_access_requests;
begin
  if auth.uid() is null or not private.auth_is_super_admin() then
    raise exception 'superadmin_required';
  end if;
  select * into v_row from public.ops_access_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_row.status <> 'pending' then return v_row; end if;
  update public.ops_access_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      approved_by=auth.uid(),
      approved_at=case when p_approve then now() else null end,
      expires_at=case when p_approve then now() + make_interval(mins => requested_minutes) else null end,
      decided_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_request_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.get_ops_support_diagnostic(p_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.auth_has_active_ops_access(p_boutique_id) then
    raise exception 'active_support_access_required';
  end if;
  select jsonb_build_object(
    'boutique_id', b.id,
    'name', b.nom,
    'city', b.ville,
    'phone', b.tel,
    'email', b.email,
    'user_count', (select count(*) from public.boutique_assignments a where a.boutique_id=b.id),
    'product_count', (select count(*) from public.products p where p.boutique_id=b.id),
    'last_sale_at', (select max(i.created_at) from public.invoices i where i.boutique_id=b.id),
    'last_stock_activity_at', (select max(s.created_at) from public.stock_entries s where s.boutique_id=b.id),
    'open_ticket_count', (select count(*) from public.ops_tickets t where t.boutique_id=b.id and t.status not in ('resolved','closed')),
    'access_expires_at', (
      select max(r.expires_at) from public.ops_access_requests r
      where r.boutique_id=b.id and r.requester_id=auth.uid() and r.status='approved' and r.expires_at>now()
    )
  ) into v_result
  from public.boutiques b where b.id=p_boutique_id;
  if v_result is null then raise exception 'boutique_not_found'; end if;
  return v_result;
end;
$$;

revoke all on function public.request_ops_boutique_access(text,text,integer) from public, anon;
revoke all on function public.decide_ops_access_request(bigint,boolean,text) from public, anon;
revoke all on function public.get_ops_support_diagnostic(text) from public, anon;
grant execute on function public.request_ops_boutique_access(text,text,integer) to authenticated;
grant execute on function public.decide_ops_access_request(bigint,boolean,text) to authenticated;
grant execute on function public.get_ops_support_diagnostic(text) to authenticated;
