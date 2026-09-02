-- Align sale stock lifecycle with business rules:
-- * counter/POS: stock only after full payment; partial payment is forbidden
-- * registered Clients flow: stock is committed automatically when the order is created
-- Existing historical rows are not rewritten.

begin;

create or replace function private.commit_pos_stock_after_invoice_line()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices
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

-- POS orders created before this migration may already have immediate stock
-- commitment. Their existing update/cancel RPCs keep the compatibility release
-- path, while new POS orders remain uncommitted until full collection.

-- Strengthen full-payment semantics for counter invoices at the database boundary.
do $do$
declare
  v_def text;
  v_old text := 'if coalesce(v_invoice.origin,''pos'')=''pos'' and abs(v_requested-v_remaining)>v_epsilon and coalesce(current_setting(''tournal.pos_full_split'',true),'''')<>''on'' then raise exception ''counter sale must be paid in full''; end if;';
begin
  select pg_get_functiondef('public.record_payment(text,text,uuid,numeric,text)'::regprocedure) into v_def;
  if position(v_old in v_def)=0 then raise exception 'record_payment full-payment guard shape changed'; end if;
  -- Guard already expresses the intended rule; re-executing the canonical
  -- definition here makes the dependency explicit in this migration.
  execute v_def;
end
$do$;

-- Keep direct table writes closed; mutations must pass through authenticated RPCs.
do $do$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('invoices','invoice_lines','stock_entries')
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
      and 'authenticated'=any(roles)
  ) then
    raise exception 'unexpected authenticated write policy on protected sale/stock tables';
  end if;
end
$do$;

commit;
