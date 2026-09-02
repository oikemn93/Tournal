-- Correct stock timing by sale origin.
-- POS/comptoir: stock is committed only when the invoice is fully paid.
-- Clients/client_profile: stock is committed automatically when the invoice is created,
-- independently from payment. Existing RLS/RPC authorization remains unchanged.
begin;

-- Remove the previous trigger that committed POS stock as soon as lines were inserted.
drop trigger if exists trg_commit_pos_stock_after_invoice_line on public.invoice_lines;

-- Client-profile invoices commit stock after their lines are inserted. The constraint
-- trigger is deferred so create_sale can insert the complete invoice before one atomic
-- stock commitment. POS invoices are intentionally ignored here.
create or replace function private.commit_client_stock_after_invoice_line()
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
    perform private.commit_invoice_stock(new.boutique_id,new.invoice_id,now(),auth.uid(),true);
  end if;
  return null;
end;
$$;

revoke all on function private.commit_client_stock_after_invoice_line() from public, anon, authenticated;

create constraint trigger trg_commit_client_stock_after_invoice_line
after insert on public.invoice_lines
deferrable initially deferred
for each row execute function private.commit_client_stock_after_invoice_line();

-- POS payment must be all-or-nothing. Client-profile invoices keep partial payment.
-- Stock commitment for POS stays in record_payment and therefore occurs atomically
-- with the only allowed (full) payment.
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

  if coalesce(v_invoice.origin,'pos') = 'pos' and lower(coalesce(v_invoice.type,'')) <> 'retour' then
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

-- The previous edit/cancel patch expected POS stock to exist before payment. With the
-- corrected lifecycle, unpaid POS orders have no committed stock. Restore the canonical
-- guards and remove release calls while keeping creator/owner and cancellation rights.
do $do$
declare
  v_def text;
  v_guard_old text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or (v_invoice.stock_deducted_at is not null and coalesce(v_invoice.origin,''pos'') <> ''pos'') then';
  v_guard_new text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or v_invoice.stock_deducted_at is not null then';
  v_edit_release text := 'if coalesce(v_invoice.origin,''pos'') = ''pos'' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,''Modification commande''); end if; delete from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;';
  v_edit_plain text := 'delete from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;';
  v_cancel_release text := 'if coalesce(v_invoice.origin,''pos'') = ''pos'' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,''Annulation commande''); end if; update public.invoices set';
  v_cancel_plain text := 'update public.invoices set';
begin
  select pg_get_functiondef('public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb)'::regprocedure) into v_def;
  if position(v_guard_old in v_def)=0 or position(v_edit_release in v_def)=0 then raise exception 'update_pending_sale shape changed'; end if;
  v_def := replace(v_def,v_guard_old,v_guard_new);
  v_def := replace(v_def,v_edit_release,v_edit_plain);
  execute v_def;

  select pg_get_functiondef('public.cancel_pending_sale(text,text,text,text)'::regprocedure) into v_def;
  if position(v_guard_old in v_def)=0 or position(v_cancel_release in v_def)=0 then raise exception 'cancel_pending_sale shape changed'; end if;
  v_def := replace(v_def,v_guard_old,v_guard_new);
  v_def := replace(v_def,v_cancel_release,v_cancel_plain);
  execute v_def;
end
$do$;

revoke all on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) from public, anon;
grant execute on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) to authenticated;
revoke all on function public.cancel_pending_sale(text,text,text,text) from public, anon;
grant execute on function public.cancel_pending_sale(text,text,text,text) to authenticated;

commit;
