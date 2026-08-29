alter table public.stock_transfer_lines
  add column if not exists destination_boutique_id text,
  add column if not exists destination_product_id bigint;

update public.stock_transfer_lines l
set destination_boutique_id=t.to_boutique_id
from public.stock_transfers t
where t.id=l.transfer_id and l.destination_boutique_id is null;

update public.stock_transfer_lines l
set destination_product_id=e.product_id
from public.stock_entries e
where e.transfer_line_id=l.id
  and e.transfer_id=l.transfer_id
  and e.boutique_id=l.destination_boutique_id
  and e.qty>0
  and l.destination_product_id is null;

create index if not exists stock_transfer_lines_destination_product_idx
  on public.stock_transfer_lines(destination_boutique_id,destination_product_id)
  where destination_product_id is not null;

alter table public.stock_transfer_lines drop constraint if exists stock_transfer_lines_destination_product_fkey;
alter table public.stock_transfer_lines
  add constraint stock_transfer_lines_destination_product_fkey
  foreign key (destination_boutique_id,destination_product_id)
  references public.products(boutique_id,id) not valid;
alter table public.stock_transfer_lines validate constraint stock_transfer_lines_destination_product_fkey;

create or replace function public.create_stock_transfer(
  p_from_boutique_id text,p_to_boutique_id text,p_idempotency_key uuid,p_lines jsonb,p_note text default null::text
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
declare
  v_user uuid:=auth.uid();v_existing jsonb;v_transfer uuid;v_line jsonb;v_product public.products%rowtype;
  v_qty numeric;v_sell_qty numeric;v_sell_unit text;v_price numeric;v_total numeric:=0;v_response jsonb;
  v_from_owner uuid;v_to_owner uuid;v_relationship text;
begin
  if v_user is null or not private.auth_has_permission(p_from_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  if p_from_boutique_id=p_to_boutique_id or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'invalid transfer'; end if;
  if not exists(select 1 from public.boutiques where id=p_to_boutique_id) then raise exception 'destination not found'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_create' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1)) into v_from_owner from public.boutiques b where b.id=p_from_boutique_id;
  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1)) into v_to_owner from public.boutiques b where b.id=p_to_boutique_id;
  v_relationship:=case when v_from_owner is not null and v_from_owner=v_to_owner then 'same_owner' else 'commercial' end;
  if v_relationship='commercial' and not exists(select 1 from public.boutique_partners where boutique_id=p_from_boutique_id and partner_boutique_id=p_to_boutique_id) then raise exception 'destination must be added to directory partners first'; end if;
  insert into public.stock_transfers(from_boutique_id,to_boutique_id,note,created_by,relationship_type) values(p_from_boutique_id,p_to_boutique_id,p_note,v_user,v_relationship) returning id into v_transfer;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce((v_line->>'qty')::numeric,0);
    v_sell_unit:=nullif(trim(coalesce(v_line->>'sell_unit','')),'');
    v_sell_qty:=case when v_sell_unit is null then v_qty else coalesce((v_line->>'sell_qty')::numeric,v_qty) end;
    select * into v_product from public.products where boutique_id=p_from_boutique_id and id=(v_line->>'product_id')::bigint and actif=true for share;
    if not found or v_qty<=0 or v_sell_qty<=0 or v_product.stock<v_qty then raise exception 'insufficient stock'; end if;
    v_price:=coalesce((v_line->>'unit_price')::numeric,v_product.prix_vente,0);
    if v_price<0 then raise exception 'invalid transfer price'; end if;
    insert into public.stock_transfer_lines(transfer_id,source_boutique_id,source_product_id,destination_boutique_id,product_name,unit,qty,prix_unit,discount_percent,sell_unit,sell_qty)
    values(v_transfer,p_from_boutique_id,v_product.id,p_to_boutique_id,v_product.nom,v_product.unit,v_qty,v_price,0,v_sell_unit,case when v_sell_unit is null then null else v_sell_qty end);
    v_total:=v_total+v_sell_qty*v_price;
  end loop;
  update public.stock_transfers set total_amount=round(v_total,2),updated_at=now() where id=v_transfer;
  v_response:=jsonb_build_object('transfer_id',v_transfer,'status','pending','relationship_type',v_relationship,'total_amount',round(v_total,2));
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_create',p_idempotency_key,v_response);
  return v_response;
