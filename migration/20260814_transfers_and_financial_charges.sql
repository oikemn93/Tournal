-- Phase 1A: financially correct inter-shop transfers.
-- Existing production rows and function definitions are snapshotted first.

create table if not exists private.backup_20260814_transfer_finance_charges
as table public.charges with data;

create table if not exists private.backup_20260814_transfer_finance_functions (
  function_name text primary key,
  definition text not null,
  captured_at timestamptz not null default now()
);

insert into private.backup_20260814_transfer_finance_functions(function_name,definition)
select p.proname,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_stock_transfer','accept_stock_transfer')
on conflict(function_name) do nothing;

alter table public.stock_transfers
  add column if not exists relationship_type text,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists invoice_id text,
  add column if not exists charge_id bigint,
  add column if not exists updated_at timestamptz not null default now();

alter table public.stock_transfers drop constraint if exists stock_transfers_relationship_type_check;
alter table public.stock_transfers add constraint stock_transfers_relationship_type_check
  check (relationship_type is null or relationship_type in ('same_owner','commercial'));

alter table public.stock_transfer_lines
  add column if not exists discount_percent numeric not null default 0;
alter table public.stock_transfer_lines drop constraint if exists stock_transfer_lines_discount_check;
alter table public.stock_transfer_lines add constraint stock_transfer_lines_discount_check
  check (discount_percent between 0 and 100);

alter table public.charges
  add column if not exists fournisseur text,
  add column if not exists status text not null default 'paid',
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists transfer_id uuid,
  add column if not exists source text not null default 'manual';

alter table public.charges drop constraint if exists charges_status_check;
alter table public.charges add constraint charges_status_check
  check (status in ('pending','partial','paid'));
alter table public.charges drop constraint if exists charges_paid_amount_check;
alter table public.charges add constraint charges_paid_amount_check
  check (paid_amount between 0 and montant);
alter table public.charges drop constraint if exists charges_transfer_id_fkey;
alter table public.charges add constraint charges_transfer_id_fkey
  foreign key(transfer_id) references public.stock_transfers(id) on delete set null;
create unique index if not exists charges_transfer_unique
  on public.charges(transfer_id) where transfer_id is not null;
create index if not exists charges_status_date_idx
  on public.charges(boutique_id,status,charge_date desc);

update public.charges
set paid_amount=montant,status='paid'
where source='manual' and paid_amount=0;

alter table public.invoice_payments drop constraint if exists invoice_payments_source_check;
alter table public.invoice_payments add constraint invoice_payments_source_check
  check (source in ('invoice','client_fifo','legacy_backfill','transfer'));

create or replace function public.create_stock_transfer(
  p_from_boutique_id text,p_to_boutique_id text,p_idempotency_key uuid,
  p_lines jsonb,p_note text default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_user uuid:=auth.uid(); v_existing jsonb; v_transfer uuid; v_line jsonb;
  v_product public.products%rowtype; v_qty numeric; v_price numeric; v_discount numeric;
  v_total numeric:=0; v_response jsonb; v_from_owner uuid; v_to_owner uuid; v_relationship text;
begin
  if v_user is null or not private.auth_has_write_access(p_from_boutique_id) then raise exception 'forbidden'; end if;
  if p_from_boutique_id=p_to_boutique_id or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'invalid transfer'; end if;
  if not exists(select 1 from public.boutiques where id=p_to_boutique_id) then raise exception 'destination not found'; end if;
  select response into v_existing from private.idempotency_keys
  where user_id=v_user and operation='stock_transfer_create' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1))
  into v_from_owner from public.boutiques b where b.id=p_from_boutique_id;
  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1))
  into v_to_owner from public.boutiques b where b.id=p_to_boutique_id;
  v_relationship:=case when v_from_owner is not null and v_from_owner=v_to_owner then 'same_owner' else 'commercial' end;

  insert into public.stock_transfers(from_boutique_id,to_boutique_id,note,created_by,relationship_type)
  values(p_from_boutique_id,p_to_boutique_id,p_note,v_user,v_relationship) returning id into v_transfer;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=coalesce((v_line->>'qty')::numeric,0);
    v_discount:=coalesce((v_line->>'discount_percent')::numeric,0);
    select * into v_product from public.products
    where boutique_id=p_from_boutique_id and id=(v_line->>'product_id')::bigint for share;
    if not found or v_qty<=0 or v_product.stock<v_qty then raise exception 'insufficient stock'; end if;
    v_price:=coalesce((v_line->>'unit_price')::numeric,v_product.prix_vente,0);
    if v_price<0 or v_discount<0 or v_discount>100 then raise exception 'invalid transfer price'; end if;
    insert into public.stock_transfer_lines(transfer_id,source_boutique_id,source_product_id,product_name,unit,qty,prix_unit,discount_percent)
    values(v_transfer,p_from_boutique_id,v_product.id,v_product.nom,v_product.unit,v_qty,v_price,v_discount);
    v_total:=v_total+v_qty*v_price*(1-v_discount/100);
  end loop;
  update public.stock_transfers set total_amount=v_total,updated_at=now() where id=v_transfer;
  v_response:=jsonb_build_object('transfer_id',v_transfer,'status','pending','relationship_type',v_relationship,'total_amount',v_total);
  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'stock_transfer_create',p_idempotency_key,v_response);
  return v_response;
