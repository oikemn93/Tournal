\set ON_ERROR_STOP on
begin;

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values('fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','+221700000198','Report Phase1 CI','R1',true,false,false);
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase1-ci','Report Phase1 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values(991980000001,'report-phase1-ci','fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','owner','{"dashboard":true,"compta":true,"marges":true}'::jsonb);
select set_config('request.jwt.claims',json_build_object('sub','fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','role','authenticated')::text,true);

insert into public.categories(id,boutique_id,nom,color)
values('report-phase1-cat','TISSUS','#999999','report-phase1-ci')
on conflict do nothing;

-- Keep the explicit column order because production categories is boutique-scoped.
delete from public.categories where id='report-phase1-cat' and boutique_id='TISSUS';
insert into public.categories(id,boutique_id,nom,color)
values('report-phase1-cat','report-phase1-ci','Tissus','#999999');

insert into public.products(id,boutique_id,nom,category_id,stock,low_stock_threshold,prix_achat,actif)
values
(991980000001,'report-phase1-ci','Produit A','report-phase1-cat',10,0,10,true),
(991980000002,'report-phase1-ci','Produit B','report-phase1-cat',10,0,5,true);

insert into public.invoices(id,boutique_id,client_id,montant,invoice_date,status,type,stock_deducted_at)
values
('R1-SALE-1','report-phase1-ci',null,100,now()-interval '2 days','payée','Vente',now()-interval '2 days'),
('R1-RETURN-1','report-phase1-ci',null,20,now()-interval '1 day','payée','Retour',now()-interval '1 day');

insert into public.invoice_lines(id,boutique_id,invoice_id,product_id,nom,qty,sell_qty,prix_unit,prix_achat)
values
(991980000001,'report-phase1-ci','R1-SALE-1',991980000001,'Produit A',2,2,30,10),
(991980000002,'report-phase1-ci','R1-SALE-1',991980000002,'Produit B',2,2,20,5),
(991980000003,'report-phase1-ci','R1-RETURN-1',991980000001,'Produit A',1,1,20,10);

insert into public.stock_entries(id,boutique_id,product_id,qty,entry_date,type,prix_unit,note,reference)
values
(991980000001,'report-phase1-ci',991980000001,2,now()-interval '3 days','achat',10,'Layer A',null),
(991980000002,'report-phase1-ci',991980000001,-2,now()-interval '2 days','vente',10,'Vente R1-SALE-1','R1-SALE-1'),
(991980000003,'report-phase1-ci',991980000002,2,now()-interval '3 days','achat',5,'Layer B',null),
(991980000004,'report-phase1-ci',991980000002,-2,now()-interval '2 days','vente',5,'Vente R1-SALE-1','R1-SALE-1');

do $test$
declare
  m jsonb;
  r jsonb;
  fifo jsonb;
  row_a jsonb;
  from_at timestamptz := now()-interval '7 days';
  to_at timestamptz := now()+interval '1 second';
begin
  m := public.get_financial_metrics('report-phase1-ci',from_at,to_at);
  r := public.get_sales_product_report('report-phase1-ci',from_at,to_at);
  fifo := public.get_fifo_realized_margin('report-phase1-ci',from_at,to_at);

  if abs((m->>'invoiced_revenue')::numeric - 80) > 0.01 then raise exception 'canonical CA mismatch: %',m; end if;
  if abs((r->>'invoiced_revenue')::numeric - (m->>'invoiced_revenue')::numeric) > 0.01 then
    raise exception 'product report CA must reconcile metrics report=% metrics=%',r,m;
  end if;
  if (m->>'sales_count')::bigint <> 1 then raise exception 'canonical transactions mismatch: %',m; end if;
  if abs((m->>'average_basket')::numeric - 100) > 0.01 then raise exception 'canonical basket mismatch: %',m; end if;
  if jsonb_array_length(r->'products') <> 2 then raise exception 'expected two product rows: %',r; end if;

  select x into row_a from jsonb_array_elements(r->'products') x where (x->>'product_id')::bigint=991980000001;
  if row_a is null then raise exception 'Produit A missing: %',r; end if;
  if abs((row_a->>'invoiced_revenue')::numeric - 40) > 0.01 then raise exception 'Produit A net revenue mismatch: %',row_a; end if;
  if abs((row_a->>'quantity')::numeric - 1) > 0.01 then raise exception 'Produit A net quantity mismatch: %',row_a; end if;
  if (row_a->>'category_name') <> 'Tissus' then raise exception 'category mismatch: %',row_a; end if;

  if abs((row_a->>'realized_margin_fifo')::numeric - (
    select (x->>'realizedMargin')::numeric from jsonb_array_elements(fifo->'products') x where (x->>'productId')::bigint=991980000001
  )) > 0.01 then raise exception 'product FIFO margin must reuse canonical core report=% fifo=%',row_a,fifo; end if;
end
$test$;

rollback;
\echo report_phase1_db_ok
