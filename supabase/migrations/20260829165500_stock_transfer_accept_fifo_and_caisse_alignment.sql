-- Transfer acceptance: structural stock provenance, source FIFO cost, and buyer-side caisse ownership.
create or replace function private.enforce_daily_caisse_on_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_enabled boolean:=false; v_open_today boolean:=false;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(s.caisse_daily_control_enabled,false) into v_enabled from public.auth_settings s where s.boutique_id=new.boutique_id;
  if not coalesce(v_enabled,false) then return new; end if;
  if tg_table_name='invoice_payments' then
    if coalesce(new.amount,0)<=0 or coalesce(new.source,'') in ('client_advance','legacy_backfill','transfer') then return new; end if;
  end if;
  select exists(select 1 from public.caisse_sessions cs where cs.boutique_id=new.boutique_id and cs.closed_at is null and (cs.opened_at at time zone 'Africa/Dakar')::date=(now() at time zone 'Africa/Dakar')::date) into v_open_today;
  if not v_open_today then raise exception 'caisse_opening_required' using hint='Ouvrez la caisse du jour avant tout encaissement ou remboursement.'; end if;
  return new;
end $$;

create or replace function public.accept_stock_transfer(p_transfer_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare
  v_user uuid:=auth.uid(); v_existing jsonb; v_transfer public.stock_transfers%rowtype; v_line record;
  v_source public.products%rowtype; v_dest public.products%rowtype; v_response jsonb; v_invoice_id text;
  v_numero bigint; v_charge_id bigint; v_from public.boutiques%rowtype; v_to public.boutiques%rowtype;
  v_supplier_id bigint; v_client_id bigint; v_source_unit_cost numeric; v_dest_unit_cost numeric;
  v_phone text; v_out_id bigint; v_in_id bigint;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_accept' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'pending' or not private.auth_has_permission(v_transfer.to_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  select * into v_from from public.boutiques where id=v_transfer.from_boutique_id;
  select * into v_to from public.boutiques where id=v_transfer.to_boutique_id;
  if not found then raise exception 'destination not found'; end if;

  if v_transfer.relationship_type='commercial' then
    select id into v_client_id from public.clients where boutique_id=v_transfer.from_boutique_id and linked_boutique_id=v_transfer.to_boutique_id limit 1;
    if v_client_id is null then
      v_phone:=private.normalize_phone(v_to.tel);
      if length(v_phone)>=8 then select id into v_client_id from public.clients where boutique_id=v_transfer.from_boutique_id and private.normalize_phone(tel)=v_phone order by id limit 1; end if;
    end if;
    if v_client_id is null then
      v_client_id:=nextval('private.client_id_seq');
      insert into public.clients(id,boutique_id,nom,type,tel,email,adresse,ville,contact,linked_boutique_id)
      values(v_client_id,v_transfer.from_boutique_id,v_to.nom,'B2B',v_to.tel,v_to.email,v_to.adresse,v_to.ville,'Partenaire Tournal',v_transfer.to_boutique_id);
    else
      update public.clients set linked_boutique_id=coalesce(linked_boutique_id,v_transfer.to_boutique_id),updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_client_id;
    end if;
    select id into v_supplier_id from public.suppliers where boutique_id=v_transfer.to_boutique_id and linked_boutique_id=v_transfer.from_boutique_id limit 1;
    if v_supplier_id is null then select id into v_supplier_id from public.suppliers where boutique_id=v_transfer.to_boutique_id and lower(trim(nom))=lower(trim(v_from.nom)) order by id limit 1; end if;
    if v_supplier_id is null then
      v_supplier_id:=nextval('private.supplier_id_seq');
      insert into public.suppliers(id,boutique_id,nom,ville,tel,email,initials,color,last_delivery_at,linked_boutique_id)
      values(v_supplier_id,v_transfer.to_boutique_id,v_from.nom,v_from.ville,v_from.tel,v_from.email,upper(left(v_from.nom,2)),'#f97316',now(),v_transfer.from_boutique_id);
    else
      update public.suppliers set linked_boutique_id=coalesce(linked_boutique_id,v_transfer.from_boutique_id),last_delivery_at=now(),updated_at=now() where boutique_id=v_transfer.to_boutique_id and id=v_supplier_id;
    end if;
  end if;

  for v_line in select * from public.stock_transfer_lines where transfer_id=p_transfer_id order by source_product_id,id loop
    select * into v_source from public.products where boutique_id=v_transfer.from_boutique_id and id=v_line.source_product_id for update;
    if not found or v_source.stock<v_line.qty then raise exception 'insufficient source stock for %',v_line.product_name; end if;
    select * into v_dest from public.products where boutique_id=v_transfer.to_boutique_id and nom=v_line.product_name and unit=v_line.unit order by id limit 1 for update;
    if not found then
      insert into public.products(boutique_id,id,nom,prix_achat,prix_vente,stock,unit,actif)
      values(v_transfer.to_boutique_id,nextval('private.product_id_seq'),v_line.product_name,0,0,0,v_line.unit,true) returning * into v_dest;
    end if;

    update public.products set stock=stock-v_line.qty,updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_source.id;
    v_out_id:=nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,transfer_id,transfer_line_id)
    values(v_out_id,v_transfer.from_boutique_id,v_source.id,'ajustement',-v_line.qty,coalesce(v_source.prix_achat,0),now(),v_user,'Transfert '||p_transfer_id,p_transfer_id,v_line.id);
    v_source_unit_cost:=case when v_line.qty>0 then private.fifo_outflow_cost(v_transfer.from_boutique_id,v_source.id,v_out_id)/v_line.qty else 0 end;
    if coalesce(v_source_unit_cost,0)<=0 then v_source_unit_cost:=coalesce(v_source.prix_achat,0); end if;
    update public.stock_entries set prix_unit=v_source_unit_cost where id=v_out_id;
    update public.stock_transfer_lines set source_unit_cost=v_source_unit_cost where id=v_line.id;

    v_dest_unit_cost:=case when v_transfer.relationship_type='commercial' then v_line.prix_unit*(1-v_line.discount_percent/100) else v_source_unit_cost end;
    update public.products set stock=stock+v_line.qty,prix_achat=v_dest_unit_cost,actif=true,updated_at=now() where boutique_id=v_transfer.to_boutique_id and id=v_dest.id;
    v_in_id:=nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,supplier_id,transfer_id,transfer_line_id)
    values(v_in_id,v_transfer.to_boutique_id,v_dest.id,'achat',v_line.qty,v_dest_unit_cost,now(),v_user,'Transfert '||p_transfer_id,v_supplier_id,p_transfer_id,v_line.id);
  end loop;

  if v_transfer.relationship_type='commercial' then
    v_numero:=private.next_invoice_number(v_transfer.from_boutique_id);
    v_invoice_id:='F'||to_char(now(),'YYMMDD')||'-'||lpad(v_numero::text,6,'0');
    insert into public.invoices(id,boutique_id,numero,client_id,client_nom,client_tel,montant,acompte,invoice_date,status,type,payment_method,operator_id,stock_deducted_at)
    values(v_invoice_id,v_transfer.from_boutique_id,v_numero,v_client_id,v_to.nom,v_to.tel,v_transfer.total_amount,0,now(),'en_attente','vente',null,v_user,now());
    insert into public.invoice_lines(boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit,prix_achat)
    select v_transfer.from_boutique_id,v_invoice_id,stl.source_product_id,stl.product_name,stl.qty,stl.unit,stl.prix_unit*(1-stl.discount_percent/100),coalesce(stl.source_unit_cost,0)
    from public.stock_transfer_lines stl where stl.transfer_id=p_transfer_id order by stl.id;
    v_charge_id:=nextval('private.charge_id_seq');
    insert into public.charges(id,boutique_id,label,montant,categorie,charge_date,operator_id,note,fournisseur,status,paid_amount,transfer_id,source)
    values(v_charge_id,v_transfer.to_boutique_id,'Transfert B2B - '||v_from.nom,v_transfer.total_amount,'Achat stock',now(),v_user,'Facture '||v_invoice_id,v_from.nom,'pending',0,p_transfer_id,'transfer');
  end if;

  update public.stock_transfers set status='accepted',accepted_at=now(),accepted_by=v_user,invoice_id=v_invoice_id,charge_id=v_charge_id,updated_at=now() where id=p_transfer_id;
  v_response=jsonb_build_object('transfer_id',p_transfer_id,'status','accepted','relationship_type',v_transfer.relationship_type,'total_amount',v_transfer.total_amount,'invoice_id',v_invoice_id,'charge_id',v_charge_id,'client_id',v_client_id,'supplier_id',v_supplier_id);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_accept',p_idempotency_key,v_response);
  return v_response;
end $$;
revoke all on function public.accept_stock_transfer(uuid,uuid) from public,anon;
grant execute on function public.accept_stock_transfer(uuid,uuid) to authenticated,service_role;
