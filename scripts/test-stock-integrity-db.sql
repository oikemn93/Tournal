\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'authenticated','authenticated','stock-integrity-ci@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Stock Integrity CI","phone":"+221700000099"}'::jsonb,
  now(),now()
);

update public.platform_users
set is_super_admin=false, nom='Stock Integrity CI', initials='SI', phone='+221700000099'
where id='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

insert into public.boutiques(id,nom,ville,owner_id)
values('stock-integrity-ci','Stock Integrity CI','Dakar','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');

insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values(
  991500000001,'stock-integrity-ci','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','owner',
  '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb
);

insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','stock-integrity-ci',now()+interval '1 hour',now(),'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'session_id','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'role','authenticated'
  )::text,
  true
);

insert into public.products(id,boutique_id,nom,prix_achat,prix_vente,stock,unit,actif)
values(991500000001,'stock-integrity-ci','Last Piece',50,100,1,'unité',true);

insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
values(991500000001,'stock-integrity-ci',991500000001,'achat',1,50,now()-interval '1 day','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','Opening stock');

create temp table stock_integrity_state(key text primary key,value text not null) on commit drop;

-- A sale may be drafted above current stock, but settlement must fail atomically.
do $test$
declare r jsonb; v_invoice text;
begin
  r:=public.create_sale(
    'stock-integrity-ci',
    'cccccccc-3333-4333-8333-ccccccccccc1',
    'Client comptoir',null,
    jsonb_build_array(jsonb_build_object('productId',991500000001,'nom','Last Piece','qty',2,'unit','unité','prixUnit',100)),
    null,null,'pos',true
  );
  v_invoice:=r->>'invoice_id';
  insert into stock_integrity_state values('oversell_invoice',v_invoice);

  begin
    perform public.record_payment(
      'stock-integrity-ci',v_invoice,
      'cccccccc-3333-4333-8333-ccccccccccc2',
      200,'Espèces'
    );
    raise exception 'expected_oversell_rejection';
  exception when others then
    if sqlerrm='expected_oversell_rejection' then raise; end if;
    if position('insufficient stock' in lower(sqlerrm))=0 then
      raise exception 'wrong oversell failure: %',sqlerrm;
    end if;
  end;
end
$test$;

do $test$
declare v_invoice text; v_stock numeric; v_payments integer; v_entries integer; v_deducted timestamptz; v_acompte numeric;
begin
  select value into v_invoice from stock_integrity_state where key='oversell_invoice';
  select stock into v_stock from public.products where boutique_id='stock-integrity-ci' and id=991500000001;
  select count(*) into v_payments from public.invoice_payments where boutique_id='stock-integrity-ci' and invoice_id=v_invoice;
  select count(*) into v_entries from public.stock_entries where boutique_id='stock-integrity-ci' and source_invoice_id=v_invoice;
  select stock_deducted_at,acompte into v_deducted,v_acompte from public.invoices where boutique_id='stock-integrity-ci' and id=v_invoice;
  if v_stock<>1 or v_payments<>0 or v_entries<>0 or v_deducted is not null or v_acompte<>0 then
    raise exception 'oversell changed state stock=% payments=% entries=% deducted=% acompte=%',v_stock,v_payments,v_entries,v_deducted,v_acompte;
  end if;
end
$test$;

-- Selling the final available unit must still succeed exactly once.
do $test$
declare r jsonb; v_invoice text; v_stock numeric; v_payments integer; v_entries integer;
begin
  r:=public.create_sale(
    'stock-integrity-ci',
    'cccccccc-3333-4333-8333-ccccccccccc3',
    'Client comptoir',null,
    jsonb_build_array(jsonb_build_object('productId',991500000001,'nom','Last Piece','qty',1,'unit','unité','prixUnit',100)),
    null,null,'pos',true
  );
  v_invoice:=r->>'invoice_id';
  r:=public.record_payment(
    'stock-integrity-ci',v_invoice,
    'cccccccc-3333-4333-8333-ccccccccccc4',
    100,'Wave'
  );
  if not coalesce((r->>'stock_deducted')::boolean,false) then
    raise exception 'valid final-unit sale did not commit stock';
  end if;
  select stock into v_stock from public.products where boutique_id='stock-integrity-ci' and id=991500000001;
  select count(*) into v_payments from public.invoice_payments where boutique_id='stock-integrity-ci' and invoice_id=v_invoice;
  select count(*) into v_entries from public.stock_entries where boutique_id='stock-integrity-ci' and source_invoice_id=v_invoice;
  if v_stock<>0 or v_payments<>1 or v_entries<>1 then
    raise exception 'valid sale final state stock=% payments=% entries=%',v_stock,v_payments,v_entries;
  end if;
end
$test$;

-- Defense in depth: no direct path may make a product more negative.
do $test$
begin
  begin
    update public.products set stock=-1 where boutique_id='stock-integrity-ci' and id=991500000001;
    raise exception 'expected_negative_guard';
  exception when others then
    if sqlerrm='expected_negative_guard' then raise; end if;
    if position('stock cannot become more negative' in lower(sqlerrm))=0 then
      raise exception 'wrong negative-stock guard failure: %',sqlerrm;
    end if;
  end;
end
$test$;

set constraints all immediate;
set constraints all deferred;

rollback;
\echo stock_integrity_db_ok
