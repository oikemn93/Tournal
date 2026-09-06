-- Stock integrity hardening: make overselling impossible at payment time,
-- preserve commercial-transfer lifecycle semantics, and fail closed when an
-- inventory changes while it is being counted.

create or replace function private.guard_product_stock_floor()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if coalesce(new.stock,0) < -0.000001 then
    if tg_op = 'INSERT' then
      raise exception using
        errcode = '23514',
        message = format('negative opening stock is not allowed for product %s', new.id);
    end if;

    if new.stock < coalesce(old.stock,0) - 0.000001 then
      raise exception using
        errcode = '23514',
        message = format('stock cannot become more negative for product %s', new.id);
    end if;
  end if;
  return new;
end
$function$;

revoke all on function private.guard_product_stock_floor() from public, anon, authenticated;

drop trigger if exists trg_guard_negative_product_stock_insert on public.products;
create trigger trg_guard_negative_product_stock_insert
before insert on public.products
for each row execute function private.guard_product_stock_floor();

drop trigger if exists trg_guard_negative_product_stock_update on public.products;
create trigger trg_guard_negative_product_stock_update
before update of stock on public.products
for each row execute function private.guard_product_stock_floor();

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
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_epsilon constant numeric:=0.01;
  v_user uuid:=auth.uid();
  v_operator_name text;
  v_invoice public.invoices%rowtype;
  v_response jsonb;
  v_requested numeric;
  v_remaining numeric;
  v_applied numeric;
  v_new numeric;
  v_paid_at timestamptz:=now();
  v_payment_id bigint;
  v_stock_deducted boolean:=false;
  v_return_reduction numeric:=0;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then
    raise exception 'payment access denied';
  end if;

  v_requested:=round(coalesce(p_amount,0),2);
  if v_requested<=0 then raise exception 'amount must be positive'; end if;

  select response into v_response
  from private.idempotency_keys
  where user_id=v_user and operation='record_payment' and key=p_idempotency_key;
  if v_response is not null then return v_response; end if;

  select * into v_invoice
  from public.invoices
  where boutique_id=p_boutique_id and id=p_invoice_id
  for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then
    raise exception 'cannot collect payment on this invoice';
  end if;

  select coalesce(sum(return_receivable_reduction),0)
  into v_return_reduction
  from public.invoices
  where boutique_id=p_boutique_id and lower(coalesce(type,''))='retour' and return_of_invoice_id=p_invoice_id;

  v_remaining:=greatest(0,round(v_invoice.montant-v_invoice.acompte-v_return_reduction,2));
  if v_requested>v_remaining+v_epsilon then raise exception 'payment amount exceeds remaining amount'; end if;
  if coalesce(v_invoice.origin,'pos')='pos'
     and abs(v_requested-v_remaining)>v_epsilon
     and coalesce(current_setting('tournal.pos_full_split',true),'')<>'on' then
    raise exception 'counter sale must be paid in full';
  end if;

  v_applied:=least(v_requested,v_remaining);
  if v_applied<=0 then raise exception 'invoice already settled'; end if;

  -- The canonical stock commit function locks products in deterministic order,
  -- verifies availability, creates stock ledger rows, and freezes FIFO cost.
  -- Keeping this before the payment insert makes the whole operation atomic:
  -- insufficient stock means no payment, no invoice settlement and no stock row.
  if v_invoice.stock_deducted_at is null
     and coalesce(v_invoice.origin,'pos')='pos'
     and (
       abs(v_requested-v_remaining)<=v_epsilon
       or coalesce(current_setting('tournal.pos_full_split',true),'')='on'
     ) then
    v_stock_deducted:=private.commit_invoice_stock(
      p_boutique_id,
      p_invoice_id,
      v_paid_at,
      v_user,
      false
    );
  end if;

  v_new:=round(v_invoice.acompte+v_applied,2);
  if v_new+v_return_reduction+v_epsilon>=v_invoice.montant then
    v_new:=least(v_new,v_invoice.montant);
  end if;

  select nom into v_operator_name from public.platform_users where id=v_user;
  v_operator_name:=coalesce(v_operator_name,'Utilisateur');

  insert into public.invoice_payments(
    boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source
  ) values(
    p_boutique_id,p_invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),
    v_paid_at,v_user,v_operator_name,p_idempotency_key,'invoice'
  ) returning id into v_payment_id;

  update public.invoices
  set acompte=v_new,
      payment_method=coalesce(nullif(p_payment_method,''),payment_method),
      status=case when v_new+v_return_reduction+v_epsilon>=montant then 'payée' else 'en_attente' end,
      -- commit_invoice_stock already wrote this timestamp. Keep the COALESCE as
      -- compatibility protection for an already-committed POS invoice.
      stock_deducted_at=case
        when coalesce(v_invoice.origin,'pos')='pos' then coalesce(stock_deducted_at,case when v_stock_deducted then v_paid_at else null end)
        else stock_deducted_at
      end,
      updated_at=now()
  where boutique_id=p_boutique_id and id=p_invoice_id;

  v_response:=jsonb_build_object(
    'invoice_id',p_invoice_id,
    'acompte',v_new,
    'applied_amount',v_applied,
    'remaining_due',greatest(0,round(v_invoice.montant-v_new-v_return_reduction,2)),
    'status',case when v_new+v_return_reduction+v_epsilon>=v_invoice.montant then 'payée' else 'acompte' end,
    'stock_deducted',v_stock_deducted,
    'payment',jsonb_build_object(
      'id',v_payment_id,
      'amount',v_applied,
      'payment_method',coalesce(nullif(p_payment_method,''),'Autre'),
      'paid_at',v_paid_at,
      'operator_id',v_user,
      'operator_name',v_operator_name,
      'batch_id',p_idempotency_key,
      'source','invoice'
    )
  );

  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'record_payment',p_idempotency_key,v_response);
  return v_response;
