create or replace function private.auth_can_collect_payment(p_boutique_id text)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select
    exists (
      select 1 from public.platform_users pu
      where pu.id = auth.uid() and pu.is_super_admin = true
    )
    or exists (
      select 1
      from public.boutique_assignments ba
      where ba.boutique_id = p_boutique_id
        and ba.user_id = auth.uid()
        and (
          ba.role = 'owner'
          or coalesce((ba.droits ->> 'encaissement_vente')::boolean, false)
        )
    );
$$;

create or replace function public.open_caisse_session(p_boutique_id text, p_idempotency_key uuid, p_fond_ouverture numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare v_existing public.caisse_sessions%rowtype; v_session public.caisse_sessions%rowtype;
begin
  if not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select * into v_existing from public.caisse_sessions
   where boutique_id=p_boutique_id and closed_at is null order by opened_at desc limit 1 for update;
  if found then
    return jsonb_build_object('session_id',v_existing.id,'opened_at',v_existing.opened_at,'fond_ouverture',v_existing.fond_ouverture,'already_open',true);
  end if;
  insert into public.caisse_sessions (id,boutique_id,opened_at,fond_ouverture,operator_id,note)
  values ('CS-' || upper(replace(gen_random_uuid()::text,'-','')),p_boutique_id,now(),greatest(coalesce(p_fond_ouverture,0),0),auth.uid(),'Ouverture PDV')
  returning * into v_session;
  return jsonb_build_object('session_id',v_session.id,'opened_at',v_session.opened_at,'fond_ouverture',v_session.fond_ouverture,'already_open',false);
end;
$$;

create or replace function public.close_caisse_session(p_boutique_id text, p_session_id text, p_idempotency_key uuid, p_fond_fermeture numeric default null::numeric, p_total_ventes numeric default 0, p_total_charges numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare v_session public.caisse_sessions%rowtype;
begin
  if not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select * into v_session from public.caisse_sessions where id=p_session_id and boutique_id=p_boutique_id for update;
  if not found then raise exception 'caisse session not found'; end if;
  if v_session.closed_at is null then
    update public.caisse_sessions set closed_at=now(), fond_fermeture=p_fond_fermeture,
      total_ventes=coalesce(p_total_ventes,0), total_charges=coalesce(p_total_charges,0),
      updated_at=now() where id=p_session_id returning * into v_session;
  end if;
  return jsonb_build_object('session_id',v_session.id,'closed_at',v_session.closed_at);
end;
$$;

create or replace function public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_user uuid := auth.uid();
  v_operator_name text;
  v_invoice public.invoices%rowtype;
  v_sale_line public.invoice_lines%rowtype;
  v_response jsonb;
  v_applied numeric;
  v_new numeric;
  v_paid_at timestamptz := now();
  v_payment_id bigint;
  v_stock_deducted boolean := false;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then
    raise exception 'payment access denied';
  end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select response into v_response
  from private.idempotency_keys
  where user_id = v_user and operation = 'record_payment' and key = p_idempotency_key;
  if v_response is not null then return v_response; end if;

  select * into v_invoice
  from public.invoices
  where boutique_id = p_boutique_id and id = p_invoice_id
  for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type, '')) = 'retour' then
    raise exception 'cannot collect payment on a return';
  end if;

  v_applied := least(p_amount, greatest(0, v_invoice.montant - v_invoice.acompte));
  if v_applied <= 0 then raise exception 'invoice already paid'; end if;

  if v_invoice.stock_deducted_at is null then
    for v_sale_line in
      select *
      from public.invoice_lines
      where boutique_id = p_boutique_id and invoice_id = p_invoice_id
      order by product_id, id
    loop
      update public.products
      set stock = stock - v_sale_line.qty
      where boutique_id = p_boutique_id
        and id = v_sale_line.product_id
        and stock >= v_sale_line.qty;
      if not found then
        raise exception 'stock unavailable for product %', v_sale_line.product_id;
      end if;

      insert into public.stock_entries(
        id, boutique_id, product_id, type, qty, prix_unit,
        entry_date, operator_id, note
      ) values (
        nextval('private.stock_entry_id_seq'), p_boutique_id,
        v_sale_line.product_id, 'ajustement', -v_sale_line.qty,
        v_sale_line.prix_unit, v_paid_at, v_user, 'Vente ' || p_invoice_id
      );
    end loop;
    v_stock_deducted := true;
  end if;

  v_new := v_invoice.acompte + v_applied;
  select nom into v_operator_name from public.platform_users where id = v_user;
  v_operator_name := coalesce(v_operator_name, 'Utilisateur');

  insert into public.invoice_payments(
    boutique_id, invoice_id, amount, payment_method, paid_at,
    operator_id, operator_name, batch_id, source
  ) values (
    p_boutique_id, p_invoice_id, v_applied,
    coalesce(nullif(p_payment_method, ''), 'Autre'), v_paid_at,
    v_user, v_operator_name, p_idempotency_key, 'invoice'
  ) returning id into v_payment_id;

  update public.invoices
  set acompte = v_new,
      payment_method = coalesce(nullif(p_payment_method, ''), payment_method),
      status = case when v_new >= montant then 'payée' else 'en_attente' end,
      stock_deducted_at = coalesce(stock_deducted_at, v_paid_at),
      updated_at = now()
  where boutique_id = p_boutique_id and id = p_invoice_id;

  v_response := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'acompte', v_new,
    'applied_amount', v_applied,
    'status', case when v_new >= v_invoice.montant then 'payée' else 'acompte' end,
    'stock_deducted', v_stock_deducted,
    'payment', jsonb_build_object(
      'id', v_payment_id,
      'amount', v_applied,
      'payment_method', coalesce(nullif(p_payment_method, ''), 'Autre'),
      'paid_at', v_paid_at,
      'operator_id', v_user,
      'operator_name', v_operator_name,
      'batch_id', p_idempotency_key,
      'source', 'invoice'
    )
  );
  insert into private.idempotency_keys(user_id, operation, key, response)
  values (v_user, 'record_payment', p_idempotency_key, v_response);
  return v_response;
end;
$$;
