-- Prevent returning more than what was actually sold on an invoice.
--
-- Bug: return_sale validated each requested line only against the ORIGINAL sold
-- quantity (v_qty > v_source.qty) and never subtracted quantities already
-- returned on prior calls. A fully-returned invoice could therefore be returned
-- again, without limit, inflating refunds and stock indefinitely.
--
-- Fix: for every requested line, compute the quantity already returned for that
-- product on this source invoice and reject the call when the request exceeds
-- the remaining returnable quantity. Prior returns are discoverable through the
-- stock_entries ledger, where each restored line is tagged
--   type = 'retour' and note = 'Retour <source_invoice_id>'
-- by this same function, so the guard also covers returns recorded historically
-- and needs no schema change.

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
  v_already numeric;
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
  if lower(coalesce(v_original.type, '')) = 'retour' then raise exception 'cannot return a return invoice'; end if;
  if v_original.stock_deducted_at is null then raise exception 'sale stock was not committed'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'lines required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line->>'qty')::numeric, 0);
    select * into v_source from public.invoice_lines
      where boutique_id = p_boutique_id and invoice_id = p_invoice_id
        and product_id = (v_line->>'productId')::bigint limit 1;
    if not found or v_qty <= 0 then raise exception 'invalid return line'; end if;

    -- Quantity already returned for this product on this source invoice.
    select coalesce(sum(qty), 0) into v_already from public.stock_entries
      where boutique_id = p_boutique_id
        and product_id = v_source.product_id
        and type = 'retour'
        and note = 'Retour ' || p_invoice_id;

    if v_qty > v_source.qty - v_already then
      raise exception 'return quantity exceeds remaining returnable quantity';
    end if;

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

revoke execute on function public.return_sale(text, text, uuid, jsonb) from public, anon;
grant execute on function public.return_sale(text, text, uuid, jsonb) to authenticated;
