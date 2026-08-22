-- A single customer payment first settles the oldest invoices, then records
-- any excess as a client credit.  The function remains the sole write path so
-- payment permission, idempotency, inventory deduction and audit metadata stay
-- identical to the established client-payment flow.
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
  v_user uuid := auth.uid();
  v_client public.clients%rowtype;
  v_invoice public.invoices%rowtype;
  v_sale_line public.invoice_lines%rowtype;
  v_advance public.client_advances%rowtype;
  v_operator_name text;
  v_response jsonb;
  v_remaining numeric;
  v_applied numeric;
  v_total_applied numeric := 0;
  v_total_due numeric := 0;
  v_advance_amount numeric := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_paid_at timestamptz;
  v_unit_cost numeric;
  v_advance_key uuid;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then
    raise exception 'payment access denied';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if coalesce(p_payment_method, '') not in ('Espèces', 'Wave', 'Orange Money', 'Autre') then
    raise exception 'invalid payment method';
  end if;

  select response into v_response
  from private.idempotency_keys
  where user_id = v_user
    and operation = 'record_client_payment'
    and key = p_idempotency_key;
  if v_response is not null then
    return v_response;
  end if;

  select * into v_client
  from public.clients
  where boutique_id = p_boutique_id
    and id = p_client_id;
  if not found then
    raise exception 'client not found';
  end if;

  select coalesce(sum(greatest(0, i.montant - i.acompte)), 0) into v_total_due
  from public.invoices i
  where i.boutique_id = p_boutique_id
    and lower(coalesce(i.type, '')) <> 'retour'
    and i.client_id = p_client_id;

  select nom into v_operator_name
  from public.platform_users
  where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');
  v_paid_at := ((coalesce(p_payment_date, current_date) + (now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar');
  v_remaining := p_amount;

  -- The oldest unpaid invoices are locked in one stable order.  This keeps two
  -- simultaneous payments from allocating the same balance twice.
  for v_invoice in
    select i.*
    from public.invoices i
    where i.boutique_id = p_boutique_id
      and lower(coalesce(i.type, '')) <> 'retour'
      and i.client_id = p_client_id
      and i.montant > i.acompte
    order by i.invoice_date asc, i.numero asc, i.id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_applied := least(v_remaining, v_invoice.montant - v_invoice.acompte);

    if v_invoice.stock_deducted_at is null then
      for v_sale_line in
        select *
        from public.invoice_lines
        where boutique_id = p_boutique_id
          and invoice_id = v_invoice.id
        order by product_id, id
      loop
        v_unit_cost := private.fifo_unit_cost(p_boutique_id, v_sale_line.product_id, v_sale_line.qty);
        update public.invoice_lines
        set prix_achat = coalesce(prix_achat, v_unit_cost)
        where id = v_sale_line.id
          and boutique_id = p_boutique_id;

        update public.products
        set stock = stock - v_sale_line.qty
        where boutique_id = p_boutique_id
          and id = v_sale_line.product_id
          and stock >= v_sale_line.qty;
        if not found then
          raise exception 'stock unavailable for product %', v_sale_line.product_id;
        end if;

        insert into public.stock_entries (
          id, boutique_id, product_id, type, qty, prix_unit,
          entry_date, operator_id, note
        ) values (
          nextval('private.stock_entry_id_seq'), p_boutique_id,
          v_sale_line.product_id, 'ajustement', -v_sale_line.qty, v_unit_cost,
          v_paid_at, v_user, 'Vente ' || v_invoice.id
        );
      end loop;
    end if;

    insert into public.invoice_payments (
      boutique_id, invoice_id, amount, payment_method, paid_at,
      operator_id, operator_name, batch_id, source
    ) values (
      p_boutique_id, v_invoice.id, v_applied, p_payment_method, v_paid_at,
      v_user, v_operator_name, p_idempotency_key, 'client_fifo'
    );

    update public.invoices
    set acompte = acompte + v_applied,
        payment_method = p_payment_method,
        status = case when acompte + v_applied >= montant then 'payée' else 'en_attente' end,
        stock_deducted_at = coalesce(stock_deducted_at, v_paid_at),
        updated_at = now()
    where boutique_id = p_boutique_id
      and id = v_invoice.id;

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_invoice.id,
      'amount', v_applied
    ));
    v_total_applied := v_total_applied + v_applied;
    v_remaining := v_remaining - v_applied;
  end loop;

  -- Money above the outstanding balance is received once and becomes an
  -- available credit.  A derived idempotency key protects this child write if
  -- the caller retries the same request.
  v_advance_amount := greatest(0, p_amount - v_total_applied);
  if v_advance_amount > 0 then
    v_advance_key := md5(p_idempotency_key::text || ':client-overflow-advance')::uuid;
    insert into public.client_advances (
      boutique_id, client_id, amount, payment_method, paid_at,
      operator_id, operator_name, idempotency_key
    ) values (
      p_boutique_id, p_client_id, v_advance_amount, p_payment_method, v_paid_at,
      v_user, v_operator_name, v_advance_key
    )
    on conflict (boutique_id, operator_id, idempotency_key) do nothing
    returning * into v_advance;

    if not found then
      select * into v_advance
      from public.client_advances
      where boutique_id = p_boutique_id
        and operator_id = v_user
        and idempotency_key = v_advance_key;
    end if;
  end if;

  v_response := jsonb_build_object(
    'client_id', p_client_id,
    'requested_amount', p_amount,
    'applied_amount', v_total_applied,
    'advance_amount', v_advance_amount,
    'remaining_due', greatest(0, v_total_due - v_total_applied),
    'paid_at', v_paid_at,
    'batch_id', p_idempotency_key,
    'operator_id', v_user,
    'operator_name', v_operator_name,
    'allocations', v_allocations,
    'advance', case when v_advance_amount > 0 then jsonb_build_object(
      'advance_id', v_advance.id,
      'client_id', v_advance.client_id,
      'amount', v_advance.amount,
      'payment_method', v_advance.payment_method,
      'paid_at', v_advance.paid_at,
      'recorded_at', v_advance.recorded_at,
      'operator_id', v_advance.operator_id,
      'operator_name', v_advance.operator_name,
      'note', v_advance.note
    ) else null end
  );

  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'record_client_payment', p_idempotency_key, v_response)
  on conflict (user_id, operation, key) do nothing;

  return v_response;
end;
$$;

revoke all on function public.record_client_payment(text, bigint, uuid, numeric, text, date) from public, anon;
grant execute on function public.record_client_payment(text, bigint, uuid, numeric, text, date) to authenticated;
