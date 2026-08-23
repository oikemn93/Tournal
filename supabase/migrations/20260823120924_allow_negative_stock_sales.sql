-- Sales remain allowed when the recorded quantity is behind physical reality.
-- The product row update itself still serializes concurrent deductions; only
-- the artificial non-negative guard is removed. No CHECK constraint is added.

create or replace function public.create_sale(
  p_boutique_id text,
  p_idempotency_key uuid,
  p_client_nom text,
  p_client_tel text,
  p_lines jsonb,
  p_payment_method text default null,
  p_client_id bigint default null
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
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'vente') then
    raise exception 'forbidden';
  end if;

  select response into v_existing from private.idempotency_keys
  where user_id = v_user and operation = 'create_sale' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if p_client_id is not null then
    select * into v_client from public.clients where boutique_id = p_boutique_id and id = p_client_id;
    if not found then raise exception 'client_not_found'; end if;
  elsif length(private.normalize_phone(p_client_tel)) >= 8 then
    select count(*) into v_client_matches from public.clients
    where boutique_id = p_boutique_id and private.normalize_phone(tel) = private.normalize_phone(p_client_tel);
    if v_client_matches = 1 then
      select * into v_client from public.clients
      where boutique_id = p_boutique_id and private.normalize_phone(tel) = private.normalize_phone(p_client_tel) limit 1;
    end if;
  end if;

  if v_client.id is not null and v_client.type = 'B2B' then
    select settings.client_payment_terms_days into v_payment_terms_days
    from public.auth_settings settings where settings.boutique_id = p_boutique_id;
    v_due_date := (now() at time zone 'Africa/Dakar')::date + coalesce(v_client.payment_terms_days, v_payment_terms_days, 30);
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    v_billed_qty := case when v_sell_unit is null then v_qty else coalesce((v_line->>'sellQty')::numeric, v_qty) end;
    select * into v_product from public.products where boutique_id = p_boutique_id and id = (v_line->>'productId')::bigint;
    -- Deliberately no `v_product.stock < v_qty` test: the inventory may be
    -- late, but a verified sale must not be blocked by that data discrepancy.
    if not found or v_qty <= 0 or v_billed_qty <= 0 then raise exception 'invalid sale line'; end if;
    v_total := v_total + v_billed_qty * v_price;
  end loop;

  v_numero := private.next_invoice_number(p_boutique_id);
  v_invoice_id := 'F' || to_char(now(), 'YYMMDD') || '-' || lpad(v_numero::text, 6, '0');
  insert into public.invoices(id, boutique_id, numero, client_id, client_nom, client_tel, montant, acompte, invoice_date, status, type, payment_method, operator_id, stock_deducted_at, due_date)
  values (v_invoice_id, p_boutique_id, v_numero, case when v_client.id is not null then v_client.id else null end, coalesce(v_client.nom, p_client_nom, 'Client comptoir'), coalesce(v_client.tel, p_client_tel), v_total, 0, now(), 'en_attente', 'vente', p_payment_method, v_user, null, v_due_date);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    insert into public.invoice_lines(boutique_id, invoice_id, product_id, nom, qty, unit, prix_unit, sell_unit, sell_qty)
    values (p_boutique_id, v_invoice_id, (v_line->>'productId')::bigint, coalesce(v_line->>'nom', 'Article'), v_qty, v_line->>'unit', v_price, v_sell_unit, case when v_sell_unit is null then null else coalesce((v_line->>'sellQty')::numeric, v_qty) end);
  end loop;

  v_response := jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_numero, 'client_id', case when v_client.id is not null then v_client.id else null end, 'total', v_total, 'stock_deducted', false, 'due_date', v_due_date);
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'create_sale', p_idempotency_key, v_response);
  return v_response;
end;
$$;

