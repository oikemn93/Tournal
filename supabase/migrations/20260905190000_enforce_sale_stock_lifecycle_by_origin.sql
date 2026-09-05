-- Enforce the stock lifecycle by sale origin without rewriting historical rows.
-- POS/counter sales commit stock only once the invoice is fully paid.
-- Client-profile sales commit stock automatically, independently of payment.

begin;

create or replace function private.commit_client_stock_after_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
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
    -- Client invoices consume stock immediately. This is deliberately not tied
    -- to collection and does not imply a separate delivery confirmation.
    perform private.commit_invoice_stock(new.boutique_id,new.invoice_id,now(),auth.uid(),false);
  end if;
  return null;
end;
$function$;

revoke all on function private.commit_client_stock_after_invoice_line() from public, anon, authenticated;

create or replace function private.enforce_sale_stock_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_origin text;
  v_fully_paid boolean;
  v_actor uuid;
begin
  -- Re-read the final row state because this is a deferred constraint trigger.
  -- That makes split counter payments safe: only the committed transaction state
  -- is evaluated, never an intermediate payment line inside the same transaction.
  select * into v_invoice
  from public.invoices
  where boutique_id = new.boutique_id and id = new.id
  for update;

  if not found then return null; end if;
  if lower(coalesce(v_invoice.type,'')) = 'retour' or v_invoice.status = 'annulée' then
    return null;
  end if;

  v_origin := coalesce(v_invoice.origin,'pos');
  v_fully_paid := coalesce(v_invoice.acompte,0) + 0.01 >= coalesce(v_invoice.montant,0);
  v_actor := coalesce(auth.uid(), v_invoice.operator_id);

  if v_origin = 'client_profile' then
    if v_invoice.stock_deducted_at is null then
      perform private.commit_invoice_stock(v_invoice.boutique_id,v_invoice.id,now(),v_actor,false);
    end if;
    return null;
  end if;

  if v_origin = 'pos' then
    if v_fully_paid then
      if v_invoice.stock_deducted_at is null then
        perform private.commit_invoice_stock(v_invoice.boutique_id,v_invoice.id,now(),v_actor,false);
      end if;
    elsif v_invoice.stock_deducted_at is not null then
      raise exception 'counter sale stock cannot be deducted before full payment';
    end if;
    return null;
  end if;

  raise exception 'invalid sale origin';
end;
$function$;

revoke all on function private.enforce_sale_stock_lifecycle() from public, anon, authenticated;

drop trigger if exists trg_enforce_sale_stock_lifecycle on public.invoices;
create constraint trigger trg_enforce_sale_stock_lifecycle
after insert or update on public.invoices
deferrable initially deferred
for each row execute function private.enforce_sale_stock_lifecycle();

comment on function private.enforce_sale_stock_lifecycle() is
'Final transaction invariant: client_profile sales always consume stock; POS sales consume stock iff fully paid.';

-- Structural assertions: the invariant must be deferred and its helper must not
-- be directly callable by browser roles.
do $do$
declare
  v_def text;
begin
  select pg_get_triggerdef(t.oid,true) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.invoices'::regclass
    and t.tgname = 'trg_enforce_sale_stock_lifecycle'
    and not t.tgisinternal;

  if v_def is null or position('DEFERRABLE INITIALLY DEFERRED' in upper(v_def)) = 0 then
    raise exception 'sale stock lifecycle constraint trigger missing or not deferred';
  end if;

  if has_function_privilege('authenticated','private.enforce_sale_stock_lifecycle()','EXECUTE') then
    raise exception 'sale stock lifecycle helper exposed to authenticated';
  end if;
end
$do$;

commit;
