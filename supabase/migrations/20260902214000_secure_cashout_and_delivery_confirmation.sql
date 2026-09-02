-- Cash-out authorization + client delivery stock lifecycle.
-- All authenticated money outflows are guarded server-side by the decaissement permission.

alter table public.invoices
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists delivery_confirmed_by uuid;

comment on column public.invoices.delivery_confirmed_at is 'Explicit delivery confirmation for client_profile sales. Stock is committed independently from payment.';
comment on column public.invoices.delivery_confirmed_by is 'Authenticated user who confirmed delivery for a client_profile sale.';

create or replace function private.enforce_charge_disbursement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_cash_out boolean := false;
begin
  if tg_op = 'INSERT' then
    v_cash_out := coalesce(new.paid_amount, 0) > 0
      or (lower(coalesce(new.status,'')) = 'paid' and coalesce(new.source,'manual') in ('manual','supplier_payment'));
  else
    v_cash_out := coalesce(new.paid_amount,0) > coalesce(old.paid_amount,0) + 0.000001;
  end if;

  if v_cash_out and v_user is not null and not private.auth_has_permission(new.boutique_id, 'decaissement') then
    raise exception 'forbidden: disbursement permission required';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_charge_disbursement() from public, anon, authenticated;

drop trigger if exists trg_enforce_charge_disbursement on public.charges;
create trigger trg_enforce_charge_disbursement
before insert or update of paid_amount, status on public.charges
for each row execute function private.enforce_charge_disbursement();

create or replace function private.enforce_client_credit_refund_disbursement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is not null and (
    not private.auth_has_permission(new.boutique_id, 'remboursement')
    or not private.auth_has_permission(new.boutique_id, 'decaissement')
  ) then
    raise exception 'forbidden: refund and disbursement permissions required';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_client_credit_refund_disbursement() from public, anon, authenticated;

drop trigger if exists trg_client_credit_refund_disbursement on public.client_credit_refunds;
create trigger trg_client_credit_refund_disbursement
before insert or update of amount on public.client_credit_refunds
for each row execute function private.enforce_client_credit_refund_disbursement();

-- POS/comptoir returns are always direct refunds when money was actually collected.
-- Registered-client credit remains exclusive to sales created from Clients.
do $do$
declare
  v_def text;
  v_old text := 'if v_original.client_id is not null then';
  v_new text := 'if coalesce(v_original.origin,''pos'')=''client_profile'' and v_original.client_id is not null then';
begin
  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure) into v_def;
  if position(v_old in v_def) = 0 then raise exception 'return_sale shape changed'; end if;
  execute replace(v_def, v_old, v_new);
end
$do$;

create or replace function private.commit_invoice_stock(
  p_boutique_id text,
  p_invoice_id text,
  p_committed_at timestamptz,
  p_user uuid,
  p_mark_delivery boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
  v_line public.invoice_lines%rowtype;
  v_product public.products%rowtype;
  v_entry_id bigint;
  v_fifo_cost numeric;
begin
  select * into v_invoice
  from public.invoices
  where boutique_id = p_boutique_id and id = p_invoice_id
  for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,'')) = 'retour' or v_invoice.status = 'annulée' then
    raise exception 'stock cannot be committed for this invoice';
  end if;
  if v_invoice.stock_deducted_at is not null then return false; end if;

  for v_line in
    select * from public.invoice_lines
    where boutique_id = p_boutique_id and invoice_id = p_invoice_id
    order by product_id, id
  loop
    select * into v_product
    from public.products
    where boutique_id = p_boutique_id and id = v_line.product_id
    for update;
    if not found then raise exception 'product not found for invoice line %', v_line.product_id; end if;
    if v_product.stock + 0.000001 < v_line.qty then
      raise exception 'insufficient stock for %', v_line.nom;
    end if;

    update public.products
    set stock = stock - v_line.qty, updated_at = now()
    where boutique_id = p_boutique_id and id = v_line.product_id;

    v_entry_id := nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(
      id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id
    ) values (
      v_entry_id,p_boutique_id,v_line.product_id,'ajustement',-v_line.qty,v_line.prix_unit,
      p_committed_at,p_user,'Vente '||p_invoice_id,p_invoice_id,v_line.id
    );
    v_fifo_cost := private.fifo_outflow_cost(p_boutique_id,v_line.product_id,v_entry_id);
    if v_fifo_cost > 0 and v_line.qty > 0 then
      update public.invoice_lines set prix_achat = round(v_fifo_cost/v_line.qty,4) where id = v_line.id;
    end if;
  end loop;

  update public.invoices
  set stock_deducted_at = p_committed_at,
      delivery_confirmed_at = case when p_mark_delivery then coalesce(delivery_confirmed_at,p_committed_at) else delivery_confirmed_at end,
      delivery_confirmed_by = case when p_mark_delivery then coalesce(delivery_confirmed_by,p_user) else delivery_confirmed_by end,
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_invoice_id;
  return true;
end;
$$;

revoke all on function private.commit_invoice_stock(text,text,timestamptz,uuid,boolean) from public, anon, authenticated;

