-- Transfer security/accounting hardening. Mirrors the production migration applied on 2026-08-29.
create sequence if not exists private.transfer_charge_payment_id_seq;

alter table public.stock_transfer_lines add column if not exists source_unit_cost numeric;
alter table public.stock_entries add column if not exists transfer_id uuid;
alter table public.stock_entries add column if not exists transfer_line_id bigint;
create index if not exists stock_entries_transfer_idx on public.stock_entries(transfer_id);
create index if not exists stock_entries_transfer_line_idx on public.stock_entries(transfer_line_id);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='stock_entries_transfer_id_fkey') then
    alter table public.stock_entries add constraint stock_entries_transfer_id_fkey foreign key(transfer_id) references public.stock_transfers(id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='stock_entries_transfer_line_id_fkey') then
    alter table public.stock_entries add constraint stock_entries_transfer_line_id_fkey foreign key(transfer_line_id) references public.stock_transfer_lines(id) not valid;
  end if;
end $$;

update public.stock_entries se
set transfer_id=(regexp_match(se.note,'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1]::uuid
where se.transfer_id is null and se.note like 'Transfert %'
  and se.note ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

update public.boutique_assignments
set droits=jsonb_set(coalesce(droits,'{}'::jsonb),'{transferts}',to_jsonb(coalesce((droits->>'stock')::boolean,false)),true)
where role<>'owner' and not (coalesce(droits,'{}'::jsonb) ? 'transferts');

revoke insert,update,delete on public.stock_transfers from authenticated;
revoke insert,update,delete on public.stock_transfer_lines from authenticated;

drop policy if exists "stock_transfers: select" on public.stock_transfers;
drop policy if exists "stock_transfers: select permitted" on public.stock_transfers;
create policy "stock_transfers: select permitted" on public.stock_transfers for select to authenticated
using (private.auth_has_permission(from_boutique_id,'transferts') or private.auth_has_permission(to_boutique_id,'transferts'));

drop policy if exists "stock_transfer_lines: select" on public.stock_transfer_lines;
drop policy if exists "stock_transfer_lines: select permitted" on public.stock_transfer_lines;
create policy "stock_transfer_lines: select permitted" on public.stock_transfer_lines for select to authenticated
using (exists(select 1 from public.stock_transfers t where t.id=stock_transfer_lines.transfer_id and (private.auth_has_permission(t.from_boutique_id,'transferts') or private.auth_has_permission(t.to_boutique_id,'transferts'))));

create table if not exists public.transfer_charge_payments(
  id bigint primary key default nextval('private.transfer_charge_payment_id_seq'),
  boutique_id text not null references public.boutiques(id),
  transfer_id uuid not null references public.stock_transfers(id),
  charge_id bigint not null,
  amount numeric(12,2) not null check(amount>0),
  payment_method text not null,
  paid_at timestamptz not null default now(),
  operator_id uuid references auth.users(id),
  operator_name text not null,
  idempotency_key uuid not null,
  unique(boutique_id,idempotency_key)
);
alter table public.transfer_charge_payments enable row level security;
revoke all on public.transfer_charge_payments from anon;
revoke insert,update,delete on public.transfer_charge_payments from authenticated;
grant select on public.transfer_charge_payments to authenticated;
drop policy if exists "transfer_charge_payments: select" on public.transfer_charge_payments;
create policy "transfer_charge_payments: select" on public.transfer_charge_payments for select to authenticated
using(private.auth_has_permission(boutique_id,'charges') or private.auth_has_permission(boutique_id,'transferts'));

create or replace function private.enforce_transfer_disbursement_caisse() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_enabled boolean:=false; v_open boolean:=false;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(caisse_daily_control_enabled,false) into v_enabled from public.auth_settings where boutique_id=new.boutique_id;
  if not v_enabled then return new; end if;
  select exists(select 1 from public.caisse_sessions where boutique_id=new.boutique_id and closed_at is null and (opened_at at time zone 'Africa/Dakar')::date=(now() at time zone 'Africa/Dakar')::date) into v_open;
  if not v_open then raise exception 'caisse_opening_required' using hint='Ouvrez la caisse du jour avant tout décaissement de transfert.'; end if;
  return new;
end $$;
drop trigger if exists transfer_charge_payment_caisse_guard on public.transfer_charge_payments;
create trigger transfer_charge_payment_caisse_guard before insert on public.transfer_charge_payments for each row execute function private.enforce_transfer_disbursement_caisse();

create or replace function public.cancel_stock_transfer(p_transfer_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare v_user uuid:=auth.uid(); v_t public.stock_transfers%rowtype; v_existing jsonb; v_response jsonb;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_cancel' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_t from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_t.status<>'pending' or not private.auth_has_permission(v_t.from_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  update public.stock_transfers set status='cancelled',updated_at=now() where id=p_transfer_id;
  v_response=jsonb_build_object('transfer_id',p_transfer_id,'status','cancelled');
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_cancel',p_idempotency_key,v_response);
  return v_response;
end $$;
revoke all on function public.cancel_stock_transfer(uuid,uuid) from public,anon;
grant execute on function public.cancel_stock_transfer(uuid,uuid) to authenticated,service_role;

create or replace function public.create_stock_transfer(p_from_boutique_id text,p_to_boutique_id text,p_idempotency_key uuid,p_lines jsonb,p_note text default null) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare v_user uuid:=auth.uid(); v_existing jsonb; v_transfer uuid; v_line jsonb; v_product public.products%rowtype; v_qty numeric; v_price numeric; v_discount numeric; v_total numeric:=0; v_response jsonb; v_from_owner uuid; v_to_owner uuid; v_relationship text;
begin
  if v_user is null or not private.auth_has_permission(p_from_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  if p_from_boutique_id=p_to_boutique_id or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'invalid transfer'; end if;
  if not exists(select 1 from public.boutiques where id=p_to_boutique_id) then raise exception 'destination not found'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_create' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1)) into v_from_owner from public.boutiques b where b.id=p_from_boutique_id;
  select coalesce(b.owner_id,(select ba.user_id from public.boutique_assignments ba where ba.boutique_id=b.id and ba.role='owner' order by ba.id limit 1)) into v_to_owner from public.boutiques b where b.id=p_to_boutique_id;
  v_relationship=case when v_from_owner is not null and v_from_owner=v_to_owner then 'same_owner' else 'commercial' end;
  if v_relationship='commercial' and not exists(select 1 from public.boutique_partners where boutique_id=p_from_boutique_id and partner_boutique_id=p_to_boutique_id) then raise exception 'destination must be added to directory partners first'; end if;
  insert into public.stock_transfers(from_boutique_id,to_boutique_id,note,created_by,relationship_type) values(p_from_boutique_id,p_to_boutique_id,p_note,v_user,v_relationship) returning id into v_transfer;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty=coalesce((v_line->>'qty')::numeric,0); v_discount=coalesce((v_line->>'discount_percent')::numeric,0);
    select * into v_product from public.products where boutique_id=p_from_boutique_id and id=(v_line->>'product_id')::bigint and actif=true for share;
    if not found or v_qty<=0 or v_product.stock<v_qty then raise exception 'insufficient stock'; end if;
    v_price=coalesce((v_line->>'unit_price')::numeric,v_product.prix_vente,0);
    if v_price<0 or v_discount<0 or v_discount>100 then raise exception 'invalid transfer price'; end if;
    insert into public.stock_transfer_lines(transfer_id,source_boutique_id,source_product_id,product_name,unit,qty,prix_unit,discount_percent) values(v_transfer,p_from_boutique_id,v_product.id,v_product.nom,v_product.unit,v_qty,v_price,v_discount);
    v_total=v_total+v_qty*v_price*(1-v_discount/100);
  end loop;
  update public.stock_transfers set total_amount=v_total,updated_at=now() where id=v_transfer;
  v_response=jsonb_build_object('transfer_id',v_transfer,'status','pending','relationship_type',v_relationship,'total_amount',v_total);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_create',p_idempotency_key,v_response);
  return v_response;
end $$;

create or replace function public.reject_stock_transfer(p_transfer_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare v_user uuid:=auth.uid(); v_transfer public.stock_transfers%rowtype; v_existing jsonb; v_response jsonb;
begin
  if v_user is null then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_reject' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found or v_transfer.status<>'pending' or not private.auth_has_permission(v_transfer.to_boutique_id,'transferts') then raise exception 'forbidden'; end if;
  update public.stock_transfers set status='rejected',updated_at=now() where id=p_transfer_id;
  v_response=jsonb_build_object('transfer_id',p_transfer_id,'status','rejected');
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_reject',p_idempotency_key,v_response);
  return v_response;
end $$;

create or replace function public.record_transfer_charge_payment(p_boutique_id text,p_charge_id bigint,p_idempotency_key uuid,p_amount numeric,p_payment_method text) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','private' as $$
declare v_user uuid:=auth.uid(); v_existing jsonb; v_charge public.charges%rowtype; v_transfer public.stock_transfers%rowtype; v_invoice public.invoices%rowtype; v_applied numeric; v_charge_paid numeric; v_invoice_paid numeric; v_operator_name text; v_payment_id bigint; v_disbursement_id bigint; v_response jsonb;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id,'charges') or not private.auth_has_permission(p_boutique_id,'decaissement') then raise exception 'forbidden'; end if;
  if p_amount<=0 then raise exception 'amount must be positive'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='transfer_charge_payment' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_charge from public.charges where boutique_id=p_boutique_id and id=p_charge_id for update;
  if not found or v_charge.source<>'transfer' or v_charge.transfer_id is null then raise exception 'transfer charge not found'; end if;
  select * into v_transfer from public.stock_transfers where id=v_charge.transfer_id for update;
  if v_transfer.status<>'accepted' or v_transfer.to_boutique_id<>p_boutique_id then raise exception 'invalid transfer charge'; end if;
  select * into v_invoice from public.invoices where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id for update;
  if not found then raise exception 'transfer invoice not found'; end if;
  v_applied=least(p_amount,greatest(0,v_charge.montant-v_charge.paid_amount));
  if v_applied<=0 then raise exception 'charge already paid'; end if;
  v_charge_paid=v_charge.paid_amount+v_applied; v_invoice_paid=v_invoice.acompte+v_applied;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name=coalesce(v_operator_name,'Utilisateur');
  insert into public.transfer_charge_payments(boutique_id,transfer_id,charge_id,amount,payment_method,operator_id,operator_name,idempotency_key) values(p_boutique_id,v_transfer.id,p_charge_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),v_user,v_operator_name,p_idempotency_key) returning id into v_disbursement_id;
  insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source) values(v_transfer.from_boutique_id,v_transfer.invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),now(),v_user,v_operator_name,p_idempotency_key,'transfer') returning id into v_payment_id;
  update public.invoices set acompte=v_invoice_paid,status=case when v_invoice_paid>=montant then 'payée' else 'en_attente' end,payment_method=coalesce(nullif(p_payment_method,''),payment_method),updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id;
  update public.charges set paid_amount=v_charge_paid,status=case when v_charge_paid>=montant then 'paid' else 'partial' end,updated_at=now() where boutique_id=p_boutique_id and id=p_charge_id;
  v_response=jsonb_build_object('charge_id',p_charge_id,'applied_amount',v_applied,'paid_amount',v_charge_paid,'status',case when v_charge_paid>=v_charge.montant then 'paid' else 'partial' end,'invoice_id',v_transfer.invoice_id,'payment_id',v_payment_id,'disbursement_id',v_disbursement_id);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'transfer_charge_payment',p_idempotency_key,v_response);
  return v_response;
end $$;