end $$;

create or replace function public.accept_stock_transfer(p_transfer_id uuid,p_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_user uuid:=auth.uid(); v_existing jsonb; v_transfer public.stock_transfers%rowtype;
  v_line record; v_source public.products%rowtype; v_dest public.products%rowtype;
  v_response jsonb; v_invoice_id text; v_numero bigint; v_charge_id bigint;
  v_from_name text; v_to_name text; v_supplier_id bigint; v_unit_cost numeric;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys
  where user_id=v_user and operation='stock_transfer_accept' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'pending' or not private.auth_has_write_access(v_transfer.to_boutique_id) then raise exception 'forbidden'; end if;
  select nom into v_from_name from public.boutiques where id=v_transfer.from_boutique_id;
  select nom into v_to_name from public.boutiques where id=v_transfer.to_boutique_id;

  for v_line in select * from public.stock_transfer_lines where transfer_id=p_transfer_id order by source_product_id,id loop
    select * into v_source from public.products
    where boutique_id=v_transfer.from_boutique_id and id=v_line.source_product_id for update;
    if not found or v_source.stock<v_line.qty then raise exception 'insufficient source stock for %',v_line.product_name; end if;
    select * into v_dest from public.products
    where boutique_id=v_transfer.to_boutique_id and nom=v_line.product_name and unit=v_line.unit
    order by id limit 1 for update;
    v_unit_cost:=case when v_transfer.relationship_type='commercial'
      then v_line.prix_unit*(1-v_line.discount_percent/100) else coalesce(v_source.prix_achat,0) end;
    if not found then
      insert into public.products(boutique_id,id,nom,prix_achat,prix_vente,stock,unit,actif)
      values(v_transfer.to_boutique_id,nextval('private.product_id_seq'),v_line.product_name,v_unit_cost,0,0,v_line.unit,true)
      returning * into v_dest;
    end if;
    update public.products set stock=stock-v_line.qty,updated_at=now()
    where boutique_id=v_transfer.from_boutique_id and id=v_source.id;
    update public.products set stock=stock+v_line.qty,prix_achat=v_unit_cost,updated_at=now()
    where boutique_id=v_transfer.to_boutique_id and id=v_dest.id;
    insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note)
    values
      (nextval('private.stock_entry_id_seq'),v_transfer.from_boutique_id,v_source.id,'ajustement',-v_line.qty,v_source.prix_achat,now(),v_user,
       case when v_transfer.relationship_type='same_owner' then 'Transfert interne ' else 'Transfert commercial ' end||p_transfer_id),
      (nextval('private.stock_entry_id_seq'),v_transfer.to_boutique_id,v_dest.id,'achat',v_line.qty,v_unit_cost,now(),v_user,
       case when v_transfer.relationship_type='same_owner' then 'Transfert interne ' else 'Transfert commercial ' end||p_transfer_id);
  end loop;

  if v_transfer.relationship_type='commercial' then
    v_numero:=private.next_invoice_number(v_transfer.from_boutique_id);
    v_invoice_id:='F'||to_char(now(),'YYMMDD')||'-'||lpad(v_numero::text,6,'0');
    insert into public.invoices(id,boutique_id,numero,client_nom,montant,acompte,invoice_date,status,type,payment_method,operator_id,stock_deducted_at)
    values(v_invoice_id,v_transfer.from_boutique_id,v_numero,v_to_name,v_transfer.total_amount,0,now(),'en_attente','vente',null,v_user,now());
    insert into public.invoice_lines(boutique_id,invoice_id,product_id,nom,qty,unit,prix_unit)
    select v_transfer.from_boutique_id,v_invoice_id,source_product_id,product_name,qty,unit,prix_unit*(1-discount_percent/100)
    from public.stock_transfer_lines where transfer_id=p_transfer_id order by id;
    if not exists(select 1 from public.suppliers where boutique_id=v_transfer.to_boutique_id and lower(nom)=lower(v_from_name)) then
      v_supplier_id:=nextval('private.supplier_id_seq');
      insert into public.suppliers(boutique_id,id,nom,ville,initials,color,last_delivery_at)
      values(v_transfer.to_boutique_id,v_supplier_id,v_from_name,'',upper(left(v_from_name,2)),'#f97316',now());
    else
      update public.suppliers set last_delivery_at=now(),updated_at=now()
      where boutique_id=v_transfer.to_boutique_id and lower(nom)=lower(v_from_name);
    end if;
    v_charge_id:=nextval('private.charge_id_seq');
    insert into public.charges(id,boutique_id,label,montant,categorie,charge_date,operator_id,note,fournisseur,status,paid_amount,transfer_id,source)
    values(v_charge_id,v_transfer.to_boutique_id,'Transfert B2B - '||v_from_name,v_transfer.total_amount,'Achat stock',now(),v_user,
      'Facture '||v_invoice_id,v_from_name,'pending',0,p_transfer_id,'transfer');
  end if;
  update public.stock_transfers set status='accepted',accepted_at=now(),accepted_by=v_user,
    invoice_id=v_invoice_id,charge_id=v_charge_id,updated_at=now() where id=p_transfer_id;
  v_response:=jsonb_build_object('transfer_id',p_transfer_id,'status','accepted','relationship_type',v_transfer.relationship_type,
    'total_amount',v_transfer.total_amount,'invoice_id',v_invoice_id,'charge_id',v_charge_id);
  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'stock_transfer_accept',p_idempotency_key,v_response);
  return v_response;
