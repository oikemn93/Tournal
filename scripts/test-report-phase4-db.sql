\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values
('edededed-1111-4111-8111-ededededed01','+221700000401','Phase4 Admin','P4',true,false,false),
('edededed-1111-4111-8111-ededededed02','+221700000402','Client Reader','CR',false,false,false),
('edededed-1111-4111-8111-ededededed03','+221700000403','No Access','NA',false,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase4-ci','Report Phase4 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values
(994040000001,'report-phase4-ci','edededed-1111-4111-8111-ededededed02','manager','{"clients":true}'::jsonb),
(994040000002,'report-phase4-ci','edededed-1111-4111-8111-ededededed03','manager','{}'::jsonb);

select set_config('request.jwt.claims',json_build_object('sub','edededed-1111-4111-8111-ededededed01','role','authenticated')::text,true);

insert into public.clients(id,boutique_id,nom,type,total,payment_terms_days,last_invoice_at)
values
(994040000001,'report-phase4-ci','Client A','B2B',0,30,now()-interval '2 days'),
(994040000002,'report-phase4-ci','Client B','B2C',0,0,now()-interval '1 day');

insert into public.invoices(id,boutique_id,client_id,montant,invoice_date,status,type,due_date)
values
('P4-A-SALE','report-phase4-ci',994040000001,100,now()-interval '3 days','partielle','Vente',current_date-1),
('P4-A-RETURN','report-phase4-ci',994040000001,20,now()-interval '2 days','payée','Retour',current_date-1),
('P4-A-OLD','report-phase4-ci',994040000001,40,now()-interval '20 days','partielle','Vente',current_date-10),
('P4-B-SALE','report-phase4-ci',994040000002,50,now()-interval '1 day','partielle','Vente',current_date+10),
('P4-WALKIN','report-phase4-ci',null,25,now()-interval '1 day','partielle','Vente',current_date-1);

insert into public.invoice_payments(id,boutique_id,invoice_id,amount,paid_at)
values
(994040000001,'report-phase4-ci','P4-A-SALE',60,now()-interval '1 day'),
(994040000002,'report-phase4-ci','P4-A-RETURN',5,now()-interval '1 day'),
(994040000003,'report-phase4-ci','P4-A-OLD',10,now()-interval '1 day'),
(994040000004,'report-phase4-ci','P4-B-SALE',20,now()-interval '10 days'),
(994040000005,'report-phase4-ci','P4-WALKIN',5,now()-interval '1 day');

insert into public.client_advances(id,boutique_id,client_id,amount,allocated_amount,paid_at)
values(994040000001,'report-phase4-ci',994040000001,50,20,now()-interval '5 days');

insert into public.client_credit_refunds(id,boutique_id,client_id,amount,payment_method,refunded_at,recorded_at,operator_id,operator_name,idempotency_key,note)
values(994040000001,'report-phase4-ci',994040000001,15,'Espèces',now()-interval '1 day',now()-interval '1 day','edededed-1111-4111-8111-ededededed01','Phase4 Admin','aaaaaaaa-4444-4444-8444-aaaaaaaaaaaa',null);

select set_config('request.jwt.claims',json_build_object('sub','edededed-1111-4111-8111-ededededed02','role','authenticated')::text,true);

do $test$
declare
  r jsonb;
  a jsonb;
  b jsonb;
  from_at timestamptz:=now()-interval '7 days';
  to_at timestamptz:=now()+interval '1 second';
begin
  r:=public.get_client_report('report-phase4-ci',from_at,to_at);
  if (r->>'clients_count')::int<>2 then raise exception 'client count mismatch: %',r; end if;
  if (r->>'active_clients_period')::int<>2 then raise exception 'active clients mismatch: %',r; end if;
  if (r->>'clients_with_outstanding')::int<>2 then raise exception 'outstanding client count mismatch: %',r; end if;
  if (r->>'clients_overdue')::int<>1 then raise exception 'overdue client count mismatch: %',r; end if;
  if abs((r->>'registered_invoiced_revenue')::numeric-130)>0.01 then raise exception 'registered CA mismatch: %',r; end if;
  if abs((r->>'registered_collected_cash')::numeric-50)>0.01 then raise exception 'registered cash mismatch: %',r; end if;
  if abs((r->>'customer_outstanding_global')::numeric-120)>0.01 then raise exception 'global outstanding mismatch: %',r; end if;
  if abs((r->>'overdue_global')::numeric-90)>0.01 then raise exception 'global overdue mismatch: %',r; end if;
  if abs((r->>'credit_available_global')::numeric-30)>0.01 then raise exception 'credit mismatch: %',r; end if;

  select x into a from jsonb_array_elements(r->'clients') x where (x->>'client_id')::bigint=994040000001;
  select x into b from jsonb_array_elements(r->'clients') x where (x->>'client_id')::bigint=994040000002;
  if abs((a->>'invoiced_revenue')::numeric-80)>0.01 or (a->>'sales_count')::int<>1 or (a->>'returns_count')::int<>1 then raise exception 'client A activity mismatch: %',a; end if;
  if abs((a->>'collected_cash')::numeric-50)>0.01 then raise exception 'client A cash mismatch: %',a; end if;
  if abs((a->>'outstanding_global')::numeric-70)>0.01 or abs((a->>'overdue_global')::numeric-70)>0.01 then raise exception 'client A receivable mismatch: %',a; end if;
  if abs((a->>'credit_available')::numeric-30)>0.01 then raise exception 'client A credit mismatch: %',a; end if;
  if abs((b->>'invoiced_revenue')::numeric-50)>0.01 or abs((b->>'outstanding_global')::numeric-30)>0.01 or abs((b->>'overdue_global')::numeric)>0.01 then raise exception 'client B mismatch: %',b; end if;
end
$test$;

select set_config('request.jwt.claims',json_build_object('sub','edededed-1111-4111-8111-ededededed03','role','authenticated')::text,true);
do $test$
begin
  begin
    perform public.get_client_report('report-phase4-ci',now()-interval '7 days',now()+interval '1 second');
    raise exception 'expected forbidden';
  exception when others then
    if sqlerrm='expected forbidden' then raise; end if;
    if position('forbidden' in sqlerrm)=0 then raise; end if;
  end;
end
$test$;

rollback;
\echo report_phase4_db_ok
