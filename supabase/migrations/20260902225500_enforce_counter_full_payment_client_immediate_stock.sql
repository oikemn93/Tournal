begin;

-- Clients: commit stock immediately at creation, independently from payment.
-- POS/comptoir: stock remains untouched until the mandatory full collection.
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

-- Client orders can be corrected while still fully unpaid. Restore the original
-- committed stock before replacing the lines; the deferred trigger commits the
-- corrected lines again in the same transaction.
do $do$
declare v_def text;
begin
  select pg_get_functiondef('public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def,
    $old$or coalesce(v_invoice.acompte, 0) > 0.01 or (v_invoice.stock_deducted_at is not null and coalesce(v_invoice.origin,'pos') <> 'pos') then$old$,
    $new$or coalesce(v_invoice.acompte, 0) > 0.01 then$new$);
  v_def := replace(v_def,
    $old$if coalesce(v_invoice.origin,'pos') = 'pos' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,'Modification commande'); end if; delete from public.invoice_lines$old$,
    $new$if coalesce(v_invoice.origin,'pos') = 'client_profile' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,'Modification commande client'); end if; delete from public.invoice_lines$new$);
  execute v_def;
end $do$;

-- Cancelling an unpaid Clients order restores stock. A pending POS order has no
-- stock committed, because POS stock only moves when payment settles it fully.
do $do$
declare v_def text;
begin
  select pg_get_functiondef('public.cancel_pending_sale(text,text,text,text)'::regprocedure) into v_def;
  v_def := replace(v_def,
    $old$or coalesce(v_invoice.acompte, 0) > 0.01 or (v_invoice.stock_deducted_at is not null and coalesce(v_invoice.origin,'pos') <> 'pos') then$old$,
    $new$or coalesce(v_invoice.acompte, 0) > 0.01 then$new$);
  v_def := replace(v_def,
    $old$if coalesce(v_invoice.origin,'pos') = 'pos' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,'Annulation commande'); end if; update public.invoices set$old$,
    $new$if coalesce(v_invoice.origin,'pos') = 'client_profile' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,'Annulation commande client'); end if; update public.invoices set$new$);
  execute v_def;
end $do$;

-- Explicit safe defaults for the two financial permissions displayed in Admin.
-- This never grants a non-owner a financial permission.
update public.boutique_assignments
set droits = jsonb_set(
  jsonb_set(coalesce(droits,'{}'::jsonb), '{encaissement_vente}', coalesce(droits->'encaissement_vente','false'::jsonb), true),
  '{decaissement}', coalesce(droits->'decaissement','false'::jsonb), true
)
where not (coalesce(droits,'{}'::jsonb) ? 'encaissement_vente')
   or not (coalesce(droits,'{}'::jsonb) ? 'decaissement');

-- Financial/stock ledgers remain RPC-only for authenticated users.
do $do$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('invoice_payments','stock_entries')
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
      and 'authenticated'=any(roles)
  ) then
    raise exception 'unexpected direct authenticated ledger write policy';
  end if;
end $do$;

commit;
