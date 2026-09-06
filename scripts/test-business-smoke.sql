\set ON_ERROR_STOP on

-- Audit-only end-to-end business smoke test.
-- Runs only against the isolated local replay database and always rolls back.
begin;

-- platform_users is owned by auth.users through an FK and is normally created
-- by private.handle_new_user(). Exercise that real bootstrap path locally.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '55555555-5555-4555-8555-555555555555',
  'authenticated','authenticated','smoke@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Smoke Operator","phone":"+221700000055"}'::jsonb,
  now(),now()
);

-- The very first local auth user is promoted by the bootstrap trigger. The
-- smoke operator must not stay super-admin so permission checks exercise the
-- same boutique-assignment path as an ordinary owner.
update public.platform_users
set is_super_admin=false,
    phone='+221700000055',
    nom='Smoke Operator',
    initials='SM'
where id='55555555-5555-4555-8555-555555555555';

insert into public.boutiques(id,nom,ville,owner_id)
values
  ('smoke-source','Smoke Source','Dakar','55555555-5555-4555-8555-555555555555'),
  ('smoke-destination','Smoke Destination','Dakar','55555555-5555-4555-8555-555555555555');

insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values
  (950000000001,'smoke-source','55555555-5555-4555-8555-555555555555','owner',
   '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb),
  (950000000002,'smoke-destination','55555555-5555-4555-8555-555555555555','owner',
   '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb);

insert into public.clients(id,boutique_id,nom,type,tel,total)
values(950000000001,'smoke-source','Smoke Client','B2C','+221700000099',0);

insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values
  ('55555555-5555-4555-8555-555555555555','smoke-source',now()+interval '2 hours',now(),'66666666-6666-4666-8666-666666666666'),
  ('55555555-5555-4555-8555-555555555555','smoke-destination',now()+interval '2 hours',now(),'66666666-6666-4666-8666-666666666666');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','55555555-5555-4555-8555-555555555555',
    'session_id','66666666-6666-4666-8666-666666666666',
    'role','authenticated'
  )::text,
  true
);

insert into public.products(id,boutique_id,nom,prix_achat,prix_vente,stock,unit,actif)
values
  (920000000001,'smoke-source','Smoke POS Single',40,100,10,'unité',true),
  (920000000002,'smoke-source','Smoke POS Split',30,100,10,'unité',true),
  (920000000003,'smoke-source','Smoke Client Product',50,250,10,'unité',true),
  (920000000004,'smoke-source','Smoke Transfer Product',60,150,10,'unité',true),
  (930000000004,'smoke-destination','Smoke Transfer Product',60,150,1,'unité',true);

-- Seed FIFO history matching the fixture stock. Direct product inserts establish
-- current stock; these purchase rows establish valuation provenance only.
insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
values
  (920000001001,'smoke-source',920000000001,'achat',10,40,now()-interval '1 day','55555555-5555-4555-8555-555555555555','Smoke opening stock'),
  (920000001002,'smoke-source',920000000002,'achat',10,30,now()-interval '1 day','55555555-5555-4555-8555-555555555555','Smoke opening stock'),
  (920000001003,'smoke-source',920000000003,'achat',10,50,now()-interval '1 day','55555555-5555-4555-8555-555555555555','Smoke opening stock'),
  (920000001004,'smoke-source',920000000004,'achat',10,60,now()-interval '1 day','55555555-5555-4555-8555-555555555555','Smoke opening stock'),
  (930000001004,'smoke-destination',930000000004,'achat',1,60,now()-interval '1 day','55555555-5555-4555-8555-555555555555','Smoke opening stock');

create temp table smoke_state(
  key text primary key,
  value text not null
) on commit drop;

-- 1) Vente comptoir + paiement complet simple.
do $smoke$
declare
  r jsonb;
  v_invoice text;
  v_stock numeric;
  v_deducted timestamptz;
