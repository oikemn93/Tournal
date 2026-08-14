-- Stock is committed on the first payment, not when a pending order is created.
-- The invoice row is locked by record_payment, making the deduction exactly-once.

alter table public.invoices
  add column if not exists stock_deducted_at timestamptz;

comment on column public.invoices.stock_deducted_at is
  'Timestamp of the single stock deduction for this invoice; null while the order is unpaid and uncommitted.';

-- Existing data was created by the old create_sale RPC, which deducted stock
-- immediately. Mark every existing sale as already deducted. We deliberately do
-- not recalculate historical inventory in this migration.
update public.invoices
set stock_deducted_at = coalesce(updated_at, invoice_date, now())
where lower(coalesce(type, '')) <> 'retour'
  and stock_deducted_at is null;

create or replace function public.create_sale(
  p_boutique_id text,
  p_idempotency_key uuid,
  p_client_nom text,
  p_client_tel text,
  p_lines jsonb,
  p_payment_method text default null
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
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then
    raise exception 'forbidden';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user and operation = 'create_sale' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');
    v_billed_qty := case when v_sell_unit is null then v_qty
                         else coalesce((v_line->>'sellQty')::numeric, v_qty) end;

    select * into v_product
    from public.products
    where boutique_id = p_boutique_id
      and id = (v_line->>'productId')::bigint;

    if not found or v_qty <= 0 or v_billed_qty <= 0 or v_product.stock < v_qty then
      raise exception 'stock unavailable';
    end if;
    v_total := v_total + v_billed_qty * v_price;
  end loop;

  v_numero := private.next_invoice_number(p_boutique_id);
  v_invoice_id := 'F' || to_char(now(), 'YYMMDD') || '-' || lpad(v_numero::text, 6, '0');

  insert into public.invoices(
    id, boutique_id, numero, client_nom, client_tel, montant, acompte,
    invoice_date, status, type, payment_method, operator_id, stock_deducted_at
  ) values (
    v_invoice_id, p_boutique_id, v_numero, coalesce(p_client_nom, 'Client comptoir'),
    p_client_tel, v_total, 0, now(), 'en_attente', 'vente', p_payment_method,
    v_user, null
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    v_price := coalesce((v_line->>'prixUnit')::numeric, 0);
    v_sell_unit := nullif(trim(coalesce(v_line->>'sellUnit', '')), '');

    insert into public.invoice_lines(
      boutique_id, invoice_id, product_id, nom, qty, unit,
      prix_unit, sell_unit, sell_qty
    ) values (
      p_boutique_id, v_invoice_id, (v_line->>'productId')::bigint,
      coalesce(v_line->>'nom', 'Article'), v_qty, v_line->>'unit', v_price,
      v_sell_unit,
      case when v_sell_unit is null then null
           else coalesce((v_line->>'sellQty')::numeric, v_qty) end
    );
  end loop;

  v_response := jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_numero,
    'total', v_total,
    'stock_deducted', false
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'create_sale', p_idempotency_key, v_response);
  return v_response;
end;
$$;

create or replace function public.record_payment(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid,
  p_amount numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_operator_name text;
  v_invoice public.invoices%rowtype;
  v_sale_line public.invoice_lines%rowtype;
  v_response jsonb;
  v_applied numeric;
  v_new numeric;
  v_paid_at timestamptz := now();
  v_payment_id bigint;
  v_stock_deducted boolean := false;
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then
    raise exception 'forbidden';
  end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select response into v_response
  from private.idempotency_keys
  where user_id = v_user and operation = 'record_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;

  select * into v_invoice
  from public.invoices
  where boutique_id = p_boutique_id and id = p_invoice_id
  for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type, '')) = 'retour' then
    raise exception 'cannot collect payment on a return';
  end if;

  v_applied := least(p_amount, greatest(0, v_invoice.montant - v_invoice.acompte));
  if v_applied <= 0 then raise exception 'invoice already paid'; end if;

  -- First payment commits every invoice line to stock in the same transaction.
  -- The locked invoice row guarantees that concurrent payments cannot deduct twice.
  if v_invoice.stock_deducted_at is null then
    for v_sale_line in
      select *
      from public.invoice_lines
      where boutique_id = p_boutique_id and invoice_id = p_invoice_id
      order by product_id, id
    loop
      update public.products
      set stock = stock - v_sale_line.qty
      where boutique_id = p_boutique_id
        and id = v_sale_line.product_id
        and stock >= v_sale_line.qty;
      if not found then
        raise exception 'stock unavailable for product %', v_sale_line.product_id;
      end if;

      insert into public.stock_entries(
        id, boutique_id, product_id, type, qty, prix_unit,
        entry_date, operator_id, note
      ) values (
        nextval('private.stock_entry_id_seq'), p_boutique_id,
        v_sale_line.product_id, 'ajustement', -v_sale_line.qty,
        v_sale_line.prix_unit, v_paid_at, v_user, 'Vente ' || p_invoice_id
      );
    end loop;

    v_stock_deducted := true;
  end if;

  v_new := v_invoice.acompte + v_applied;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');

  insert into public.invoice_payments(
    boutique_id, invoice_id, amount, payment_method, paid_at,
    operator_id, operator_name, batch_id, source
  ) values (
    p_boutique_id, p_invoice_id, v_applied,
    coalesce(nullif(p_payment_method, ''), 'Autre'), v_paid_at,
    v_user, v_operator_name, p_idempotency_key, 'invoice'
  ) returning id into v_payment_id;

  update public.invoices
  set acompte = v_new,
      payment_method = coalesce(nullif(p_payment_method, ''), payment_method),
      status = case when v_new >= montant then 'payée' else 'en_attente' end,
      stock_deducted_at = coalesce(stock_deducted_at, v_paid_at),
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_invoice_id;

  v_response := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'acompte', v_new,
    'applied_amount', v_applied,
    'status', case when v_new >= v_invoice.montant then 'payée' else 'acompte' end,
    'stock_deducted', v_stock_deducted,
    'payment', jsonb_build_object(
      'id', v_payment_id,
      'amount', v_applied,
      'payment_method', coalesce(nullif(p_payment_method, ''), 'Autre'),
      'paid_at', v_paid_at,
      'operator_id', v_user,
      'operator_name', v_operator_name,
      'batch_id', p_idempotency_key,
      'source', 'invoice'
    )
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'record_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;

