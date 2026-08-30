create or replace function public.enforce_return_invoice_disbursement()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if lower(btrim(coalesce(new.type,'')))='retour' and coalesce(new.return_refund_amount,0)>0
     and not private.auth_has_permission(new.boutique_id,'decaissement') then
    raise exception 'forbidden: disbursement permission required';
  end if;
  return new;
end $function$;

create or replace function private.guard_future_return_invoice_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_source public.invoices%rowtype;
  v_refund numeric := coalesce(new.return_refund_amount, 0);
  v_receivable numeric := coalesce(new.return_receivable_reduction, 0);
  v_credit numeric := coalesce(new.return_credit_restore, 0);
begin
  if lower(btrim(coalesce(new.type, ''))) <> 'retour' then
    return new;
  end if;

  if new.return_of_invoice_id is null then
    raise exception 'return source invoice required';
  end if;

  select * into v_source
  from public.invoices
  where boutique_id = new.boutique_id
    and id = new.return_of_invoice_id;

  if not found then
    raise exception 'return source invoice not found';
  end if;
  if lower(btrim(coalesce(v_source.type, ''))) = 'retour' then
    raise exception 'cannot return a return';
  end if;
  if v_source.status = 'annulée' then
    raise exception 'cannot return a cancelled invoice';
  end if;
  if new.client_id is distinct from v_source.client_id then
    raise exception 'return client must match source invoice';
  end if;
  if coalesce(new.montant, 0) <= 0 then
    raise exception 'return amount must be positive';
  end if;
  if v_refund < 0 or v_receivable < 0 or v_credit < 0 then
    raise exception 'return settlement components must be non-negative';
  end if;
  if abs((v_refund + v_receivable + v_credit) - new.montant) > 0.01 then
    raise exception 'return settlement split must equal return amount';
  end if;

  if v_source.client_id is not null and v_refund > 0.01 then
    raise exception 'registered client return cannot refund immediately';
  end if;
  if v_source.client_id is null and v_credit > 0.01 then
    raise exception 'counter sale return cannot create registered client credit';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_new_return_line_totals()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_count bigint;
  v_lines_total numeric;
begin
  if lower(btrim(coalesce(new.type, ''))) <> 'retour' then
    return new;
  end if;

  select count(*), coalesce(sum(
    case
      when coalesce(l.qty,0) > 0 then
        coalesce(l.qty,0) * case
          when coalesce(l.qty,0) > 0 and l.sell_qty is not null
            then (coalesce(l.sell_qty,0) * coalesce(l.prix_unit,0)) / l.qty
          else coalesce(l.prix_unit,0)
        end
      else 0
    end
  ),0)
  into v_count, v_lines_total
  from public.invoice_lines l
  where l.boutique_id = new.boutique_id
    and l.invoice_id = new.id;

  if v_count = 0 then
    raise exception 'return credit note must contain at least one line';
  end if;
  if abs(round(v_lines_total,2) - round(coalesce(new.montant,0),2)) > 0.01 then
    raise exception 'return credit note total must equal return line total';
  end if;
  return new;
end;
$function$;

create or replace function private.protect_source_sale_after_return()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not exists (
    select 1
    from public.invoices r
    where r.boutique_id = old.boutique_id
      and r.return_of_invoice_id = old.id
      and lower(btrim(coalesce(r.type, ''))) = 'retour'
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'source sale with issued return is immutable';
  end if;

  if new.boutique_id is distinct from old.boutique_id
     or new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.client_nom is distinct from old.client_nom
     or new.client_tel is distinct from old.client_tel
     or new.montant is distinct from old.montant
     or new.acompte is distinct from old.acompte
     or new.invoice_date is distinct from old.invoice_date
     or new.type is distinct from old.type
     or new.payment_method is distinct from old.payment_method
     or new.stock_deducted_at is distinct from old.stock_deducted_at
     or new.cancel_reason is distinct from old.cancel_reason
     or new.cancelled_at is distinct from old.cancelled_at
     or new.cancelled_by is distinct from old.cancelled_by
     or new.return_of_invoice_id is distinct from old.return_of_invoice_id
     or new.origin is distinct from old.origin
  then
    raise exception 'source sale with issued return is immutable';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_return_invoice_immutability()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if lower(btrim(coalesce(old.type, ''))) = 'retour' then
    raise exception 'return credit notes are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
