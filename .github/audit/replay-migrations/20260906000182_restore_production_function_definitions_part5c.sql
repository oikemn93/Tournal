-- AUDIT ONLY: exact current production pg_get_functiondef; schema-only, no data.

CREATE OR REPLACE FUNCTION public.record_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_amount numeric, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_epsilon constant numeric:=0.01;
  v_user uuid:=auth.uid(); v_operator_name text; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype;
  v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_paid_at timestamptz:=now(); v_payment_id bigint; v_stock_deducted boolean:=false;
  v_stock_entry_id bigint; v_fifo_cost numeric; v_return_reduction numeric:=0;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  v_requested:=round(coalesce(p_amount,0),2); if v_requested<=0 then raise exception 'amount must be positive'; end if;
  select response into v_response from private.idempotency_keys where user_id=v_user and operation='record_payment' and key=p_idempotency_key;
  if v_response is not null then return v_response; end if;
  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  select coalesce(sum(return_receivable_reduction),0) into v_return_reduction from public.invoices where boutique_id=p_boutique_id and type='Retour' and return_of_invoice_id=p_invoice_id;
  v_remaining:=greatest(0,round(v_invoice.montant-v_invoice.acompte-v_return_reduction,2));
  if v_requested>v_remaining+v_epsilon then raise exception 'payment amount exceeds remaining amount'; end if;
  if coalesce(v_invoice.origin,'pos')='pos' and abs(v_requested-v_remaining)>v_epsilon and coalesce(current_setting('tournal.pos_full_split',true),'')<>'on' then raise exception 'counter sale must be paid in full'; end if; v_applied:=least(v_requested,v_remaining); if v_applied<=0 then raise exception 'invoice already settled'; end if;
  if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,'pos')='pos' and (abs(v_requested-v_remaining)<=v_epsilon or coalesce(current_setting('tournal.pos_full_split',true),'')='on') then
    for v_sale_line in select * from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=p_invoice_id order by product_id,id loop
      update public.products set stock=stock-v_sale_line.qty where boutique_id=p_boutique_id and id=v_sale_line.product_id;
      if not found then raise exception 'product not found for invoice line %',v_sale_line.product_id; end if;
      insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id)
      values(nextval('private.stock_entry_id_seq'),p_boutique_id,v_sale_line.product_id,'ajustement',-v_sale_line.qty,v_sale_line.prix_unit,v_paid_at,v_user,'Vente '||p_invoice_id,p_invoice_id,v_sale_line.id)
      returning id into v_stock_entry_id;
      v_fifo_cost:=private.fifo_outflow_cost(p_boutique_id,v_sale_line.product_id,v_stock_entry_id);
      if v_fifo_cost>0 and v_sale_line.qty>0 then
        update public.invoice_lines set prix_achat=round(v_fifo_cost/v_sale_line.qty,4) where id=v_sale_line.id;
      end if;
    end loop;
    v_stock_deducted:=true;
  end if;
  v_new:=round(v_invoice.acompte+v_applied,2);
  if v_new+v_return_reduction+v_epsilon>=v_invoice.montant then v_new:=least(v_new,v_invoice.montant); end if;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur');
  insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source)
  values(p_boutique_id,p_invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),v_paid_at,v_user,v_operator_name,p_idempotency_key,'invoice') returning id into v_payment_id;
  update public.invoices set acompte=v_new,payment_method=coalesce(nullif(p_payment_method,''),payment_method),status=case when v_new+v_return_reduction+v_epsilon>=montant then 'payée' else 'en_attente' end,stock_deducted_at=case when coalesce(v_invoice.origin,'pos')='pos' then coalesce(stock_deducted_at,v_paid_at) else stock_deducted_at end,updated_at=now() where boutique_id=p_boutique_id and id=p_invoice_id;
  v_response:=jsonb_build_object('invoice_id',p_invoice_id,'acompte',v_new,'applied_amount',v_applied,'remaining_due',greatest(0,round(v_invoice.montant-v_new-v_return_reduction,2)),'status',case when v_new+v_return_reduction+v_epsilon>=v_invoice.montant then 'payée' else 'acompte' end,'stock_deducted',v_stock_deducted,'payment',jsonb_build_object('id',v_payment_id,'amount',v_applied,'payment_method',coalesce(nullif(p_payment_method,''),'Autre'),'paid_at',v_paid_at,'operator_id',v_user,'operator_name',v_operator_name,'batch_id',p_idempotency_key,'source','invoice'));
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_payment',p_idempotency_key,v_response);
  return v_response;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_transfer_charge_payment(p_boutique_id text, p_charge_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$ declare v_user uuid:=auth.uid(); v_existing jsonb; v_charge public.charges%rowtype; v_transfer public.stock_transfers%rowtype; v_invoice public.invoices%rowtype; v_applied numeric; v_charge_paid numeric; v_invoice_paid numeric; v_operator_name text; v_payment_id bigint; v_disbursement_id bigint; v_response jsonb; begin if v_user is null or not private.auth_has_permission(p_boutique_id,'charges') or not private.auth_has_permission(p_boutique_id,'decaissement') then raise exception 'forbidden'; end if; if p_amount<=0 then raise exception 'amount must be positive'; end if; select response into v_existing from private.idempotency_keys where user_id=v_user and operation='transfer_charge_payment' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if; select * into v_charge from public.charges where boutique_id=p_boutique_id and id=p_charge_id for update; if not found or v_charge.source<>'transfer' or v_charge.transfer_id is null then raise exception 'transfer charge not found'; end if; select * into v_transfer from public.stock_transfers where id=v_charge.transfer_id for update; if v_transfer.status<>'accepted' or v_transfer.to_boutique_id<>p_boutique_id then raise exception 'invalid transfer charge'; end if; select * into v_invoice from public.invoices where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id for update; if not found then raise exception 'transfer invoice not found'; end if; v_applied=least(p_amount,greatest(0,v_charge.montant-v_charge.paid_amount)); if v_applied<=0 then raise exception 'charge already paid'; end if; v_charge_paid=v_charge.paid_amount+v_applied; v_invoice_paid=v_invoice.acompte+v_applied; select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name=coalesce(v_operator_name,'Utilisateur'); insert into public.transfer_charge_payments(boutique_id,transfer_id,charge_id,amount,payment_method,operator_id,operator_name,idempotency_key) values(p_boutique_id,v_transfer.id,p_charge_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),v_user,v_operator_name,p_idempotency_key) returning id into v_disbursement_id; insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source) values(v_transfer.from_boutique_id,v_transfer.invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),now(),v_user,v_operator_name,p_idempotency_key,'transfer') returning id into v_payment_id; update public.invoices set acompte=v_invoice_paid,status=case when v_invoice_paid>=montant then 'payée' else 'en_attente' end,payment_method=coalesce(nullif(p_payment_method,''),payment_method),updated_at=now() where boutique_id=v_transfer.from_boutique_id and id=v_transfer.invoice_id; update public.charges set paid_amount=v_charge_paid,status=case when v_charge_paid>=montant then 'paid' else 'partial' end,updated_at=now() where boutique_id=p_boutique_id and id=p_charge_id; v_response=jsonb_build_object('charge_id',p_charge_id,'applied_amount',v_applied,'paid_amount',v_charge_paid,'status',case when v_charge_paid>=v_charge.montant then 'paid' else 'partial' end,'invoice_id',v_transfer.invoice_id,'payment_id',v_payment_id,'disbursement_id',v_disbursement_id); insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'transfer_charge_payment',p_idempotency_key,v_response); return v_response; end $function$
;

CREATE OR REPLACE FUNCTION public.reject_stock_transfer(p_transfer_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$ declare v_user uuid:=auth.uid(); v_transfer public.stock_transfers%rowtype; v_existing jsonb; v_response jsonb; begin if v_user is null then raise exception 'forbidden'; end if; select response into v_existing from private.idempotency_keys where user_id=v_user and operation='stock_transfer_reject' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if; select * into v_transfer from public.stock_transfers where id=p_transfer_id for update; if not found or v_transfer.status<>'pending' or not private.auth_has_permission(v_transfer.to_boutique_id,'transferts') then raise exception 'forbidden'; end if; update public.stock_transfers set status='rejected',updated_at=now() where id=p_transfer_id; v_response=jsonb_build_object('transfer_id',p_transfer_id,'status','rejected'); insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'stock_transfer_reject',p_idempotency_key,v_response); return v_response; end $function$
;
