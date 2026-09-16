create or replace function private.enrich_transfer_receipt_trace()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_transfer public.stock_transfers%rowtype;
  v_supplier_id bigint;
begin
  if new.transfer_id is null or new.qty <= 0 then return new; end if;
  select * into v_transfer from public.stock_transfers where id=new.transfer_id;
  if not found or v_transfer.to_boutique_id<>new.boutique_id then return new; end if;
  new.reference:=coalesce(nullif(new.reference,''),'transfer:'||new.transfer_id::text);
  if v_transfer.relationship_type='commercial' and new.supplier_id is null then
    select id into v_supplier_id from public.suppliers
    where boutique_id=new.boutique_id and linked_boutique_id=v_transfer.from_boutique_id
    order by id limit 1;
    new.supplier_id:=v_supplier_id;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_enrich_transfer_receipt_trace on public.stock_entries;
create trigger trg_enrich_transfer_receipt_trace
before insert on public.stock_entries
for each row execute function private.enrich_transfer_receipt_trace();

create or replace function private.enrich_transfer_charge_supplier()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_from_boutique_id text;
  v_supplier_id bigint;
begin
  if new.source<>'transfer' or new.transfer_id is null then return new; end if;
  select from_boutique_id into v_from_boutique_id from public.stock_transfers
  where id=new.transfer_id and to_boutique_id=new.boutique_id;
  if v_from_boutique_id is null then return new; end if;
  if new.supplier_id is null then
    select id into v_supplier_id from public.suppliers
    where boutique_id=new.boutique_id and linked_boutique_id=v_from_boutique_id
    order by id limit 1;
    new.supplier_id:=v_supplier_id;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_enrich_transfer_charge_supplier on public.charges;
create trigger trg_enrich_transfer_charge_supplier
before insert or update of transfer_id,source,supplier_id on public.charges
for each row execute function private.enrich_transfer_charge_supplier();

update public.stock_entries se
set reference='transfer:'||se.transfer_id::text
where se.transfer_id is not null and se.qty>0 and nullif(se.reference,'') is null;

update public.charges c
set supplier_id=s.id
from public.stock_transfers st
join public.suppliers s on s.boutique_id=st.to_boutique_id and s.linked_boutique_id=st.from_boutique_id
where c.source='transfer' and c.transfer_id=st.id and c.boutique_id=st.to_boutique_id and c.supplier_id is null;
