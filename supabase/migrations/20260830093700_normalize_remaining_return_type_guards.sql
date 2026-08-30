create or replace function private.guard_return_line_immutability()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_type text;
begin
  select i.type into v_type from public.invoices i where i.boutique_id=old.boutique_id and i.id=old.invoice_id;
  if lower(btrim(coalesce(v_type,'')))='retour' then raise exception 'return credit note lines are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function private.guard_return_line_provenance()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_return public.invoices%rowtype; v_source public.invoice_lines%rowtype; v_already_returned numeric; v_expected_sell_qty numeric;
begin
  select * into v_return from public.invoices where boutique_id=new.boutique_id and id=new.invoice_id;
  if not found or lower(btrim(coalesce(v_return.type,'')))<>'retour' then return new; end if;
  if v_return.return_of_invoice_id is null then raise exception 'return source invoice required'; end if;
  if new.source_invoice_line_id is null then raise exception 'return source line required'; end if;
  if coalesce(new.qty,0)<=0 then raise exception 'invalid return quantity'; end if;
  select * into v_source from public.invoice_lines where id=new.source_invoice_line_id and boutique_id=new.boutique_id and invoice_id=v_return.return_of_invoice_id for update;
  if not found then raise exception 'return source line does not belong to source invoice'; end if;
  if v_source.product_id<>new.product_id then raise exception 'return product does not match source line'; end if;
  if new.nom is distinct from v_source.nom or new.unit is distinct from v_source.unit or new.prix_unit is distinct from v_source.prix_unit or new.sell_unit is distinct from v_source.sell_unit then raise exception 'return line commercial snapshot does not match source line'; end if;
  v_expected_sell_qty:=case when v_source.sell_unit is null or v_source.sell_qty is null or coalesce(v_source.qty,0)<=0 then null else round(v_source.sell_qty*new.qty/v_source.qty,3) end;
  if new.sell_qty is distinct from v_expected_sell_qty then raise exception 'return sell quantity does not match source line proportion'; end if;
  select coalesce(sum(rl.qty),0) into v_already_returned
    from public.invoice_lines rl join public.invoices ri on ri.boutique_id=rl.boutique_id and ri.id=rl.invoice_id
   where rl.boutique_id=new.boutique_id and lower(btrim(coalesce(ri.type,'')))='retour'
     and ri.return_of_invoice_id=v_return.return_of_invoice_id and rl.source_invoice_line_id=new.source_invoice_line_id
     and (tg_op<>'UPDATE' or rl.id<>new.id);
  if v_already_returned+new.qty>v_source.qty+0.0005 then raise exception 'return quantity exceeds remaining quantity for source line %',new.source_invoice_line_id; end if;
  return new;
end; $$;

create or replace function private.guard_return_payment_disbursement()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_invoice_type text;
begin
  if coalesce(new.amount,0)<=0 then return new; end if;
  select i.type into v_invoice_type from public.invoices i where i.boutique_id=new.boutique_id and i.id=new.invoice_id;
  if lower(btrim(coalesce(v_invoice_type,'')))='retour' and not private.auth_can_disburse(new.boutique_id) then raise exception 'disbursement access denied'; end if;
  return new;
end; $$;

create or replace function private.guard_return_payment_immutability()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_old_is_return boolean:=false; v_new_is_return boolean:=false;
begin
  if tg_op in ('UPDATE','DELETE') then select exists(select 1 from public.invoices i where i.boutique_id=old.boutique_id and i.id=old.invoice_id and lower(btrim(coalesce(i.type,'')))='retour') into v_old_is_return; end if;
  if tg_op='UPDATE' then select exists(select 1 from public.invoices i where i.boutique_id=new.boutique_id and i.id=new.invoice_id and lower(btrim(coalesce(i.type,'')))='retour') into v_new_is_return; end if;
  if v_old_is_return or v_new_is_return then raise exception 'return payment is immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function private.guard_return_stock_entry_immutability()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_old_is_return boolean:=false; v_new_is_return boolean:=false;
