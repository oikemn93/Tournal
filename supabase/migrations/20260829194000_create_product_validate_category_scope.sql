create or replace function public.create_product(p_boutique_id text, p_idempotency_key uuid, p_nom text, p_unit text, p_category_id text default null::text, p_prix_achat numeric default 0, p_prix_vente numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := auth.uid();
  v_id bigint;
  v_response jsonb;
  v_category_id text;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id,'stock') then
    raise exception 'forbidden';
  end if;
  if nullif(trim(p_nom),'') is null then
    raise exception 'name required';
  end if;

  select response into v_response
  from private.idempotency_keys
  where user_id=v_user and operation='create_product' and key=p_idempotency_key;
  if v_response is not null then return v_response; end if;

  if p_category_id is not null then
    select c.id into v_category_id
    from public.categories c
    where c.id=p_category_id and c.boutique_id=p_boutique_id;
  end if;

  v_id := nextval('private.product_id_seq');
  insert into public.products(id,boutique_id,nom,category_id,unit,prix_achat,prix_vente,stock)
  values(v_id,p_boutique_id,trim(p_nom),v_category_id,coalesce(nullif(trim(p_unit),''),'unité'),coalesce(p_prix_achat,0),coalesce(p_prix_vente,0),0);

  v_response := jsonb_build_object('product_id',v_id);
  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'create_product',p_idempotency_key,v_response);
  return v_response;
end
$function$;
