\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  'abababab-1111-4111-8111-abababababab',
  'authenticated','authenticated','dashboard-fifo-ci@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Dashboard FIFO CI","phone":"+221700000096"}'::jsonb,
  now(),now()
);
update public.platform_users
set is_super_admin=false,nom='Dashboard FIFO CI',initials='DF',phone='+221700000096'
where id='abababab-1111-4111-8111-abababababab';

insert into public.boutiques(id,nom,ville,owner_id)
values('dashboard-fifo-ci','Dashboard FIFO CI','Dakar','abababab-1111-4111-8111-abababababab');
insert into public.boutique_assignments(id,boutique_id,user_id,role,droits)
overriding system value
values(991500000041,'dashboard-fifo-ci','abababab-1111-4111-8111-abababababab','owner','{"dashboard":true,"marges":true}'::jsonb);

select set_config('request.jwt.claims',json_build_object('sub','abababab-1111-4111-8111-abababababab','role','authenticated')::text,true);

-- Current product purchase price is intentionally unrelated to the FIFO layers.
insert into public.products(id,boutique_id,nom,prix_achat,prix_vente,stock,unit,actif)
values(991500000041,'dashboard-fifo-ci','FIFO Product',999,100,2,'unité',true);
insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
values
(991500000041,'dashboard-fifo-ci',991500000041,'achat',2,10,now()-interval '3 days','abababab-1111-4111-8111-abababababab','Layer 1'),
(991500000042,'dashboard-fifo-ci',991500000041,'achat',2,20,now()-interval '2 days','abababab-1111-4111-8111-abababababab','Layer 2'),
(991500000043,'dashboard-fifo-ci',991500000041,'ajustement',-2,10,now()-interval '1 day','abababab-1111-4111-8111-abababababab','FIFO outflow');

do $test$
declare j jsonb; v_value numeric;
begin
  j:=public.get_dashboard_summary('dashboard-fifo-ci',now()-interval '7 days',now());
  v_value:=(j->>'stock_value')::numeric;
  if abs(v_value-40)>0.01 then
    raise exception 'dashboard stock value must be FIFO 40, got %',v_value;
  end if;
  if abs(v_value-(2*999))<0.01 then
    raise exception 'dashboard fell back to mutable product purchase price';
  end if;
end
$test$;

rollback;
\echo dashboard_fifo_db_ok