end $function$;

drop function if exists public.accept_stock_transfer(uuid,uuid);
create function public.accept_stock_transfer(
  p_transfer_id uuid,p_idempotency_key uuid,p_line_mappings jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private' as $function$
declare
  v_user uuid:=auth.uid();v_existing jsonb;v_transfer public.stock_transfers%rowtype;v_line record;
  v_source public.products%rowtype;v_dest public.products%rowtype;v_response jsonb;v_invoice_id text;v_numero bigint;
  v_charge_id bigint;v_from public.boutiques%rowtype;v_to public.boutiques%rowtype;v_supplier_id bigint;v_client_id bigint;
  v_source_unit_cost numeric;v_dest_unit_cost numeric;v_line_total numeric;v_phone text;v_out_id bigint;v_in_id bigint;
  v_mapping jsonb;v_destination_product_id bigint;v_create_new boolean;v_source_category public.categories%rowtype;v_dest_category_id text;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  if p_line_mappings is null or jsonb_typeof(p_line_mappings)<>'array' then raise exception 'invalid line mappings'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_accept' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'pending' or not private.auth_has_permission(v_transfer.to_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  select * into v_from from public.boutiques where id=v_transfer.from_boutique_id;
  select * into v_to from public.boutiques where id=v_transfer.to_boutique_id;
  if not found then raise exception 'destination not found'; end if;

  if v_transfer.relationship_type='commercial' then
    select id into v_client_id from public.clients where boutique_id=v_transfer.from_boutique_id and linked_boutique_id=v_transfer.to_boutique_id limit 1;
    if v_client_id is null then v_phone:=private.normalize_phone(v_to.tel); if length(v_phone)>=8 then select id into v_client_id from public.clients where boutique_id=v_transfer.from_boutique_id and private.normalize_phone(tel)=v_phone order by id limit 1; end if; end if;
    if v_client_id is null then
      v_client_id:=nextval('private.client_id_seq');
      insert into public.clients(id,boutique_id,nom,type,tel,email,adresse,ville,contact,linked_boutique_id) values(v_client_id,v_transfer.from_boutique_id,v_to.nom,'B2B',v_to.tel,v_to.email,v_to.adresse,v_to.ville,'Partenaire Tournal',v_transfer.to_boutique_id);
    else update public.clients set linked_boutique_id=coalesce(linked_boutique_id,v_transfer.to_boutique_id),updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_client_id; end if;

    select id into v_supplier_id from public.suppliers where boutique_id=v_transfer.to_boutique_id and linked_boutique_id=v_transfer.from_boutique_id limit 1;
    if v_supplier_id is null then select id into v_supplier_id from public.suppliers where boutique_id=v_transfer.to_boutique_id and lower(trim(nom))=lower(trim(v_from.nom)) order by id limit 1; end if;
    if v_supplier_id is null then
      v_supplier_id:=nextval('private.supplier_id_seq');
      insert into public.suppliers(id,boutique_id,nom,ville,tel,email,initials,color,last_delivery_at,linked_boutique_id) values(v_supplier_id,v_transfer.to_boutique_id,v_from.nom,v_from.ville,v_from.tel,v_from.email,upper(left(v_from.nom,2)),'#f97316',now(),v_transfer.from_boutique_id);
    else
      update public.suppliers set linked_boutique_id=coalesce(linked_boutique_id,v_transfer.from_boutique_id),ville=coalesce(nullif(ville,''),v_from.ville),tel=coalesce(nullif(tel,''),v_from.tel),email=coalesce(nullif(email,''),v_from.email),last_delivery_at=now(),updated_at=now() where boutique_id=v_transfer.to_boutique_id and id=v_supplier_id;
    end if;
  end if;

  for v_line in select * from public.stock_transfer_lines where transfer_id=p_transfer_id order by source_product_id,id loop
    select * into v_source from public.products where boutique_id=v_transfer.from_boutique_id and id=v_line.source_product_id for update;
    if not found or v_source.stock<v_line.qty then raise exception 'insufficient source stock for %',v_line.product_name; end if;
    v_mapping:=null;
    select m.value into v_mapping from jsonb_array_elements(p_line_mappings) m(value) where (m.value->>'transfer_line_id')::bigint=v_line.id limit 1;
    v_destination_product_id:=null;v_create_new:=false;
    if v_mapping is not null then
      v_destination_product_id:=nullif(v_mapping->>'destination_product_id','')::bigint;
      v_create_new:=coalesce((v_mapping->>'create_new')::boolean,false);
      if v_destination_product_id is not null and v_create_new then raise exception 'invalid destination mapping for line %',v_line.id; end if;
    end if;
    if v_destination_product_id is not null then
      select * into v_dest from public.products where boutique_id=v_transfer.to_boutique_id and id=v_destination_product_id for update;
      if not found then raise exception 'destination product not found for line %',v_line.id; end if;
    elsif not v_create_new then
      select * into v_dest from public.products where boutique_id=v_transfer.to_boutique_id and lower(trim(nom))=lower(trim(v_line.product_name)) and unit=v_line.unit order by actif desc,id limit 1 for update;
    end if;
    if v_dest.id is null or v_create_new then
      v_dest_category_id:=null;
      if v_source.category_id is not null then
        select * into v_source_category from public.categories where boutique_id=v_transfer.from_boutique_id and id=v_source.category_id;
        if found then
          select id into v_dest_category_id from public.categories where boutique_id=v_transfer.to_boutique_id and lower(trim(nom))=lower(trim(v_source_category.nom)) order by id limit 1;
          if v_dest_category_id is null then
            v_dest_category_id:='trcat_'||replace(gen_random_uuid()::text,'-','');
            insert into public.categories(id,boutique_id,nom,color,unit_vente,pieces_per_lot,length_per_piece) values(v_dest_category_id,v_transfer.to_boutique_id,v_source_category.nom,v_source_category.color,v_source_category.unit_vente,v_source_category.pieces_per_lot,v_source_category.length_per_piece);
          end if;
        end if;
      end if;
      insert into public.products(boutique_id,id,nom,category_id,prix_achat,prix_vente,stock,unit,actif,image_url,supplier_name,pieces_per_lot,length_per_piece,sell_unit,sell_qty)
      values(v_transfer.to_boutique_id,nextval('private.product_id_seq'),v_line.product_name,v_dest_category_id,0,0,0,v_line.unit,true,v_source.image_url,case when v_transfer.relationship_type='commercial' then v_from.nom else v_source.supplier_name end,v_source.pieces_per_lot,v_source.length_per_piece,v_source.sell_unit,v_source.sell_qty)
      returning * into v_dest;
    end if;
    update public.stock_transfer_lines set destination_boutique_id=v_transfer.to_boutique_id,destination_product_id=v_dest.id where id=v_line.id;
    update public.products set stock=stock-v_line.qty,updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_source.id;
    v_out_id:=nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,transfer_id,transfer_line_id) values(v_out_id,v_transfer.from_boutique_id,v_source.id,'ajustement',-v_line.qty,coalesce(v_source.prix_achat,0),now(),v_user,'Transfert '||p_transfer_id,p_transfer_id,v_line.id);
    v_source_unit_cost:=case when v_line.qty>0 then private.fifo_outflow_cost(v_transfer.from_boutique_id,v_source.id,v_out_id)/v_line.qty else 0 end;
    if coalesce(v_source_unit_cost,0)<=0 then v_source_unit_cost:=coalesce(v_source.prix_achat,0); end if;
    update public.stock_entries set prix_unit=v_source_unit_cost where id=v_out_id;
    update public.stock_transfer_lines set source_unit_cost=v_source_unit_cost where id=v_line.id;
    v_line_total:=coalesce(v_line.sell_qty,v_line.qty)*v_line.prix_unit;
    v_dest_unit_cost:=case when v_transfer.relationship_type='commercial' then case when v_line.qty>0 then v_line_total/v_line.qty else 0 end else v_source_unit_cost end;
    update public.products set stock=stock+v_line.qty,prix_achat=v_dest_unit_cost,actif=true,supplier_name=case when v_transfer.relationship_type='commercial' then v_from.nom else supplier_name end,updated_at=now() where boutique_id=v_transfer.to_boutique_id and id=v_dest.id;
    v_in_id:=nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,supplier_id,transfer_id,transfer_line_id) values(v_in_id,v_transfer.to_boutique_id,v_dest.id,'achat',v_line.qty,v_dest_unit_cost,now(),v_user,'Transfert '||p_transfer_id,v_supplier_id,p_transfer_id,v_line.id);
  end loop;

  if v_transfer.relationship_type='commercial' then
    v_numero:=private.next_invoice_number(v_transfer.from_boutique_id);v_invoice_id:='F'||to_char(now(),'YYMMDD')||'-'||lpad(v_numero::text,6,'0');
    insert into public.invoices(id,boutique_id,numero,client_id,client_nom,client_tel,montant,acompte,invoice_date,status,type,payment_method,operator_id,stock_deducted_at) values(v_invoice_id,v_transfer.from_boutique_id,v_numero,v_client_id,v_to.nom,v_to.tel,v_transfer.total_amount,0,now(),'en_attente','vente',null,v_user,now());
    insert into public.invoice_lines(boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit,prix_achat,sell_unit,sell_qty)
    select v_transfer.from_boutique_id,v_invoice_id,stl.source_product_id,stl.product_name,stl.qty,stl.unit,stl.prix_unit,coalesce(stl.source_unit_cost,0),stl.sell_unit,stl.sell_qty from public.stock_transfer_lines stl where stl.transfer_id=p_transfer_id order by stl.id;
    v_charge_id:=nextval('private.charge_id_seq');
    insert into public.charges(id,boutique_id,label,montant,categorie,charge_date,operator_id,note,fournisseur,status,paid_amount,transfer_id,source) values(v_charge_id,v_transfer.to_boutique_id,'Transfert B2B - '||v_from.nom,v_transfer.total_amount,'Achat stock',now(),v_user,'Facture '||v_invoice_id,v_from.nom,'pending',0,p_transfer_id,'transfer');
  end if;
  update public.stock_transfers set status='accepted',accepted_at=now(),accepted_by=v_user,invoice_id=v_invoice_id,charge_id=v_charge_id,updated_at=now() where id=p_transfer_id;
  v_response:=jsonb_build_object('transfer_id',p_transfer_id,'status','accepted','relationship_type',v_transfer.relationship_type,'total_amount',v_transfer.total_amount,'invoice_id',v_invoice_id,'charge_id',v_charge_id,'client_id',v_client_id,'supplier_id',v_supplier_id);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_accept',p_idempotency_key,v_response);
  return v_response;