end
$function$;

create or replace function private.enforce_sale_stock_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_origin text;
  v_fully_paid boolean;
  v_actor uuid;
begin
  select * into v_invoice
  from public.invoices
  where boutique_id=new.boutique_id and id=new.id
  for update;

  if not found then return null; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then
    return null;
  end if;

  -- Commercial transfers already move stock atomically during transfer
  -- acceptance and create their invoice afterwards. Do not reinterpret that
  -- invoice as an unpaid counter sale, but require the committed-stock marker.
  if exists(
    select 1
    from public.stock_transfers st
    where st.invoice_id=v_invoice.id
      and st.from_boutique_id=v_invoice.boutique_id
      and st.relationship_type='commercial'
      and st.status='accepted'
  ) then
    if v_invoice.stock_deducted_at is null then
      raise exception 'commercial transfer invoice must have committed stock';
    end if;
    return null;
  end if;

  v_origin:=coalesce(v_invoice.origin,'pos');
  v_fully_paid:=coalesce(v_invoice.acompte,0)+0.01>=coalesce(v_invoice.montant,0);
  v_actor:=coalesce(auth.uid(),v_invoice.operator_id);

  if v_origin='client_profile' then
    if v_invoice.stock_deducted_at is null then
      perform private.commit_invoice_stock(v_invoice.boutique_id,v_invoice.id,now(),v_actor,false);
    end if;
    return null;
  end if;

  if v_origin='pos' then
    if v_fully_paid then
      if v_invoice.stock_deducted_at is null then
        perform private.commit_invoice_stock(v_invoice.boutique_id,v_invoice.id,now(),v_actor,false);
      end if;
    elsif v_invoice.stock_deducted_at is not null then
      raise exception 'counter sale stock cannot be deducted before full payment';
    end if;
    return null;
  end if;

  raise exception 'invalid sale origin';
end
$function$;

