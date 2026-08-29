-- Prospectively link client credits created by sale returns to their credit note.
-- Existing advances are intentionally left untouched: historical provenance may be uncertain.
alter table public.client_advances add column if not exists return_invoice_id text;

create or replace function public.link_return_client_advance()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_match text[];
  v_return public.invoices%rowtype;
begin
  if new.return_invoice_id is null and coalesce(new.note,'') like 'Avoir créé par % sur %' then
    v_match := regexp_match(new.note, '^Avoir créé par ([^ ]+) sur (.+)$');
    if v_match is null then
      raise exception 'invalid return client credit provenance';
    end if;
    new.return_invoice_id := v_match[1];
  end if;

  if new.return_invoice_id is not null then
    select * into v_return
      from public.invoices
     where boutique_id = new.boutique_id
       and id = new.return_invoice_id
       and lower(coalesce(type,'')) = 'retour';
    if not found then raise exception 'invalid return client credit note'; end if;
    if v_return.client_id is null or new.client_id is distinct from v_return.client_id then
      raise exception 'return client credit client mismatch';
    end if;
    if abs(coalesce(new.amount,0) - coalesce(v_return.return_client_credit_amount,0)) > 0.01 then
      raise exception 'return client credit amount mismatch';
    end if;
  end if;
  return new;
end
$function$;

create or replace function public.protect_return_client_advance()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.return_invoice_id is not null then raise exception 'return client credit is immutable'; end if;
    return old;
  end if;
  -- allocated_amount is deliberately excluded: consuming/refunding the credit must remain possible.
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
$function$;

drop trigger if exists trg_link_return_client_advance on public.client_advances;
create trigger trg_link_return_client_advance
before insert or update of return_invoice_id, boutique_id, client_id, amount, note
on public.client_advances
for each row execute function public.link_return_client_advance();

drop trigger if exists trg_protect_return_client_advance on public.client_advances;
create trigger trg_protect_return_client_advance
before update or delete on public.client_advances
for each row execute function public.protect_return_client_advance();