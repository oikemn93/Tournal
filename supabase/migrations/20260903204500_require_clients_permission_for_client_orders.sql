begin;

create or replace function public.create_sale(
  p_boutique_id text,
  p_idempotency_key uuid,
  p_client_nom text,
  p_client_tel text,
  p_lines jsonb,
  p_payment_method text default null,
  p_client_id bigint default null,
  p_origin text default 'pos',
  p_confirm_duplicate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_invoice_id text;
  v_numero bigint;
  v_total numeric := 0;
  v_line jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_billed_qty numeric;
  v_price numeric;
  v_sell_unit text;
  v_response jsonb;
  v_client public.clients%rowtype;
  v_client_matches integer := 0;
  v_payment_terms_days integer;
  v_due_date date;
  v_duplicate public.invoices%rowtype;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'vente') then
    raise exception 'forbidden';
  end if;
  if coalesce(p_origin, 'pos') not in ('pos', 'client_profile') then
    raise exception 'invalid order origin';
  end if;
  if coalesce(p_origin, 'pos') = 'client_profile'
     and not private.auth_has_permission(p_boutique_id, 'clients') then
    raise exception 'forbidden';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user and operation = 'create_sale' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if p_client_id is not null then
    select * into v_client
    from public.clients
    where boutique_id = p_boutique_id and id = p_client_id;
    if not found then raise exception 'client_not_found'; end if;
  elsif length(private.normalize_phone(p_client_tel)) >= 8 then
    select count(*) into v_client_matches
    from public.clients
    where boutique_id = p_boutique_id
      and private.normalize_phone(tel) = private.normalize_phone(p_client_tel);
    if v_client_matches = 1 then
      select * into v_client
      from public.clients
      where boutique_id = p_boutique_id
        and private.normalize_phone(tel) = private.normalize_phone(p_client_tel)
      limit 1;
    end if;
  end if;

  if v_client.id is not null and v_client.type = 'B2B' then
    select settings.client_payment_terms_days into v_payment_terms_days
    from public.auth_settings settings
    where settings.boutique_id = p_boutique_id;
    v_due_date := (now() at time zone 'Africa/Dakar')::date
      + coalesce(v_client.payment_terms_days, v_payment_terms_days, 30);
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    v_billed_qty := case when v_sell_unit is null then v_qty else coalesce((v_line->>'sellQty')::numeric, v_qty) end;
    select * into v_product
    from public.products
    where boutique_id = p_boutique_id and id = (v_line->>'productId')::bigint;
    if not found or v_qty <= 0 or v_billed_qty <= 0 then
      raise exception 'invalid sale line';
    end if;
    v_total := v_total + v_billed_qty * v_price;
  end loop;
  v_total := round(v_total, 2);

  if not coalesce(p_confirm_duplicate, true) and v_client.id is not null then
    for v_duplicate in
      select i.*
      from public.invoices i
      where i.boutique_id = p_boutique_id
        and i.client_id = v_client.id
        and i.operator_id = v_user
        and i.type = 'vente'
        and i.status in ('en_attente', 'acompte')
        and i.created_at >= now() - interval '30 minutes'
        and round(i.montant, 2) = v_total
      order by i.created_at desc, i.id desc
    loop
      if not exists (
        (
          select l.product_id, round(l.qty, 2), round(l.prix_unit, 2),
                 coalesce(l.sell_unit, ''), round(coalesce(l.sell_qty, 0), 2)
          from public.invoice_lines l
          where l.boutique_id = p_boutique_id and l.invoice_id = v_duplicate.id
          except all
          select (item->>'productId')::bigint,
                 round(coalesce((item->>'qty')::numeric, 0), 2),
                 round(coalesce((item->>'prixUnit')::numeric, 0), 2),
                 coalesce(nullif(trim(coalesce(item->>'sellUnit', '')), ''), ''),
                 round(case when nullif(trim(coalesce(item->>'sellUnit', '')), '') is null
                   then 0 else coalesce((item->>'sellQty')::numeric, (item->>'qty')::numeric) end, 2)
          from jsonb_array_elements(p_lines) item
        )
        union all
        (
          select (item->>'productId')::bigint,
                 round(coalesce((item->>'qty')::numeric, 0), 2),
                 round(coalesce((item->>'prixUnit')::numeric, 0), 2),
                 coalesce(nullif(trim(coalesce(item->>'sellUnit', '')), ''), ''),
                 round(case when nullif(trim(coalesce(item->>'sellUnit', '')), '') is null
                   then 0 else coalesce((item->>'sellQty')::numeric, (item->>'qty')::numeric) end, 2)
          from jsonb_array_elements(p_lines) item
          except all
          select l.product_id, round(l.qty, 2), round(l.prix_unit, 2),
                 coalesce(l.sell_unit, ''), round(coalesce(l.sell_qty, 0), 2)
          from public.invoice_lines l
          where l.boutique_id = p_boutique_id and l.invoice_id = v_duplicate.id
        )
      ) then
        return jsonb_build_object(
          'duplicate_invoice_id', v_duplicate.id,
          'duplicate_invoice_number', v_duplicate.numero,
          'duplicate_created_at', v_duplicate.created_at,
          'duplicate_total', v_duplicate.montant
        );
      end if;
    end loop;
  end if;

  v_numero := private.next_invoice_number(p_boutique_id);
  v_invoice_id := 'F' || to_char(now(), 'YYMMDD') || '-' || lpad(v_numero::text, 6, '0');
  insert into public.invoices(
    id, boutique_id, numero, client_id, client_nom, client_tel, montant, acompte,
    invoice_date, status, type, payment_method, operator_id, stock_deducted_at,
    due_date, origin
  ) values (
    v_invoice_id, p_boutique_id, v_numero,
    case when v_client.id is not null then v_client.id else null end,
    coalesce(v_client.nom, p_client_nom, 'Client comptoir'), coalesce(v_client.tel, p_client_tel),
    v_total, 0, now(), 'en_attente', 'vente', p_payment_method, v_user, null,
    v_due_date, coalesce(p_origin, 'pos')
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    insert into public.invoice_lines(
      boutique_id, invoice_id, product_id, nom, qty, unit, prix_unit, sell_unit, sell_qty
    ) values (
      p_boutique_id, v_invoice_id, (v_line->>'productId')::bigint,
      coalesce(v_line->>'nom', 'Article'), v_qty, v_line->>'unit', v_price, v_sell_unit,
      case when v_sell_unit is null then null else coalesce((v_line->>'sellQty')::numeric, v_qty) end
    );
  end loop;

  v_response := jsonb_build_object(
    'invoice_id', v_invoice_id, 'invoice_number', v_numero,
    'client_id', case when v_client.id is not null then v_client.id else null end,
    'total', v_total, 'stock_deducted', false, 'due_date', v_due_date
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'create_sale', p_idempotency_key, v_response);
  return v_response;
end;
$$;

create or replace function public.update_pending_sale(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid,
  p_client_id bigint,
  p_client_nom text,
  p_client_tel text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_invoice public.invoices%rowtype;
  v_client public.clients%rowtype;
  v_payment_terms_days integer;
  v_due_date date;
  v_line jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_billed_qty numeric;
  v_price numeric;
  v_sell_unit text;
  v_total numeric := 0;
  v_old_line_count integer := 0;
  v_new_line_count integer := 0;
  v_response jsonb;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'vente') then
    raise exception 'forbidden';
  end if;
  select response into v_existing from private.idempotency_keys
  where user_id = v_user and operation = 'update_pending_sale' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_invoice from public.invoices
  where boutique_id = p_boutique_id and id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if coalesce(v_invoice.origin, 'pos') = 'client_profile'
     and not private.auth_has_permission(p_boutique_id, 'clients') then
    raise exception 'forbidden';
  end if;
  if v_invoice.type <> 'vente' or v_invoice.status <> 'en_attente'
    or coalesce(v_invoice.acompte, 0) > 0.01 then
    raise exception 'only an unpaid pending sale can be modified';
  end if;
  if not (private.auth_is_super_admin() or private.auth_is_owner_of(p_boutique_id))
    and v_invoice.operator_id is distinct from v_user then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;

  if p_client_id is not null then
    select * into v_client from public.clients where boutique_id = p_boutique_id and id = p_client_id;
    if not found then raise exception 'client_not_found'; end if;
  end if;
  if v_client.id is not null and v_client.type = 'B2B' then
    select settings.client_payment_terms_days into v_payment_terms_days
    from public.auth_settings settings where settings.boutique_id = p_boutique_id;
    v_due_date := (now() at time zone 'Africa/Dakar')::date + coalesce(v_client.payment_terms_days, v_payment_terms_days, 30);
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    v_billed_qty := case when v_sell_unit is null then v_qty else coalesce((v_line->>'sellQty')::numeric, v_qty) end;
    select * into v_product from public.products where boutique_id = p_boutique_id and id = (v_line->>'productId')::bigint;
    if not found or v_qty <= 0 or v_billed_qty <= 0 then raise exception 'invalid sale line'; end if;
    v_total := v_total + v_billed_qty * v_price;
    v_new_line_count := v_new_line_count + 1;
  end loop;
  v_total := round(v_total, 2);
  select count(*) into v_old_line_count from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;

  if v_invoice.stock_deducted_at is not null then
    perform private.release_pending_committed_stock(p_boutique_id,p_invoice_id,v_user,'Modification commande');
  end if;
  delete from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    insert into public.invoice_lines(boutique_id, invoice_id, product_id, nom, qty, unit, prix_unit, sell_unit, sell_qty)
    values (p_boutique_id, p_invoice_id, (v_line->>'productId')::bigint, coalesce(v_line->>'nom', 'Article'), v_qty, v_line->>'unit', v_price, v_sell_unit, case when v_sell_unit is null then null else coalesce((v_line->>'sellQty')::numeric, v_qty) end);
  end loop;

  update public.invoices set
    client_id = case when v_client.id is not null then v_client.id else null end,
    client_nom = coalesce(v_client.nom, p_client_nom, 'Client comptoir'),
    client_tel = coalesce(v_client.tel, p_client_tel),
    montant = v_total,
    due_date = v_due_date,
    updated_at = now()
  where boutique_id = p_boutique_id and id = p_invoice_id;

  insert into public.audit_log(boutique_id, user_id, action, detail, icon, source)
  values (p_boutique_id, v_user, 'Commande modifiée',
    p_invoice_id || ' · client ' || coalesce(v_invoice.client_nom, 'Client comptoir') || ' → ' || coalesce(v_client.nom, p_client_nom, 'Client comptoir') ||
    ' · total ' || round(v_invoice.montant, 2)::text || ' → ' || v_total::text ||
    ' · lignes ' || v_old_line_count::text || ' → ' || v_new_line_count::text,
    '✏️', 'native');

  v_response := jsonb_build_object('invoice_id', p_invoice_id, 'client_id', case when v_client.id is not null then v_client.id else null end, 'total', v_total, 'due_date', v_due_date, 'updated_at', now());
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'update_pending_sale', p_idempotency_key, v_response)
  on conflict (user_id, operation, key) do nothing;
  return v_response;
end;
$$;

revoke all on function public.create_sale(text,uuid,text,text,jsonb,text,bigint,text,boolean) from public, anon;
grant execute on function public.create_sale(text,uuid,text,text,jsonb,text,bigint,text,boolean) to authenticated;
revoke all on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) from public, anon;
grant execute on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) to authenticated;

commit;
