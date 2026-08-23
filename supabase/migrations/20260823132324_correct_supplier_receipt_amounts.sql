-- Correct a supplier receipt in place so stock, its original purchase amount
-- and the linked payable cannot drift apart. The UI writes an audit entry
-- after a successful call; this function enforces the financial invariants.
create or replace function public.correct_supplier_receipt(
  p_boutique_id text,
  p_stock_entry_id bigint,
  p_idempotency_key uuid,
  p_new_qty numeric,
  p_new_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_entry public.stock_entries%rowtype;
  v_product public.products%rowtype;
  v_receipt_charge public.charges%rowtype;
  v_has_receipt_charge boolean := false;
  v_delta_qty numeric;
  v_unit_price numeric;
  v_status text;
  v_response jsonb;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'stock') then
    raise exception 'forbidden';
  end if;
  if p_new_qty is null or p_new_qty <= 0 then
    raise exception 'invalid receipt quantity';
  end if;
  if p_new_amount is null or p_new_amount < 0 then
    raise exception 'invalid receipt amount';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user
    and operation = 'correct_supplier_receipt'
    and key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_entry
  from public.stock_entries
  where boutique_id = p_boutique_id
    and id = p_stock_entry_id
  for update;
  if not found or v_entry.type <> 'achat' or v_entry.qty <= 0 then
    raise exception 'only original supplier receipts can be corrected';
  end if;

  -- This lock serializes receipt corrections with stock writers. Negative
  -- stock remains permitted by the product policy: a correction must not make
  -- a real physical discrepancy impossible to record.
  select * into v_product
  from public.products
  where boutique_id = p_boutique_id
    and id = v_entry.product_id
  for update;
  if not found then
    raise exception 'product not found';
  end if;

  select * into v_receipt_charge
  from public.charges
  where boutique_id = p_boutique_id
    and stock_entry_id = v_entry.id
    and source = 'supplier_receipt'
  for update;
  v_has_receipt_charge := found;

  if v_has_receipt_charge and p_new_amount < v_receipt_charge.paid_amount then
    raise exception 'new receipt amount cannot be lower than the amount already paid';
  end if;

  v_delta_qty := p_new_qty - v_entry.qty;
  v_unit_price := p_new_amount / p_new_qty;

  update public.products
  set stock = stock + v_delta_qty,
      updated_at = now()
  where boutique_id = p_boutique_id
    and id = v_product.id;

  update public.stock_entries
  set qty = p_new_qty,
      prix_unit = v_unit_price
  where boutique_id = p_boutique_id
    and id = v_entry.id;

  if v_has_receipt_charge then
    v_status := case
      when v_receipt_charge.paid_amount >= p_new_amount then 'paid'
      when v_receipt_charge.paid_amount > 0 then 'partial'
      else 'pending'
    end;

    update public.charges
    set montant = p_new_amount,
        status = v_status,
        updated_at = now()
    where boutique_id = p_boutique_id
      and id = v_receipt_charge.id;
  end if;

  v_response := jsonb_build_object(
    'entry_id', v_entry.id,
    'product_id', v_entry.product_id,
    'qty', p_new_qty,
    'amount', p_new_amount,
    'unit_price', v_unit_price,
    'stock', v_product.stock + v_delta_qty,
    'charge_id', case when v_has_receipt_charge then v_receipt_charge.id else null end,
    'paid_amount', case when v_has_receipt_charge then v_receipt_charge.paid_amount else 0 end,
    'remaining_due', case when v_has_receipt_charge then p_new_amount - v_receipt_charge.paid_amount else null end,
    'charge_status', case when v_has_receipt_charge then v_status else null end
  );

  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'correct_supplier_receipt', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.correct_supplier_receipt(text, bigint, uuid, numeric, numeric) from public, anon;
grant execute on function public.correct_supplier_receipt(text, bigint, uuid, numeric, numeric) to authenticated;
