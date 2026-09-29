-- Stage A only: approval does not provision an Auth account.
-- Executed unchanged inside the deployment runner's transaction.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text check (nom is null or length(nom) between 2 and 100),
  societe text check (societe is null or length(societe) between 1 and 120),
  telephone text check (telephone is null or telephone ~ '^\+[1-9][0-9]{7,14}$'),
  type_activite text check (type_activite is null or length(type_activite) between 2 and 80),
  message text check (message is null or length(message)<=1000),
  statut text not null default 'nouvelle' check (statut in ('nouvelle','vue','acceptee','refusee','complement_demande')),
  boutique_id text references public.boutiques(id) on delete set null,
  traite_par uuid references public.platform_users(id) on delete set null,
  traite_le timestamptz,
  note_interne text check (note_interne is null or length(note_interne)<=1000),
  accepted_at timestamptz,
  refused_at timestamptz,
  anonymized_at timestamptz,
  constraint access_requests_personal_fields_check check (
    (anonymized_at is null and nom is not null and telephone is not null and type_activite is not null)
    or (anonymized_at is not null and statut='acceptee' and nom is null and societe is null
      and telephone is null and type_activite is null and message is null and note_interne is null)
  ),
  constraint access_requests_decision_dates_check check (
    (statut='acceptee' and accepted_at is not null and refused_at is null)
    or (statut='refusee' and refused_at is not null and accepted_at is null)
    or (statut not in ('acceptee','refusee') and accepted_at is null and refused_at is null)
  )
);
create index access_requests_phone_created_idx on public.access_requests(telephone,created_at desc) where telephone is not null;
create index access_requests_scope_status_created_idx on public.access_requests(boutique_id,statut,created_at desc);
create index access_requests_actor_idx on public.access_requests(traite_par) where traite_par is not null;
create index access_requests_refused_retention_idx on public.access_requests(refused_at) where statut='refusee';
create index access_requests_accepted_retention_idx on public.access_requests(accepted_at) where statut='acceptee' and anonymized_at is null;
alter table public.access_requests enable row level security;
-- Intentionally no policies: all access is through checked functions.
revoke all on public.access_requests from public, anon, authenticated, service_role;

create function private.can_manage_access_request(p_boutique_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.platform_users u
    where u.id=auth.uid() and not u.is_suspended and not u.must_change_password
      and (u.is_super_admin or exists (
        select 1 from public.boutique_assignments a
        where a.user_id=u.id and a.boutique_id=p_boutique_id and a.role='owner'
      ))
  );
$$;
revoke all on function private.can_manage_access_request(text) from public,anon,authenticated,service_role;

create function private.log_access_request_decision(p_id uuid,p_boutique_id text,p_action text)
returns void language sql security definer set search_path='' as $$
  insert into public.ops_interactions(boutique_id,kind,team,title,detail,actor_id)
  values(p_boutique_id,'system','system','access_request_decision',
    jsonb_build_object('request_id',p_id,'action',p_action)::text,auth.uid());
$$;
revoke all on function private.log_access_request_decision(uuid,text,text) from public,anon,authenticated,service_role;

create function private.notify_access_request(p_id uuid,p_boutique_id text)
returns void language sql security definer set search_path='' as $$
  insert into public.notifications(user_id,boutique_id,category,title,body,action_tab,action_filter,source_event_key,in_app_enabled,push_enabled)
  select u.id,p_boutique_id,'security','Nouvelle demande d’accès','Une demande attend votre décision.',
    'access_requests',jsonb_build_object('request_id',p_id),'access_request:'||p_id::text,true,false
  from public.platform_users u
  where not u.is_suspended and not u.must_change_password
    and (u.is_super_admin or exists (
      select 1 from public.boutique_assignments a
      where a.user_id=u.id and a.boutique_id=p_boutique_id and a.role='owner'
    ))
  on conflict (source_event_key,user_id) where source_event_key is not null do nothing;
$$;
revoke all on function private.notify_access_request(uuid,text) from public,anon,authenticated,service_role;

