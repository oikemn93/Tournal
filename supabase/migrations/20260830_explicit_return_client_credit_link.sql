do $migration$
declare
  v_oid oid;
  v_def text;
  v_old_insert text := 'insert into public.client_advances(boutique_id,client_id,amount,payment_method,paid_at,recorded_at,operator_id,operator_name,idempotency_key,note,allocated_amount)';
  v_new_insert text := 'insert into public.client_advances(boutique_id,client_id,amount,payment_method,paid_at,recorded_at,operator_id,operator_name,idempotency_key,note,allocated_amount,return_invoice_id)';
  v_old_values text := 'values(p_boutique_id,v_original.client_id,v_client_credit_amount,''Autre'',v_returned_at,v_returned_at,v_user,v_operator_name,v_advance_key,''Avoir créé par ''||v_return_id||'' sur ''||p_invoice_id,0) returning id into v_advance_id;';
  v_new_values text := 'values(p_boutique_id,v_original.client_id,v_client_credit_amount,''Autre'',v_returned_at,v_returned_at,v_user,v_operator_name,v_advance_key,''Avoir créé par ''||v_return_id||'' sur ''||p_invoice_id,0,v_return_id) returning id into v_advance_id;';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='return_sale'
    and pg_get_function_identity_arguments(p.oid)='p_boutique_id text, p_invoice_id text, p_idempotency_key uuid, p_lines jsonb, p_refund_method text';

  if v_oid is null then raise exception 'return_sale function not found'; end if;
  select pg_get_functiondef(v_oid) into v_def;
  if position(v_old_insert in v_def)=0 or position(v_old_values in v_def)=0 then
    raise exception 'return_sale definition differs from expected version; aborting';
  end if;
  v_def := replace(v_def,v_old_insert,v_new_insert);
  v_def := replace(v_def,v_old_values,v_new_values);
  execute v_def;
end
$migration$;
