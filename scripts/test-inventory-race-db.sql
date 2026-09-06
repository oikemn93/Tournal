\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '12121212-1111-4111-8111-121212121212',
  'authenticated','authenticated','inventory-race-ci@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Inventory Race CI","phone":"+221700000097"}'::jsonb,
  now(),now()
);

update public.platform_users
set is_super_admin=false,nom='Inventory Race CI',initials='IR',phone='+221700000097'
where id='12121212-1111-4111-8111-121212121212';

insert into public.boutiques(id,nom,ville,owner_id)
values('inventory-race-ci','Inventory Race CI','Dakar','12121212-1111-4111-8111-121212121212');

insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values(
  991500000021,'inventory-race-ci','12121212-1111-4111-8111-121212121212','owner',
  '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":true,"encaissement_vente":true,"annulation_commande":true,"decaissement":true,"transferts":true}'::jsonb
);

insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values(
  '12121212-1111-4111-8111-121212121212',
  'inventory-race-ci',
  now()+interval '1 hour',now(),
  '34343434-2222-4222-8222-343434343434'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','12121212-1111-4111-8111-121212121212',
    'session_id','34343434-2222-4222-8222-343434343434',
    'role','authenticated'
  )::text,
  true
);

insert into public.products(id,boutique_id,nom,prix_achat,prix_vente,stock,unit,actif)
values(991500000021,'inventory-race-ci','Counted Product',50,100,5,'unité',true);

insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
values(991500000021,'inventory-race-ci',991500000021,'achat',5,50,now()-interval '1 day','12121212-1111-4111-8111-121212121212','Opening stock');

create temp table inventory_race_state(id uuid) on commit drop;

do $test$
declare r jsonb; v_id uuid;
begin
  r:=public.start_inventory_session('inventory-race-ci','product','991500000021',now());
  v_id:=(r->>'id')::uuid;
  insert into inventory_race_state values(v_id);
  perform public.save_inventory_count(v_id,991500000021,5,'{}'::jsonb);
  perform public.record_stock_movement(
    'inventory-race-ci',991500000021,
    '56565656-3333-4333-8333-565656565656',
    1,'ajustement',50,'Concurrent receipt',null::bigint,'RACE'
  );
  begin
    perform public.finalize_inventory_session(v_id);
    raise exception 'expected_inventory_race_rejection';
  exception when others then
    if sqlerrm='expected_inventory_race_rejection' then raise; end if;
    if position('inventory stock changed during count' in lower(sqlerrm))=0 then
      raise exception 'wrong inventory race failure: %',sqlerrm;
    end if;
  end;
end
$test$;

do $test$
declare v_status text; v_stock numeric; v_entry bigint;
begin
  select s.status,p.stock,l.stock_entry_id
  into v_status,v_stock,v_entry
  from inventory_race_state x
  join public.inventory_sessions s on s.id=x.id
  join public.inventory_lines l on l.session_id=s.id
  join public.products p on p.boutique_id=s.boutique_id and p.id=l.product_id;

  if v_status<>'draft' or v_stock<>6 or v_entry is not null then
    raise exception 'inventory race changed finalization state status=% stock=% entry=%',v_status,v_stock,v_entry;
  end if;
end
$test$;

rollback;
\echo inventory_race_db_ok
