-- AUDIT ONLY: exact current production pg_get_functiondef; schema-only, no data.

CREATE OR REPLACE FUNCTION public.get_supplier_current_balances(p_boutique_id text)
 RETURNS TABLE(supplier_id bigint, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select s.id,
         greatest(
           0::numeric,
           coalesce((
             select sum(e.qty * coalesce(e.prix_unit, 0))
             from public.stock_entries e
             where e.boutique_id = p_boutique_id
               and e.supplier_id = s.id
               and e.qty > 0
               and e.type in ('achat','ajustement')
           ), 0)
           + coalesce((
             select sum(c.montant)
             from public.charges c
             where c.boutique_id = p_boutique_id
               and c.supplier_id = s.id
               and c.source = 'transfer'
           ), 0)
           - coalesce((
             select sum(c.montant)
             from public.charges c
             where c.boutique_id = p_boutique_id
               and c.supplier_id = s.id
               and c.source is distinct from 'transfer'
               and c.source is distinct from 'supplier_receipt'
           ), 0)
           - coalesce((
             select sum(c.paid_amount)
             from public.charges c
             where c.boutique_id = p_boutique_id
               and c.supplier_id = s.id
               and c.source = 'transfer'
           ), 0)
         )::numeric as balance
  from public.suppliers s
  where s.boutique_id = p_boutique_id
    and (
      (select private.auth_is_super_admin())
      or ((select private.auth_is_active_user()) and exists (
        select 1 from public.boutique_assignments ba
        where ba.boutique_id = p_boutique_id
          and ba.user_id = (select auth.uid())
      ))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where user_id=auth.uid()
    and dismissed_at is null
    and boutique_id is not null
    and private.auth_notification_context_matches(boutique_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_boutique_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not private.auth_notification_context_matches(p_boutique_id) then raise exception 'forbidden'; end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where user_id=auth.uid()
    and boutique_id=p_boutique_id
    and dismissed_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  update public.notifications
  set read_at=coalesce(read_at,now())
  where id=p_id
    and user_id=auth.uid()
    and dismissed_at is null
    and boutique_id is not null
    and private.auth_notification_context_matches(boutique_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_return_client_advance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.return_invoice_id is not null then raise exception 'return client credit is immutable'; end if;
    return old;
  end if;
  if old.return_invoice_id is not null and (
       new.return_invoice_id is distinct from old.return_invoice_id
    or new.boutique_id is distinct from old.boutique_id
    or new.client_id is distinct from old.client_id
    or new.amount is distinct from old.amount
    or new.payment_method is distinct from old.payment_method
    or new.paid_at is distinct from old.paid_at
    or new.recorded_at is distinct from old.recorded_at
    or new.operator_id is distinct from old.operator_id
    or new.operator_name is distinct from old.operator_name
    or new.idempotency_key is distinct from old.idempotency_key
    or new.note is distinct from old.note
  ) then
    raise exception 'return client credit is immutable';
  end if;
  return new;
end
$function$
;
