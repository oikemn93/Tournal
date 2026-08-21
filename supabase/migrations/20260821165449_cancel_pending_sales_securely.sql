-- Pending orders are cancelled through one atomic, permission-checked RPC.
-- A seller can cancel only their own unpaid sale; owners and users with the
-- Factures permission can cancel any eligible pending sale in their boutique.
-- Direct DELETE policies remain unchanged as a defense-in-depth boundary.

create or replace function public.cancel_pending_sale(
  p_boutique_id text,
  p_invoice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_can_cancel_any boolean;
  v_can_cancel_own boolean;
begin
  if v_user is null then
    raise exception 'forbidden';
  end if;

  v_can_cancel_any := private.auth_has_permission(p_boutique_id, 'factures');
  v_can_cancel_own := private.auth_has_permission(p_boutique_id, 'vente');

  if not (v_can_cancel_any or v_can_cancel_own) then
    raise exception 'forbidden';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and boutique_id = p_boutique_id
  for update;

  if not found then
    raise exception 'invoice not found';
  end if;

  if v_invoice.type <> 'vente'
     or v_invoice.status <> 'en_attente'
     or coalesce(v_invoice.acompte, 0) <> 0
     or v_invoice.stock_deducted_at is not null then
    raise exception 'only an unpaid pending sale can be cancelled';
  end if;

  if not v_can_cancel_any and v_invoice.operator_id is distinct from v_user then
    raise exception 'forbidden';
  end if;

  delete from public.invoice_lines
  where boutique_id = p_boutique_id
    and invoice_id = p_invoice_id;

  delete from public.invoices
  where boutique_id = p_boutique_id
    and id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.cancel_pending_sale(text, text) from public, anon;
grant execute on function public.cancel_pending_sale(text, text) to authenticated;