create or replace function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid(); v_operator_name text; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype;
  v_response jsonb; v_applied numeric; v_new numeric; v_paid_at timestamptz := now(); v_payment_id bigint; v_stock_deducted boolean := false;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select response into v_response from private.idempotency_keys where user_id = v_user and operation = 'record_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  select * into v_invoice from public.invoices where boutique_id = p_boutique_id and id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type, '')) = 'retour' then raise exception 'cannot collect payment on a return'; end if;
  v_applied := least(p_amount, greatest(0, v_invoice.montant - v_invoice.acompte));
  if v_applied <= 0 then raise exception 'invoice already paid'; end if;

  if v_invoice.stock_deducted_at is null then
    for v_sale_line in select * from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id order by product_id, id loop
      update public.products set stock = stock - v_sale_line.qty where boutique_id = p_boutique_id and id = v_sale_line.product_id;
      if not found then raise exception 'product not found for invoice line %', v_sale_line.product_id; end if;
      insert into public.stock_entries(id, boutique_id, product_id, type, qty, prix_unit, entry_date, operator_id, note)
      values (nextval('private.stock_entry_id_seq'), p_boutique_id, v_sale_line.product_id, 'ajustement', -v_sale_line.qty, v_sale_line.prix_unit, v_paid_at, v_user, 'Vente ' || p_invoice_id);
    end loop;
    v_stock_deducted := true;
  end if;
  v_new := v_invoice.acompte + v_applied;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');
  insert into public.invoice_payments(boutique_id, invoice_id, amount, payment_method, paid_at, operator_id, operator_name, batch_id, source)
  values (p_boutique_id, p_invoice_id, v_applied, coalesce(nullif(p_payment_method, ''), 'Autre'), v_paid_at, v_user, v_operator_name, p_idempotency_key, 'invoice') returning id into v_payment_id;
  update public.invoices set acompte = v_new, payment_method = coalesce(nullif(p_payment_method, ''), payment_method), status = case when v_new >= montant then 'payée' else 'en_attente' end, stock_deducted_at = coalesce(stock_deducted_at, v_paid_at), updated_at = now() where boutique_id = p_boutique_id and id = p_invoice_id;
  v_response := jsonb_build_object('invoice_id', p_invoice_id, 'acompte', v_new, 'applied_amount', v_applied, 'status', case when v_new >= v_invoice.montant then 'payée' else 'acompte' end, 'stock_deducted', v_stock_deducted, 'payment', jsonb_build_object('id', v_payment_id, 'amount', v_applied, 'payment_method', coalesce(nullif(p_payment_method, ''), 'Autre'), 'paid_at', v_paid_at, 'operator_id', v_user, 'operator_name', v_operator_name, 'batch_id', p_idempotency_key, 'source', 'invoice'));
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'record_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.create_sale(text, uuid, text, text, jsonb, text, bigint) from public, anon;
grant execute on function public.create_sale(text, uuid, text, text, jsonb, text, bigint) to authenticated;
revoke all on function public.record_payment(text, text, uuid, numeric, text) from public, anon;
grant execute on function public.record_payment(text, text, uuid, numeric, text) to authenticated;

