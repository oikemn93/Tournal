-- Financial and order-lifecycle hardening.  Orders are immutable once paid;
-- unpaid orders can be edited in place or cancelled with an audit trail.
begin;

alter table public.invoices
  add column if not exists origin text not null default 'pos',
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.platform_users(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_origin_check;
alter table public.invoices
  add constraint invoices_origin_check check (origin in ('pos', 'client_profile'));

-- A cancelled financial document must never be physically removed through the
-- Data API.  The dedicated RPC below is the only supported cancellation path.
drop policy if exists "invoices: delete pending only" on public.invoices;
drop policy if exists "invoices: update pending only" on public.invoices;
drop policy if exists "invoice_lines: insert pending only" on public.invoice_lines;
drop policy if exists "invoice_lines: update pending only" on public.invoice_lines;
drop policy if exists "invoice_lines: delete pending only" on public.invoice_lines;

drop function if exists public.create_sale(text, uuid, text, text, jsonb, text, bigint);
create function public.create_sale(
  p_boutique_id text,
  p_idempotency_key uuid,
  p_client_nom text,
  p_client_tel text,
  p_lines jsonb,
  p_payment_method text default null,
  p_client_id bigint default null,
  p_origin text default 'pos'
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
  if coalesce(p_origin, 'pos') not in ('pos', 'client_profile') then
    raise exception 'invalid order origin';
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
    if not found or v_qty <= 0 or v_billed_qty <= 0 then raise exception 'invalid sale line'; end if;
    v_total := v_total + v_billed_qty * v_price;
  end loop;

  v_total := round(v_total, 2);
  v_numero := private.next_invoice_number(p_boutique_id);
  v_invoice_id := 'F' || to_char(now(), 'YYMMDD') || '-' || lpad(v_numero::text, 6, '0');
  insert into public.invoices(id, boutique_id, numero, client_id, client_nom, client_tel, montant, acompte, invoice_date, status, type, payment_method, operator_id, stock_deducted_at, due_date, origin)
  values (v_invoice_id, p_boutique_id, v_numero, case when v_client.id is not null then v_client.id else null end, coalesce(v_client.nom, p_client_nom, 'Client comptoir'), coalesce(v_client.tel, p_client_tel), v_total, 0, now(), 'en_attente', 'vente', p_payment_method, v_user, null, v_due_date, coalesce(p_origin, 'pos'));

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
set search_path = 'pg_catalog', 'public', 'private'
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
  if v_invoice.type <> 'vente' or v_invoice.status <> 'en_attente'
    or coalesce(v_invoice.acompte, 0) > 0.01 or v_invoice.stock_deducted_at is not null then
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

drop function if exists public.cancel_pending_sale(text, text);
create function public.cancel_pending_sale(
  p_boutique_id text,
  p_invoice_id text,
  p_reason text default null,
  p_origin_context text default 'pos'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_can_cancel_any boolean;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'annulation_commande') then
    raise exception 'forbidden';
  end if;
  if coalesce(p_origin_context, 'pos') not in ('pos', 'client_profile') then
    raise exception 'invalid order origin';
  end if;
  v_can_cancel_any := private.auth_is_super_admin() or private.auth_is_owner_of(p_boutique_id);

  select * into v_invoice from public.invoices
  where id = p_invoice_id and boutique_id = p_boutique_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if coalesce(v_invoice.origin, 'pos') <> coalesce(p_origin_context, 'pos') then
    raise exception 'this order must be managed from its originating screen';
  end if;
  if v_invoice.type <> 'vente' or v_invoice.status <> 'en_attente'
    or coalesce(v_invoice.acompte, 0) > 0.01 or v_invoice.stock_deducted_at is not null then
    raise exception 'only an unpaid pending sale can be cancelled';
  end if;
  if not v_can_cancel_any and v_invoice.operator_id is distinct from v_user then
    raise exception 'forbidden';
  end if;

  update public.invoices set
    status = 'annulée',
    cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
    cancelled_at = now(),
    cancelled_by = v_user,
    updated_at = now()
  where boutique_id = p_boutique_id and id = p_invoice_id;

  insert into public.audit_log(boutique_id, user_id, action, detail, icon, source)
  values (p_boutique_id, v_user, 'Commande annulée',
    p_invoice_id || ' · ' || coalesce(v_invoice.client_nom, 'Client comptoir') ||
    case when nullif(trim(coalesce(p_reason, '')), '') is null then '' else ' · Motif : ' || trim(p_reason) end,
    '🗑️', 'native');

  return jsonb_build_object('invoice_id', p_invoice_id, 'status', 'annulée', 'cancelled_at', now(), 'cancelled_by', v_user, 'cancel_reason', nullif(trim(coalesce(p_reason, '')), ''));
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
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_epsilon constant numeric := 0.01;
  v_user uuid := auth.uid(); v_operator_name text; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype;
  v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_paid_at timestamptz := now(); v_payment_id bigint; v_stock_deducted boolean := false;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  v_requested := round(coalesce(p_amount, 0), 2);
  if v_requested <= 0 then raise exception 'amount must be positive'; end if;
  select response into v_response from private.idempotency_keys where user_id = v_user and operation = 'record_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  select * into v_invoice from public.invoices where boutique_id = p_boutique_id and id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type, '')) = 'retour' or v_invoice.status = 'annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  v_remaining := greatest(0, round(v_invoice.montant - v_invoice.acompte, 2));
  if v_requested > v_remaining + v_epsilon then raise exception 'payment amount exceeds remaining amount'; end if;
  v_applied := least(v_requested, v_remaining);
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
  v_new := round(v_invoice.acompte + v_applied, 2);
  if v_new + v_epsilon >= v_invoice.montant then v_new := v_invoice.montant; end if;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');
  insert into public.invoice_payments(boutique_id, invoice_id, amount, payment_method, paid_at, operator_id, operator_name, batch_id, source)
  values (p_boutique_id, p_invoice_id, v_applied, coalesce(nullif(p_payment_method, ''), 'Autre'), v_paid_at, v_user, v_operator_name, p_idempotency_key, 'invoice') returning id into v_payment_id;
  update public.invoices set acompte = v_new, payment_method = coalesce(nullif(p_payment_method, ''), payment_method), status = case when v_new + v_epsilon >= montant then 'payée' else 'en_attente' end, stock_deducted_at = coalesce(stock_deducted_at, v_paid_at), updated_at = now() where boutique_id = p_boutique_id and id = p_invoice_id;
  v_response := jsonb_build_object('invoice_id', p_invoice_id, 'acompte', v_new, 'applied_amount', v_applied, 'status', case when v_new + v_epsilon >= v_invoice.montant then 'payée' else 'acompte' end, 'stock_deducted', v_stock_deducted, 'payment', jsonb_build_object('id', v_payment_id, 'amount', v_applied, 'payment_method', coalesce(nullif(p_payment_method, ''), 'Autre'), 'paid_at', v_paid_at, 'operator_id', v_user, 'operator_name', v_operator_name, 'batch_id', p_idempotency_key, 'source', 'invoice'));
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'record_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;

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
  v_epsilon constant numeric := 0.01;
  v_user uuid := auth.uid(); v_client public.clients%rowtype; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype; v_advance public.client_advances%rowtype;
  v_operator_name text; v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_total_applied numeric := 0; v_total_due numeric := 0; v_advance_amount numeric := 0; v_allocations jsonb := '[]'::jsonb; v_paid_at timestamptz; v_unit_cost numeric; v_advance_key uuid;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  v_requested := round(coalesce(p_amount, 0), 2);
  if v_requested <= 0 then raise exception 'amount must be positive'; end if;
  if coalesce(p_payment_method, '') not in ('Espèces', 'Wave', 'Orange Money', 'Autre') then raise exception 'invalid payment method'; end if;
  select response into v_response from private.idempotency_keys where user_id = v_user and operation = 'record_client_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;
  select * into v_client from public.clients where boutique_id = p_boutique_id and id = p_client_id;
  if not found then raise exception 'client not found'; end if;
  select coalesce(sum(greatest(0, round(i.montant - i.acompte, 2))), 0) into v_total_due from public.invoices i where i.boutique_id = p_boutique_id and lower(coalesce(i.type, '')) <> 'retour' and i.status <> 'annulée' and i.client_id = p_client_id;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');
  v_paid_at := ((coalesce(p_payment_date, current_date) + (now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar');
  v_remaining := v_requested;

  for v_invoice in select i.* from public.invoices i where i.boutique_id = p_boutique_id and lower(coalesce(i.type, '')) <> 'retour' and i.status <> 'annulée' and i.client_id = p_client_id and i.montant > i.acompte + v_epsilon order by i.invoice_date asc, i.numero asc, i.id asc for update loop
    exit when v_remaining <= v_epsilon;
    v_applied := least(v_remaining, greatest(0, round(v_invoice.montant - v_invoice.acompte, 2)));
    if v_applied <= 0 then continue; end if;
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
    v_new := round(v_invoice.acompte + v_applied, 2);
    if v_new + v_epsilon >= v_invoice.montant then v_new := v_invoice.montant; end if;
    insert into public.invoice_payments(boutique_id, invoice_id, amount, payment_method, paid_at, operator_id, operator_name, batch_id, source)
    values (p_boutique_id, v_invoice.id, v_applied, p_payment_method, v_paid_at, v_user, v_operator_name, p_idempotency_key, 'client_fifo');
    update public.invoices set acompte = v_new, payment_method = p_payment_method, status = case when v_new + v_epsilon >= montant then 'payée' else 'en_attente' end, stock_deducted_at = coalesce(stock_deducted_at, v_paid_at), updated_at = now() where boutique_id = p_boutique_id and id = v_invoice.id;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object('invoice_id', v_invoice.id, 'amount', v_applied));
    v_total_applied := round(v_total_applied + v_applied, 2); v_remaining := round(v_remaining - v_applied, 2);
  end loop;

  v_advance_amount := greatest(0, round(v_requested - v_total_applied, 2));
  if v_advance_amount <= v_epsilon then v_advance_amount := 0; end if;
  if v_advance_amount > 0 then
    v_advance_key := md5(p_idempotency_key::text || ':client-overflow-advance')::uuid;
    insert into public.client_advances(boutique_id, client_id, amount, payment_method, paid_at, operator_id, operator_name, idempotency_key)
    values (p_boutique_id, p_client_id, v_advance_amount, p_payment_method, v_paid_at, v_user, v_operator_name, v_advance_key)
    on conflict (boutique_id, operator_id, idempotency_key) do nothing returning * into v_advance;
    if not found then select * into v_advance from public.client_advances where boutique_id = p_boutique_id and operator_id = v_user and idempotency_key = v_advance_key; end if;
  end if;
  v_response := jsonb_build_object('client_id', p_client_id, 'requested_amount', v_requested, 'applied_amount', v_total_applied, 'advance_amount', v_advance_amount, 'remaining_due', greatest(0, round(v_total_due - v_total_applied, 2)), 'paid_at', v_paid_at, 'batch_id', p_idempotency_key, 'operator_id', v_user, 'operator_name', v_operator_name, 'allocations', v_allocations, 'advance', case when v_advance_amount > 0 then jsonb_build_object('advance_id', v_advance.id, 'client_id', v_advance.client_id, 'amount', v_advance.amount, 'payment_method', v_advance.payment_method, 'paid_at', v_advance.paid_at, 'recorded_at', v_advance.recorded_at, 'operator_id', v_advance.operator_id, 'operator_name', v_advance.operator_name, 'note', v_advance.note) else null end);
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'record_client_payment', p_idempotency_key, v_response) on conflict (user_id, operation, key) do nothing;
  return v_response;
end;
$$;

create or replace function public.record_multi_payment(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_epsilon constant numeric := 0.01;
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_invoice public.invoices%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_amount numeric;
  v_method text;
  v_total_requested numeric := 0;
  v_total_applied numeric := 0;
  v_remaining numeric;
  v_line_key uuid;
  v_line_result jsonb;
  v_payments_result jsonb := '[]'::jsonb;
  v_advance_allocations jsonb := '[]'::jsonb;
  v_last_result jsonb;
  v_stock_deducted boolean := false;
  v_response jsonb;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select response into v_existing from private.idempotency_keys where user_id = v_user and operation = 'record_multi_payment' and key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then raise exception 'payments required'; end if;
  select * into v_invoice from public.invoices where boutique_id = p_boutique_id and id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type, '')) = 'retour' or v_invoice.status = 'annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  v_remaining := greatest(0, round(v_invoice.montant - v_invoice.acompte, 2));

  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_amount := round(coalesce((v_item->>'amount')::numeric, 0), 2);
    v_method := coalesce(nullif(trim(v_item->>'paymentMethod'), ''), nullif(trim(v_item->>'method'), ''), 'Autre');
    if v_amount <= 0 then raise exception 'payment amount must be positive'; end if;
    if v_method not in ('Espèces', 'Wave', 'Orange Money', 'Autre', 'Avoir client') then raise exception 'invalid payment method'; end if;
    if v_method = 'Avoir client' and v_invoice.client_id is null then raise exception 'invoice has no registered client'; end if;
    v_total_requested := v_total_requested + v_amount;
  end loop;
  if v_total_requested > v_remaining + v_epsilon then raise exception 'payment total exceeds remaining amount'; end if;

  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_index := v_index + 1;
    v_amount := round((v_item->>'amount')::numeric, 2);
    v_method := coalesce(nullif(trim(v_item->>'paymentMethod'), ''), nullif(trim(v_item->>'method'), ''), 'Autre');
    v_line_key := md5(p_idempotency_key::text || ':' || v_index::text)::uuid;
    if v_method = 'Avoir client' then
      v_line_result := public.apply_client_advance_to_invoice(p_boutique_id, p_invoice_id, v_line_key, v_amount);
      v_advance_allocations := v_advance_allocations || coalesce(v_line_result->'allocations', '[]'::jsonb);
    else
      v_line_result := public.record_payment(p_boutique_id, p_invoice_id, v_line_key, v_amount, v_method);
    end if;
    v_payments_result := v_payments_result || jsonb_build_array(v_line_result->'payment');
    v_last_result := v_line_result;
    v_total_applied := round(v_total_applied + coalesce((v_line_result->>'applied_amount')::numeric, 0), 2);
    v_stock_deducted := v_stock_deducted or coalesce((v_line_result->>'stock_deducted')::boolean, false);
  end loop;
  v_response := jsonb_build_object('invoice_id', p_invoice_id, 'acompte', (v_last_result->>'acompte')::numeric, 'applied_amount', v_total_applied, 'status', v_last_result->>'status', 'stock_deducted', v_stock_deducted, 'payments', v_payments_result, 'advance_allocations', v_advance_allocations, 'batch_id', p_idempotency_key);
  insert into private.idempotency_keys(user_id, operation, key, response) values (v_user, 'record_multi_payment', p_idempotency_key, v_response) on conflict (user_id, operation, key) do nothing;
  return v_response;
end;
$$;

revoke all on function public.create_sale(text, uuid, text, text, jsonb, text, bigint, text) from public, anon;
grant execute on function public.create_sale(text, uuid, text, text, jsonb, text, bigint, text) to authenticated;
revoke all on function public.update_pending_sale(text, text, uuid, bigint, text, text, jsonb) from public, anon;
grant execute on function public.update_pending_sale(text, text, uuid, bigint, text, text, jsonb) to authenticated;
revoke all on function public.cancel_pending_sale(text, text, text, text) from public, anon;
grant execute on function public.cancel_pending_sale(text, text, text, text) to authenticated;
revoke all on function public.record_payment(text, text, uuid, numeric, text) from public, anon;
grant execute on function public.record_payment(text, text, uuid, numeric, text) to authenticated;
revoke all on function public.record_client_payment(text, bigint, uuid, numeric, text, date) from public, anon;
grant execute on function public.record_client_payment(text, bigint, uuid, numeric, text, date) to authenticated;
revoke all on function public.record_multi_payment(text, text, uuid, jsonb) from public, anon;
grant execute on function public.record_multi_payment(text, text, uuid, jsonb) to authenticated;

commit;
