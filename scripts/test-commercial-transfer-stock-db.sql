\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('67676767-1111-4111-8111-676767676767','authenticated','authenticated','commercial-source-ci@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Commercial Source CI","phone":"+221700000091"}'::jsonb,now(),now()),
('78787878-1111-4111-8111-787878787878','authenticated','authenticated','commercial-dest-ci@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Commercial Destination CI","phone":"+221700000092"}'::jsonb,now(),now());

update public.platform_users set is_super_admin=false
where id in ('67676767-1111-4111-8111-676767676767','78787878-1111-4111-8111-787878787878');

insert into public.boutiques(id,nom,ville,owner_id,tel)
values
('commercial-source-ci','Commercial Source CI','Dakar','67676767-1111-4111-8111-676767676767','+221700000091'),
('commercial-dest-ci','Commercial Destination CI','Dakar','78787878-1111-4111-8111-787878787878','+221700000092');

insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values
(991500000031,'commercial-source-ci','67676767-1111-4111-8111-676767676767','owner','{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb),
(991500000032,'commercial-dest-ci','78787878-1111-4111-8111-787878787878','owner','{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb),
(991500000033,'commercial-dest-ci','67676767-1111-4111-8111-676767676767','employee','{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb);

insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values
('67676767-1111-4111-8111-676767676767','commercial-source-ci',now()+interval '1 hour',now(),'89898989-2222-4222-8222-898989898989'),
('67676767-1111-4111-8111-676767676767','commercial-dest-ci',now()+interval '1 hour',now(),'89898989-2222-4222-8222-898989898989');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','67676767-1111-4111-8111-676767676767',
    'session_id','89898989-2222-4222-8222-898989898989',
    'role','authenticated'
  )::text,
  true
);

insert into public.boutique_partners(boutique_id,partner_boutique_id,created_by)
values('commercial-source-ci','commercial-dest-ci','67676767-1111-4111-8111-676767676767');

insert into public.products(id,boutique_id,nom,prix_achat,prix_vente,stock,unit,actif)
values
(991500000031,'commercial-source-ci','Commercial Cloth',50,100,5,'unité',true),
(991500000032,'commercial-dest-ci','Commercial Cloth',0,120,1,'unité',true);

insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
values
(991500000031,'commercial-source-ci',991500000031,'achat',5,50,now()-interval '1 day','67676767-1111-4111-8111-676767676767','Opening source'),
(991500000032,'commercial-dest-ci',991500000032,'achat',1,60,now()-interval '1 day','67676767-1111-4111-8111-676767676767','Opening destination');

create temp table commercial_stock_state(transfer_id uuid,invoice_id text) on commit drop;

do $test$
declare r jsonb; v_transfer uuid; v_line bigint;
begin
  r:=public.create_stock_transfer(
    'commercial-source-ci','commercial-dest-ci',
    '90909090-3333-4333-8333-909090909091',
    jsonb_build_array(jsonb_build_object('product_id',991500000031,'qty',2,'unit_price',100)),
    'Commercial lifecycle CI'
  );
  if r->>'relationship_type'<>'commercial' then raise exception 'expected commercial relationship: %',r; end if;
  v_transfer:=(r->>'transfer_id')::uuid;
  select id into v_line from public.stock_transfer_lines where transfer_id=v_transfer;

  r:=public.accept_stock_transfer(
    v_transfer,
    '90909090-3333-4333-8333-909090909092',
    jsonb_build_array(jsonb_build_object('transfer_line_id',v_line,'destination_product_id',991500000032,'create_new',false))
  );
  if r->>'status'<>'accepted' or nullif(r->>'invoice_id','') is null then
    raise exception 'commercial transfer accept failed: %',r;
  end if;
  insert into commercial_stock_state values(v_transfer,r->>'invoice_id');
end
$test$;

-- Fire the deferred sale lifecycle trigger. A commercial transfer invoice is
-- intentionally unpaid but its stock was already moved atomically by transfer acceptance.
set constraints all immediate;
set constraints all deferred;

do $test$
declare
  v_status text; v_relationship text; v_source numeric; v_dest numeric;
  v_invoice_status text; v_origin text; v_committed timestamptz; v_out integer; v_in integer;
begin
  select st.status,st.relationship_type,ps.stock,pd.stock,i.status,i.origin,i.stock_deducted_at,
         (select count(*) from public.stock_entries se where se.transfer_id=st.id and se.boutique_id='commercial-source-ci' and se.qty=-2),
         (select count(*) from public.stock_entries se where se.transfer_id=st.id and se.boutique_id='commercial-dest-ci' and se.qty=2)
  into v_status,v_relationship,v_source,v_dest,v_invoice_status,v_origin,v_committed,v_out,v_in
  from commercial_stock_state cs
  join public.stock_transfers st on st.id=cs.transfer_id
  join public.products ps on ps.boutique_id='commercial-source-ci' and ps.id=991500000031
  join public.products pd on pd.boutique_id='commercial-dest-ci' and pd.id=991500000032
  join public.invoices i on i.boutique_id='commercial-source-ci' and i.id=cs.invoice_id;

  if v_status<>'accepted' or v_relationship<>'commercial' or v_source<>3 or v_dest<>3
     or v_invoice_status<>'en_attente' or v_origin<>'pos' or v_committed is null or v_out<>1 or v_in<>1 then
    raise exception 'commercial transfer invariant failed status=% relation=% source=% dest=% invoice=% origin=% committed=% out=% in=%',
      v_status,v_relationship,v_source,v_dest,v_invoice_status,v_origin,v_committed,v_out,v_in;
  end if;
end
$test$;

rollback;
\echo commercial_transfer_stock_db_ok