begin
  if tg_op in ('UPDATE','DELETE') and old.return_invoice_id is not null then select exists(select 1 from public.invoices i where i.boutique_id=old.boutique_id and i.id=old.return_invoice_id and lower(btrim(coalesce(i.type,'')))='retour') into v_old_is_return; end if;
  if tg_op='UPDATE' and new.return_invoice_id is not null then select exists(select 1 from public.invoices i where i.boutique_id=new.boutique_id and i.id=new.return_invoice_id and lower(btrim(coalesce(i.type,'')))='retour') into v_new_is_return; end if;
  if v_old_is_return or v_new_is_return then raise exception 'return stock movement is immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function private.guard_return_stock_provenance()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_return public.invoices%rowtype; v_line public.invoice_lines%rowtype;
begin
  if new.return_invoice_id is null then return new; end if;
  select * into v_return from public.invoices i where i.boutique_id=new.boutique_id and i.id=new.return_invoice_id and lower(btrim(coalesce(i.type,'')))='retour';
  if not found then raise exception 'invalid return stock movement invoice'; end if;
  if new.return_invoice_line_id is null then raise exception 'return stock movement requires return invoice line'; end if;
  select * into v_line from public.invoice_lines il where il.id=new.return_invoice_line_id and il.boutique_id=new.boutique_id and il.invoice_id=new.return_invoice_id;
  if not found then raise exception 'invalid return stock movement line'; end if;
  if new.product_id is distinct from v_line.product_id then raise exception 'return stock movement product mismatch'; end if;
  if new.source_invoice_id is distinct from v_return.return_of_invoice_id then raise exception 'return stock movement source invoice mismatch'; end if;
  if new.source_invoice_line_id is distinct from v_line.source_invoice_line_id then raise exception 'return stock movement source line mismatch'; end if;
  if lower(btrim(coalesce(new.type,'')))<>'retour' then raise exception 'invalid return stock movement type'; end if;
  if abs(coalesce(new.qty,0)-coalesce(v_line.qty,0))>0.0005 then raise exception 'return stock movement quantity mismatch'; end if;
  return new;
end; $$;

create or replace function private.protect_source_sale_line_after_return()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_boutique_id text:=old.boutique_id; v_invoice_id text:=old.invoice_id;
begin
  if exists(select 1 from public.invoices r where r.boutique_id=v_boutique_id and r.return_of_invoice_id=v_invoice_id and lower(btrim(coalesce(r.type,'')))='retour') then raise exception 'source sale lines with issued return are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function private.protect_source_sale_payment_after_return()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
begin
  if exists(select 1 from public.invoices r where r.boutique_id=old.boutique_id and r.return_of_invoice_id=old.invoice_id and lower(btrim(coalesce(r.type,'')))='retour') then raise exception 'source sale payments with issued return are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function private.protect_source_sale_stock_after_return()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public','private'
as $$
declare v_source_invoice_id text:=old.source_invoice_id;
begin
  if v_source_invoice_id is not null and exists(select 1 from public.invoices r where r.boutique_id=old.boutique_id and r.return_of_invoice_id=v_source_invoice_id and lower(btrim(coalesce(r.type,'')))='retour') then raise exception 'source sale stock movements with issued return are immutable'; end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

create or replace function public.link_return_client_advance()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public'
as $$
declare v_match text[]; v_return public.invoices%rowtype;
begin
  if new.return_invoice_id is null and coalesce(new.note,'') like 'Avoir créé par % sur %' then
    v_match:=regexp_match(new.note,'^Avoir créé par ([^ ]+) sur (.+)$');
    if v_match is null then raise exception 'invalid return client credit provenance'; end if;
    new.return_invoice_id:=v_match[1];
  end if;
  if new.return_invoice_id is not null then
    select * into v_return from public.invoices where boutique_id=new.boutique_id and id=new.return_invoice_id and lower(btrim(coalesce(type,'')))='retour';
    if not found then raise exception 'invalid return client credit note'; end if;
    if v_return.client_id is null or new.client_id is distinct from v_return.client_id then raise exception 'return client credit client mismatch'; end if;
    if abs(coalesce(new.amount,0)-coalesce(v_return.return_client_credit_amount,0))>0.01 then raise exception 'return client credit amount mismatch'; end if;
  end if;
  return new;
end; $$;
