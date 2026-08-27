-- A confirmed duplicate order must be stopped before it reaches payments.  The
-- same idempotency key still returns the original order; a distinct deliberate
-- request for the exact same client cart requires an explicit confirmation.
begin;

drop function if exists public.create_sale(text, uuid, text, text, jsonb, text, bigint, text);

create function public.create_sale(
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
set search_path = 'pg_catalog', 'public', 'private'
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

  -- Compatibility default is true for an older browser tab.  New clients send
  -- false first and receive the candidate details below instead of creating it.
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

revoke all on function public.create_sale(text, uuid, text, text, jsonb, text, bigint, text, boolean) from public, anon;
grant execute on function public.create_sale(text, uuid, text, text, jsonb, text, bigint, text, boolean) to authenticated;

-- Confirmed data repair for Awa Diop.  F260827-001113 is the cancelled
-- duplicate.  The two real cash payments (400 000 F) remain immutable:
-- 102 580 F settles F260827-001115 through a client credit and 148 710 F
-- remains available as a documented client advance.  The five evidenced stock
-- movements of the duplicate are counter-posted, product by product.
do $$
declare
  v_boutique_id constant text := 'b1785182214663';
  v_duplicate_id constant text := 'F260827-001113';
  v_valid_id constant text := 'F260827-001115';
  v_client_id constant bigint := 1786477678202;
  v_duplicate public.invoices%rowtype;
  v_valid public.invoices%rowtype;
  v_operator_id uuid;
  v_operator_name text;
  v_duplicate_paid numeric;
  v_duplicate_payment_count integer;
  v_valid_paid numeric;
  v_primary_advance_id bigint;
  v_payment public.invoice_payments%rowtype;
  v_advance_id bigint;
  v_advance_key uuid;
  v_stock_entry public.stock_entries%rowtype;
  v_stock_entry_count integer;
  v_allocation_key constant uuid := md5('repair:awa-diop:f260827-001113:allocation')::uuid;
  v_batch_key constant uuid := md5('repair:awa-diop:f260827-001113:invoice-payment')::uuid;
begin
  select * into v_duplicate
  from public.invoices
  where boutique_id = v_boutique_id and id = v_duplicate_id
  for update;
  if not found then raise exception 'repair target % not found', v_duplicate_id; end if;

  select * into v_valid
  from public.invoices
  where boutique_id = v_boutique_id and id = v_valid_id
  for update;
  if not found then raise exception 'repair target % not found', v_valid_id; end if;

  if v_duplicate.status = 'annulée' then
    return;
  end if;
  if v_duplicate.boutique_id <> v_boutique_id or v_valid.boutique_id <> v_boutique_id
    or v_duplicate.client_id is distinct from v_client_id or v_valid.client_id is distinct from v_client_id
    or round(v_duplicate.montant, 2) <> 251290 or round(v_valid.montant, 2) <> 251290
    or round(v_duplicate.acompte, 2) <> 251290 or round(v_valid.acompte, 2) <> 148710 then
    raise exception 'repair precondition failed for Awa Diop invoices';
  end if;

  if exists (
    (
      select product_id, round(qty, 2), round(prix_unit, 2), coalesce(sell_unit, ''), round(coalesce(sell_qty, 0), 2)
      from public.invoice_lines where boutique_id = v_boutique_id and invoice_id = v_duplicate_id
      except all
      select product_id, round(qty, 2), round(prix_unit, 2), coalesce(sell_unit, ''), round(coalesce(sell_qty, 0), 2)
      from public.invoice_lines where boutique_id = v_boutique_id and invoice_id = v_valid_id
    ) union all (
      select product_id, round(qty, 2), round(prix_unit, 2), coalesce(sell_unit, ''), round(coalesce(sell_qty, 0), 2)
      from public.invoice_lines where boutique_id = v_boutique_id and invoice_id = v_valid_id
      except all
      select product_id, round(qty, 2), round(prix_unit, 2), coalesce(sell_unit, ''), round(coalesce(sell_qty, 0), 2)
      from public.invoice_lines where boutique_id = v_boutique_id and invoice_id = v_duplicate_id
    )
  ) then
    raise exception 'repair precondition failed: invoice lines differ';
  end if;

  select coalesce(sum(amount), 0), count(*)
  into v_duplicate_paid, v_duplicate_payment_count
  from public.invoice_payments
  where boutique_id = v_boutique_id and invoice_id = v_duplicate_id;
  select operator_id, operator_name
  into v_operator_id, v_operator_name
  from public.invoice_payments
  where boutique_id = v_boutique_id and invoice_id = v_duplicate_id
  order by paid_at, id
  limit 1;
  select coalesce(sum(amount), 0) into v_valid_paid
  from public.invoice_payments
  where boutique_id = v_boutique_id and invoice_id = v_valid_id;
  if round(v_duplicate_paid, 2) <> 251290 or v_duplicate_payment_count <> 2
    or round(v_valid_paid, 2) <> 148710
    or v_operator_id is null or v_operator_name is null then
    raise exception 'repair precondition failed: payment history differs';
  end if;

  select count(*) into v_stock_entry_count
  from public.stock_entries
  where boutique_id = v_boutique_id and note = 'Vente ' || v_duplicate_id;
  if v_stock_entry_count <> 5 then
    raise exception 'repair precondition failed: expected 5 source stock movements, found %', v_stock_entry_count;
  end if;

  -- Keep the two original cash receipt timestamps instead of inventing one
  -- combined payment date.  The 102580 F credit application comes from the
  -- first (200000 F) reclassified receipt.
  for v_payment in
    select * from public.invoice_payments
    where boutique_id = v_boutique_id and invoice_id = v_duplicate_id
    order by paid_at, id
  loop
    v_advance_key := md5('repair:awa-diop:' || v_payment.id::text || ':advance')::uuid;
    v_advance_id := null;
    insert into public.client_advances(
      boutique_id, client_id, amount, payment_method, paid_at, operator_id,
      operator_name, idempotency_key, note
    ) values (
      v_boutique_id, v_client_id, v_payment.amount, v_payment.payment_method,
      v_payment.paid_at, v_payment.operator_id, v_payment.operator_name, v_advance_key,
      'Reclassement traçable du règlement de la commande annulée ' || v_duplicate_id
    ) on conflict (boutique_id, operator_id, idempotency_key) do nothing
    returning id into v_advance_id;
    if v_advance_id is null then
      select id into v_advance_id
      from public.client_advances
      where boutique_id = v_boutique_id
        and operator_id = v_payment.operator_id
        and idempotency_key = v_advance_key;
    end if;
    if round(v_payment.amount, 2) = 200000 then
      v_primary_advance_id := v_advance_id;
    end if;
  end loop;
  if v_primary_advance_id is null then
    raise exception 'repair precondition failed: missing 200000 F source payment';
  end if;

  insert into private.client_advance_allocations(
    boutique_id, client_advance_id, client_id, invoice_id, amount,
    operator_id, operator_name, idempotency_key
  ) values (
    v_boutique_id, v_primary_advance_id, v_client_id, v_valid_id, 102580,
    v_operator_id, v_operator_name, v_allocation_key
  ) on conflict (boutique_id, invoice_id, client_advance_id, idempotency_key) do nothing;

  update public.client_advances
  set allocated_amount = 102580
  where id = v_primary_advance_id and boutique_id = v_boutique_id and allocated_amount = 0;
  if not found then raise exception 'repair precondition failed: advance already allocated'; end if;

  insert into public.invoice_payments(
    boutique_id, invoice_id, amount, payment_method, paid_at, operator_id,
    operator_name, batch_id, source
  ) values (
    v_boutique_id, v_valid_id, 102580, 'Avoir client', now(), v_operator_id,
    v_operator_name, v_batch_key, 'client_advance'
  );

  update public.invoices
  set acompte = 251290, status = 'payée', updated_at = now()
  where boutique_id = v_boutique_id and id = v_valid_id;

  update public.invoices
  set status = 'annulée',
      cancel_reason = 'Doublon confirmé : la facture ' || v_valid_id || ' est la vente conservée',
      cancelled_at = now(),
      cancelled_by = v_operator_id,
      updated_at = now()
  where boutique_id = v_boutique_id and id = v_duplicate_id;

  for v_stock_entry in
    select * from public.stock_entries
    where boutique_id = v_boutique_id and note = 'Vente ' || v_duplicate_id
    order by id
  loop
    update public.products
    set stock = stock - v_stock_entry.qty
    where boutique_id = v_boutique_id and id = v_stock_entry.product_id;
    if not found then
      raise exception 'repair precondition failed: stock product % missing', v_stock_entry.product_id;
    end if;
    insert into public.stock_entries(
      id, boutique_id, product_id, type, qty, prix_unit, entry_date,
      operator_id, note, reference
    ) values (
      nextval('private.stock_entry_id_seq'), v_boutique_id, v_stock_entry.product_id,
      'ajustement', -v_stock_entry.qty, v_stock_entry.prix_unit, now(),
      v_operator_id, 'Annulation doublon ' || v_duplicate_id || ' : restitution stock',
      v_duplicate_id
    );
  end loop;

  insert into public.audit_log(boutique_id, user_id, action, detail, icon, source) values
    (v_boutique_id, v_operator_id, 'Commande annulée',
      v_duplicate_id || ' · doublon confirmé de ' || v_valid_id || ' · aucune suppression physique', '🗑️', 'native'),
    (v_boutique_id, v_operator_id, 'Règlement reclassé',
      'Awa Diop · 102580 F affectés à ' || v_valid_id || ' · avoir restant 148710 F', '💳', 'native'),
    (v_boutique_id, v_operator_id, 'Stock restitué',
      v_duplicate_id || ' · 5 sorties de stock contrepassées sur la vente doublon', '📦', 'native');
end;
$$;

commit;
