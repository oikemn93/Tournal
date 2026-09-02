begin;

create or replace function private.release_pending_committed_stock(
  p_boutique_id text,
  p_invoice_id text,
  p_user uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
  v_line public.invoice_lines%rowtype;
  v_entry_id bigint;
begin
  select * into v_invoice
  from public.invoices
  where boutique_id=p_boutique_id and id=p_invoice_id
  for update;

  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.type <> 'vente'
     or v_invoice.status <> 'en_attente'
     or coalesce(v_invoice.acompte,0) > 0.01 then
    raise exception 'only an unpaid pending sale can release stock';
  end if;
  if v_invoice.stock_deducted_at is null then return false; end if;

  for v_line in
    select * from public.invoice_lines
    where boutique_id=p_boutique_id and invoice_id=p_invoice_id
    order by product_id,id
  loop
    perform 1 from public.products
    where boutique_id=p_boutique_id and id=v_line.product_id
    for update;
    if not found then raise exception 'product not found for invoice line %', v_line.product_id; end if;

    update public.products
    set stock=stock+v_line.qty, updated_at=now()
    where boutique_id=p_boutique_id and id=v_line.product_id;

    v_entry_id := nextval('private.stock_entry_id_seq');
    insert into public.stock_entries(
      id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id
    ) values (
      v_entry_id,p_boutique_id,v_line.product_id,'ajustement',v_line.qty,
      coalesce(v_line.prix_achat,0),now(),p_user,
      coalesce(nullif(trim(p_reason),''),'Correction commande')||' '||p_invoice_id,
      p_invoice_id
    );
  end loop;

  update public.stock_entries
  set source_invoice_line_id=null
  where boutique_id=p_boutique_id
    and source_invoice_id=p_invoice_id
    and source_invoice_line_id is not null;

  update public.invoices
  set stock_deducted_at=null, updated_at=now()
  where boutique_id=p_boutique_id and id=p_invoice_id;

  return true;
end;
$$;
revoke all on function private.release_pending_committed_stock(text,text,uuid,text) from public, anon, authenticated;

create or replace function private.enforce_pos_full_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
  v_paid_before numeric;
begin
  select * into v_invoice
  from public.invoices
  where boutique_id = new.boutique_id and id = new.invoice_id
  for update;
  if not found then raise exception 'invoice not found'; end if;

  if coalesce(v_invoice.origin,'pos') = 'pos'
     and lower(coalesce(v_invoice.type,'')) <> 'retour'
     and coalesce(current_setting('tournal.pos_full_split',true),'') <> 'on' then
    select coalesce(sum(ip.amount),0) into v_paid_before
    from public.invoice_payments ip
    where ip.boutique_id = new.boutique_id and ip.invoice_id = new.invoice_id;

    if abs((v_paid_before + coalesce(new.amount,0)) - coalesce(v_invoice.montant,0)) > 0.01 then
      raise exception 'counter sale must be paid in full';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_pos_full_payment() from public, anon, authenticated;

drop trigger if exists trg_enforce_pos_full_payment on public.invoice_payments;
create trigger trg_enforce_pos_full_payment
before insert on public.invoice_payments
for each row execute function private.enforce_pos_full_payment();

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
set search_path = pg_catalog, public, private
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
    or coalesce(v_invoice.acompte, 0) > 0.01 then
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

  if v_invoice.stock_deducted_at is not null then
    perform private.release_pending_committed_stock(p_boutique_id,p_invoice_id,v_user,'Modification commande');
  end if;
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
revoke all on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) from public, anon;
grant execute on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) to authenticated;

create or replace function public.cancel_pending_sale(
  p_boutique_id text,
  p_invoice_id text,
  p_reason text default null,
  p_origin_context text default 'pos'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := auth.uid();
  v_invoice public.invoices%rowtype;
begin
  if v_user is null or not private.auth_has_permission(p_boutique_id, 'annulation_commande') then
    raise exception 'forbidden';
  end if;
  if coalesce(p_origin_context, 'pos') not in ('pos', 'client_profile') then
    raise exception 'invalid order origin';
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and boutique_id = p_boutique_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if coalesce(v_invoice.origin, 'pos') <> coalesce(p_origin_context, 'pos') then
    raise exception 'this order must be managed from its originating screen';
  end if;
  if v_invoice.type <> 'vente' or v_invoice.status <> 'en_attente'
    or coalesce(v_invoice.acompte, 0) > 0.01 then
    raise exception 'only an unpaid pending sale can be cancelled';
  end if;

  if v_invoice.stock_deducted_at is not null then
    perform private.release_pending_committed_stock(p_boutique_id,p_invoice_id,v_user,'Annulation commande');
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
revoke all on function public.cancel_pending_sale(text,text,text,text) from public, anon;
grant execute on function public.cancel_pending_sale(text,text,text,text) to authenticated;

commit;
