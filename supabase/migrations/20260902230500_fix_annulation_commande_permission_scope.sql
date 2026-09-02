-- The explicit annulation_commande permission authorizes cancellation of any
-- eligible pending order in the boutique. Editing remains creator/owner scoped.
-- Cancellation is still restricted to the originating screen and to unpaid,
-- pending sales; stock handling remains delegated to the existing RPC logic.
begin;

do $do$
declare
  v_def text;
  v_old_decl text := '  v_can_cancel_any boolean;';
  v_old_assign text := '  v_can_cancel_any := private.auth_is_super_admin() or private.auth_is_owner_of(p_boutique_id);';
  v_old_guard text := E'  if not v_can_cancel_any and v_invoice.operator_id is distinct from v_user then\n    raise exception ''forbidden'';\n  end if;';
begin
  select pg_get_functiondef('public.cancel_pending_sale(text,text,text,text)'::regprocedure) into v_def;
  if position(v_old_guard in v_def)=0 then
    raise exception 'cancel_pending_sale creator-scope guard shape changed';
  end if;
  v_def := replace(v_def, v_old_decl, '');
  v_def := replace(v_def, v_old_assign, '');
  v_def := replace(v_def, v_old_guard, '');
  execute v_def;
end
$do$;

revoke all on function public.cancel_pending_sale(text,text,text,text) from public, anon;
grant execute on function public.cancel_pending_sale(text,text,text,text) to authenticated;

commit;
