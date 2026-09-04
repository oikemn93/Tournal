\set ON_ERROR_STOP on
begin;

insert into public.boutiques(id,nom,ville) values('ci-boutique-security','CI Security Boutique','Dakar');
insert into public.platform_users(id,phone,nom,initials)
values('11111111-1111-4111-8111-111111111111','+221700000001','CI User','CI');
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
values(
  910000000001,
  'ci-boutique-security',
  '11111111-1111-4111-8111-111111111111',
  'employee',
  '{"dashboard":true,"stock":true,"fournisseurs":true,"clients":true,"factures":true,"remboursement":true,"charges":true,"compta":true,"vente":true,"inventaire":true,"marges":false,"encaissement_vente":true,"annulation_commande":true,"decaissement":false,"transferts":true}'::jsonb
);
insert into public.clients(id,boutique_id,nom,type,total)
values(910000000001,'ci-boutique-security','CI Client','B2C',0);

select set_config(
  'request.jwt.claims',
  json_build_object('sub','11111111-1111-4111-8111-111111111111','role','authenticated')::text,
  true
);

do $$
begin
  if not private.auth_has_read_permission('ci-boutique-security','dashboard') then
    raise exception 'read helper rejected valid assignment without app session';
  end if;
  if private.auth_has_permission('ci-boutique-security','dashboard') then
    raise exception 'write helper unexpectedly allowed missing app session';
  end if;
end $$;

do $$
declare j jsonb;
begin
  j := public.get_dashboard_summary('ci-boutique-security',now()-interval '1 day',now());
  if j is null then raise exception 'dashboard read returned null'; end if;
  if (j->'margin') is distinct from 'null'::jsonb or (j->'stock_value') is distinct from 'null'::jsonb then
    raise exception 'dashboard margin masking regressed';
  end if;
end $$;

insert into private.app_sessions(user_id,boutique_id,expires_at,last_seen_at,session_id)
values(
  '11111111-1111-4111-8111-111111111111',
  'ci-boutique-security',
  now()+interval '1 hour',
  now(),
  '22222222-2222-4222-8222-222222222222'
);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','11111111-1111-4111-8111-111111111111',
    'session_id','22222222-2222-4222-8222-222222222222',
    'role','authenticated'
  )::text,
  true
);

do $$
begin
  if not private.auth_has_permission('ci-boutique-security','charges') then
    raise exception 'write helper rejected valid app session';
  end if;
end $$;

-- No Décaissement: paid charge must be refused by the canonical charge guard.
do $$
begin
  begin
    insert into public.charges(id,boutique_id,label,montant,categorie,operator_id,status,paid_amount,source)
    values(910000000001,'ci-boutique-security','CI blocked charge',10,'Autre','11111111-1111-4111-8111-111111111111','paid',10,'manual');
    raise exception 'expected charge disbursement refusal missing';
  exception when others then
    if sqlerrm='expected charge disbursement refusal missing' then raise; end if;
  end;
end $$;

-- No Décaissement: client-credit refund must also be refused.
do $$
begin
  begin
    insert into public.client_credit_refunds(
      id,boutique_id,client_id,amount,payment_method,operator_id,operator_name,idempotency_key
    ) values(
      910000000001,'ci-boutique-security',910000000001,5,'Espèces',
      '11111111-1111-4111-8111-111111111111','CI User','33333333-3333-4333-8333-333333333333'
    );
    raise exception 'expected refund disbursement refusal missing';
  exception when others then
    if sqlerrm='expected refund disbursement refusal missing' then raise; end if;
  end;
end $$;

update public.boutique_assignments
set droits=jsonb_set(droits,'{decaissement}','true'::jsonb,true)
where boutique_id='ci-boutique-security' and user_id='11111111-1111-4111-8111-111111111111';

insert into public.charges(id,boutique_id,label,montant,categorie,operator_id,status,paid_amount,source)
values(910000000002,'ci-boutique-security','CI allowed charge',10,'Autre','11111111-1111-4111-8111-111111111111','paid',10,'manual');

insert into public.client_credit_refunds(
  id,boutique_id,client_id,amount,payment_method,operator_id,operator_name,idempotency_key
) values(
  910000000002,'ci-boutique-security',910000000001,5,'Espèces',
  '11111111-1111-4111-8111-111111111111','CI User','44444444-4444-4444-8444-444444444444'
);

do $$
declare n integer;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and c.oid='public.charges'::regclass
    and t.tgname in ('trg_enforce_charge_disbursement','trg_guard_supplier_payment_disbursement');
  if n<>0 then raise exception 'duplicate charge disbursement triggers remain'; end if;

  select count(*) into n from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and c.oid='public.client_credit_refunds'::regclass
    and t.tgname='client_credit_refunds_require_disbursement';
  if n<>0 then raise exception 'duplicate refund disbursement trigger remains'; end if;

  select count(*) into n from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and c.oid='public.charges'::regclass
    and t.tgname='charges_require_disbursement';
  if n<>1 then raise exception 'canonical charge disbursement trigger missing'; end if;

  select count(*) into n from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and c.oid='public.client_credit_refunds'::regclass
    and t.tgname='trg_client_credit_refund_disbursement';
  if n<>1 then raise exception 'canonical refund disbursement trigger missing'; end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated','public.get_inventory_session_internal_unmasked(uuid)','EXECUTE') then
    raise exception 'unmasked inventory get helper exposed to authenticated';
  end if;
  if has_function_privilege('authenticated','public.list_inventory_sessions_internal_unmasked(text,integer)','EXECUTE') then
    raise exception 'unmasked inventory list helper exposed to authenticated';
  end if;
  if position('private.auth_has_permission' in pg_get_functiondef('public.start_inventory_session(text,text,text,timestamptz)'::regprocedure))=0 then
    raise exception 'inventory write RPC lost app-session-bound authorization';
  end if;
end $$;

rollback;
\echo db_behavior_matrix_ok
