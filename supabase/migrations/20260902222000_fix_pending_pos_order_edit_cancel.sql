-- POS orders commit stock immediately. Editing/cancelling an unpaid POS order must
-- therefore release that committed stock atomically before changing the order.
-- Client-profile deliveries remain immutable once stock has been committed.
begin;

-- Older assignments predate this permission. Initialize it explicitly without
-- granting it to anybody; owners remain implicitly authorized by auth_has_permission.
update public.boutique_assignments
set droits = coalesce(droits, '{}'::jsonb) || jsonb_build_object('annulation_commande', false)
where not (coalesce(droits, '{}'::jsonb) ? 'annulation_commande');

create or replace function private.release_pending_pos_stock(
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
  if coalesce(v_invoice.origin,'pos') <> 'pos'
     or v_invoice.type <> 'vente'
     or v_invoice.status <> 'en_attente'
     or coalesce(v_invoice.acompte,0) > 0.01 then
    raise exception 'only an unpaid pending POS sale can release stock';
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

  -- Existing outbound rows keep invoice-level provenance. Detach the old line
  -- FK so an edited order may replace its line set without deleting the ledger.
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

revoke all on function private.release_pending_pos_stock(text,text,uuid,text) from public, anon, authenticated;

-- Patch the canonical edit RPC: POS stock is released before old lines are
-- replaced; the deferred invoice-line trigger commits the new lines once at
-- transaction end. Delivered client orders stay protected.
do $do$
declare
  v_def text;
  v_old_guard text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or v_invoice.stock_deducted_at is not null then';
  v_new_guard text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or (v_invoice.stock_deducted_at is not null and coalesce(v_invoice.origin,''pos'') <> ''pos'') then';
  v_old_delete text := 'delete from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;';
  v_new_delete text := 'if coalesce(v_invoice.origin,''pos'') = ''pos'' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,''Modification commande''); end if; delete from public.invoice_lines where boutique_id = p_boutique_id and invoice_id = p_invoice_id;';
begin
  select pg_get_functiondef('public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb)'::regprocedure) into v_def;
  if position(v_old_guard in v_def)=0 then raise exception 'update_pending_sale guard shape changed'; end if;
  if position(v_old_delete in v_def)=0 then raise exception 'update_pending_sale delete shape changed'; end if;
  v_def := replace(v_def,v_old_guard,v_new_guard);
  v_def := replace(v_def,v_old_delete,v_new_delete);
  execute v_def;
end
$do$;

-- Patch cancellation for immediate-stock POS orders. The explicit
-- annulation_commande right is still required for non-owners; owners and
-- SuperAdmin are covered by auth_has_permission's existing semantics.
do $do$
declare
  v_def text;
  v_old_guard text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or v_invoice.stock_deducted_at is not null then';
  v_new_guard text := 'or coalesce(v_invoice.acompte, 0) > 0.01 or (v_invoice.stock_deducted_at is not null and coalesce(v_invoice.origin,''pos'') <> ''pos'') then';
  v_old_update text := 'update public.invoices set';
  v_new_update text := 'if coalesce(v_invoice.origin,''pos'') = ''pos'' and v_invoice.stock_deducted_at is not null then perform private.release_pending_pos_stock(p_boutique_id,p_invoice_id,v_user,''Annulation commande''); end if; update public.invoices set';
begin
  select pg_get_functiondef('public.cancel_pending_sale(text,text,text,text)'::regprocedure) into v_def;
  if position(v_old_guard in v_def)=0 then raise exception 'cancel_pending_sale guard shape changed'; end if;
  if position(v_old_update in v_def)=0 then raise exception 'cancel_pending_sale update shape changed'; end if;
  v_def := replace(v_def,v_old_guard,v_new_guard);
  v_def := replace(v_def,v_old_update,v_new_update);
  execute v_def;
end
$do$;

revoke all on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) from public, anon;
grant execute on function public.update_pending_sale(text,text,uuid,bigint,text,text,jsonb) to authenticated;
revoke all on function public.cancel_pending_sale(text,text,text,text) from public, anon;
grant execute on function public.cancel_pending_sale(text,text,text,text) to authenticated;

commit;
