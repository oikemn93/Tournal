-- Audit-only final-state reconciliation.
-- These definitions are the exact pg_get_functiondef() forms currently active
-- in production after the stock-integrity rollout. Keeping them byte-for-byte
-- aligned makes the canonical replay fingerprint prove the deployed state.

CREATE OR REPLACE FUNCTION private.enforce_sale_stock_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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

CREATE OR REPLACE FUNCTION public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