create or replace function public.finalize_inventory_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_session public.inventory_sessions%rowtype;
  v_line record;
  v_current numeric;
  v_diff numeric;
  v_entry jsonb;
  v_missing integer;
  v_fifo_counted numeric;
begin
  select * into v_session
  from public.inventory_sessions
  where id=p_session_id
  for update;

  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_session.boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if v_session.status='completed' then return public.get_inventory_session(p_session_id); end if;
  if v_session.status<>'draft' then raise exception 'inventory session is closed'; end if;

  select count(*) into v_missing
  from public.inventory_lines
  where session_id=p_session_id and counted_qty is null;
  if v_missing>0 then raise exception 'inventory incomplete: % product(s) not counted',v_missing; end if;

  -- Freeze every product in deterministic order before checking whether the
  -- counted scope changed. Stock writers use the same product row locks, so a
  -- concurrent sale/receipt either completes first (and is detected below) or
  -- waits until this inventory transaction finishes.
  perform p.id
  from public.products p
  join public.inventory_lines il
    on il.session_id=p_session_id and il.product_id=p.id
  where p.boutique_id=v_session.boutique_id
  order by p.id
  for update of p;

  if exists(
    select 1
    from public.inventory_lines il
    join public.stock_entries se
      on se.boutique_id=v_session.boutique_id
     and se.product_id=il.product_id
    where il.session_id=p_session_id
      and se.created_at>v_session.started_at
  ) then
    raise exception 'inventory stock changed during count; restart this inventory';
  end if;

  for v_line in
    select * from public.inventory_lines
    where session_id=p_session_id
    order by product_id
  loop
    select stock into v_current
    from public.products
    where boutique_id=v_session.boutique_id and id=v_line.product_id;
    if not found then raise exception 'product % not found',v_line.product_id; end if;

    -- Use the final locked theoretical stock rather than the start snapshot.
    -- With the no-concurrent-movement guard above these should normally match;
    -- using the final value makes the correction itself fail safe.
    v_diff:=v_line.counted_qty-v_current;

    if v_diff<>0 then
      v_entry:=public.record_stock_movement(
        v_session.boutique_id,
        v_line.product_id,
        gen_random_uuid(),
        v_diff,
        'inventaire',
        case when v_line.theoretical_qty>0 then v_line.fifo_theoretical_cost/v_line.theoretical_qty else coalesce(v_line.purchase_price,0) end,
        'Inventaire daté '||v_session.as_of_at::text||' · compté '||v_line.counted_qty::text||' '||v_line.unit,
        null::bigint,
        'INV-'||left(p_session_id::text,8)
      );
    else
      v_entry:=null;
    end if;

    v_fifo_counted:=private.fifo_stock_value(
      v_session.boutique_id,
      v_line.product_id,
      v_session.as_of_at,
      v_line.counted_qty
    );

    update public.inventory_lines
    set final_theoretical_qty=v_current,
        difference_qty=v_diff,
        fifo_counted_cost=v_fifo_counted,
        fifo_unit_cost=case when counted_qty>0 then v_fifo_counted/counted_qty else 0 end,
        stock_entry_id=case when v_entry is null then null else (v_entry->>'entry_id')::bigint end,
        updated_at=now()
    where session_id=p_session_id and product_id=v_line.product_id;
  end loop;

  update public.inventory_sessions s
  set status='completed',
      finalized_at=now(),
      updated_at=now(),
      total_theoretical_cost=coalesce(x.theoretical_cost,0),
      total_counted_cost=coalesce(x.counted_cost,0),
      total_theoretical_sales=0,
      total_counted_sales=0,
      total_potential_margin=0,
      total_variance_cost=coalesce(x.counted_cost-x.theoretical_cost,0),
      total_variance_sales=0
  from (
    select sum(fifo_theoretical_cost) theoretical_cost,
           sum(fifo_counted_cost) counted_cost
    from public.inventory_lines
    where session_id=p_session_id
  ) x
  where s.id=p_session_id;

  return public.get_inventory_session(p_session_id);
end
$function$;
