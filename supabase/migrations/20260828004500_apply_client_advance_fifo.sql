create or replace function public.apply_client_advance_fifo(
  p_boutique_id text,
  p_client_id bigint,
  p_idempotency_key uuid,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_client public.clients%rowtype;
  v_invoice public.invoices%rowtype;
  v_requested numeric;
  v_available numeric;
  v_total_due numeric;
  v_remaining numeric;
  v_apply numeric;
  v_result jsonb;
  v_total_applied numeric := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_invoice_key uuid;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then
    raise exception 'payment access denied';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user
    and operation = 'apply_client_advance_fifo'
    and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_client
  from public.clients
  where boutique_id = p_boutique_id and id = p_client_id;
  if not found then raise exception 'client not found'; end if;

  select coalesce(sum(greatest(0, amount - allocated_amount)), 0)
  into v_available
  from public.client_advances
  where boutique_id = p_boutique_id
    and client_id = p_client_id
    and amount > allocated_amount;

  select coalesce(sum(greatest(0, round(montant - acompte, 2))), 0)
  into v_total_due
  from public.invoices
  where boutique_id = p_boutique_id
    and client_id = p_client_id
    and lower(coalesce(type,'')) <> 'retour'
    and status <> 'annulée';

  if v_available <= 0 then raise exception 'no client advance available'; end if;
  if v_total_due <= 0 then raise exception 'client has no unpaid invoice'; end if;

  v_requested := case
    when p_amount is null then least(v_available, v_total_due)
    else round(p_amount, 2)
  end;
  if v_requested <= 0 then raise exception 'amount must be positive'; end if;
  if v_requested > v_available then raise exception 'client advance balance is insufficient'; end if;
  if v_requested > v_total_due then raise exception 'advance amount exceeds client balance'; end if;

  v_remaining := v_requested;
  for v_invoice in
    select i.*
    from public.invoices i
    where i.boutique_id = p_boutique_id
      and i.client_id = p_client_id
      and lower(coalesce(i.type,'')) <> 'retour'
      and i.status <> 'annulée'
      and i.montant > i.acompte + 0.01
    order by i.invoice_date asc, i.numero asc, i.id asc
    for update
  loop
    exit when v_remaining <= 0.01;
    v_apply := least(v_remaining, greatest(0, round(v_invoice.montant - v_invoice.acompte, 2)));
    if v_apply <= 0 then continue; end if;
    v_invoice_key := md5(p_idempotency_key::text || ':' || v_invoice.id)::uuid;
    v_result := public.apply_client_advance_to_invoice(p_boutique_id, v_invoice.id, v_invoice_key, v_apply);
    v_total_applied := round(v_total_applied + coalesce((v_result->>'applied_amount')::numeric,0),2);
    v_remaining := round(v_requested - v_total_applied,2);
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_invoice.id,
      'amount', coalesce((v_result->>'applied_amount')::numeric,0),
      'acompte', (v_result->>'acompte')::numeric,
      'status', v_result->>'status',
      'payment', v_result->'payment',
      'advance_allocations', coalesce(v_result->'allocations','[]'::jsonb),
      'stock_deducted', coalesce((v_result->>'stock_deducted')::boolean,false)
    ));
  end loop;

  if v_remaining > 0.01 then raise exception 'could not apply full client advance'; end if;

  v_result := jsonb_build_object(
    'client_id', p_client_id,
    'requested_amount', v_requested,
    'applied_amount', v_total_applied,
    'remaining_due', greatest(0, round(v_total_due - v_total_applied,2)),
    'remaining_advance', greatest(0, round(v_available - v_total_applied,2)),
    'allocations', v_allocations
  );

  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'apply_client_advance_fifo', p_idempotency_key, v_result)
  on conflict (user_id, operation, key) do nothing;

  return v_result;
end;
$$;

revoke all on function public.apply_client_advance_fifo(text,bigint,uuid,numeric) from public, anon;
grant execute on function public.apply_client_advance_fifo(text,bigint,uuid,numeric) to authenticated;
comment on function public.apply_client_advance_fifo(text,bigint,uuid,numeric) is 'Consumes existing client advances FIFO across unpaid invoices. No new cash receipt is created.';
