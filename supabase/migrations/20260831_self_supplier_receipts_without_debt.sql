create or replace function public.record_stock_movement(p_boutique_id text, p_product_id bigint, p_idempotency_key uuid, p_qty numeric, p_type text, p_prix_unit numeric, p_note text, p_supplier_id bigint, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_product public.products%rowtype;
  v_supplier public.suppliers%rowtype;
  v_entry_id bigint;
  v_charge_id bigint;
  v_due_date date;
  v_terms_days integer;
  v_response jsonb;
  v_is_self_supplier boolean := false;
begin
  if v_user is null or not (
    case when p_type = 'inventaire'
      then private.auth_has_permission(p_boutique_id, 'inventaire')
      else private.auth_has_permission(p_boutique_id, 'stock')
    end
  ) then
    raise exception 'forbidden';
  end if;

  if p_qty = 0 or p_type not in ('achat', 'ajustement', 'retour', 'inventaire') then
    raise exception 'invalid movement';
  end if;
  if coalesce(p_prix_unit, 0) < 0 then
    raise exception 'invalid unit price';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user and operation = 'stock_movement' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if p_type = 'achat' and p_qty > 0 and p_supplier_id is null then
    raise exception 'supplier required';
  end if;

  if p_supplier_id is not null then
    if p_type not in ('achat', 'ajustement') then
      raise exception 'supplier is only valid for supplier receipts or corrections';
    end if;
    select * into v_supplier
    from public.suppliers
    where boutique_id = p_boutique_id and id = p_supplier_id;
    if not found then raise exception 'supplier not found'; end if;
    v_is_self_supplier := v_supplier.linked_boutique_id = p_boutique_id;
  end if;

  select * into v_product
  from public.products
  where boutique_id = p_boutique_id and id = p_product_id
  for update;
  if not found or v_product.stock + p_qty < 0 then raise exception 'invalid stock'; end if;

  update public.products
  set stock = stock + p_qty, updated_at = now()
  where boutique_id = p_boutique_id and id = p_product_id;

  v_entry_id := nextval('private.stock_entry_id_seq');
  insert into public.stock_entries (
    id, boutique_id, product_id, type, qty, prix_unit, entry_date,
    operator_id, note, supplier_id, reference
  ) values (
    v_entry_id, p_boutique_id, p_product_id, p_type, p_qty,
    coalesce(p_prix_unit, 0), now(), v_user,
    coalesce(nullif(trim(p_note), ''), v_supplier.nom), p_supplier_id,
    nullif(trim(p_reference), '')
  );

  if p_supplier_id is not null and p_type = 'achat' and p_qty > 0 and not v_is_self_supplier then
    select coalesce(settings.supplier_payment_terms_days, 30)
      into v_terms_days
    from public.auth_settings settings
    where settings.boutique_id = p_boutique_id;
    v_terms_days := coalesce(v_supplier.payment_terms_days, v_terms_days, 30);
    v_due_date := (now() at time zone 'Africa/Dakar')::date + v_terms_days;
    v_charge_id := nextval('private.charge_id_seq');

    insert into public.charges (
      id, boutique_id, label, montant, categorie, charge_date, operator_id,
      note, fournisseur, supplier_id, status, paid_amount, source,
      stock_entry_id, due_date
    ) values (
      v_charge_id, p_boutique_id, 'Réception stock · ' || v_supplier.nom,
      p_qty * coalesce(p_prix_unit, 0), 'Achat stock', now(), v_user,
      nullif(trim(p_note), ''), v_supplier.nom, p_supplier_id,
      'pending', 0, 'supplier_receipt', v_entry_id, v_due_date
    );
  end if;

  if p_supplier_id is not null and p_type = 'achat' and p_qty > 0 then
    update public.suppliers
    set last_delivery_at = now(), updated_at = now()
    where boutique_id = p_boutique_id and id = p_supplier_id;
  end if;

  v_response := jsonb_build_object(
    'entry_id', v_entry_id,
    'product_id', p_product_id,
    'stock', v_product.stock + p_qty,
    'supplier_id', p_supplier_id,
    'charge_id', v_charge_id,
    'due_date', v_due_date
  );
  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'stock_movement', p_idempotency_key, v_response);
  return v_response;
end;
$function$;