-- stock_entries.type is intentionally lowercase and constrained as such.
create or replace function public.return_sale(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_operator_name text;
  v_existing jsonb;
  v_original public.invoices%rowtype;
  v_line jsonb;
  v_qty numeric;
  v_source public.invoice_lines%rowtype;
  v_return_id text;
  v_numero bigint;
  v_total numeric := 0;
  v_response jsonb;
  v_returned_at timestamptz := now();
begin
  if v_user is null or not private.auth_has_write_access(p_boutique_id) then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys
    where user_id = v_user and operation = 'return_sale' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_original from public.invoices
    where boutique_id = p_boutique_id and id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_original.stock_deducted_at is null then raise exception 'sale stock was not committed'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    select * into v_source from public.invoice_lines
      where boutique_id = p_boutique_id and invoice_id = p_invoice_id
        and product_id = (v_line->>'productId')::bigint limit 1;
    if not found or v_qty <= 0 or v_qty > v_source.qty then raise exception 'invalid return line'; end if;
    v_total := v_total + v_qty * v_source.prix_unit;
  end loop;

  v_numero := private.next_invoice_number(p_boutique_id);
  v_return_id := 'R' || to_char(v_returned_at, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');

  insert into public.invoices(
    id, boutique_id, numero, client_id, client_nom, client_tel, montant,
    acompte, invoice_date, status, type, payment_method, operator_id, stock_deducted_at
  ) values (
    v_return_id, p_boutique_id, v_numero, v_original.client_id,
    v_original.client_nom, v_original.client_tel, v_total, v_total,
    v_returned_at, 'retour', 'Retour', coalesce(v_original.payment_method, 'Autre'),
    v_user, v_returned_at
  );

  insert into public.invoice_payments(
    boutique_id, invoice_id, amount, payment_method, paid_at,
    operator_id, operator_name, batch_id, source
  ) values (
    p_boutique_id, v_return_id, v_total,
    coalesce(v_original.payment_method, 'Autre'), v_returned_at,
    v_user, v_operator_name, p_idempotency_key, 'invoice'
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'qty')::numeric;
    select * into v_source from public.invoice_lines
      where boutique_id = p_boutique_id and invoice_id = p_invoice_id
        and product_id = (v_line->>'productId')::bigint limit 1;

    insert into public.invoice_lines(
      boutique_id, invoice_id, product_id, nom, qty, unit,
      prix_unit, sell_unit, sell_qty
    ) values (
      p_boutique_id, v_return_id, v_source.product_id, v_source.nom,
      v_qty, v_source.unit, v_source.prix_unit, v_source.sell_unit,
      case when v_source.sell_unit is null then null else v_source.sell_qty end
    );

    update public.products
    set stock = stock + v_qty
    where boutique_id = p_boutique_id and id = v_source.product_id;

    insert into public.stock_entries(
      id, boutique_id, product_id, type, qty, prix_unit,
      entry_date, operator_id, note
    ) values (
      nextval('private.stock_entry_id_seq'), p_boutique_id,
      v_source.product_id, 'retour', v_qty, v_source.prix_unit,
      v_returned_at, v_user, 'Retour ' || p_invoice_id
    );
  end loop;

  v_response := jsonb_build_object(
    'return_invoice_id', v_return_id,
    'total', v_total,
    'returned_at', v_returned_at
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'return_sale', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke execute on function public.create_sale(text, uuid, text, text, jsonb, text) from public, anon;
revoke execute on function public.record_payment(text, text, uuid, numeric, text) from public, anon;
revoke execute on function public.return_sale(text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_sale(text, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.record_payment(text, text, uuid, numeric, text) to authenticated;
grant execute on function public.return_sale(text, text, uuid, jsonb) to authenticated;
