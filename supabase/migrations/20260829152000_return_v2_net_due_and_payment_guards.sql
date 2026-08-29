-- Return v2: all payment paths operate on the net receivable after credit notes.

create or replace function private.invoice_net_due(p_boutique_id text,p_invoice_id text)
returns numeric language sql stable security definer set search_path='pg_catalog','public','private'
as $$
  select greatest(0,round(i.montant-i.acompte-coalesce((select sum(r.return_receivable_reduction) from public.invoices r where r.boutique_id=i.boutique_id and r.type='Retour' and r.return_of_invoice_id=i.id),0),2))
  from public.invoices i where i.boutique_id=p_boutique_id and i.id=p_invoice_id
$$;
revoke all on function private.invoice_net_due(text,text) from public,anon,authenticated;
grant execute on function private.invoice_net_due(text,text) to service_role;

create or replace function public.record_payment(p_boutique_id text,p_invoice_id text,p_idempotency_key uuid,p_amount numeric,p_payment_method text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_operator_name text; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype;
  v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_paid_at timestamptz:=now(); v_payment_id bigint; v_stock_deducted boolean:=false;
  v_stock_entry_id bigint; v_fifo_cost numeric; v_return_reduction numeric:=0;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  v_requested:=round(coalesce(p_amount,0),2); if v_requested<=0 then raise exception 'amount must be positive'; end if;
  select response into v_response from private.idempotency_keys where user_id=v_user and operation='record_payment' and key=p_idempotency_key; if v_response is not null then return v_response; end if;
  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update; if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  select coalesce(sum(return_receivable_reduction),0) into v_return_reduction from public.invoices where boutique_id=p_boutique_id and type='Retour' and return_of_invoice_id=p_invoice_id;
  v_remaining:=greatest(0,round(v_invoice.montant-v_invoice.acompte-v_return_reduction,2)); if v_requested>v_remaining+v_epsilon then raise exception 'payment amount exceeds remaining amount'; end if;
  v_applied:=least(v_requested,v_remaining); if v_applied<=0 then raise exception 'invoice already settled'; end if;
  if v_invoice.stock_deducted_at is null then
    for v_sale_line in select * from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=p_invoice_id order by product_id,id loop
      update public.products set stock=stock-v_sale_line.qty where boutique_id=p_boutique_id and id=v_sale_line.product_id; if not found then raise exception 'product not found for invoice line %',v_sale_line.product_id; end if;
      insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id)
      values(nextval('private.stock_entry_id_seq'),p_boutique_id,v_sale_line.product_id,'ajustement',-v_sale_line.qty,v_sale_line.prix_unit,v_paid_at,v_user,'Vente '||p_invoice_id,p_invoice_id,v_sale_line.id) returning id into v_stock_entry_id;
      v_fifo_cost:=private.fifo_outflow_cost(p_boutique_id,v_sale_line.product_id,v_stock_entry_id); if v_fifo_cost>0 and v_sale_line.qty>0 then update public.invoice_lines set prix_achat=round(v_fifo_cost/v_sale_line.qty,4) where id=v_sale_line.id; end if;
    end loop; v_stock_deducted:=true;
  end if;
  v_new:=round(v_invoice.acompte+v_applied,2); if v_new+v_return_reduction+v_epsilon>=v_invoice.montant then v_new:=least(v_new,v_invoice.montant); end if;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur');
  insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source)
  values(p_boutique_id,p_invoice_id,v_applied,coalesce(nullif(p_payment_method,''),'Autre'),v_paid_at,v_user,v_operator_name,p_idempotency_key,'invoice') returning id into v_payment_id;
  update public.invoices set acompte=v_new,payment_method=coalesce(nullif(p_payment_method,''),payment_method),status=case when v_new+v_return_reduction+v_epsilon>=montant then 'payée' else 'en_attente' end,stock_deducted_at=coalesce(stock_deducted_at,v_paid_at),updated_at=now() where boutique_id=p_boutique_id and id=p_invoice_id;
  v_response:=jsonb_build_object('invoice_id',p_invoice_id,'acompte',v_new,'applied_amount',v_applied,'remaining_due',greatest(0,round(v_invoice.montant-v_new-v_return_reduction,2)),'status',case when v_new+v_return_reduction+v_epsilon>=v_invoice.montant then 'payée' else 'acompte' end,'stock_deducted',v_stock_deducted,'payment',jsonb_build_object('id',v_payment_id,'amount',v_applied,'payment_method',coalesce(nullif(p_payment_method,''),'Autre'),'paid_at',v_paid_at,'operator_id',v_user,'operator_name',v_operator_name,'batch_id',p_idempotency_key,'source','invoice'));
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_payment',p_idempotency_key,v_response); return v_response;
end $$;