begin
  r:=public.create_sale(
    'smoke-source',
    '70000000-0000-4000-8000-000000000001',
    'Client comptoir',null,
    jsonb_build_array(jsonb_build_object(
      'productId',920000000001,'nom','Smoke POS Single','qty',2,'unit','unité','prixUnit',100
    )),
    null,null,'pos',true
  );
  v_invoice:=r->>'invoice_id';
  if v_invoice is null or (r->>'total')::numeric<>200 then
    raise exception 'smoke pos single: invalid create_sale response %',r;
  end if;
  insert into smoke_state values('pos_single_invoice',v_invoice);

  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000001;
  select stock_deducted_at into v_deducted from public.invoices where boutique_id='smoke-source' and id=v_invoice;
  if v_stock<>10 or v_deducted is not null then
    raise exception 'smoke pos single: stock deducted before payment stock=% deducted=%',v_stock,v_deducted;
  end if;
end
$smoke$;

set constraints all immediate;
set constraints all deferred;

do $smoke$
declare
  r jsonb;
  v_invoice text;
  v_stock numeric;
  v_status text;
  v_deducted timestamptz;
  v_count integer;
begin
  select value into v_invoice from smoke_state where key='pos_single_invoice';
  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000001;
  if v_stock<>10 then raise exception 'smoke pos single: deferred lifecycle deducted unpaid POS stock'; end if;

  r:=public.record_payment(
    'smoke-source',v_invoice,
    '70000000-0000-4000-8000-000000000002',
    200,'Espèces'
  );
  if (r->>'applied_amount')::numeric<>200 or r->>'status'<>'payée' or not coalesce((r->>'stock_deducted')::boolean,false) then
    raise exception 'smoke pos single: full payment response invalid %',r;
  end if;

  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000001;
  select status,stock_deducted_at into v_status,v_deducted from public.invoices where boutique_id='smoke-source' and id=v_invoice;
  select count(*) into v_count from public.invoice_payments where boutique_id='smoke-source' and invoice_id=v_invoice and amount=200;
  if v_stock<>8 or v_status<>'payée' or v_deducted is null or v_count<>1 then
    raise exception 'smoke pos single: persisted state invalid stock=% status=% deducted=% payments=%',v_stock,v_status,v_deducted,v_count;
  end if;
end
$smoke$;

set constraints all immediate;
set constraints all deferred;

-- 2) Retour/remboursement d'une vente comptoir payée.
do $smoke$
declare
  r jsonb;
  v_invoice text;
  v_return text;
  v_stock numeric;
  v_type text;
  v_source text;
  v_refund numeric;
  v_payment numeric;
  v_return_lines integer;
  v_return_entries integer;
begin
  select value into v_invoice from smoke_state where key='pos_single_invoice';
  r:=public.return_sale(
    'smoke-source',v_invoice,
    '70000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object('productId',920000000001,'qty',1)),
    'Espèces'
  );
  v_return:=r->>'return_invoice_id';
  if v_return is null or (r->>'total')::numeric<>100 or (r->>'refund_amount')::numeric<>100 or coalesce((r->>'receivable_reduction')::numeric,0)<>0 then
    raise exception 'smoke return: invalid response %',r;
  end if;
  insert into smoke_state values('return_invoice',v_return);

  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000001;
  select type,return_of_invoice_id,return_refund_amount into v_type,v_source,v_refund from public.invoices where boutique_id='smoke-source' and id=v_return;
  select coalesce(sum(amount),0) into v_payment from public.invoice_payments where boutique_id='smoke-source' and invoice_id=v_return;
  select count(*) into v_return_lines from public.invoice_lines where boutique_id='smoke-source' and invoice_id=v_return and source_invoice_line_id is not null;
  select count(*) into v_return_entries from public.stock_entries where boutique_id='smoke-source' and return_invoice_id=v_return and type='retour' and qty=1 and source_invoice_line_id is not null and return_invoice_line_id is not null;
  if v_stock<>9 or lower(v_type)<>'retour' or v_source<>v_invoice or v_refund<>100 or v_payment<>100 or v_return_lines<>1 or v_return_entries<>1 then
    raise exception 'smoke return: persisted refund/provenance invalid stock=% type=% source=% refund=% payment=% lines=% entries=%',v_stock,v_type,v_source,v_refund,v_payment,v_return_lines,v_return_entries;
  end if;
