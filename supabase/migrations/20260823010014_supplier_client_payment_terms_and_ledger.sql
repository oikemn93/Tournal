-- Supplier and client payment terms are stored in the database, and not only
-- in the interface. Supplier stock receipts become one linked payable charge
-- each; the existing supplier-payment charge remains the cash-payment record.
begin;

set local lock_timeout = '10s';
set local statement_timeout = '45s';

alter table public.auth_settings
  add column if not exists supplier_payment_terms_days integer not null default 30,
  add column if not exists client_payment_terms_days integer not null default 30;

alter table public.auth_settings
  drop constraint if exists auth_settings_supplier_payment_terms_days_check,
  drop constraint if exists auth_settings_client_payment_terms_days_check,
  add constraint auth_settings_supplier_payment_terms_days_check
    check (supplier_payment_terms_days between 0 and 3650) not valid,
  add constraint auth_settings_client_payment_terms_days_check
    check (client_payment_terms_days between 0 and 3650) not valid;

alter table public.auth_settings
  validate constraint auth_settings_supplier_payment_terms_days_check,
  validate constraint auth_settings_client_payment_terms_days_check;

alter table public.suppliers
  add column if not exists notes text,
  add column if not exists payment_terms_days integer;

alter table public.suppliers
  drop constraint if exists suppliers_payment_terms_days_check,
  add constraint suppliers_payment_terms_days_check
    check (payment_terms_days is null or payment_terms_days between 0 and 3650) not valid;

alter table public.suppliers
  validate constraint suppliers_payment_terms_days_check;

alter table public.clients
  add column if not exists payment_terms_days integer;

alter table public.clients
  drop constraint if exists clients_payment_terms_days_check,
  add constraint clients_payment_terms_days_check
    check (payment_terms_days is null or payment_terms_days between 0 and 3650) not valid;

alter table public.clients
  validate constraint clients_payment_terms_days_check;

alter table public.stock_entries
  add column if not exists reference text;

alter table public.charges
  add column if not exists due_date date,
  add column if not exists stock_entry_id bigint;

alter table public.invoices
  add column if not exists due_date date;

alter table public.charges
  drop constraint if exists charges_boutique_stock_entry_fkey,
  add constraint charges_boutique_stock_entry_fkey
    foreign key (boutique_id, stock_entry_id)
    references public.stock_entries (boutique_id, id)
    on delete restrict;

create unique index if not exists charges_one_supplier_receipt_per_stock_entry_idx
  on public.charges (boutique_id, stock_entry_id)
  where stock_entry_id is not null;

create index if not exists charges_supplier_receipt_due_idx
  on public.charges (boutique_id, supplier_id, due_date, id)
  where source = 'supplier_receipt' and status <> 'paid';

create index if not exists invoices_client_due_idx
  on public.invoices (boutique_id, client_id, due_date, id)
  where due_date is not null and status <> 'payée';

-- Backfill only receipts already linked to a canonical supplier. Older imports
-- without a reliable supplier ID are deliberately left untouched rather than
-- guessing a counterparty.
insert into public.charges (
  id, boutique_id, label, montant, categorie, charge_date, operator_id,
  note, fournisseur, supplier_id, status, paid_amount, source, stock_entry_id,
  due_date
)
select
  nextval('private.charge_id_seq'),
  e.boutique_id,
  'Réception stock · ' || coalesce(p.nom, 'Fournisseur'),
  e.qty * coalesce(e.prix_unit, 0),
  'Achat stock',
  e.entry_date,
  e.operator_id,
  nullif(trim(e.note), ''),
  p.nom,
  e.supplier_id,
  'pending',
  0,
  'supplier_receipt',
  e.id,
  (e.entry_date at time zone 'Africa/Dakar')::date
    + coalesce(p.payment_terms_days, settings.supplier_payment_terms_days, 30)
from public.stock_entries e
join public.suppliers p
  on p.boutique_id = e.boutique_id
 and p.id = e.supplier_id
left join public.auth_settings settings
  on settings.boutique_id = e.boutique_id
left join public.charges existing
  on existing.boutique_id = e.boutique_id
 and existing.stock_entry_id = e.id
where e.type = 'achat'
  and e.qty > 0
  and e.supplier_id is not null
  and e.qty * coalesce(e.prix_unit, 0) > 0
  and existing.id is null;