create or replace function public.record_multi_payment(p_boutique_id text,p_invoice_id text,p_idempotency_key uuid,p_payments jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_existing jsonb; v_invoice public.invoices%rowtype; v_item jsonb; v_index integer:=0; v_amount numeric; v_method text;
  v_total_requested numeric:=0; v_total_applied numeric:=0; v_remaining numeric; v_line_key uuid; v_line_result jsonb; v_payments_result jsonb:='[]'::jsonb; v_advance_allocations jsonb:='[]'::jsonb; v_last_result jsonb; v_stock_deducted boolean:=false; v_response jsonb;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='record_multi_payment' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if;
  if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'payments required'; end if;
  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update; if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'cannot collect payment on this invoice'; end if;
  v_remaining:=coalesce(private.invoice_net_due(p_boutique_id,p_invoice_id),0);
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_amount:=round(coalesce((v_item->>'amount')::numeric,0),2); v_method:=coalesce(nullif(trim(v_item->>'paymentMethod'),''),nullif(trim(v_item->>'method'),''),'Autre');
    if v_amount<=0 then raise exception 'payment amount must be positive'; end if; if v_method not in ('Espèces','Wave','Orange Money','Autre','Avoir client') then raise exception 'invalid payment method'; end if;
    if v_method='Avoir client' and v_invoice.client_id is null then raise exception 'invoice has no registered client'; end if; v_total_requested:=v_total_requested+v_amount;
  end loop;
  if v_total_requested>v_remaining+v_epsilon then raise exception 'payment total exceeds remaining amount'; end if;
  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_index:=v_index+1; v_amount:=round((v_item->>'amount')::numeric,2); v_method:=coalesce(nullif(trim(v_item->>'paymentMethod'),''),nullif(trim(v_item->>'method'),''),'Autre'); v_line_key:=md5(p_idempotency_key::text||':'||v_index::text)::uuid;
    if v_method='Avoir client' then v_line_result:=public.apply_client_advance_to_invoice(p_boutique_id,p_invoice_id,v_line_key,v_amount); v_advance_allocations:=v_advance_allocations||coalesce(v_line_result->'allocations','[]'::jsonb); else v_line_result:=public.record_payment(p_boutique_id,p_invoice_id,v_line_key,v_amount,v_method); end if;
    v_payments_result:=v_payments_result||jsonb_build_array(v_line_result->'payment'); v_last_result:=v_line_result; v_total_applied:=round(v_total_applied+coalesce((v_line_result->>'applied_amount')::numeric,0),2); v_stock_deducted:=v_stock_deducted or coalesce((v_line_result->>'stock_deducted')::boolean,false);
  end loop;
  v_response:=jsonb_build_object('invoice_id',p_invoice_id,'acompte',(v_last_result->>'acompte')::numeric,'applied_amount',v_total_applied,'remaining_due',coalesce((v_last_result->>'remaining_due')::numeric,private.invoice_net_due(p_boutique_id,p_invoice_id)),'status',v_last_result->>'status','stock_deducted',v_stock_deducted,'payments',v_payments_result,'advance_allocations',v_advance_allocations,'batch_id',p_idempotency_key);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_multi_payment',p_idempotency_key,v_response) on conflict(user_id,operation,key) do nothing; return v_response;
end $$;

create or replace function public.apply_client_advance_to_invoice(p_boutique_id text,p_invoice_id text,p_idempotency_key uuid,p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare
  v_user uuid:=auth.uid(); v_existing jsonb; v_invoice public.invoices%rowtype; v_advance public.client_advances%rowtype; v_operator_name text; v_due numeric; v_available numeric; v_total_available numeric:=0;
  v_applied numeric; v_remaining_to_allocate numeric; v_from_advance numeric; v_payment_key uuid; v_payment_result jsonb; v_payment_id bigint; v_allocations jsonb:='[]'::jsonb; v_response jsonb;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if; if p_amount is not null and p_amount<=0 then raise exception 'amount must be positive'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='apply_client_advance_to_invoice' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if;
  select * into v_invoice from public.invoices where boutique_id=p_boutique_id and id=p_invoice_id for update; if not found then raise exception 'invoice not found'; end if;
  if lower(coalesce(v_invoice.type,''))='retour' or v_invoice.status='annulée' then raise exception 'cannot apply an advance to this invoice'; end if; if v_invoice.client_id is null then raise exception 'invoice has no registered client'; end if;
  v_due:=coalesce(private.invoice_net_due(p_boutique_id,p_invoice_id),0); if v_due<=0 then raise exception 'invoice already settled'; end if;
  for v_advance in select * from public.client_advances where boutique_id=p_boutique_id and client_id=v_invoice.client_id and amount>allocated_amount order by paid_at,id for update loop v_total_available:=v_total_available+(v_advance.amount-v_advance.allocated_amount); end loop;
  if v_total_available<=0 then raise exception 'no client advance available'; end if;
  if p_amount is null then v_applied:=least(v_due,v_total_available); else if p_amount>v_due then raise exception 'advance amount exceeds invoice balance'; end if; if p_amount>v_total_available then raise exception 'client advance balance is insufficient'; end if; v_applied:=p_amount; end if;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur'); v_payment_key:=md5(p_idempotency_key::text||':client-advance-payment')::uuid;
  v_payment_result:=public.record_payment(p_boutique_id,p_invoice_id,v_payment_key,v_applied,'Avoir client'); v_applied:=(v_payment_result->>'applied_amount')::numeric;
  update public.invoice_payments set source='client_advance' where boutique_id=p_boutique_id and invoice_id=p_invoice_id and batch_id=v_payment_key returning id into v_payment_id; if not found then raise exception 'advance payment record not found'; end if;
  v_remaining_to_allocate:=v_applied;
  for v_advance in select * from public.client_advances where boutique_id=p_boutique_id and client_id=v_invoice.client_id and amount>allocated_amount order by paid_at,id for update loop
    exit when v_remaining_to_allocate<=0; v_available:=v_advance.amount-v_advance.allocated_amount; v_from_advance:=least(v_remaining_to_allocate,v_available); if v_from_advance<=0 then continue; end if;
    update public.client_advances set allocated_amount=allocated_amount+v_from_advance where id=v_advance.id and boutique_id=p_boutique_id and allocated_amount+v_from_advance<=amount; if not found then raise exception 'client advance balance changed'; end if;
    insert into private.client_advance_allocations(boutique_id,client_advance_id,client_id,invoice_id,amount,operator_id,operator_name,idempotency_key) values(p_boutique_id,v_advance.id,v_invoice.client_id,p_invoice_id,v_from_advance,v_user,v_operator_name,p_idempotency_key);
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('advance_id',v_advance.id,'amount',v_from_advance)); v_remaining_to_allocate:=v_remaining_to_allocate-v_from_advance;
  end loop;
  if v_remaining_to_allocate<>0 then raise exception 'could not allocate the full client advance payment'; end if;
  v_payment_result:=jsonb_set(v_payment_result,'{payment,source}',to_jsonb('client_advance'::text),true);
  v_response:=jsonb_build_object('invoice_id',p_invoice_id,'client_id',v_invoice.client_id,'acompte',(v_payment_result->>'acompte')::numeric,'applied_amount',v_applied,'remaining_due',coalesce((v_payment_result->>'remaining_due')::numeric,private.invoice_net_due(p_boutique_id,p_invoice_id)),'status',v_payment_result->>'status','stock_deducted',coalesce((v_payment_result->>'stock_deducted')::boolean,false),'payment',v_payment_result->'payment','allocations',v_allocations,'remaining_advance',v_total_available-v_applied);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'apply_client_advance_to_invoice',p_idempotency_key,v_response) on conflict(user_id,operation,key) do nothing; return v_response;
