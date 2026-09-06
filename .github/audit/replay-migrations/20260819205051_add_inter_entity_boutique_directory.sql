alter table public.boutiques add column if not exists directory_visible boolean not null default true;

create table if not exists public.boutique_partners (
  boutique_id text not null references public.boutiques(id) on delete cascade,
  partner_boutique_id text not null references public.boutiques(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (boutique_id, partner_boutique_id),
  check (boutique_id <> partner_boutique_id)
);

alter table public.boutique_partners enable row level security;
revoke all on public.boutique_partners from anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='boutique_partners' and policyname='partners_read_authorized'
  ) then
    create policy partners_read_authorized on public.boutique_partners for select to authenticated
    using (private.auth_has_write_access(boutique_id));
  end if;
end $$;

insert into public.boutique_partners(boutique_id, partner_boutique_id, created_by)
select distinct st.from_boutique_id, st.to_boutique_id, st.created_by
from public.stock_transfers st
where st.from_boutique_id <> st.to_boutique_id
on conflict do nothing;

insert into public.boutique_partners(boutique_id, partner_boutique_id, created_by)
select distinct st.to_boutique_id, st.from_boutique_id, st.created_by
from public.stock_transfers st
where st.from_boutique_id <> st.to_boutique_id
on conflict do nothing;

create or replace function public.search_boutique_directory(
  p_source_boutique_id text,
  p_query text default null
)
returns table(
  boutique_id text,
  nom text,
  ville text,
  tel text,
  is_partner boolean,
  transfer_count bigint
)
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare
  v_user uuid := auth.uid();
  v_q text := regexp_replace(lower(coalesce(p_query,'')), '\s+', '', 'g');
begin
  if v_user is null or not private.auth_has_write_access(p_source_boutique_id) then
    raise exception 'forbidden';
  end if;

  return query
  select
    b.id,
    b.nom,
    coalesce(b.ville,''),
    coalesce(b.tel,''),
    exists(
      select 1 from public.boutique_partners bp
      where bp.boutique_id = p_source_boutique_id
        and bp.partner_boutique_id = b.id
    ) as is_partner,
    (
      select count(*)
      from public.stock_transfers st
      where (st.from_boutique_id = p_source_boutique_id and st.to_boutique_id = b.id)
         or (st.to_boutique_id = p_source_boutique_id and st.from_boutique_id = b.id)
    ) as transfer_count
  from public.boutiques b
  where b.id <> p_source_boutique_id
    and b.directory_visible = true
    and (
      v_q = ''
      or regexp_replace(lower(coalesce(b.nom,'')), '\s+', '', 'g') like '%'||v_q||'%'
      or regexp_replace(lower(coalesce(b.ville,'')), '\s+', '', 'g') like '%'||v_q||'%'
      or regexp_replace(lower(coalesce(b.tel,'')), '[^0-9+]', '', 'g') like '%'||regexp_replace(v_q, '[^0-9+]', '', 'g')||'%'
    )
  order by is_partner desc, transfer_count desc, b.nom asc
  limit 50;
end;
$$;

create or replace function public.get_boutique_partners(p_boutique_id text)
returns table(
  boutique_id text,
  nom text,
  ville text,
  tel text,
  transfer_count bigint
)
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then
    raise exception 'forbidden';
  end if;
  return query
  select b.id, b.nom, coalesce(b.ville,''), coalesce(b.tel,''),
    (select count(*) from public.stock_transfers st
      where (st.from_boutique_id=p_boutique_id and st.to_boutique_id=b.id)
         or (st.to_boutique_id=p_boutique_id and st.from_boutique_id=b.id))
  from public.boutique_partners bp
  join public.boutiques b on b.id=bp.partner_boutique_id
  where bp.boutique_id=p_boutique_id
  order by 5 desc, b.nom asc;
end;
$$;

create or replace function public.add_boutique_partner(p_boutique_id text, p_partner_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare v_user uuid := auth.uid(); v_partner public.boutiques%rowtype;
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then raise exception 'forbidden'; end if;
  if p_boutique_id=p_partner_boutique_id then raise exception 'invalid partner'; end if;
  select * into v_partner from public.boutiques where id=p_partner_boutique_id and directory_visible=true;
  if not found then raise exception 'partner not found'; end if;
  insert into public.boutique_partners(boutique_id,partner_boutique_id,created_by)
  values(p_boutique_id,p_partner_boutique_id,v_user)
  on conflict do nothing;
  return jsonb_build_object('boutique_id',p_partner_boutique_id,'nom',v_partner.nom,'ville',v_partner.ville,'tel',v_partner.tel);
end;
$$;

create or replace function public.remove_boutique_partner(p_boutique_id text, p_partner_boutique_id text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public','private'
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then raise exception 'forbidden'; end if;
  delete from public.boutique_partners where boutique_id=p_boutique_id and partner_boutique_id=p_partner_boutique_id;
  return jsonb_build_object('removed',true,'boutique_id',p_partner_boutique_id);
end;
$$;

revoke execute on function public.search_boutique_directory(text,text) from public, anon;
revoke execute on function public.get_boutique_partners(text) from public, anon;
revoke execute on function public.add_boutique_partner(text,text) from public, anon;
revoke execute on function public.remove_boutique_partner(text,text) from public, anon;
grant execute on function public.search_boutique_directory(text,text) to authenticated;
grant execute on function public.get_boutique_partners(text) to authenticated;
grant execute on function public.add_boutique_partner(text,text) to authenticated;
grant execute on function public.remove_boutique_partner(text,text) to authenticated;

create or replace function public.create_stock_transfer(p_from_boutique_id text, p_to_boutique_id text, p_idempotency_key uuid, p_lines jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
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

  if v_relationship='commercial' and not exists(
    select 1 from public.boutique_partners bp
    where bp.boutique_id=p_from_boutique_id and bp.partner_boutique_id=p_to_boutique_id
  ) then
    raise exception 'destination must be added to directory partners first';
  end if;

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
end;
$$;