-- Customer-profile payments deduct stock through their own FIFO settlement
-- function, so it needs the same policy as the point-of-sale path above.
create or replace function public.record_client_payment(
  p_boutique_id text,
  p_client_id bigint,
  p_idempotency_key uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid(); v_client public.clients%rowtype; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype; v_advance public.client_advances%rowtype;
  v_operator_name text; v_response jsonb; v_remaining numeric; v_applied numeric; v_total_applied numeric := 0; v_total_due numeric := 0; v_advance_amount numeric := 0; v_allocations jsonb := '[]'::jsonb; v_paid_at timestamptz; v_unit_cost numeric; v_advance_key uuid;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if coalesce(p_payment_method, '') not in ('Espèces', 'Wave', 'Orange Money', 'Autre') then raise exception 'invalid payment method'; end if;
  select response into v_response from private.idempotency_keys where user_id = v_user and operation = 'record_client_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  select * into v_client from public.clients where boutique_id = p_boutique_id and id = p_client_id;
  if not found then raise exception 'client not found'; end if;
  select coalesce(sum(greatest(0, i.montant - i.acompte)), 0) into v_total_due from public.invoices i where i.boutique_id = p_boutique_id and lower(coalesce(i.type, '')) <> 'retour' and i.client_id = p_client_id;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');
  v_paid_at := ((coalesce(p_payment_date, current_date) + (now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar');
  v_remaining := p_amount;

  for v_invoice in select i.* from public.invoices i where i.boutique_id = p_boutique_id and lower(coalesce(i.type, '')) <> 'retour' and i.client_id = p_client_id and i.montant > i.acompte order by i.invoice_date asc, i.numero asc, i.id asc for update loop
    exit when v_remaining <= 0;
    v_applied := least(v_remaining, v_invoice.montant - v_invoice.acompte);
    if v_invoice.stock_deducted_at is null then
      for v_sale_line in select * from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = v_invoice.id order by product_id, id loop
        v_unit_cost := private.fifo_unit_cost(p_boutique_id, v_sale_line.product_id, v_sale_line.qty);
        update public.invoice_lines set prix_achat = coalesce(prix_achat, v_unit_cost) where id = v_sale_line.id and boutique_id = p_boutique_id;
        update public.products set stock = stock - v_sale_line.qty where boutique_id = p_boutique_id and id = v_sale_line.product_id;
        if not found then raise exception 'product not found for invoice line %', v_sale_line.product_id; end if;
        insert into public.stock_entries(id, boutique_id, product_id, type, qty, prix_unit, entry_date, operator_id, note)
        values (nextval('private.stock_entry_id_seq'), p_boutique_id, v_sale_line.product_id, 'ajustement', -v_sale_line.qty, v_unit_cost, v_paid_at, v_user, 'Vente ' || v_invoice.id);
      end loop;
    end if;
    insert into public.invoice_payments(boutique_id, invoice_id, amount, payment_method, paid_at, operator_id, operator_name, batch_id, source)
    values (p_boutique_id, v_invoice.id, v_applied, p_payment_method, v_paid_at, v_user, v_operator_name, p_idempotency_key, 'client_fifo');
    update public.invoices set acompte = acompte + v_applied, payment_method = p_payment_method, status = case when acompte + v_applied >= montant then 'payée' else 'en_attente' end, stock_deducted_at = coalesce(stock_deducted_at, v_paid_at), updated_at = now() where boutique_id = p_boutique_id and id = v_invoice.id;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object('invoice_id', v_invoice.id, 'amount', v_applied));
    v_total_applied := v_total_applied + v_applied; v_remaining := v_remaining - v_applied;
  end loop;

  v_advance_amount := greatest(0, p_amount - v_total_applied);
  if v_advance_amount > 0 then
    v_advance_key := md5(p_idempotency_key::text || ':client-overflow-advance')::uuid;
    insert into public.client_advances(boutique_id, client_id, amount, payment_method, paid_at, operator_id, operator_name, idempotency_key)
    values (p_boutique_id, p_client_id, v_advance_amount, p_payment_method, v_paid_at, v_user, v_operator_name, v_advance_key)
    on conflict (boutique_id, operator_id, idempotency_key) do nothing returning * into v_advance;
    if not found then select * into v_advance from public.client_advances where boutique_id = p_boutique_id and operator_id = v_user and idempotency_key = v_advance_key; end if;
  end if;
  v_response := jsonb_build_object('client_id', p_client_id, 'requested_amount', p_amount, 'applied_amount', v_total_applied, 'advance_amount', v_advance_amount, 'remaining_due', greatest(0, v_total_due - v_total_applied), 'paid_at', v_paid_at, 'batch_id', p_idempotency_key, 'operator_id', v_user, 'operator_name', v_operator_name, 'allocations', v_allocations, 'advance', case when v_advance_amount > 0 then jsonb_build_object('advance_id', v_advance.id, 'client_id', v_advance.client_id, 'amount', v_advance.amount, 'payment_method', v_advance.payment_method, 'paid_at', v_advance.paid_at, 'recorded_at', v_advance.recorded_at, 'operator_id', v_advance.operator_id, 'operator_name', v_advance.operator_name, 'note', v_advance.note) else null end);
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'record_client_payment', p_idempotency_key, v_response) on conflict (user_id, operation, key) do nothing;
  return v_response;
end;
$$;

revoke all on function public.record_client_payment(text, bigint, uuid, numeric, text, date) from public, anon;
grant execute on function public.record_client_payment(text, bigint, uuid, numeric, text, date) to authenticated;