end $$;

create or replace function public.apply_client_advance_fifo(p_boutique_id text,p_client_id bigint,p_idempotency_key uuid,p_amount numeric default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare v_user uuid:=auth.uid(); v_existing jsonb; v_client public.clients%rowtype; v_invoice public.invoices%rowtype; v_requested numeric; v_available numeric; v_total_due numeric; v_remaining numeric; v_apply numeric; v_result jsonb; v_total_applied numeric:=0; v_allocations jsonb:='[]'::jsonb; v_invoice_key uuid;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if;
  select response into v_existing from private.idempotency_keys where user_id=v_user and operation='apply_client_advance_fifo' and key=p_idempotency_key; if v_existing is not null then return v_existing; end if;
  select * into v_client from public.clients where boutique_id=p_boutique_id and id=p_client_id; if not found then raise exception 'client not found'; end if;
  select coalesce(sum(greatest(0,amount-allocated_amount)),0) into v_available from public.client_advances where boutique_id=p_boutique_id and client_id=p_client_id and amount>allocated_amount;
  select coalesce(sum(private.invoice_net_due(i.boutique_id,i.id)),0) into v_total_due from public.invoices i where i.boutique_id=p_boutique_id and i.client_id=p_client_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée';
  if v_available<=0 then raise exception 'no client advance available'; end if; if v_total_due<=0 then raise exception 'client has no unpaid invoice'; end if;
  v_requested:=case when p_amount is null then least(v_available,v_total_due) else round(p_amount,2) end; if v_requested<=0 then raise exception 'amount must be positive'; end if; if v_requested>v_available then raise exception 'client advance balance is insufficient'; end if; if v_requested>v_total_due then raise exception 'advance amount exceeds client balance'; end if;
  v_remaining:=v_requested;
  for v_invoice in select i.* from public.invoices i where i.boutique_id=p_boutique_id and i.client_id=p_client_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée' and private.invoice_net_due(i.boutique_id,i.id)>0.01 order by i.invoice_date,i.numero,i.id for update loop
    exit when v_remaining<=0.01; v_apply:=least(v_remaining,private.invoice_net_due(p_boutique_id,v_invoice.id)); if v_apply<=0 then continue; end if; v_invoice_key:=md5(p_idempotency_key::text||':'||v_invoice.id)::uuid;
    v_result:=public.apply_client_advance_to_invoice(p_boutique_id,v_invoice.id,v_invoice_key,v_apply); v_total_applied:=round(v_total_applied+coalesce((v_result->>'applied_amount')::numeric,0),2); v_remaining:=round(v_requested-v_total_applied,2);
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('invoice_id',v_invoice.id,'amount',coalesce((v_result->>'applied_amount')::numeric,0),'acompte',(v_result->>'acompte')::numeric,'status',v_result->>'status','payment',v_result->'payment','advance_allocations',coalesce(v_result->'allocations','[]'::jsonb),'stock_deducted',coalesce((v_result->>'stock_deducted')::boolean,false)));
  end loop;
  if v_remaining>0.01 then raise exception 'could not apply full client advance'; end if;
  v_result:=jsonb_build_object('client_id',p_client_id,'requested_amount',v_requested,'applied_amount',v_total_applied,'remaining_due',greatest(0,round(v_total_due-v_total_applied,2)),'remaining_advance',greatest(0,round(v_available-v_total_applied,2)),'allocations',v_allocations);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'apply_client_advance_fifo',p_idempotency_key,v_result) on conflict(user_id,operation,key) do nothing; return v_result;