-- Only the Turnstile-verifying Edge Function may execute this endpoint.
create function public.submit_access_request(p_nom text,p_societe text,p_telephone text,p_type_activite text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_phone text;
  v_digits text;
  v_id uuid;
  v_response constant jsonb := '{"received":true}'::jsonb;
begin
  if p_nom is null or length(trim(p_nom)) not between 2 and 100
    or length(coalesce(p_societe,''))>120 or length(coalesce(p_message,''))>1000
    or p_type_activite is null or length(trim(p_type_activite)) not between 2 and 80
    or p_telephone is null or length(p_telephone)>32 or p_telephone !~ '^\+?[0-9 ()-]+$' then
    raise exception using errcode='22023',message='Champs invalides ou trop longs';
  end if;
  v_digits:=regexp_replace(p_telephone,'[^0-9]','','g');
  if left(v_digits,2)='00' then v_digits:=substr(v_digits,3); end if;
  -- Existing Tournal local numbers are Senegalese nine-digit numbers.
  if length(v_digits)=9 then v_digits:='221'||v_digits; end if;
  v_phone:='+'||v_digits;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode='22023',message='Téléphone invalide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('access_request:'||v_phone,0));
  -- Never enumerate existing accounts and never modify them.
  if exists (select 1 from public.platform_users u where
    case when length(regexp_replace(u.phone,'[^0-9]','','g'))=9
      then '+221'||regexp_replace(u.phone,'[^0-9]','','g')
      else '+'||regexp_replace(u.phone,'[^0-9]','','g') end=v_phone)
    or exists (select 1 from public.access_requests r where r.telephone=v_phone and r.created_at>now()-interval '24 hours')
    or (select count(*) from public.access_requests r where r.telephone=v_phone and r.created_at>now()-interval '30 days')>=3 then
    return v_response;
  end if;
  insert into public.access_requests(nom,societe,telephone,type_activite,message)
  values(trim(p_nom),nullif(trim(p_societe),''),v_phone,trim(p_type_activite),nullif(trim(p_message),'')) returning id into v_id;
  perform private.notify_access_request(v_id,null);
  return v_response;
end;
$$;
revoke all on function public.submit_access_request(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_access_request(text,text,text,text,text) to service_role;

create function public.list_access_requests(p_boutique_id text default null,p_statut text default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.can_manage_access_request(p_boutique_id) then raise insufficient_privilege using message='Accès interdit'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 10000 then
    raise exception using errcode='22023',message='Pagination invalide';
  end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
    select id,created_at,nom,societe,type_activite,statut,boutique_id,traite_le,anonymized_at
    from public.access_requests r where (p_boutique_id is null or r.boutique_id=p_boutique_id)
      and (p_statut is null or r.statut=p_statut)
    order by created_at desc,id limit p_limit offset p_offset
  ) q;
  return v_result;
end;
$$;

create function public.get_access_request(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.access_requests;
begin
  select * into v_row from public.access_requests where id=p_id;
  if not found or not private.can_manage_access_request(v_row.boutique_id) then
    raise insufficient_privilege using message='Accès interdit';
  end if;
  return to_jsonb(v_row);
end;
$$;

create function public.count_new_access_requests(p_boutique_id text default null)
returns bigint language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_manage_access_request(p_boutique_id) then raise insufficient_privilege using message='Accès interdit'; end if;
  return (select count(*) from public.access_requests where statut='nouvelle' and (p_boutique_id is null or boutique_id=p_boutique_id));
end;
$$;

create function public.route_access_request(p_id uuid,p_boutique_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.access_requests;
begin
  if not private.can_manage_access_request(null) then raise insufficient_privilege using message='Accès interdit'; end if;
  select * into v_row from public.access_requests where id=p_id for update;
  if not found or v_row.statut in ('acceptee','refusee') then
    raise exception using errcode='22023',message='Demande absente ou clôturée';
  end if;
  if v_row.boutique_id is not distinct from p_boutique_id then return to_jsonb(v_row); end if;
  update public.access_requests set boutique_id=p_boutique_id where id=p_id returning * into v_row;
  -- Remove obsolete recipient records when the scope changes.
  delete from public.notifications where source_event_key='access_request:'||p_id::text;
  perform private.notify_access_request(p_id,p_boutique_id);
  perform private.log_access_request_decision(p_id,p_boutique_id,'routed');
  return to_jsonb(v_row);
end;
$$;

create function public.decide_access_request(p_id uuid,p_statut text,p_note_interne text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.access_requests;
begin
  select * into v_row from public.access_requests where id=p_id for update;
  if not found or not private.can_manage_access_request(v_row.boutique_id) then
    raise insufficient_privilege using message='Accès interdit';
  end if;
  if p_statut is null or p_statut not in ('vue','acceptee','refusee','complement_demande') or length(coalesce(p_note_interne,''))>1000 then
    raise exception using errcode='22023',message='Décision invalide';
  end if;
  -- Same decision is idempotent; terminal states cannot be reversed.
  if v_row.statut=p_statut then return to_jsonb(v_row); end if;
  if v_row.statut in ('acceptee','refusee') then raise exception using errcode='22023',message='Demande déjà clôturée'; end if;
  update public.access_requests set statut=p_statut,traite_par=auth.uid(),traite_le=now(),note_interne=nullif(trim(p_note_interne),''),
    accepted_at=case when p_statut='acceptee' then now() else null end,
    refused_at=case when p_statut='refusee' then now() else null end
  where id=p_id returning * into v_row;
  perform private.log_access_request_decision(p_id,v_row.boutique_id,p_statut);
  return to_jsonb(v_row);
end;
$$;

create function public.get_access_request_notifications(p_boutique_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.can_manage_access_request(p_boutique_id) then raise insufficient_privilege using message='Accès interdit'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_result from (
    select n.id,n.title,n.body,n.action_filter,n.created_at,n.read_at from public.notifications n
    join public.access_requests r on n.source_event_key='access_request:'||r.id::text
    where n.user_id=auth.uid() and n.dismissed_at is null
      and (p_boutique_id is null or r.boutique_id=p_boutique_id)
      and private.can_manage_access_request(r.boutique_id)
    order by n.created_at desc limit 100
  ) q;
  return v_result;
end;
$$;

create function public.mark_access_request_notification_read(p_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_scope text;
begin
  select r.boutique_id into v_scope from public.notifications n
    join public.access_requests r on n.source_event_key='access_request:'||r.id::text
    where n.id=p_id and n.user_id=auth.uid();
  if not found or not private.can_manage_access_request(v_scope) then raise insufficient_privilege using message='Accès interdit'; end if;
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
end;
$$;

revoke all on function public.list_access_requests(text,text,integer,integer) from public,anon,service_role;
revoke all on function public.get_access_request(uuid) from public,anon,service_role;
revoke all on function public.count_new_access_requests(text) from public,anon,service_role;
revoke all on function public.route_access_request(uuid,text) from public,anon,service_role;
revoke all on function public.decide_access_request(uuid,text,text) from public,anon,service_role;
revoke all on function public.get_access_request_notifications(text) from public,anon,service_role;
revoke all on function public.mark_access_request_notification_read(bigint) from public,anon,service_role;
grant execute on function public.list_access_requests(text,text,integer,integer),public.get_access_request(uuid),
  public.count_new_access_requests(text),public.route_access_request(uuid,text),public.decide_access_request(uuid,text,text),
  public.get_access_request_notifications(text),public.mark_access_request_notification_read(bigint) to authenticated;

create function private.purge_access_requests()
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.notifications n using public.access_requests r
  where n.source_event_key='access_request:'||r.id::text and (
    (r.statut='refusee' and r.refused_at<=now()-interval '30 days')
    or (r.statut='acceptee' and r.accepted_at<=now()-interval '30 days')
    or (r.statut not in ('acceptee','refusee') and coalesce(r.traite_le,r.created_at)<=now()-interval '90 days')
  );
  delete from public.access_requests where
    (statut='refusee' and refused_at<=now()-interval '30 days')
    or (statut not in ('acceptee','refusee') and coalesce(traite_le,created_at)<=now()-interval '90 days');
  update public.access_requests set nom=null,societe=null,telephone=null,type_activite=null,message=null,note_interne=null,anonymized_at=now()
  where statut='acceptee' and anonymized_at is null and accepted_at<=now()-interval '30 days';
end;
$$;
revoke all on function private.purge_access_requests() from public,anon,authenticated,service_role;
-- pg_cron is already installed on production and in canonical replay.
select cron.schedule('access-requests-retention','15 3 * * *','select private.purge_access_requests();');