end $function$;

create or replace function private.transfer_destination_product_is_compatible(p_boutique_id text,p_product_id bigint,p_unit text)
returns boolean language sql stable set search_path='pg_catalog','public' as $$
  select exists(select 1 from public.products where boutique_id=p_boutique_id and id=p_product_id and unit=p_unit)
$$;

create or replace function private.enforce_transfer_destination_mapping()
returns trigger language plpgsql set search_path='pg_catalog','public','private' as $$
begin
  if new.destination_product_id is not null then
    if new.destination_boutique_id is null or not private.transfer_destination_product_is_compatible(new.destination_boutique_id,new.destination_product_id,new.unit) then
      raise exception 'destination product unit mismatch';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stock_transfer_lines_destination_mapping_guard on public.stock_transfer_lines;
create trigger stock_transfer_lines_destination_mapping_guard
before insert or update of destination_boutique_id,destination_product_id,unit
on public.stock_transfer_lines for each row execute function private.enforce_transfer_destination_mapping();

revoke all on function public.accept_stock_transfer(uuid,uuid,jsonb) from public,anon;
grant execute on function public.accept_stock_transfer(uuid,uuid,jsonb) to authenticated,service_role;
revoke all on function public.create_stock_transfer(text,text,uuid,jsonb,text) from public,anon;
grant execute on function public.create_stock_transfer(text,text,uuid,jsonb,text) to authenticated,service_role;
