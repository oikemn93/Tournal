-- Align stock lifecycle with business rules:
-- 1) POS/comptoir stock is committed only when the invoice is fully paid.
-- 2) POS/comptoir does not allow partial collection.
-- 3) Clients (origin=client_profile) commit stock immediately at order creation,
--    independently from payment timing.

begin;

-- The deferred line trigger now commits stock for Clients orders, not POS orders.
create or replace function private.commit_pos_stock_after_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice
  from public.invoices
  where boutique_id = new.boutique_id and id = new.invoice_id;

  if found
     and lower(coalesce(v_invoice.type,'')) <> 'retour'
     and coalesce(v_invoice.origin,'pos') = 'client_profile'
     and v_invoice.status <> 'annulée'
     and v_invoice.stock_deducted_at is null then
    perform private.commit_invoice_stock(new.boutique_id,new.invoice_id,now(),auth.uid(),false);
  end if;
  return null;
end;
$$;
revoke all on function private.commit_pos_stock_after_invoice_line() from public, anon, authenticated;

-- Single-payment collection: a POS/comptoir invoice must be settled in full.
do $do$
declare
  v_def text;
  v_anchor text := 'v_applied:=least(v_requested,v_remaining); if v_applied<=0 then raise exception ''invoice already settled''; end if;';
  v_replacement text := 'if coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)>v_epsilon then raise exception ''counter sale must be paid in full''; end if; ' || v_anchor;
  v_old_stock text := 'if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,''pos'')=''pos'' then';
  v_new_stock text := 'if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)<=v_epsilon then';
begin
  select pg_get_functiondef('public.record_payment(text,text,uuid,numeric,text)'::regprocedure) into v_def;
  if position(v_anchor in v_def)=0 then raise exception 'record_payment amount anchor changed'; end if;
  if position(v_old_stock in v_def)=0 then raise exception 'record_payment stock anchor changed'; end if;
  v_def := replace(v_def,v_anchor,v_replacement);
  v_def := replace(v_def,v_old_stock,v_new_stock);
  execute v_def;
end
$do$;

-- Split-method payment is allowed for POS only if the combined amount settles
-- the full remaining balance. Individual internal record_payment calls are
-- allowed through a transaction-local flag set only by this SECURITY DEFINER RPC.
do $do$
declare
  v_def text;
  v_after_total text := 'if v_total_requested>v_remaining+v_epsilon then raise exception ''payment total exceeds remaining amount''; end if;';
  v_after_total_replacement text := v_after_total || ' if coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_total_requested-v_remaining)>v_epsilon then raise exception ''counter sale must be paid in full''; end if; if coalesce(v_invoice.origin,''pos'')=''pos'' then perform set_config(''tournal.pos_full_split'',''on'',true); end if;';
  v_record_def text;
  v_record_check text := 'if coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)>v_epsilon then raise exception ''counter sale must be paid in full''; end if;';
  v_record_check_replacement text := 'if coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)>v_epsilon and coalesce(current_setting(''tournal.pos_full_split'',true),'''')<>''on'' then raise exception ''counter sale must be paid in full''; end if;';
  v_record_stock text := 'if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)<=v_epsilon then';
  v_record_stock_replacement text := 'if v_invoice.stock_deducted_at is null and coalesce(v_invoice.origin,''pos'')=''pos'' and (abs(v_requested-v_remaining)<=v_epsilon or coalesce(current_setting(''tournal.pos_full_split'',true),'''')=''on'') then';
begin
  select pg_get_functiondef('public.record_multi_payment(text,text,uuid,jsonb)'::regprocedure) into v_def;
  if position(v_after_total in v_def)=0 then raise exception 'record_multi_payment anchor changed'; end if;
  v_def := replace(v_def,v_after_total,v_after_total_replacement);
  execute v_def;

  select pg_get_functiondef('public.record_payment(text,text,uuid,numeric,text)'::regprocedure) into v_record_def;
  if position(v_record_check in v_record_def)=0 or position(v_record_stock in v_record_def)=0 then raise exception 'record_payment split anchors changed'; end if;
  v_record_def := replace(v_record_def,v_record_check,v_record_check_replacement);
  v_record_def := replace(v_record_def,v_record_stock,v_record_stock_replacement);
  execute v_record_def;
end
$do$;

-- Client-wide FIFO collection must never commit stock because client_profile
-- orders already committed it at creation. Keep POS fallback impossible here:
-- POS/comptoir invoices are not eligible for partial FIFO allocation.
do $do$
declare
  v_def text;
  v_loop text := 'for v_invoice in select i.* from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''''))<>''retour'' and i.status<>''annulée'' and i.client_id=p_client_id and private.invoice_net_due(i.boutique_id,i.id)>v_epsilon order by i.invoice_date,i.numero,i.id for update loop';
  v_loop_new text := 'for v_invoice in select i.* from public.invoices i where i.boutique_id=p_boutique_id and lower(coalesce(i.type,''''))<>''retour'' and i.status<>''annulée'' and i.client_id=p_client_id and coalesce(i.origin,''client_profile'')=''client_profile'' and private.invoice_net_due(i.boutique_id,i.id)>v_epsilon order by i.invoice_date,i.numero,i.id for update loop';
begin
  select pg_get_functiondef('public.record_client_payment(text,bigint,uuid,numeric,text,date)'::regprocedure) into v_def;
  if position(v_loop in v_def)=0 then raise exception 'record_client_payment loop anchor changed'; end if;
  v_def := replace(v_def,v_loop,v_loop_new);
  execute v_def;
end
$do$;

-- Keep the public execution boundary unchanged.
revoke all on function public.record_payment(text,text,uuid,numeric,text) from public, anon;
grant execute on function public.record_payment(text,text,uuid,numeric,text) to authenticated;
revoke all on function public.record_multi_payment(text,text,uuid,jsonb) from public, anon;
grant execute on function public.record_multi_payment(text,text,uuid,jsonb) to authenticated;
revoke all on function public.record_client_payment(text,bigint,uuid,numeric,text,date) from public, anon;
grant execute on function public.record_client_payment(text,bigint,uuid,numeric,text,date) to authenticated;

commit;
