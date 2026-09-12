\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values('fdfdfdfd-1111-4111-8111-fdfdfdfdfdfd','+221700000299','Report Phase3 CI','R3',true,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase3-ci','Report Phase3 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values(991990000001,'report-phase3-ci','fdfdfdfd-1111-4111-8111-fdfdfdfdfdfd','owner','{"stock":true,"inventaire":true,"compta":true,"marges":true}'::jsonb);
select set_config('request.jwt.claims',json_build_object('sub','fdfdfdfd-1111-4111-8111-fdfdfdfdfdfd','role','authenticated')::text,true);

insert into public.products(id,boutique_id,nom,stock,low_stock_threshold,prix_achat,actif)
values
(991990000001,'report-phase3-ci','Rapide',8,0,10,true),
(991990000002,'report-phase3-ci','Dormant',5,0,5,true);

insert into public.stock_entries(id,boutique_id,product_id,qty,entry_date,type,prix_unit,note,reference,source_invoice_id)
values
(991990000001,'report-phase3-ci',991990000001,10,now()-interval '20 days','achat',10,'achat',null,null),
(991990000002,'report-phase3-ci',991990000001,-2,now()-interval '2 days','ajustement',10,'vente','R3-SALE','R3-SALE'),
(991990000003,'report-phase3-ci',991990000002,5,now()-interval '20 days','achat',5,'achat',null,null);

insert into public.inventory_sessions(id,boutique_id,scope_type,scope_label,status,operator_id,started_at,finalized_at,total_variance_cost,as_of_at)
values('11111111-2222-4333-8444-555555555555','report-phase3-ci','all','Tout le stock','completed','fdfdfdfd-1111-4111-8111-fdfdfdfdfdfd',now()-interval '3 days',now()-interval '2 days',-10,now()-interval '3 days');
insert into public.inventory_lines(session_id,product_id,product_name,unit,theoretical_qty,counted_qty,difference_qty,purchase_price,sale_price)
values
('11111111-2222-4333-8444-555555555555',991990000001,'Rapide','u',9,8,-1,10,20),
('11111111-2222-4333-8444-555555555555',991990000002,'Dormant','u',5,5,0,5,10);

do $test$
declare
  r jsonb;
  fast jsonb;
  dormant jsonb;
begin
  r := public.get_stock_inventory_report('report-phase3-ci',now()-interval '7 days',now()+interval '1 second',7);
  if abs((r->>'stock_value_fifo')::numeric-105)>0.01 then raise exception 'FIFO stock value mismatch: %',r; end if;
  select x into fast from jsonb_array_elements(r->'products') x where (x->>'product_id')::bigint=991990000001;
  select x into dormant from jsonb_array_elements(r->'products') x where (x->>'product_id')::bigint=991990000002;
  if abs((fast->>'net_sold_qty')::numeric-2)>0.01 then raise exception 'rotation sold qty mismatch: %',fast; end if;
  if (fast->>'dormant')::boolean then raise exception 'recently sold product marked dormant: %',fast; end if;
  if not (dormant->>'dormant')::boolean then raise exception 'unsold product not dormant: %',dormant; end if;
  if jsonb_array_length(r->'inventory_variances')<>1 then raise exception 'inventory variance missing: %',r; end if;
  if abs(((r->'inventory_variances'->0->>'variance_qty_abs')::numeric)-1)>0.01 then raise exception 'inventory qty variance mismatch: %',r; end if;
end
$test$;

update public.boutique_assignments set droits='{"stock":true,"inventaire":true,"compta":true,"marges":false}'::jsonb where id=991990000001;
do $test$
declare r jsonb; row1 jsonb;
begin
  r := public.get_stock_inventory_report('report-phase3-ci',now()-interval '7 days',now()+interval '1 second',7);
  if r->'stock_value_fifo' <> 'null'::jsonb then raise exception 'stock value leaked without margins: %',r; end if;
  row1 := r->'products'->0;
  if row1->'fifo_stock_value' <> 'null'::jsonb then raise exception 'product FIFO value leaked without margins: %',row1; end if;
end
$test$;

update public.boutique_assignments set droits='{"stock":false,"inventaire":false,"compta":false,"marges":false}'::jsonb where id=991990000001;
do $test$
begin
  begin
    perform public.get_stock_inventory_report('report-phase3-ci',now()-interval '7 days',now()+interval '1 second',7);
    raise exception 'expected forbidden';
  exception when others then
    if sqlerrm='expected forbidden' then raise; end if;
    if position('forbidden' in sqlerrm)=0 then raise; end if;
  end;
end
$test$;

rollback;
\echo report_phase3_db_ok