end $$;

create or replace function public.reject_stock_transfer(p_transfer_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_user uuid:=auth.uid(); v_transfer public.stock_transfers%rowtype; v_existing jsonb; v_response jsonb;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_reject' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'pending' or not private.auth_has_write_access(v_transfer.to_boutique_id) then raise exception 'forbidden'; end if;
  update public.stock_transfers set status='rejected',updated_at=now() where id=p_transfer_id;
  v_response:=jsonb_build_object('transfer_id',p_transfer_id,'status','rejected');
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_reject',p_idempotency_key,v_response);
  return v_response;
end $$;

create or replace function public.record_transfer_charge_payment(
  p_boutique_id text,p_charge_id bigint,p_idempotency_key uuid,p_amount numeric,p_payment_method text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare
  v_user uuid:=auth.uid(); v_existing jsonb; v_charge public.charges%rowtype;
  v_transfer public.stock_transfers%rowtype; v_invoice public.invoices%rowtype;
  v_applied numeric; v_charge_paid numeric; v_invoice_paid numeric; v_operator_name text; v_payment_id bigint; v_response jsonb;
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then raise exception 'forbidden'; end if;
  if p_amount<=0 then raise exception 'amount must be positive'; end if;
  select response into v_existing from private.idempotency_keys
  where user_id=v_user and operation='transfer_charge_payment' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_charge from public.charges where boutique_id=p_boutique_id and id=p_charge_id for update;
  if not found or v_charge.source<>'transfer' or v_charge.transfer_id is null then raise exception 'transfer charge not found'; end if;
  select * into v_transfer from public.stock_transfers where id=v_charge.transfer_id for update;
  select * into v_invoice from public.invoices
  where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id for update;
  if not found then raise exception 'transfer invoice not found'; end if;
  v_applied:=least(p_amount,greatest(0,v_charge.montant-v_charge.paid_amount));
  if v_applied<=0 then raise exception 'charge already paid'; end if;
  v_charge_paid:=v_charge.paid_amount+v_applied; v_invoice_paid:=v_invoice.acompte+v_applied;
  select nom into v_operator_name from public.platform_users where id=v_user;
  v_operator_name:=coalesce(v_operator_name,'Utilisateur');
  insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source)
  values(v_transfer.from_boutique_id,v_transfer.invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),now(),v_user,v_operator_name,p_idempotency_key,'transfer')
  returning id into v_payment_id;
  update public.invoices set acompte=v_invoice_paid,
    status=case when v_invoice_paid>=montant then 'payée' else 'en_attente' end,
    payment_method=coalesce(nullif(p_payment_method,''),payment_method),updated_at=now()
  where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id;
  update public.charges set paid_amount=v_charge_paid,
    status=case when v_charge_paid>=montant then 'paid' else 'partial' end,updated_at=now()
  where boutique_id=p_boutique_id and id=p_charge_id;
  v_response:=jsonb_build_object('charge_id',p_charge_id,'applied_amount',v_applied,'paid_amount',v_charge_paid,
    'status',case when v_charge_paid>=v_charge.montant then 'paid' else 'partial' end,
    'invoice_id',v_transfer.invoice_id,'payment_id',v_payment_id);
  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'transfer_charge_payment',p_idempotency_key,v_response);
  return v_response;
end $$;

revoke all on function public.create_stock_transfer(text,text,uuid,jsonb,text) from public,anon;
revoke all on function public.accept_stock_transfer(uuid,uuid) from public,anon;
revoke all on function public.reject_stock_transfer(uuid,uuid) from public,anon;
revoke all on function public.record_transfer_charge_payment(text,bigint,uuid,numeric,text) from public,anon;
grant execute on function public.create_stock_transfer(text,text,uuid,jsonb,text) to authenticated;
grant execute on function public.accept_stock_transfer(uuid,uuid) to authenticated;
grant execute on function public.reject_stock_transfer(uuid,uuid) to authenticated;
grant execute on function public.record_transfer_charge_payment(text,bigint,uuid,numeric,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_transfers') then
    alter publication supabase_realtime add table public.stock_transfers;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stock_transfer_lines') then
    alter publication supabase_realtime add table public.stock_transfer_lines;
  end if;
end $$;
