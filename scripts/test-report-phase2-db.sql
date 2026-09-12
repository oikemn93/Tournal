\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values
('fcfcfcfc-1111-4111-8111-fcfcfcfcfcf1','+221700000201','Phase2 Manager','PM',true,false,false),
('fcfcfcfc-1111-4111-8111-fcfcfcfcfcf2','+221700000202','Employé A','EA',false,false,false),
('fcfcfcfc-1111-4111-8111-fcfcfcfcfcf3','+221700000203','Employé B','EB',false,false,false),
('fcfcfcfc-1111-4111-8111-fcfcfcfcfcf4','+221700000204','Sans marges','SM',false,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase2-ci','Report Phase2 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values
(992020000001,'report-phase2-ci','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf1','manager','{"dashboard":true,"compta":true,"marges":true}'::jsonb),
(992020000002,'report-phase2-ci','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf4','manager','{"dashboard":true,"compta":true,"marges":false}'::jsonb);
select set_config('request.jwt.claims',json_build_object('sub','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf1','role','authenticated')::text,true);

insert into public.invoices(id,boutique_id,client_id,montant,invoice_date,status,type,operator_id,operator_nom_snapshot)
values
('R2-SALE-A','report-phase2-ci',null,100,now()-interval '3 days','payée','Vente','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf2','Employé A'),
('R2-RETURN-A','report-phase2-ci',null,20,now()-interval '2 days','payée','Retour','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf2','Employé A'),
('R2-SALE-B','report-phase2-ci',null,50,now()-interval '1 day','payée','Vente','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf3','Employé B');

do $test$
declare
  m jsonb;
  r jsonb;
  a jsonb;
  b jsonb;
  from_at timestamptz := now()-interval '7 days';
  to_at timestamptz := now()+interval '1 second';
begin
  m := public.get_financial_metrics('report-phase2-ci',from_at,to_at);
  r := public.get_employee_performance_report('report-phase2-ci',from_at,to_at);

  if abs((m->>'invoiced_revenue')::numeric - 130) > 0.01 then raise exception 'canonical CA mismatch: %',m; end if;
  if abs((r->>'invoiced_revenue')::numeric - (m->>'invoiced_revenue')::numeric) > 0.01 then
    raise exception 'employee report CA must reconcile canonical metrics report=% metrics=%',r,m;
  end if;
  if jsonb_array_length(r->'employees') <> 2 then raise exception 'expected two employee rows: %',r; end if;

  select x into a from jsonb_array_elements(r->'employees') x where x->>'operator_id'='fcfcfcfc-1111-4111-8111-fcfcfcfcfcf2';
  select x into b from jsonb_array_elements(r->'employees') x where x->>'operator_id'='fcfcfcfc-1111-4111-8111-fcfcfcfcfcf3';
  if abs((a->>'invoiced_revenue')::numeric - 80) > 0.01 then raise exception 'employee A net CA mismatch: %',a; end if;
  if (a->>'sales_count')::bigint <> 1 or abs((a->>'average_basket')::numeric-100)>0.01 then raise exception 'employee A sales metrics mismatch: %',a; end if;
  if (a->>'returns_count')::bigint <> 1 or abs((a->>'return_rate')::numeric-100)>0.01 then raise exception 'employee A return rate mismatch: %',a; end if;
  if abs((b->>'invoiced_revenue')::numeric - 50) > 0.01 or (b->>'returns_count')::bigint<>0 then raise exception 'employee B mismatch: %',b; end if;

  perform set_config('request.jwt.claims',json_build_object('sub','fcfcfcfc-1111-4111-8111-fcfcfcfcfcf4','role','authenticated')::text,true);
  begin
    perform public.get_employee_performance_report('report-phase2-ci',from_at,to_at);
    raise exception 'employee report must be forbidden without marges permission';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
end
$test$;

rollback;
\echo report_phase2_db_ok
