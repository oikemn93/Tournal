-- Mirror the client-approved support-access model already deployed in production.
create or replace function private.auth_has_active_ops_access(p_boutique_id text)
returns boolean language sql stable security definer
set search_path to pg_catalog, public, private
as $$
  select exists (
    select 1 from public.ops_access_requests r
    where r.boutique_id=p_boutique_id
      and r.requester_id=auth.uid()
      and r.status='approved'
      and r.expires_at is not null
      and r.expires_at>now()
  );
$$;
revoke all on function private.auth_has_active_ops_access(text) from public;

drop policy if exists ops_access_requests_read on public.ops_access_requests;
create policy ops_access_requests_read on public.ops_access_requests for select to authenticated
using (
  requester_id=(select auth.uid())
  or private.auth_is_boutique_owner(boutique_id)
  or (select private.auth_is_super_admin())
);
drop policy if exists ops_access_requests_admin_update on public.ops_access_requests;

create or replace function public.decide_ops_access_request(
  p_request_id bigint, p_approve boolean, p_note text default null
) returns public.ops_access_requests
language plpgsql security definer
set search_path to pg_catalog, public, private
as $$
declare v_row public.ops_access_requests;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_row from public.ops_access_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if not private.auth_is_boutique_owner(v_row.boutique_id) then raise exception 'boutique_owner_required'; end if;
  if v_row.status <> 'pending' then return v_row; end if;
  update public.ops_access_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      approved_by=auth.uid(),
      approved_at=case when p_approve then now() else null end,
      expires_at=case when p_approve then now()+make_interval(mins=>requested_minutes) else null end,
      decided_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_request_id returning * into v_row;
  insert into public.audit_log(boutique_id,user_id,action,detail,icon,source)
  values(v_row.boutique_id,auth.uid(),case when p_approve then 'Accès support approuvé' else 'Accès support refusé' end,
         'Demande Ops #'||v_row.id||' · durée '||v_row.requested_minutes||' min','shield','ops_access');
  return v_row;
end;
$$;

create or replace function public.request_emergency_ops_access(
  p_boutique_id text, p_reason text, p_requested_minutes integer default 30
) returns public.ops_access_requests
language plpgsql security definer
set search_path to pg_catalog, public, private
as $$
declare v_row public.ops_access_requests; v_minutes integer;
begin
  if auth.uid() is null or not private.auth_is_super_admin() then raise exception 'superadmin_required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if not exists(select 1 from public.boutiques where id=p_boutique_id) then raise exception 'boutique_not_found'; end if;
  v_minutes:=greatest(5,least(coalesce(p_requested_minutes,30),60));
  insert into public.ops_access_requests(boutique_id,requester_id,reason,status,requested_minutes,approved_by,approved_at,expires_at,decided_note)
  values(p_boutique_id,auth.uid(),trim(p_reason),'approved',v_minutes,auth.uid(),now(),now()+make_interval(mins=>v_minutes),'Accès d’urgence Super Admin')
  returning * into v_row;
  insert into public.audit_log(boutique_id,user_id,action,detail,icon,source)
  values(p_boutique_id,auth.uid(),'Accès Ops d’urgence','Motif: '||trim(p_reason)||' · durée '||v_minutes||' min','alert-triangle','ops_emergency_access');
  return v_row;
end;
$$;

revoke all on function public.decide_ops_access_request(bigint,boolean,text) from public,anon;
revoke all on function public.request_emergency_ops_access(text,text,integer) from public,anon;
grant execute on function public.decide_ops_access_request(bigint,boolean,text) to authenticated;
grant execute on function public.request_emergency_ops_access(text,text,integer) to authenticated;