end
$smoke$;

set constraints all immediate;
set constraints all deferred;

-- 3) Vente comptoir + rejet d'acompte + paiement multiple intégral.
do $smoke$
declare
  r jsonb;
  v_invoice text;
  v_stock numeric;
  v_count integer;
  v_sum numeric;
  v_status text;
begin
  r:=public.create_sale(
    'smoke-source',
    '70000000-0000-4000-8000-000000000004',
    'Client comptoir split',null,
    jsonb_build_array(jsonb_build_object(
      'productId',920000000002,'nom','Smoke POS Split','qty',3,'unit','unité','prixUnit',100
    )),
    null,null,'pos',true
  );
  v_invoice:=r->>'invoice_id';
  insert into smoke_state values('pos_split_invoice',v_invoice);

  begin
    perform public.record_payment(
      'smoke-source',v_invoice,
      '70000000-0000-4000-8000-000000000005',
      100,'Wave'
    );
    raise exception 'smoke_expected_partial_pos_rejection';
  exception when others then
    if sqlerrm='smoke_expected_partial_pos_rejection' then raise; end if;
    if position('counter sale must be paid in full' in sqlerrm)=0 then
      raise exception 'smoke pos split: wrong partial-payment failure: %',sqlerrm;
    end if;
  end;

  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000002;
  select count(*) into v_count from public.invoice_payments where boutique_id='smoke-source' and invoice_id=v_invoice;
  if v_stock<>10 or v_count<>0 then
    raise exception 'smoke pos split: rejected partial payment changed state stock=% payments=%',v_stock,v_count;
  end if;

  r:=public.record_multi_payment(
    'smoke-source',v_invoice,
    '70000000-0000-4000-8000-000000000006',
    jsonb_build_array(
      jsonb_build_object('amount',100,'paymentMethod','Espèces'),
      jsonb_build_object('amount',200,'paymentMethod','Wave')
    )
  );
  if (r->>'applied_amount')::numeric<>300 or r->>'status'<>'payée' then
    raise exception 'smoke pos split: multi-payment response invalid %',r;
  end if;

  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000002;
  select status into v_status from public.invoices where boutique_id='smoke-source' and id=v_invoice;
  select count(*),coalesce(sum(amount),0) into v_count,v_sum from public.invoice_payments where boutique_id='smoke-source' and invoice_id=v_invoice;
  if v_stock<>7 or v_status<>'payée' or v_count<>2 or v_sum<>300 then
    raise exception 'smoke pos split: final state invalid stock=% status=% payments=% sum=%',v_stock,v_status,v_count,v_sum;
  end if;
end
$smoke$;

set constraints all immediate;
set constraints all deferred;

-- 4) Facture client : stock consommé immédiatement, même sans encaissement.
do $smoke$
declare
  r jsonb;
  v_invoice text;
  v_stock numeric;
  v_status text;
  v_origin text;
  v_deducted timestamptz;
  v_acompte numeric;
  v_entries integer;
begin
  r:=public.create_sale(
    'smoke-source',
    '70000000-0000-4000-8000-000000000007',
    'Smoke Client','+221700000099',
    jsonb_build_array(jsonb_build_object(
      'productId',920000000003,'nom','Smoke Client Product','qty',1,'unit','unité','prixUnit',250
    )),
    null,950000000001,'client_profile',true
  );
  v_invoice:=r->>'invoice_id';
  insert into smoke_state values('client_invoice',v_invoice);
end
$smoke$;

-- Force the deferred client-profile stock lifecycle before asserting it.
set constraints all immediate;
set constraints all deferred;

do $smoke$
declare
  v_invoice text;
  v_stock numeric;
  v_status text;
  v_origin text;
  v_deducted timestamptz;
  v_acompte numeric;
  v_entries integer;
