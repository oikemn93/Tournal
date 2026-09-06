-- AUDIT ONLY: exact current production pg_get_functiondef; schema-only, no data.

CREATE OR REPLACE FUNCTION public.record_client_payment(p_boutique_id text, p_client_id bigint, p_idempotency_key uuid, p_amount numeric, p_payment_method text, p_payment_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_client public.clients%rowtype; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype; v_advance public.client_advances%rowtype;
  v_operator_name text; v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_total_applied numeric:=0; v_total_due numeric:=0; v_advance_amount numeric:=0; v_allocations jsonb:='[]'::jsonb; v_paid_at timestamptz; v_advance_key uuid; v_stock_entry_id bigint; v_fifo_cost numeric; v_return_reduction numeric;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  v_requested:=round(coalesce(p_amount,0),2); if v_requested<=0 then raise exception 'amount must be positive'; end if;
  if coalesce(p_payment_method,'') not in ('Espèces','Wave','Orange Money','Autre') then raise exception 'invalid payment method'; end if;
  select response into v_response from private.idempotency_keys where user_id=v_user and operation='record_client_payment' and key=p_idempotency_key; if v_response is not null then return v_response; end if;
  select * into v_client from public.clients where boutique_id=p_boutique_id and id=p_client_id; if not found then raise exception 'client not found'; end if;
  select coalesce(sum(private.invoice_net_due(i.boutique_id,i.id)),0) into v_total_due from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée' and i.client_id=p_client_id;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur');
  v_paid_at:=((coalesce(p_payment_date,current_date)+(now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar'); v_remaining:=v_requested;
  for v_invoice in select i.* from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée' and i.client_id=p_client_id and coalesce(i.origin,'client_profile')='client_profile' and private.invoice_net_due(i.boutique_id,i.id)>v_epsilon order by i.invoice_date,i.numero,i.id for update loop
    exit when v_remaining<=v_epsilon; v_applied:=least(v_remaining,private.invoice_net_due(p_boutique_id,v_invoice.id)); if v_applied<=0 then continue; end if;
    if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,'pos')='pos' then
      for v_sale_line in select * from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=v_invoice.id order by product_id,id loop
        update public.products set stock=stock-v_sale_line.qty where boutique_id=p_boutique_id and id=v_sale_line.product_id; if not found then raise exception 'product not found for invoice line %',v_sale_line.product_id; end if;
        insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id)
        values(nextval('private.stock_entry_id_seq'),p_boutique_id,v_sale_line.product_id,'ajustement',-v_sale_line.qty,v_sale_line.prix_unit,v_paid_at,v_user,'Vente '||v_invoice.id,v_invoice.id,v_sale_line.id) returning id into v_stock_entry_id;
        v_fifo_cost:=private.fifo_outflow_cost(p_boutique_id,v_sale_line.product_id,v_stock_entry_id);
        if v_fifo_cost>0 and v_sale_line.qty>0 then update public.invoice_lines set prix_achat=round(v_fifo_cost/v_sale_line.qty,4) where id=v_sale_line.id; end if;
      end loop;
    end if;
    select coalesce(sum(return_receivable_reduction),0) into v_return_reduction from public.invoices where boutique_id=p_boutique_id and type='Retour' and return_of_invoice_id=v_invoice.id;
    v_new:=round(v_invoice.acompte+v_applied,2);
    insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source) values(p_boutique_id,v_invoice.id,v_applied,p_payment_method,v_paid_at,v_user,v_operator_name,p_idempotency_key,'client_fifo');
    update public.invoices set acompte=v_new,payment_method=p_payment_method,status=case when v_new+v_return_reduction+v_epsilon>=montant then 'payée' else 'en_attente' end,stock_deducted_at=case when coalesce(v_invoice.origin,'pos')='pos' then coalesce(stock_deducted_at,v_paid_at) else stock_deducted_at end,updated_at=now() where boutique_id=p_boutique_id and id=v_invoice.id;
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('invoice_id',v_invoice.id,'amount',v_applied)); v_total_applied:=round(v_total_applied+v_applied,2); v_remaining:=round(v_remaining-v_applied,2);
  end loop;
  v_advance_amount:=greatest(0,round(v_requested-v_total_applied,2)); if v_advance_amount<=v_epsilon then v_advance_amount:=0; end if;
  if v_advance_amount>0 then
    v_advance_key:=md5(p_idempotency_key::text||':client-overflow-advance')::uuid;
    insert into public.client_advances(boutique_id,client_id,amount,payment_method,paid_at,operator_id,operator_name,idempotency_key) values(p_boutique_id,p_client_id,v_advance_amount,p_payment_method,v_paid_at,v_user,v_operator_name,v_advance_key) on conflict(boutique_id,operator_id,idempotency_key) do nothing returning * into v_advance;
    if not found then select * into v_advance from public.client_advances where boutique_id=p_boutique_id and operator_id=v_user and idempotency_key=v_advance_key; end if;
  end if;
  v_response:=jsonb_build_object('client_id',p_client_id,'requested_amount',v_requested,'applied_amount',v_total_applied,'advance_amount',v_advance_amount,'remaining_due',greatest(0,round(v_total_due-v_total_applied,2)),'paid_at',v_paid_at,'batch_id',p_idempotency_key,'operator_id',v_user,'operator_name',v_operator_name,'allocations',v_allocations,'advance',case when v_advance_amount>0 then jsonb_build_object('advance_id',v_advance.id,'client_id',v_advance.client_id,'amount',v_advance.amount,'payment_method',v_advance.payment_method,'paid_at',v_advance.paid_at,'recorded_at',v_advance.recorded_at,'operator_id',v_advance.operator_id,'operator_name',v_advance.operator_name,'note',v_advance.note) else null end);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_client_payment',p_idempotency_key,v_response) on conflict(user_id,operation,key) do nothing; return v_response;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_multi_payment(p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_existing jsonb; v_invoice public.invoices%rowtype;
  v_item jsonb; v_index integer:=0; v_amount numeric; v_method text; v_total_requested numeric:=0; v_total_applied numeric:=0; v_remaining numeric;
  v_line_key uuid; v_line_result jsonb; v_payments_result jsonb:='[]'::jsonb; v_advance_allocations jsonb:='[]'::jsonb; v_last_result jsonb; v_stock_deducted boolean:=false; v_response jsonb;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='record_multi_payment' and key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'payments required'; end if;
  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  v_remaining:=coalesce(private.invoice_net_due(p_boutique_id,p_invoice_id),0);
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2); v_method:=coalesce(nullif(trim(v_item->>'paymentMethod'),''),nullif(trim(v_item->>'method'),''),'Autre');
    if v_amount<=0 then raise exception 'payment amount must be positive'; end if;
    if v_method not in ('Espèces','Wave','Orange Money','Autre','Avoir client') then raise exception 'invalid payment method'; end if;
    if v_method='Avoir client' and v_invoice.client_id is null then raise exception 'invoice has no registered client'; end if;
    v_total_requested:=v_total_requested+v_amount;
  end loop;
  if v_total_requested>v_remaining+v_epsilon then raise exception 'payment total exceeds remaining amount'; end if; if coalesce(v_invoice.origin,'pos')='pos' and abs(v_total_requested-v_remaining)>v_epsilon then raise exception 'counter sale must be paid in full'; end if; if coalesce(v_invoice.origin,'pos')='pos' then perform set_config('tournal.pos_full_split','on',true); end if;
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_index:=v_index+1; v_amount:=round((v_item->>'amount')::numeric,2); v_method:=coalesce(nullif(trim(v_item->>'paymentMethod'),''),nullif(trim(v_item->>'method'),''),'Autre');
    v_line_key:=md5(p_idempotency_key::text||':'||v_index::text)::uuid;
    if v_method='Avoir client' then
      v_line_result:=public.apply_client_advance_to_invoice(p_boutique_id,p_invoice_id,v_line_key,v_amount);
      v_advance_allocations:=v_advance_allocations||coalesce(v_line_result->'allocations','[]'::jsonb);
    else
      v_line_result:=public.record_payment(p_boutique_id,p_invoice_id,v_line_key,v_amount,v_method);
    end if;
    v_payments_result:=v_payments_result||jsonb_build_array(v_line_result->'payment'); v_last_result:=v_line_result;
    v_total_applied:=round(v_total_applied+coalesce((v_line_result->>'applied_amount')::numeric,0),2); v_stock_deducted:=v_stock_deducted or coalesce((v_line_result->>'stock_deducted')::boolean,false);
  end loop;
  v_response:=jsonb_build_object('invoice_id',p_invoice_id,'acompte',(v_last_result->>'acompte')::numeric,'applied_amount',v_total_applied,'remaining_due',coalesce((v_last_result->>'remaining_due')::numeric,private.invoice_net_due(p_boutique_id,p_invoice_id)),'status',v_last_result->>'status','stock_deducted',v_stock_deducted,'payments',v_payments_result,'advance_allocations',v_advance_allocations,'batch_id',p_idempotency_key);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_multi_payment',p_idempotency_key,v_response) on conflict(user_id,operation,key) do nothing;
  return v_response;
end $function$
;
