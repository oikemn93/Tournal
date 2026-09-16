\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb');

insert into public.platform_users(id,phone,nom,initials,is_super_admin,is_suspended,must_change_password)
values('fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','+221700000198','Report Phase1 CI','R1',true,false,false)
on conflict(id) do update set phone=excluded.phone,nom=excluded.nom,is_super_admin=true,is_suspended=false,must_change_password=false;
insert into public.boutiques(id,nom,ville,tel,directory_visible)
values('report-phase1-ci','Report Phase1 CI','Dakar',null,true);
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values(991980000001,'report-phase1-ci','fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','owner','{"dashboard":true,"compta":true,"marges":true}'::jsonb);
insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values('fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','report-phase1-ci',now()+interval '1 hour',now(),'fbfbfbfb-2222-4222-8222-fbfbfbfbfbfb');
select set_config('request.jwt.claims',json_build_object('sub','fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb','session_id','fbfbfbfb-2222-4222-8222-fbfbfbfbfbfb','role','authenticated')::text,true);

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


-- More rows than a page, deliberately tied in revenue to exercise stable ordering.
insert into public.products(id,boutique_id,nom,stock,low_stock_threshold,prix_achat,actif)
select 991980001000+n,'report-phase1-ci','Extra '||n,0,0,1,true from generate_series(1,55) n;
insert into public.invoice_lines(id,boutique_id,invoice_id,product_id,nom,qty,sell_qty,prix_unit,prix_achat)
select 991980001000+n,'report-phase1-ci','R1-SALE-1',991980001000+n,'Extra '||n,1,1,0,1 from generate_series(1,55) n;
do $test$
declare a jsonb; b jsonb; c jsonb; before_hash text;
begin
 select md5(pg_get_functiondef('public.get_financial_metrics(text,timestamptz,timestamptz)'::regprocedure)) into before_hash;
 a:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales');
 b:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales','{}',50);
 if jsonb_array_length(a#>'{page,rows}')<>50 or jsonb_array_length(b#>'{page,rows}')<>7 then raise exception 'page bounds wrong: %, %',a,b; end if;
 if a#>'{page,summary}'<>b#>'{page,summary}' or a#>'{page,chart}'<>b#>'{page,chart}' then raise exception 'summary changed between pages'; end if;
 if exists(select 1 from jsonb_array_elements(a#>'{page,rows}') x join jsonb_array_elements(b#>'{page,rows}') y on x->>'id'=y->>'id') then raise exception 'page overlap'; end if;
 c:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales','{"categoryId":"report-phase1-cat","entityKind":"product","entityId":"991980000001"}');
 if c#>>'{page,total}'<>'1' or (c#>>'{page,rows,0,revenue}')::numeric<>40 then raise exception 'category and product filter wrong: %',c; end if;
 c:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','stock','{"categoryId":"report-phase1-cat","entityKind":"product","entityId":"991980000001"}');
 if c#>>'{page,total}'<>'1' or (c#>>'{page,rows,0,quantity}')::numeric<>1 then raise exception 'stock filter differs from sales: %',c; end if;
 c:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales','{"categoryId":"missing","paymentMethod":"missing","clientType":"missing"}');
 if c#>>'{page,total}'<>'0' then raise exception 'combined empty filter failed'; end if;
 c:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales','{}',0,10000,'name','asc');
 if c#>>'{page,limit}'<>'100' then raise exception 'server maximum bypassed'; end if;
 if before_hash<>md5(pg_get_functiondef('public.get_financial_metrics(text,timestamptz,timestamptz)'::regprocedure)) then raise exception 'canonical metrics changed'; end if;
 begin
  perform public.get_report_section_page('report-phase1-ci',now()-interval '400 days',now(),'sales');
  raise exception 'expected period rejection';
 exception when others then if sqlerrm='expected period rejection' then raise; end if; end;
end
$test$;
-- The same authenticated actor loses margin access: values and sort columns must disappear.
update public.platform_users set is_super_admin=false where id='fbfbfbfb-1111-4111-8111-fbfbfbfbfbfb';
update public.boutique_assignments set role='manager',droits='{"dashboard":true,"compta":true,"marges":false}' where id=991980000001;
do $test$
declare a jsonb;
begin
 a:=public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now()+interval '1 second','sales');
 if exists(select 1 from jsonb_array_elements(a#>'{page,columns}') x where x->>'key'='margin') then raise exception 'margin column leaked'; end if;
 if exists(select 1 from jsonb_array_elements(a#>'{page,rows}') x where x->>'margin' is not null) then raise exception 'margin value leaked'; end if;
 begin perform public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now(),'team');raise exception 'expected forbidden';exception when others then if sqlerrm='expected forbidden' then raise; end if;end;
 a:=public.search_report_entities_v2('report-phase1-ci',now()-interval '7 days',now(),'Non attribué');
 if exists(select 1 from jsonb_array_elements(a->'hits') x where x->>'kind'='employee') then raise exception 'employee search leaked'; end if;
end
$test$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$ begin
 begin perform public.get_report_section_page('report-phase1-ci',now()-interval '7 days',now(),'sales');raise exception 'expected forbidden';exception when others then if sqlerrm='expected forbidden' then raise; end if;end;
end $test$;
rollback;
