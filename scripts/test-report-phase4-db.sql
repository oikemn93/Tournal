\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values
('fefefefe-1111-4111-8111-fefefefefef1','+221700000401','Phase4 Clients','C4',false,false,false),
('fefefefe-1111-4111-8111-fefefefefef2','+221700000402','Sans clients','SC',false,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase4-ci','Report Phase4 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values
(994040000001,'report-phase4-ci','fefefefe-1111-4111-8111-fefefefefef1','manager','{"clients":true,"compta":true}'::jsonb),
(994040000002,'report-phase4-ci','fefefefe-1111-4111-8111-fefefefefef2','manager','{"clients":false,"compta":true}'::jsonb);

insert into public.clients(id,boutique_id,nom,type,total,created_at,payment_terms_days)
values
(994040000001,'report-phase4-ci','Client A','B2B',0,now()-interval '2 days',0),
(994040000002,'report-phase4-ci','Client B','B2C',0,now()-interval '200 days',0),
(994040000003,'report-phase4-ci','Client C','Grossiste',0,now()-interval '120 days',0);

insert into public.invoices(id,boutique_id,client_id,montant,invoice_date,status,type,due_date)
values
('R4-A-SALE','report-phase4-ci',994040000001,100,now()-interval '3 days','acompte','Vente',(current_date-2)),
('R4-A-RETURN','report-phase4-ci',994040000001,20,now()-interval '2 days','payée','Retour',current_date),
('R4-B-OLD','report-phase4-ci',994040000002,50,now()-interval '100 days','payée','Vente',(current_date-90)),
('R4-C-SALE','report-phase4-ci',994040000003,70,now()-interval '1 day','payée','Vente',current_date);

insert into public.invoice_payments(id,boutique_id,invoice_id,amount,paid_at)
values
(994040000001,'report-phase4-ci','R4-A-SALE',40,now()-interval '1 day'),
(994040000002,'report-phase4-ci','R4-A-RETURN',5,now()-interval '1 day'),
(994040000003,'report-phase4-ci','R4-B-OLD',50,now()-interval '90 days'),
(994040000004,'report-phase4-ci','R4-C-SALE',70,now()-interval '12 hours');

alter table public.client_credit_refunds disable trigger user;
insert into public.client_credit_refunds(id,boutique_id,client_id,amount,payment_method,refunded_at,recorded_at,operator_id,operator_name,idempotency_key,note)
values(994040000001,'report-phase4-ci',994040000001,10,'Espèces',now()-interval '6 hours',now()-interval '6 hours','fefefefe-1111-4111-8111-fefefefefef1','Phase4 Clients','44444444-4444-4444-8444-444444444444','fixture');
alter table public.client_credit_refunds enable trigger user;

select set_config('request.jwt.claims',json_build_object('sub','fefefefe-1111-4111-8111-fefefefefef1','role','authenticated')::text,true);

do $test$
declare
  r jsonb;
  a jsonb;
  d jsonb;
  inactive jsonb;
begin
  r := public.get_client_report('report-phase4-ci',now()-interval '7 days',now()+interval '1 second',60);
  if abs((r->>'registered_invoiced_revenue')::numeric-150)>0.01 then raise exception 'registered CA mismatch: %',r; end if;
  if abs((r->>'registered_collected_cash')::numeric-95)>0.01 then raise exception 'registered cash mismatch: %',r; end if;
  if (r->>'active_clients')::bigint<>2 then raise exception 'active clients mismatch: %',r; end if;
  if (r->>'new_clients')::bigint<>1 then raise exception 'new clients mismatch: %',r; end if;
  if (r->>'inactive_clients_count')::bigint<>1 then raise exception 'inactive count mismatch: %',r; end if;
  if abs((r->>'registered_outstanding_global')::numeric-60)>0.01 then raise exception 'outstanding mismatch: %',r; end if;
  if abs((r->>'overdue_global')::numeric-60)>0.01 then raise exception 'overdue mismatch: %',r; end if;
  if (r->>'returns_count')::bigint<>1 then raise exception 'returns count mismatch: %',r; end if;

  a := r->'top_clients'->0;
  if (a->>'client_name')<>'Client A' or abs((a->>'invoiced_revenue')::numeric-80)>0.01 or (a->>'sales_count')::bigint<>1 then
    raise exception 'top client mismatch: %',a;
  end if;
  if abs((a->>'average_basket')::numeric-100)>0.01 or abs((a->>'collected_cash')::numeric-25)>0.01 then
    raise exception 'top client basket/cash mismatch: %',a;
  end if;

  d := r->'debtors'->0;
  if (d->>'client_name')<>'Client A' or abs((d->>'outstanding_global')::numeric-60)>0.01 or abs((d->>'overdue_global')::numeric-60)>0.01 then
    raise exception 'debtor mismatch: %',d;
  end if;

  inactive := r->'inactive_clients'->0;
  if (inactive->>'client_name')<>'Client B' or not (inactive->>'inactive')::boolean then raise exception 'inactive client mismatch: %',inactive; end if;
end
$test$;

select set_config('request.jwt.claims',json_build_object('sub','fefefefe-1111-4111-8111-fefefefefef2','role','authenticated')::text,true);
do $test$
begin
  begin
    perform public.get_client_report('report-phase4-ci',now()-interval '7 days',now()+interval '1 second',60);
    raise exception 'expected forbidden';
  exception when others then
    if sqlerrm='expected forbidden' then raise; end if;
    if position('forbidden' in sqlerrm)=0 then raise; end if;
  end;
end
$test$;

if has_function_privilege('anon','public.get_client_report(text,timestamptz,timestamptz,integer)','EXECUTE') then
  raise exception 'anon must not execute client report';
end if;
if not has_function_privilege('authenticated','public.get_client_report(text,timestamptz,timestamptz,integer)','EXECUTE') then
  raise exception 'authenticated must execute client report';
end if;

rollback;
\echo report_phase4_db_ok
