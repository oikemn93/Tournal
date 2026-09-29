\set ON_ERROR_STOP on
begin;

-- Fictitious identities; transaction rolled back on the canonical schema.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('a1000000-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated',
  'access-ci-'||n||'@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name','Access Test','phone','+22170000900'||n),now(),now()
from generate_series(1,4) n;
update public.platform_users set is_super_admin=(id='a1000000-0000-4000-8000-000000000001'),
  is_suspended=false,must_change_password=false where id::text like 'a1000000-%';
insert into public.boutiques(id,nom,owner_id) values
  ('access-ci-a','Fictive A','a1000000-0000-4000-8000-000000000002'),
  ('access-ci-b','Fictive B','a1000000-0000-4000-8000-000000000004');
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits) overriding system value values
  (991699000001,'access-ci-a','a1000000-0000-4000-8000-000000000002','owner','{}'),
  (991699000002,'access-ci-a','a1000000-0000-4000-8000-000000000003','vendor','{}'),
  (991699000003,'access-ci-b','a1000000-0000-4000-8000-000000000004','owner','{}');

create temp table access_test_state(id uuid,existing_user jsonb);
insert into access_test_state(existing_user) select to_jsonb(u) from public.platform_users u where id='a1000000-0000-4000-8000-000000000003';

set local role anon;
do $$ begin
  begin perform 1 from public.access_requests; raise exception 'anon select unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.access_requests(nom,telephone,type_activite) values('Test','+221700009099','Commerce'); raise exception 'anon insert allowed'; exception when insufficient_privilege then null; end;
  begin perform public.submit_access_request('Test',null,'700009099','Commerce',null); raise exception 'anon RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$ declare a jsonb; b jsonb; begin
  a:=public.submit_access_request('Prospect fictif','Fictive','700009099','Commerce','Message fictif');
  b:=public.submit_access_request('Prospect fictif','Fictive','+221700009099','Commerce',null);
  if a<>b or a<>public.submit_access_request('Compte fictif',null,'700009003','Commerce',null) then raise exception 'response enumerates'; end if;
  begin perform public.submit_access_request('X',null,'abc','Commerce',null); raise exception 'invalid submission accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update access_test_state set id=(select id from public.access_requests where telephone='+221700009099');
select set_config('test.access_request_id',(select id::text from access_test_state),true);
do $$ begin
  if (select count(*) from public.access_requests where telephone='+221700009099')<>1 then raise exception '24h duplicate accepted'; end if;
  if exists(select 1 from public.access_requests where telephone='+221700009003') then raise exception 'existing account stored'; end if;
  if (select to_jsonb(u) from public.platform_users u where id='a1000000-0000-4000-8000-000000000003')<>(select existing_user from access_test_state) then raise exception 'existing account modified'; end if;
end $$;

-- Exercise all unauthorized APIs, including global counts and detail.
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin perform public.list_access_requests('access-ci-a'); raise exception 'vendor list allowed'; exception when insufficient_privilege then null; end;
  begin perform public.get_access_request(current_setting('test.access_request_id')::uuid); raise exception 'vendor detail allowed'; exception when insufficient_privilege then null; end;
  begin perform public.get_access_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'vendor detail allowed'; exception when insufficient_privilege then null; end;
  begin perform public.count_new_access_requests('access-ci-a'); raise exception 'vendor count allowed'; exception when insufficient_privilege then null; end;
  begin perform public.get_access_request_notifications('access-ci-a'); raise exception 'vendor notification allowed'; exception when insufficient_privilege then null; end;
  begin perform public.mark_access_request_notification_read(-1); raise exception 'vendor notification read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare v_id uuid := (select id from access_test_state); a jsonb; b jsonb; begin
  if public.count_new_access_requests()<1 then raise exception 'badge missing'; end if;
  if not exists(select 1 from public.notifications where user_id=auth.uid() and source_event_key='access_request:'||v_id::text) then raise exception 'notification missing'; end if;
  perform public.route_access_request(v_id,'access-ci-a');
  perform public.decide_access_request(v_id,'vue');
  perform public.decide_access_request(v_id,'complement_demande');
  a:=public.decide_access_request(v_id,'acceptee','Note fictive');
  b:=public.decide_access_request(v_id,'acceptee','Autre note');
  if a<>b then raise exception 'double acceptance changed state'; end if;
  if (select count(*) from public.ops_interactions where title='access_request_decision' and detail::jsonb->>'request_id'=v_id::text and detail::jsonb->>'action'='acceptee')<>1 then raise exception 'acceptance logged twice'; end if;
  begin perform public.decide_access_request(v_id,'refusee'); raise exception 'terminal decision reversed'; exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ declare v_id uuid := (select id from access_test_state); begin
  begin perform public.get_access_request(v_id); raise exception 'other owner detail allowed'; exception when insufficient_privilege then null; end;
  begin perform public.count_new_access_requests('access-ci-a'); raise exception 'other owner count allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare v_id uuid := (select id from access_test_state); v_notification bigint; begin
  perform public.get_access_request(v_id);
  if jsonb_array_length(public.get_access_request_notifications('access-ci-a'))<>1 then raise exception 'scoped notification missing'; end if;
  select id into v_notification from public.notifications where user_id=auth.uid() and source_event_key='access_request:'||v_id::text;
  perform public.mark_access_request_notification_read(v_notification);
  if not exists(select 1 from public.notifications where id=v_notification and read_at is not null) then raise exception 'read flag missing'; end if;
  begin perform public.count_new_access_requests(); raise exception 'owner global count allowed'; exception when insufficient_privilege then null; end;
end $$;

-- Rolling quota: old enough to clear the duplicate window, within 30 days.
insert into public.access_requests(nom,telephone,type_activite,created_at)
select 'Fictive quota','+221700009088','Commerce',now()-n*interval '2 days' from generate_series(1,3) n;
set local role service_role;
select public.submit_access_request('Fictive quota',null,'700009088','Commerce',null);
reset role;
do $$ begin
  if (select count(*) from public.access_requests where telephone='+221700009088')<>3 then raise exception '30 day quota exceeded'; end if;
end $$;

-- Purge: time is anchored to the decision, not subsequent viewing.
update public.access_requests set accepted_at=now()-interval '31 days',traite_le=now() where id=(select id from access_test_state);
insert into public.access_requests(nom,telephone,type_activite,statut,refused_at) values
  ('Fictive expired','+221700009077','Commerce','refusee',now()-interval '31 days'),
  ('Fictive retained','+221700009076','Commerce','refusee',now()-interval '29 days');
insert into public.access_requests(nom,telephone,type_activite,created_at) values('Fictive stale','+221700009075','Commerce',now()-interval '91 days');
select private.purge_access_requests();
do $$ begin
  if exists(select 1 from public.access_requests where telephone in ('+221700009077','+221700009075')) then raise exception 'expired requests retained'; end if;
  if not exists(select 1 from public.access_requests where telephone='+221700009076') then raise exception 'early purge'; end if;
  if not exists(select 1 from public.access_requests where id=(select id from access_test_state) and anonymized_at is not null and telephone is null and message is null and nom is null and note_interne is null) then raise exception 'accepted PII retained'; end if;
  if exists(select 1 from public.ops_interactions where title='access_request_decision' and detail ~ '700009|fictif|fictive') then raise exception 'audit contains PII'; end if;
end $$;
rollback;
\echo access_requests_db_ok
