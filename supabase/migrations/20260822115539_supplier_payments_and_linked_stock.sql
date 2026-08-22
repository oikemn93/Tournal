-- A supplier is an accounting counterparty, not a display name.  New stock
-- receipts and payments therefore use the supplier's scoped primary key.
-- Legacy imports are only linked when their free-text label has one exact
-- supplier match in the same boutique; ambiguous or non-supplier history is
-- deliberately preserved as-is.
begin;

set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.stock_entries
  add column if not exists supplier_id bigint;

alter table public.charges
  add column if not exists supplier_id bigint,
  add column if not exists payment_method text;

update public.stock_entries e
set supplier_id = matched.supplier_id
from (
  select e2.boutique_id, e2.id, min(s.id) as supplier_id
  from public.stock_entries e2
  join public.suppliers s
    on s.boutique_id = e2.boutique_id
   and lower(trim(s.nom)) = lower(trim(e2.note))
  where e2.type = 'achat'
    and e2.supplier_id is null
  group by e2.boutique_id, e2.id
  having count(*) = 1
) matched
where e.boutique_id = matched.boutique_id
  and e.id = matched.id
  and e.supplier_id is null;

update public.charges c
set supplier_id = matched.supplier_id
from (
  select c2.boutique_id, c2.id, min(s.id) as supplier_id
  from public.charges c2
  join public.suppliers s
    on s.boutique_id = c2.boutique_id
   and lower(trim(s.nom)) = lower(trim(c2.fournisseur))
  where c2.fournisseur is not null
    and c2.supplier_id is null
  group by c2.boutique_id, c2.id
  having count(*) = 1
) matched
where c.boutique_id = matched.boutique_id
  and c.id = matched.id
  and c.supplier_id is null;

alter table public.stock_entries
  drop constraint if exists stock_entries_supplier_id_fkey,
  add constraint stock_entries_boutique_id_supplier_id_fkey
    foreign key (boutique_id, supplier_id)
    references public.suppliers (boutique_id, id)
    on delete restrict;

alter table public.charges
  drop constraint if exists charges_supplier_id_fkey,
  drop constraint if exists charges_payment_method_check,
  add constraint charges_boutique_id_supplier_id_fkey
    foreign key (boutique_id, supplier_id)
    references public.suppliers (boutique_id, id)
    on delete restrict,
  add constraint charges_payment_method_check
    check (payment_method is null or payment_method in ('Espèces', 'Wave', 'Orange Money', 'Autre'));

create index if not exists stock_entries_supplier_ledger_idx
  on public.stock_entries (boutique_id, supplier_id, entry_date desc)
  where supplier_id is not null;

create index if not exists charges_supplier_ledger_idx
  on public.charges (boutique_id, supplier_id, charge_date desc)
  where supplier_id is not null;

-- The eight-argument form is the canonical writer used by the current client.
-- Supplier-scoped adjustments are signed, so correcting or cancelling a
-- receipt also corrects the amount owed.
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
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_product public.products%rowtype;
  v_supplier public.suppliers%rowtype;
  v_entry_id bigint;
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
    operator_id, note, supplier_id
  ) values (
    v_entry_id, p_boutique_id, p_product_id, p_type, p_qty,
    coalesce(p_prix_unit, 0), now(), v_user,
    coalesce(nullif(trim(p_note), ''), v_supplier.nom), p_supplier_id
  );

  if p_supplier_id is not null and p_type = 'achat' and p_qty > 0 then
    update public.suppliers
    set last_delivery_at = now(), updated_at = now()
    where boutique_id = p_boutique_id and id = p_supplier_id;
  end if;

  v_response := jsonb_build_object(
    'entry_id', v_entry_id,
    'product_id', p_product_id,
    'stock', v_product.stock + p_qty,
    'supplier_id', p_supplier_id
  );
  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'stock_movement', p_idempotency_key, v_response);
  return v_response;
end;
$$;

-- Keep already-open clients compatible during rollout. Their old request is
-- converted to an ID link only when its note identifies one supplier exactly.
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
    p_boutique_id, p_product_id, p_idempotency_key, p_qty,
    p_type, p_prix_unit, p_note, v_supplier_id
  );
end;
$$;

create or replace function public.update_supplier(
  p_boutique_id text,
  p_supplier_id bigint,
  p_nom text,
  p_tel text default null,
  p_ville text default null,
  p_email text default null,
  p_contact text default null
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
      initials = upper(left(v_name, 1) || coalesce(nullif(left(split_part(v_name, ' ', 2), 1), ''::text))),
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_supplier_id;

  update public.products
  set supplier_name = v_name, updated_at = now()
  where boutique_id = p_boutique_id and supplier_name = v_supplier.nom;

  return jsonb_build_object('supplier_id', p_supplier_id);
end;
$$;

create or replace function public.record_supplier_payment(
  p_boutique_id text,
  p_supplier_id bigint,
  p_idempotency_key uuid,
  p_montant numeric,
  p_payment_method text,
  p_note text default null
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
  v_stock_due numeric := 0;
  v_transfer_due numeric := 0;
  v_regular_payments numeric := 0;
  v_due numeric := 0;
  v_applied numeric := 0;
  v_charge_id bigint;
  v_paid_at timestamptz := now();
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
    and c.source <> 'transfer';

  v_due := greatest(0, v_stock_due + v_transfer_due - v_regular_payments);
  if v_due <= 0 then
    raise exception 'supplier is already settled';
  end if;
  v_applied := least(p_montant, v_due);

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
    'payment_method', p_payment_method
  );
  insert into private.idempotency_keys (user_id, operation, key, response)
  values (v_user, 'supplier_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;

revoke all on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint) from public, anon;
grant execute on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text, bigint) to authenticated;
revoke all on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text) from public, anon;
grant execute on function public.record_stock_movement(text, bigint, uuid, numeric, text, numeric, text) to authenticated;
revoke all on function public.update_supplier(text, bigint, text, text, text, text, text) from public, anon;
grant execute on function public.update_supplier(text, bigint, text, text, text, text, text) to authenticated;
revoke all on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text) from public, anon;
grant execute on function public.record_supplier_payment(text, bigint, uuid, numeric, text, text) to authenticated;

commit;