end $$;

create or replace function public.record_client_payment(p_boutique_id text,p_client_id bigint,p_idempotency_key uuid,p_amount numeric,p_payment_method text,p_payment_date date default current_date)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
declare
  v_epsilon constant numeric:=0.01; v_user uuid:=auth.uid(); v_client public.clients%rowtype; v_invoice public.invoices%rowtype; v_sale_line public.invoice_lines%rowtype; v_advance public.client_advances%rowtype;
  v_operator_name text; v_response jsonb; v_requested numeric; v_remaining numeric; v_applied numeric; v_new numeric; v_total_applied numeric:=0; v_total_due numeric:=0; v_advance_amount numeric:=0; v_allocations jsonb:='[]'::jsonb; v_paid_at timestamptz; v_advance_key uuid; v_stock_entry_id bigint; v_fifo_cost numeric; v_return_reduction numeric;
begin
  if v_user is null or not private.auth_can_collect_payment(p_boutique_id) then raise exception 'payment access denied'; end if; v_requested:=round(coalesce(p_amount,0),2); if v_requested<=0 then raise exception 'amount must be positive'; end if;
  if coalesce(p_payment_method,'') not in ('Espèces','Wave','Orange Money','Autre') then raise exception 'invalid payment method'; end if;
  select response into v_response from private.idempotency_keys where user_id=v_user and operation='record_client_payment' and key=p_idempotency_key; if v_response is not null then return v_response; end if;
  select * into v_client from public.clients where boutique_id=p_boutique_id and id=p_client_id; if not found then raise exception 'client not found'; end if;
  select coalesce(sum(private.invoice_net_due(i.boutique_id,i.id)),0) into v_total_due from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée' and i.client_id=p_client_id;
  select nom into v_operator_name from public.platform_users where id=v_user; v_operator_name:=coalesce(v_operator_name,'Utilisateur'); v_paid_at:=((coalesce(p_payment_date,current_date)+(now() at time zone 'Africa/Dakar')::time) at time zone 'Africa/Dakar'); v_remaining:=v_requested;
  for v_invoice in select i.* from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''))<>'retour' and i.status<>'annulée' and i.client_id=p_client_id and private.invoice_net_due(i.boutique_id,i.id)>v_epsilon order by i.invoice_date,i.numero,i.id for update loop
    exit when v_remaining<=v_epsilon; v_applied:=least(v_remaining,private.invoice_net_due(p_boutique_id,v_invoice.id)); if v_applied<=0 then continue; end if;
    if v_invoice.stock_deducted_at is null then
      for v_sale_line in select * from public.invoice_lines where boutique_id=p_boutique_id and invoice_id=v_invoice.id order by product_id,id loop
        update public.products set stock=stock-v_sale_line.qty where boutique_id=p_boutique_id and id=v_sale_line.product_id; if not found then raise exception 'product not found for invoice line %',v_sale_line.product_id; end if;
        insert into public.stock_entries(id,boutique_id,product_id,type,qty,prix_unit,entry_date,operator_id,note,source_invoice_id,source_invoice_line_id)
        values(nextval('private.stock_entry_id_seq'),p_boutique_id,v_sale_line.product_id,'ajustement',-v_sale_line.qty,v_sale_line.prix_unit,v_paid_at,v_user,'Vente '||v_invoice.id,v_invoice.id,v_sale_line.id) returning id into v_stock_entry_id;
        v_fifo_cost:=private.fifo_outflow_cost(p_boutique_id,v_sale_line.product_id,v_stock_entry_id); if v_fifo_cost>0 and v_sale_line.qty>0 then update public.invoice_lines set prix_achat=round(v_fifo_cost/v_sale_line.qty,4) where id=v_sale_line.id; end if;
      end loop;
    end if;
    select coalesce(sum(return_receivable_reduction),0) into v_return_reduction from public.invoices where boutique_id=p_boutique_id and type='Retour' and return_of_invoice_id=v_invoice.id; v_new:=round(v_invoice.acompte+v_applied,2);
    insert into public.invoice_payments(boutique_id,invoice_id,amount,payment_method,paid_at,operator_id,operator_name,batch_id,source) values(p_boutique_id,v_invoice.id,v_applied,p_payment_method,v_paid_at,v_user,v_operator_name,p_idempotency_key,'client_fifo');
    update public.invoices set acompte=v_new,payment_method=p_payment_method,status=case when v_new+v_return_reduction+v_epsilon>=montant then 'payée' else 'en_attente' end,stock_deducted_at=coalesce(stock_deducted_at,v_paid_at),updated_at=now() where boutique_id=p_boutique_id and id=v_invoice.id;
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('invoice_id',v_invoice.id,'amount',v_applied)); v_total_applied:=round(v_total_applied+v_applied,2); v_remaining:=round(v_remaining-v_applied,2);
  end loop;
  v_advance_amount:=greatest(0,round(v_requested-v_total_applied,2)); if v_advance_amount<=v_epsilon then v_advance_amount:=0; end if;
  if v_advance_amount>0 then v_advance_key:=md5(p_idempotency_key::text||':client-overflow-advance')::uuid; insert into public.client_advances(boutique_id,client_id,amount,payment_method,paid_at,operator_id,operator_name,idempotency_key) values(p_boutique_id,p_client_id,v_advance_amount,p_payment_method,v_paid_at,v_user,v_operator_name,v_advance_key) on conflict(boutique_id,operator_id,idempotency_key) do nothing returning * into v_advance; if not found then select * into v_advance from public.client_advances where boutique_id=p_boutique_id and operator_id=v_user and idempotency_key=v_advance_key; end if; end if;
  v_response:=jsonb_build_object('client_id',p_client_id,'requested_amount',v_requested,'applied_amount',v_total_applied,'advance_amount',v_advance_amount,'remaining_due',greatest(0,round(v_total_due-v_total_applied,2)),'paid_at',v_paid_at,'batch_id',p_idempotency_key,'operator_id',v_user,'operator_name',v_operator_name,'allocations',v_allocations,'advance',case when v_advance_amount>0 then jsonb_build_object('advance_id',v_advance.id,'client_id',v_advance.client_id,'amount',v_advance.amount,'payment_method',v_advance.payment_method,'paid_at',v_advance.paid_at,'recorded_at',v_advance.recorded_at,'operator_id',v_advance.operator_id,'operator_name',v_advance.operator_name,'note',v_advance.note) else null end);
  insert into private.idempotency_keys(user_id,operation,key,response) values(v_user,'record_client_payment',p_idempotency_key,v_response) on conflict(user_id,operation,key) do nothing; return v_response;
end $$;

create or replace function private.sync_source_invoice_return_status()
returns trigger language plpgsql security definer set search_path='pg_catalog','public','private'
as $$
begin
  if new.type='Retour' and new.return_of_invoice_id is not null then
    update public.invoices s set status=case when s.status='annulée' then s.status when private.invoice_net_due(s.boutique_id,s.id)<=0.01 then 'payée' else 'en_attente' end,updated_at=now()
    where s.boutique_id=new.boutique_id and s.id=new.return_of_invoice_id and lower(coalesce(s.type,''))<>'retour';
  end if; return new;
end $$;
drop trigger if exists trg_sync_source_invoice_return_status on public.invoices;
create trigger trg_sync_source_invoice_return_status after insert or update of return_receivable_reduction on public.invoices for each row when (new.type='Retour' and new.return_of_invoice_id is not null) execute function private.sync_source_invoice_return_status();
