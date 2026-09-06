-- AUDIT ONLY: exact current production pg_get_functiondef; schema-only, no data.

CREATE OR REPLACE FUNCTION public.reset_user_quick_pin(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_target_is_owner boolean := false;
  v_authorized boolean := false;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if p_user_id is null then raise exception 'Utilisateur requis'; end if;

  select coalesce(u.is_super_admin,false) and not coalesce(u.is_suspended,false)
    into v_is_super
  from public.platform_users u where u.id = v_uid;

  select exists(
    select 1 from public.boutique_assignments a
    where a.user_id = p_user_id and a.role = 'owner'
  ) into v_target_is_owner;

  if v_is_super then
    v_authorized := true;
  elsif not v_target_is_owner then
    select exists(
      select 1
      from public.boutique_assignments target_a
      join public.boutique_assignments caller_a
        on caller_a.boutique_id = target_a.boutique_id
       and caller_a.user_id = v_uid
       and caller_a.role = 'owner'
      where target_a.user_id = p_user_id
    ) into v_authorized;
  end if;

  if not v_authorized then raise exception 'Accès refusé'; end if;
  delete from private.user_pins where user_id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_inventory_count(p_session_id uuid, p_product_id bigint, p_counted_qty numeric, p_counting_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_boutique text; v_status text;
begin
  select boutique_id,status into v_boutique,v_status from public.inventory_sessions where id=p_session_id for update;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_boutique,'inventaire') then raise exception 'forbidden'; end if;
  if v_status<>'draft' then raise exception 'inventory session is closed'; end if;
  if p_counted_qty is null or p_counted_qty<0 then raise exception 'invalid counted quantity'; end if;

  update public.inventory_lines
  set counted_qty=p_counted_qty,
      counting_detail=coalesce(p_counting_detail,'{}'::jsonb),
      updated_at=now()
  where session_id=p_session_id and product_id=p_product_id;
  if not found then raise exception 'inventory product not found'; end if;
  update public.inventory_sessions set updated_at=now() where id=p_session_id;
  return public.get_inventory_session(p_session_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_quick_pin(p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Connexion requise';
  end if;
  if p_pin is null or p_pin !~ '^\d{6}$' then
    raise exception 'Le PIN doit contenir exactement 6 chiffres';
  end if;
  if not exists (
    select 1 from public.platform_users u
    where u.id = v_uid
      and coalesce(u.is_suspended,false) = false
      and coalesce(u.must_change_password,false) = false
  ) then
    raise exception 'Compte non prêt pour la configuration du PIN';
  end if;

  insert into private.user_pins(user_id,pin_hash,failed_attempts,locked_until,updated_at)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), 0, null, now())
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.snapshot_invoice_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
  b public.boutiques%rowtype;
  op_name text;
begin
  if new.client_id is not null then
    select * into c
    from public.clients
    where boutique_id = new.boutique_id and id = new.client_id;

    if found then
      new.client_nom := coalesce(c.nom, new.client_nom);
      new.client_tel := coalesce(c.tel, new.client_tel);
      new.client_email_snapshot := c.email;
      new.client_adresse_snapshot := c.adresse;
      new.client_ville_snapshot := c.ville;
      new.client_type_snapshot := c.type;
    end if;
  end if;

  select * into b from public.boutiques where id = new.boutique_id;
  if found then
    new.boutique_nom_snapshot := b.nom;
    new.boutique_ville_snapshot := b.ville;
    new.boutique_adresse_snapshot := b.adresse;
    new.boutique_tel_snapshot := b.tel;
    new.boutique_email_snapshot := b.email;
    -- Deliberately do not duplicate the base64 logo in every invoice.
    -- The PDF renderer already uses public.boutiques.logo_url.
    new.boutique_logo_snapshot := null;
  end if;

  if new.operator_id is not null then
    select nom into op_name from public.platform_users where id = new.operator_id;
    new.operator_nom_snapshot := op_name;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text DEFAULT NULL::text, p_as_of_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_id uuid:=gen_random_uuid(); v_label text; v_count integer; v_asof timestamptz:=least(coalesce(p_as_of_at,now()),now()); begin
 if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if; if p_scope_type not in ('all','category','product') then raise exception 'invalid inventory scope'; end if;
 if p_scope_type='all' then v_label:='Tous les produits'; elsif p_scope_type='category' then select nom into v_label from public.categories where boutique_id=p_boutique_id and id=p_scope_id; if not found then raise exception 'category not found'; end if; else select nom into v_label from public.products where boutique_id=p_boutique_id and id=p_scope_id::bigint; if not found then raise exception 'product not found'; end if; end if;
 insert into public.inventory_sessions(id,boutique_id,scope_type,scope_id,scope_label,operator_id,as_of_at) values(v_id,p_boutique_id,p_scope_type,p_scope_id,v_label,auth.uid(),v_asof);
 insert into public.inventory_lines(session_id,product_id,product_name,category_name,unit,theoretical_qty,purchase_price,sale_price,pieces_per_lot,length_per_piece,fifo_theoretical_cost,fifo_unit_cost)
 select v_id,p.id,p.nom,c.nom,p.unit,coalesce((select sum(se.qty) from public.stock_entries se where se.boutique_id=p_boutique_id and se.product_id=p.id and se.entry_date<=v_asof),0),coalesce(p.prix_achat,0),coalesce(p.prix_vente,0),coalesce(p.pieces_per_lot,c.pieces_per_lot,0),coalesce(p.length_per_piece,c.length_per_piece,0),private.fifo_stock_value(p_boutique_id,p.id,v_asof,null),case when coalesce((select sum(se.qty) from public.stock_entries se where se.boutique_id=p_boutique_id and se.product_id=p.id and se.entry_date<=v_asof),0)>0 then private.fifo_stock_value(p_boutique_id,p.id,v_asof,null)/coalesce((select sum(se.qty) from public.stock_entries se where se.boutique_id=p_boutique_id and se.product_id=p.id and se.entry_date<=v_asof),0) else 0 end
 from public.products p left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id where p.boutique_id=p_boutique_id and (coalesce(p.actif,true) or coalesce(p.stock,0)<>0) and case p_scope_type when 'all' then true when 'category' then p.category_id=p_scope_id when 'product' then p.id=p_scope_id::bigint else false end order by c.nom nulls last,p.nom;
 get diagnostics v_count=row_count; if v_count=0 then raise exception 'no product in inventory scope'; end if; return public.get_inventory_session(v_id); end $function$
;

CREATE OR REPLACE FUNCTION public.sync_push_subscription_context(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_sid uuid:=nullif(auth.jwt() ->> 'session_id','')::uuid;
  v_boutique text;
begin
  if v_uid is null or v_sid is null then raise exception 'Connexion requise'; end if;
  select c.boutique_id into v_boutique
  from private.notification_session_context c
  where c.session_id=v_sid and c.user_id=v_uid;
  if v_boutique is null or not private.auth_has_boutique_access(v_boutique) then raise exception 'Boutique active requise'; end if;
  update public.push_subscriptions
  set boutique_id=v_boutique,enabled=true,last_seen_at=now()
  where endpoint=p_endpoint and user_id=v_uid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_client_profile(p_boutique_id text, p_client_id bigint, p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_contact text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_client public.clients%rowtype;
  v_phone text := nullif(trim(coalesce(p_phone,'')), '');
begin
  if auth.uid() is null or not private.auth_has_permission(p_boutique_id,'clients') then
    raise exception 'forbidden';
  end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    raise exception 'client name required';
  end if;

  if v_phone is not null and exists (
    select 1 from public.clients c
    where c.boutique_id=p_boutique_id
      and c.id<>p_client_id
      and regexp_replace(coalesce(c.tel,''),'\D','','g')=regexp_replace(v_phone,'\D','','g')
      and length(regexp_replace(v_phone,'\D','','g'))>=8
  ) then
    raise exception 'client_phone_exists';
  end if;

  update public.clients
  set nom=trim(p_name),
      tel=v_phone,
      email=nullif(trim(coalesce(p_email,'')),''),
      ville=nullif(trim(coalesce(p_city,'')),''),
      adresse=nullif(trim(coalesce(p_address,'')),''),
      contact=nullif(trim(coalesce(p_contact,'')),''),
      updated_at=now()
  where boutique_id=p_boutique_id and id=p_client_id
  returning * into v_client;

  if not found then raise exception 'client not found'; end if;

  return jsonb_build_object(
    'client_id',v_client.id,
    'name',v_client.nom,
    'phone',v_client.tel,
    'email',v_client.email,
    'city',v_client.ville,
    'address',v_client.adresse,
    'contact',v_client.contact
  );
end;
$function$
;
