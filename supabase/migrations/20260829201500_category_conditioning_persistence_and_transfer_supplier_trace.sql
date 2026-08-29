create or replace function public.create_category(
  p_boutique_id text,
  p_idempotency_key uuid,
  p_nom text,
  p_unit_vente text default 'pièces',
  p_pieces_per_lot numeric default 0,
  p_length_per_piece numeric default 0
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_user uuid:=auth.uid();
  v_existing jsonb;
  v_id text;
  v_response jsonb;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id,'stock') then raise exception 'forbidden'; end if;
  if nullif(trim(p_nom),'') is null then raise exception 'category name required'; end if;
  if coalesce(p_pieces_per_lot,0)<0 or coalesce(p_length_per_piece,0)<0 then raise exception 'invalid conditioning'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='create_category' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if exists(select 1 from public.categories where boutique_id=p_boutique_id and lower(trim(nom))=lower(trim(p_nom))) then raise exception 'category already exists'; end if;
  v_id:='cat_'||replace(gen_random_uuid()::text,'-','');
  insert into public.categories(id,boutique_id,nom,unit_vente,pieces_per_lot,length_per_piece)
  values(v_id,p_boutique_id,trim(p_nom),coalesce(nullif(trim(p_unit_vente),''),'pièces'),coalesce(p_pieces_per_lot,0),coalesce(p_length_per_piece,0));
  v_response:=jsonb_build_object('category_id',v_id,'name',trim(p_nom),'unit_vente',coalesce(nullif(trim(p_unit_vente),''),'pièces'),'pieces_per_lot',coalesce(p_pieces_per_lot,0),'length_per_piece',coalesce(p_length_per_piece,0));
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'create_category',p_idempotency_key,v_response);
  return v_response;
end $function$;

create or replace function public.update_category(
  p_boutique_id text,
  p_category_id text,
  p_nom text,
  p_unit_vente text,
  p_pieces_per_lot numeric,
  p_length_per_piece numeric
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'stock') then raise exception 'forbidden'; end if;
  if nullif(trim(p_nom),'') is null then raise exception 'category name required'; end if;
  if coalesce(p_pieces_per_lot,0)<0 or coalesce(p_length_per_piece,0)<0 then raise exception 'invalid conditioning'; end if;
  if exists(select 1 from public.categories where boutique_id=p_boutique_id and id<>p_category_id and lower(trim(nom))=lower(trim(p_nom))) then raise exception 'category already exists'; end if;
  update public.categories
  set nom=trim(p_nom),unit_vente=coalesce(nullif(trim(p_unit_vente),''),'pièces'),pieces_per_lot=coalesce(p_pieces_per_lot,0),length_per_piece=coalesce(p_length_per_piece,0),updated_at=now()
  where boutique_id=p_boutique_id and id=p_category_id;
  if not found then raise exception 'category not found'; end if;
  return jsonb_build_object('category_id',p_category_id,'name',trim(p_nom),'unit_vente',coalesce(nullif(trim(p_unit_vente),''),'pièces'),'pieces_per_lot',coalesce(p_pieces_per_lot,0),'length_per_piece',coalesce(p_length_per_piece,0));
end $function$;

create or replace function public.delete_category(p_boutique_id text,p_category_id text) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare v_name text; v_products bigint;
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'stock') then raise exception 'forbidden'; end if;
  select nom into v_name from public.categories where boutique_id=p_boutique_id and id=p_category_id for update;
  if not found then raise exception 'category not found'; end if;
  select count(*) into v_products from public.products where boutique_id=p_boutique_id and category_id=p_category_id;
  delete from public.categories where boutique_id=p_boutique_id and id=p_category_id;
  return jsonb_build_object('category_id',p_category_id,'name',v_name,'unlinked_products',v_products);
end $function$;

revoke all on function public.create_category(text,uuid,text,text,numeric,numeric) from public,anon;
revoke all on function public.update_category(text,text,text,text,numeric,numeric) from public,anon;
revoke all on function public.delete_category(text,text) from public,anon;
grant execute on function public.create_category(text,uuid,text,text,numeric,numeric) to authenticated,service_role;
grant execute on function public.update_category(text,text,text,text,numeric,numeric) to authenticated,service_role;
grant execute on function public.delete_category(text,text) to authenticated,service_role;

create or replace function private.trace_transfer_sender_as_supplier()
returns trigger
language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_from public.boutiques%rowtype;
  v_supplier_id bigint;
begin
  if new.status<>'accepted' or old.status='accepted' then return new; end if;
  select * into v_from from public.boutiques where id=new.from_boutique_id;
  if not found then return new; end if;
  select id into v_supplier_id from public.suppliers
  where boutique_id=new.to_boutique_id and linked_boutique_id=new.from_boutique_id
  order by id limit 1;
  if v_supplier_id is null then
    select id into v_supplier_id from public.suppliers
    where boutique_id=new.to_boutique_id and lower(trim(nom))=lower(trim(v_from.nom))
    order by id limit 1;
  end if;
  if v_supplier_id is null then
    v_supplier_id:=nextval('private.supplier_id_seq');
    insert into public.suppliers(id,boutique_id,nom,ville,tel,email,initials,color,last_delivery_at,linked_boutique_id)
    values(v_supplier_id,new.to_boutique_id,v_from.nom,v_from.ville,v_from.tel,v_from.email,upper(left(v_from.nom,2)),'#f97316',coalesce(new.accepted_at,now()),new.from_boutique_id);
  else
    update public.suppliers set
      linked_boutique_id=coalesce(linked_boutique_id,new.from_boutique_id),
      ville=coalesce(nullif(ville,''),v_from.ville),
      tel=coalesce(nullif(tel,''),v_from.tel),
      email=coalesce(nullif(email,''),v_from.email),
      last_delivery_at=greatest(coalesce(last_delivery_at,'epoch'::timestamptz),coalesce(new.accepted_at,now())),
      updated_at=now()
    where boutique_id=new.to_boutique_id and id=v_supplier_id;
  end if;
  update public.stock_entries se
  set supplier_id=v_supplier_id,
      note=coalesce(nullif(se.note,''),'Transfert '||new.id::text)
  where se.boutique_id=new.to_boutique_id and se.transfer_id=new.id and se.qty>0 and se.supplier_id is null;
  update public.products p
  set supplier_name=v_from.nom,updated_at=now()
  where p.boutique_id=new.to_boutique_id
    and exists(select 1 from public.stock_transfer_lines l where l.transfer_id=new.id and l.destination_product_id=p.id)
    and coalesce(nullif(trim(p.supplier_name),''),'')='';
  return new;
end $function$;

drop trigger if exists trg_trace_transfer_sender_as_supplier on public.stock_transfers;
create trigger trg_trace_transfer_sender_as_supplier
after update of status on public.stock_transfers
for each row execute function private.trace_transfer_sender_as_supplier();
