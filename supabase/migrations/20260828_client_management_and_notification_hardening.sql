create or replace function public.update_client_profile(
  p_boutique_id text,
  p_client_id bigint,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_address text default null,
  p_contact text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_client public.clients%rowtype;
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'clients') then
    raise exception 'forbidden';
  end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    raise exception 'client name required';
  end if;
  if v_phone is not null and exists (
    select 1 from public.clients c
    where c.boutique_id=p_boutique_id and c.id<>p_client_id
      and regexp_replace(coalesce(c.tel,''),'\D','','g')=regexp_replace(v_phone,'\D','','g')
      and length(regexp_replace(v_phone,'\D','','g'))>=8
  ) then
    raise exception 'client_phone_exists';
  end if;
  update public.clients
  set nom=trim(p_name), tel=v_phone,
      email=nullif(trim(coalesce(p_email,'')),''),
      ville=nullif(trim(coalesce(p_city,'')),''),
      adresse=nullif(trim(coalesce(p_address,'')),''),
      contact=nullif(trim(coalesce(p_contact,'')),''),
      updated_at=now()
  where boutique_id=p_boutique_id and id=p_client_id
  returning * into v_client;
  if not found then raise exception 'client not found'; end if;
  return jsonb_build_object('client_id',v_client.id,'name',v_client.nom,'phone',v_client.tel,'email',v_client.email,'city',v_client.ville,'address',v_client.adresse,'contact',v_client.contact);
end;
$$;
revoke all on function public.update_client_profile(text,bigint,text,text,text,text,text,text) from public;
grant execute on function public.update_client_profile(text,bigint,text,text,text,text,text,text) to authenticated;

create or replace function public.delete_client_if_unused(p_boutique_id text,p_client_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_name text;
  v_invoice_count bigint;
  v_advance_count bigint;
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'clients') then raise exception 'forbidden'; end if;
  select nom into v_name from public.clients where boutique_id=p_boutique_id and id=p_client_id for update;
  if not found then raise exception 'client not found'; end if;
  select count(*) into v_invoice_count from public.invoices where boutique_id=p_boutique_id and client_id=p_client_id;
  select count(*) into v_advance_count from public.client_advances where boutique_id=p_boutique_id and client_id=p_client_id;
  if v_invoice_count>0 or v_advance_count>0 then
    raise exception 'client_has_history' using detail=format('invoices=%s advances=%s',v_invoice_count,v_advance_count);
  end if;
  delete from public.clients where boutique_id=p_boutique_id and id=p_client_id;
  return jsonb_build_object('client_id',p_client_id,'name',v_name,'deleted',true);
end;
$$;
revoke all on function public.delete_client_if_unused(text,bigint) from public;
grant execute on function public.delete_client_if_unused(text,bigint) to authenticated;

create or replace function public.mark_all_notifications_read(p_boutique_id text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not private.auth_notification_context_matches(p_boutique_id) then raise exception 'forbidden'; end if;
  update public.notifications set read_at=coalesce(read_at,now())
  where user_id=auth.uid() and boutique_id=p_boutique_id and dismissed_at is null;
end;
$$;
create or replace function public.dismiss_all_notifications(p_boutique_id text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not private.auth_notification_context_matches(p_boutique_id) then raise exception 'forbidden'; end if;
  update public.notifications set dismissed_at=coalesce(dismissed_at,now()),read_at=coalesce(read_at,now())
  where user_id=auth.uid() and boutique_id=p_boutique_id and dismissed_at is null;
end;
$$;
revoke all on function public.mark_all_notifications_read(text) from public;
revoke all on function public.dismiss_all_notifications(text) from public;
grant execute on function public.mark_all_notifications_read(text) to authenticated;
grant execute on function public.dismiss_all_notifications(text) to authenticated;

create index if not exists notifications_user_boutique_active_created_idx
  on public.notifications(user_id,boutique_id,created_at desc) where dismissed_at is null;

create or replace function private.emit_audit_notification()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_category text;
  v_in_app boolean;
  v_push boolean;
begin
  v_category := private.notification_category(new.action);
  if v_category in ('sale','refund','charge','caisse') then return new; end if;
  v_in_app := private.notification_channel_enabled(new.boutique_id,v_category,'in_app');
  v_push := private.notification_channel_enabled(new.boutique_id,v_category,'push');
  if not v_in_app and not v_push then return new; end if;
  insert into public.notifications(user_id,boutique_id,category,title,body,icon,action_tab,source_audit_id,in_app_enabled,push_enabled)
  select r.user_id,new.boutique_id,v_category,new.action,coalesce(new.detail,''),coalesce(nullif(new.icon,''),'🔔'),private.notification_tab(v_category),new.id,v_in_app,v_push
  from (
    select distinct a.user_id from public.boutique_assignments a
    join public.platform_users u on u.id=a.user_id and not coalesce(u.is_suspended,false)
    where a.boutique_id=new.boutique_id and (
      a.role='owner' or v_category='general'
      or (v_category='payment' and (coalesce((a.droits->>'factures')::boolean,false) or coalesce((a.droits->>'encaissement_vente')::boolean,false)))
      or (v_category in ('stock','transfer') and (coalesce((a.droits->>'stock')::boolean,false) or coalesce((a.droits->>'inventaire')::boolean,false)))
      or (v_category='client' and coalesce((a.droits->>'clients')::boolean,false))
      or (v_category='supplier' and coalesce((a.droits->>'fournisseurs')::boolean,false))
      or v_category='security'
    )
    union
    select u.id from public.platform_users u where u.is_super_admin=true and not coalesce(u.is_suspended,false)
  ) r
  where not exists (
    select 1 from public.notifications n
    where n.user_id=r.user_id and n.boutique_id=new.boutique_id and n.category=v_category
      and n.title=new.action and n.body=coalesce(new.detail,'') and n.created_at>now()-interval '5 seconds'
  )
  on conflict (source_audit_id,user_id) do nothing;
  return new;
end;
$$;