begin
  select value into v_invoice from smoke_state where key='client_invoice';
  select stock into v_stock from public.products where boutique_id='smoke-source' and id=920000000003;
  select status,origin,stock_deducted_at,acompte into v_status,v_origin,v_deducted,v_acompte from public.invoices where boutique_id='smoke-source' and id=v_invoice;
  select count(*) into v_entries from public.stock_entries where boutique_id='smoke-source' and source_invoice_id=v_invoice and product_id=920000000003 and qty=-1;
  if v_stock<>9 or v_origin<>'client_profile' or v_deducted is null or v_acompte<>0 or v_status<>'en_attente' or v_entries<>1 then
    raise exception 'smoke client invoice: lifecycle invalid stock=% origin=% deducted=% acompte=% status=% entries=%',v_stock,v_origin,v_deducted,v_acompte,v_status,v_entries;
  end if;
end
$smoke$;

-- 5) Transfert de stock même propriétaire : aucun mouvement à la création,
-- puis débit source + crédit destination exactement une fois à l'acceptation.
do $smoke$
declare
  r jsonb;
  v_transfer uuid;
  v_source_stock numeric;
  v_dest_stock numeric;
  v_status text;
  v_relationship text;
  v_dest_product bigint;
  v_out integer;
  v_in integer;
begin
  r:=public.create_stock_transfer(
    'smoke-source','smoke-destination',
    '70000000-0000-4000-8000-000000000008',
    jsonb_build_array(jsonb_build_object(
      'product_id',920000000004,'qty',4,'unit_price',150
    )),
    'Smoke transfer'
  );
  v_transfer:=(r->>'transfer_id')::uuid;
  if v_transfer is null or r->>'status'<>'pending' or r->>'relationship_type'<>'same_owner' or (r->>'total_amount')::numeric<>600 then
    raise exception 'smoke transfer: invalid create response %',r;
  end if;

  select stock into v_source_stock from public.products where boutique_id='smoke-source' and id=920000000004;
  select stock into v_dest_stock from public.products where boutique_id='smoke-destination' and id=930000000004;
  if v_source_stock<>10 or v_dest_stock<>1 then
    raise exception 'smoke transfer: stock moved before acceptance source=% dest=%',v_source_stock,v_dest_stock;
  end if;

  r:=public.accept_stock_transfer(
    v_transfer,
    '70000000-0000-4000-8000-000000000009',
    '[]'::jsonb
  );
  if r->>'status'<>'accepted' or r->>'relationship_type'<>'same_owner' or (r->>'invoice_id') is not null or (r->>'charge_id') is not null then
    raise exception 'smoke transfer: invalid accept response %',r;
  end if;

  select stock into v_source_stock from public.products where boutique_id='smoke-source' and id=920000000004;
  select stock into v_dest_stock from public.products where boutique_id='smoke-destination' and id=930000000004;
  select status,relationship_type into v_status,v_relationship from public.stock_transfers where id=v_transfer;
  select destination_product_id into v_dest_product from public.stock_transfer_lines where transfer_id=v_transfer;
  select count(*) into v_out from public.stock_entries where transfer_id=v_transfer and boutique_id='smoke-source' and product_id=920000000004 and qty=-4;
  select count(*) into v_in from public.stock_entries where transfer_id=v_transfer and boutique_id='smoke-destination' and product_id=930000000004 and qty=4;
  if v_source_stock<>6 or v_dest_stock<>5 or v_status<>'accepted' or v_relationship<>'same_owner' or v_dest_product<>930000000004 or v_out<>1 or v_in<>1 then
    raise exception 'smoke transfer: final state invalid source=% dest=% status=% relationship=% mapped=% out=% in=%',v_source_stock,v_dest_stock,v_status,v_relationship,v_dest_product,v_out,v_in;
  end if;
end
$smoke$;

set constraints all immediate;

rollback;
\echo business_smoke_matrix_ok