-- Existing supplier payments are retained as the historical cash ledger, and
-- are reflected on the newly linked receipt charges in FIFO order. This does
-- not alter any amount owed: it only makes the linked-charge statuses truthful.
do $$
declare
  v_payment record;
  v_receipt record;
  v_remaining numeric;
  v_open numeric;
  v_applied numeric;
begin
  for v_payment in
    select id, boutique_id, supplier_id, montant
    from public.charges
    where source = 'supplier_payment'
      and supplier_id is not null
    order by charge_date asc, id asc
  loop
    v_remaining := v_payment.montant;
    for v_receipt in
      select id, montant, paid_amount
      from public.charges
      where boutique_id = v_payment.boutique_id
        and supplier_id = v_payment.supplier_id
        and source = 'supplier_receipt'
        and paid_amount < montant
      order by charge_date asc, id asc
      for update
    loop
      exit when v_remaining <= 0;
      v_open := v_receipt.montant - v_receipt.paid_amount;
      v_applied := least(v_remaining, v_open);
      update public.charges
      set paid_amount = paid_amount + v_applied,
          status = case when paid_amount + v_applied >= montant then 'paid' else 'partial' end,
          updated_at = now()
      where id = v_receipt.id
        and boutique_id = v_payment.boutique_id;
      v_remaining := v_remaining - v_applied;
    end loop;
  end loop;
end;
$$;