-- Deferred line trigger keeps POS stock commitment in the same transaction as create_sale,
-- after all invoice lines have been inserted.
create or replace function private.commit_pos_stock_after_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices
  where boutique_id = new.boutique_id and id = new.invoice_id;
  if found
     and lower(coalesce(v_invoice.type,'')) <> 'retour'
     and coalesce(v_invoice.origin,'pos') = 'pos'
     and v_invoice.status <> 'annulée'
     and v_invoice.stock_deducted_at is null then
    perform private.commit_invoice_stock(new.boutique_id,new.invoice_id,now(),auth.uid(),false);
  end if;
  return null;
end;
$$;
revoke all on function private.commit_pos_stock_after_invoice_line() from public, anon, authenticated;

drop trigger if exists trg_commit_pos_stock_after_invoice_line on public.invoice_lines;
create constraint trigger trg_commit_pos_stock_after_invoice_line
after insert on public.invoice_lines
deferrable initially deferred
for each row execute function private.commit_pos_stock_after_invoice_line();

create or replace function public.confirm_client_delivery(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_existing jsonb;
  v_invoice public.invoices%rowtype;
  v_now timestamptz := now();
  v_committed boolean := false;
  v_response jsonb;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id,'vente') then raise exception 'forbidden'; end if;
  select response into v_existing from private.idempotency_keys
  where user_id=v_user and operation='confirm_client_delivery' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_invoice from public.invoices
  where boutique_id=p_boutique_id and id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if coalesce(v_invoice.origin,'pos') <> 'client_profile' then raise exception 'delivery confirmation is only available for client orders'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'delivery cannot be confirmed for this invoice'; end if;

  if v_invoice.stock_deducted_at is null then
    v_committed := private.commit_invoice_stock(p_boutique_id,p_invoice_id,v_now,v_user,true);
  end if;

  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id;
  if v_invoice.delivery_confirmed_at is null and v_invoice.stock_deducted_at is not null then
    -- Legacy client invoices may already have had stock deducted by an old payment flow.
    -- Do not deduct again; record only the explicit confirmation now.
    update public.invoices
    set delivery_confirmed_at=v_now, delivery_confirmed_by=v_user, updated_at=now()
    where boutique_id=p_boutique_id and id=p_invoice_id;
    v_invoice.delivery_confirmed_at := v_now;
    v_invoice.delivery_confirmed_by := v_user;
  end if;

  insert into public.audit_log(boutique_id,user_id,action,detail,icon,source)
  values(p_boutique_id,v_user,'Livraison client confirmée',p_invoice_id,'📦','native');

  v_response := jsonb_build_object(
    'invoice_id',p_invoice_id,
    'stock_committed',v_committed,
    'stock_deducted_at',v_invoice.stock_deducted_at,
    'delivery_confirmed_at',v_invoice.delivery_confirmed_at,
    'delivery_confirmed_by',v_invoice.delivery_confirmed_by
  );
  insert into private.idempotency_keys(user_id,operation,key,response)
  values(v_user,'confirm_client_delivery',p_idempotency_key,v_response)
  on conflict(user_id,operation,key) do nothing;
  return v_response;
end;
$$;

revoke all on function public.confirm_client_delivery(text,text,uuid) from public, anon;
grant execute on function public.confirm_client_delivery(text,text,uuid) to authenticated;

-- Payments must never be the event that commits stock for a Clients invoice.
-- Preserve legacy POS fallback only.
do $do$
declare
  v_def text;
  v_stock_cond text := 'if v_invoice.stock_deducted_at is null then';
  v_stock_pos_cond text := 'if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,''pos'')=''pos'' then';
  v_update text := 'stock_deducted_at=coalesce(stock_deducted_at,v_paid_at)';
  v_update_pos text := 'stock_deducted_at=case when coalesce(v_invoice.origin,''pos'')=''pos'' then coalesce(stock_deducted_at,v_paid_at) else stock_deducted_at end';
begin
  select pg_get_functiondef('public.record_payment(text,text,uuid,numeric,text)'::regprocedure) into v_def;
  if position(v_stock_cond in v_def)=0 or position(v_update in v_def)=0 then raise exception 'record_payment shape changed'; end if;
  v_def := replace(v_def,v_stock_cond,v_stock_pos_cond);
  v_def := replace(v_def,v_update,v_update_pos);
  execute v_def;

  select pg_get_functiondef('public.record_client_payment(text,bigint,uuid,numeric,text,date)'::regprocedure) into v_def;
  if position(v_stock_cond in v_def)=0 or position(v_update in v_def)=0 then raise exception 'record_client_payment shape changed'; end if;
  v_def := replace(v_def,v_stock_cond,v_stock_pos_cond);
  v_def := replace(v_def,v_update,v_update_pos);
  execute v_def;
end
$do$;

-- Explicit assertions document the RLS/write boundary relied upon by this migration.
do $do$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('charges','client_credit_refunds','invoice_payments','invoices','stock_entries')
      and cmd in ('INSERT','UPDATE','DELETE','ALL') and 'authenticated'=any(roles)
  ) then
    raise exception 'unexpected authenticated write policy on protected cash/ledger tables';
  end if;
end
$do$;