-- Canonical stock writer. The new optional reference is persisted with the
-- receipt, and every positive supplier receipt receives one idempotent payable
-- charge with the supplier/boutique payment term applied.
create or replace function public.record_stock_movement(
  p_boutique_id text,
  p_product_id bigint,
  p_idempotency_key uuid,
  p_qty numeric,
  p_type text,
  p_prix_unit numeric,
  p_note text,
  p_supplier_id bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
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
  if v_existing is not null then
    return v_existing;
  end if;

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
    if not found then
      raise exception 'supplier not found';
    end if;
  end if;

  select * into v_product
  from public.products
  where boutique_id = p_boutique_id and id = p_product_id
  for update;
  if not found or v_product.stock + p_qty < 0 then
    raise exception 'invalid stock';
  end if;

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

  if p_supplier_id is not null and p_type = 'achat' and p_qty > 0 then
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
$$;

-- Keep the deployed eight-argument call compatible during the rollout.
create or replace function public.record_stock_movement(
  p_boutique_id text,
  p_product_id bigint,
  p_idempotency_key uuid,
  p_qty numeric,
  p_type text,
  p_prix_unit numeric,
  p_note text,
  p_supplier_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  return public.record_stock_movement(
    p_boutique_id, p_product_id, p_idempotency_key, p_qty, p_type,
    p_prix_unit, p_note, p_supplier_id, null
  );
end;
$$;

-- The legacy seven-argument writer resolves a supplier by its historic note,
-- then delegates to the canonical writer above.
create or replace function public.record_stock_movement(
  p_boutique_id text,
  p_product_id bigint,
  p_idempotency_key uuid,
  p_qty numeric,
  p_type text,
  p_prix_unit numeric default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_supplier_id bigint;
begin
  if p_type = 'achat' and p_qty > 0 then
    select s.id into v_supplier_id
    from public.suppliers s
    where s.boutique_id = p_boutique_id
      and lower(trim(s.nom)) = lower(trim(p_note));
    if not found then
      raise exception 'supplier required';
    end if;
  end if;
  return public.record_stock_movement(
    p_boutique_id, p_product_id, p_idempotency_key, p_qty, p_type,
    p_prix_unit, p_note, v_supplier_id, null
  );
end;
$$;

-- Supplier editing owns both notes and the optional per-supplier term. All
-- writes remain behind the existing supplier permission and active-session
-- check implemented by private.auth_has_permission.
drop function if exists public.update_supplier(text, bigint, text, text, text, text, text);

create function public.update_supplier(
  p_boutique_id text,
  p_supplier_id bigint,
  p_nom text,
  p_tel text default null,
  p_ville text default null,
  p_email text default null,
  p_contact text default null,
  p_notes text default null,
  p_payment_terms_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_supplier public.suppliers%rowtype;
  v_name text := nullif(trim(p_nom), '');
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'fournisseurs') then
    raise exception 'forbidden';
  end if;
  if v_name is null then
    raise exception 'name required';
  end if;
  if p_payment_terms_days is not null and p_payment_terms_days not between 0 and 3650 then
    raise exception 'invalid payment terms';
  end if;

  select * into v_supplier
  from public.suppliers
  where boutique_id = p_boutique_id and id = p_supplier_id
  for update;
  if not found then
    raise exception 'supplier not found';
  end if;
  if exists (
    select 1 from public.suppliers s
    where s.boutique_id = p_boutique_id
      and s.id <> p_supplier_id
      and lower(trim(s.nom)) = lower(v_name)
  ) then
    raise exception 'supplier_name_exists';
  end if;

  update public.suppliers
  set nom = v_name,
      tel = nullif(trim(p_tel), ''),
      ville = nullif(trim(p_ville), ''),
      email = nullif(trim(p_email), ''),
      contact = nullif(trim(p_contact), ''),
      notes = nullif(trim(p_notes), ''),
      payment_terms_days = p_payment_terms_days,
      initials = upper(left(v_name, 1) || coalesce(nullif(left(split_part(v_name, ' ', 2), 1), ''::text))),
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_supplier_id;

  update public.products
  set supplier_name = v_name, updated_at = now()
  where boutique_id = p_boutique_id and supplier_name = v_supplier.nom;

  return jsonb_build_object('supplier_id', p_supplier_id);
end;
$$;

-- A client may override the boutique rule only when it is B2B (including the
-- existing Grossiste marker). B2C therefore never receives a due date.
create or replace function public.update_client_payment_terms(
  p_boutique_id text,
  p_client_id bigint,
  p_payment_terms_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_client public.clients%rowtype;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'clients') then
    raise exception 'forbidden';
  end if;
  if p_payment_terms_days is not null and p_payment_terms_days not between 0 and 3650 then
    raise exception 'invalid payment terms';
  end if;

  select * into v_client
  from public.clients
  where boutique_id = p_boutique_id and id = p_client_id
  for update;
  if not found then
    raise exception 'client not found';
  end if;
  if v_client.type <> 'B2B' and p_payment_terms_days is not null then
    raise exception 'payment terms are reserved for B2B clients';
  end if;

  update public.clients
  set payment_terms_days = p_payment_terms_days,
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_client_id;

  return jsonb_build_object('client_id', p_client_id, 'payment_terms_days', p_payment_terms_days);
end;
$$;

-- Supplier payments settle the oldest linked receipt charges first, while the
-- payment itself remains a distinct financial charge. This preserves the
-- established cash-reporting model and gives each receipt an accurate status.
-- The deployed function previously declared trailing defaults. PostgreSQL does
-- not allow CREATE OR REPLACE to remove defaults, so both legacy signatures
-- are dropped inside this transaction and recreated immediately below.
drop function if exists public.record_supplier_payment(text, bigint, uuid, numeric, text, text, date);
drop function if exists public.record_supplier_payment(text, bigint, uuid, numeric, text, text);

create or replace function public.record_supplier_payment(
  p_boutique_id text,
  p_supplier_id bigint,
  p_idempotency_key uuid,
  p_montant numeric,
  p_payment_method text,
  p_note text,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_supplier public.suppliers%rowtype;
  v_receipt public.charges%rowtype;
  v_stock_due numeric := 0;
  v_transfer_due numeric := 0;
  v_regular_payments numeric := 0;
  v_due numeric := 0;
  v_applied numeric := 0;
  v_remaining numeric := 0;
  v_from_receipt numeric;
  v_charge_id bigint;
  v_paid_at timestamptz;
  v_operator_name text;
  v_allocations jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  if v_user is null
     or not private.auth_has_permission(p_boutique_id, 'fournisseurs')
     or not private.auth_has_permission(p_boutique_id, 'charges') then
    raise exception 'forbidden';
  end if;
  if p_montant is null or p_montant <= 0 then
    raise exception 'invalid payment';
  end if;
  if p_payment_method is null
     or p_payment_method not in ('Espèces', 'Wave', 'Orange Money', 'Autre') then
    raise exception 'invalid payment method';
  end if;

  select response into v_existing
  from private.idempotency_keys
  where user_id = v_user and operation = 'supplier_payment' and key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_supplier
  from public.suppliers
  where boutique_id = p_boutique_id and id = p_supplier_id
  for update;
  if not found then
    raise exception 'supplier not found';
  end if;

  select coalesce(sum(e.qty * coalesce(e.prix_unit, 0)), 0)
  into v_stock_due
  from public.stock_entries e
  where e.boutique_id = p_boutique_id
    and e.supplier_id = p_supplier_id
    and e.type in ('achat', 'ajustement');

  select coalesce(sum(c.montant - c.paid_amount), 0)
  into v_transfer_due
  from public.charges c
  where c.boutique_id = p_boutique_id
    and c.supplier_id = p_supplier_id
    and c.source = 'transfer';

  select coalesce(sum(c.montant), 0)
  into v_regular_payments
  from public.charges c
  where c.boutique_id = p_boutique_id
    and c.supplier_id = p_supplier_id
    -- Historic manually recorded supplier payments remain valid cash payments.
    -- The new supplier_receipt source is the only payable document and must
    -- never be subtracted a second time.
    and c.source is distinct from 'transfer'
    and c.source is distinct from 'supplier_receipt';

  v_due := greatest(0, v_stock_due + v_transfer_due - v_regular_payments);
  if v_due <= 0 then
    raise exception 'supplier is already settled';
  end if;
  v_applied := least(p_montant, v_due);
  v_paid_at := ((coalesce(p_payment_date, current_date)
    + (now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar');
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');

  v_remaining := v_applied;
  for v_receipt in
    select *
    from public.charges
    where boutique_id = p_boutique_id
      and supplier_id = p_supplier_id
      and source = 'supplier_receipt'
      and paid_amount < montant
    order by charge_date asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_from_receipt := least(v_remaining, v_receipt.montant - v_receipt.paid_amount);
    update public.charges
    set paid_amount = paid_amount + v_from_receipt,
        status = case when paid_amount + v_from_receipt >= montant then 'paid' else 'partial' end,
        updated_at = now()
    where boutique_id = p_boutique_id and id = v_receipt.id;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'charge_id', v_receipt.id,
      'amount', v_from_receipt
    ));
    v_remaining := v_remaining - v_from_receipt;
  end loop;

  v_charge_id := nextval('private.charge_id_seq');
  insert into public.charges (
    id, boutique_id, label, montant, categorie, charge_date, operator_id,
    note, fournisseur, supplier_id, payment_method, status, paid_amount, source
  ) values (
    v_charge_id, p_boutique_id, 'Versement fournisseur · ' || v_supplier.nom,
    v_applied, 'Achat stock', v_paid_at, v_user, nullif(trim(p_note), ''),
    v_supplier.nom, p_supplier_id, p_payment_method, 'paid', v_applied,
    'supplier_payment'
  );

  v_response := jsonb_build_object(
    'charge_id', v_charge_id,
    'supplier_id', p_supplier_id,
    'applied_amount', v_applied,
    'remaining_due', v_due - v_applied,
    'paid_at', v_paid_at,
    'payment_method', p_payment_method,
    'operator_name', v_operator_name,
    'allocations', v_allocations
  );
  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'supplier_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;

-- Current deployed clients without a payment-date field retain the same
-- behaviour; this wrapper delegates to the canonical dated RPC.
create or replace function public.record_supplier_payment(
  p_boutique_id text,
  p_supplier_id bigint,
  p_idempotency_key uuid,
  p_montant numeric,
  p_payment_method text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  return public.record_supplier_payment(
    p_boutique_id, p_supplier_id, p_idempotency_key, p_montant,
    p_payment_method, p_note, current_date
  );
end;
$$;

-- Invoices for B2B and wholesale clients receive a due date at creation.
-- B2C invoices intentionally stay without a credit deadline.
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
    select settings.client_payment_terms_days
      into v_payment_terms_days
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
    id, boutique_id, numero, client_id, client_nom, client_tel, montant, acompte,
    invoice_date, status, type, payment_method, operator_id, stock_deducted_at,
    due_date
  ) values (
    v_invoice_id, p_boutique_id, v_numero,
    case when v_client.id is not null then v_client.id else null end,
    coalesce(v_client.nom, p_client_nom, 'Client comptoir'),
    coalesce(v_client.tel, p_client_tel), v_total, 0, now(), 'en_attente',
    'vente', p_payment_method, v_user, null, v_due_date
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
    'client_id', case when v_client.id is not null then v_client.id else null end,
    'total', v_total,
    'stock_deducted', false,
    'due_date', v_due_date
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'create_sale', p_idempotency_key, v_response);
  return v_response;
end;
$$;

-- One daily, idempotent job emits a heads-up within three days of maturity and
-- a distinct alert once a receivable becomes overdue. Notifications use the
-- existing channel preferences and are delivered to responsible owners.
create or replace function private.emit_payment_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receivable record;
  v_sent integer := 0;
  v_state text;
begin
  for v_receivable in
    select c.id, c.boutique_id, c.supplier_id, c.due_date, c.montant,
           c.paid_amount, s.nom as counterparty_name
    from public.charges c
    join public.suppliers s
      on s.boutique_id = c.boutique_id and s.id = c.supplier_id
    where c.source = 'supplier_receipt'
      and c.due_date is not null
      and c.paid_amount < c.montant
      and c.due_date <= current_date + 3
  loop
    v_state := case when v_receivable.due_date < current_date then 'overdue' else 'due-soon' end;
    perform private.emit_important_notification(
      v_receivable.boutique_id,
      'supplier',
      case when v_state = 'overdue' then 'Paiement fournisseur en retard' else 'Échéance fournisseur proche' end,
      v_receivable.counterparty_name || ' · reste '
        || trim(to_char(v_receivable.montant - v_receivable.paid_amount, 'FM999G999G999G990D00'))
        || ' F · échéance ' || to_char(v_receivable.due_date, 'DD/MM/YYYY'),
      case when v_state = 'overdue' then '🔴' else '⏳' end,
      'fournisseurs',
      jsonb_build_object('supplierId', v_receivable.supplier_id, 'chargeId', v_receivable.id),
      'supplier-due:' || v_state || ':' || v_receivable.id::text,
      true
    );
    v_sent := v_sent + 1;
  end loop;

  for v_receivable in
    select i.id, i.boutique_id, i.client_id, i.due_date, i.montant,
           i.acompte, c.nom as counterparty_name
    from public.invoices i
    join public.clients c
      on c.boutique_id = i.boutique_id and c.id = i.client_id
    where i.type = 'vente'
      and i.due_date is not null
      and i.montant > i.acompte
      and i.due_date <= current_date + 3
  loop
    v_state := case when v_receivable.due_date < current_date then 'overdue' else 'due-soon' end;
    perform private.emit_important_notification(
      v_receivable.boutique_id,
      'client',
      case when v_state = 'overdue' then 'Facture client en retard' else 'Échéance client proche' end,
      v_receivable.counterparty_name || ' · reste '
        || trim(to_char(v_receivable.montant - v_receivable.acompte, 'FM999G999G999G990D00'))
        || ' F · échéance ' || to_char(v_receivable.due_date, 'DD/MM/YYYY'),
      case when v_state = 'overdue' then '🔴' else '⏳' end,
      'clients',
      jsonb_build_object('clientId', v_receivable.client_id, 'invoiceId', v_receivable.id),
      'client-due:' || v_state || ':' || v_receivable.id,
      true
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

revoke all on function private.emit_payment_due_notifications() from public, anon, authenticated, service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'emit-payment-due-notifications';

select cron.schedule(
  'emit-payment-due-notifications',
  '5 8 * * *',
  $$select private.emit_payment_due_notifications();$$
);

revoke all on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint, text) from public, anon;
grant execute on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint, text) to authenticated;
revoke all on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint) from public, anon;
grant execute on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint) to authenticated;
revoke all on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text) from public, anon;
grant execute on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text) to authenticated;
revoke all on function public.update_supplier(text, bigint, text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.update_supplier(text, bigint, text, text, text, text, text, text, integer) to authenticated;
revoke all on function public.update_client_payment_terms(text, bigint, integer) from public, anon;
grant execute on function public.update_client_payment_terms(text, bigint, integer) to authenticated;
revoke all on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text, date) from public, anon;
grant execute on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text, date) to authenticated;
revoke all on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text) from public, anon;
grant execute on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text) to authenticated;
revoke all on function public.create_sale(text, uuid, text, text, jsonb, text, bigint) from public, anon;
grant execute on function public.create_sale(text, uuid, text, text, jsonb, text, bigint) to authenticated;

commit;
