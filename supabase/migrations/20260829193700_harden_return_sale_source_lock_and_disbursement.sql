create or replace function public.enforce_return_line_provenance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_return public.invoices%rowtype;
  v_source public.invoice_lines%rowtype;
  v_returned numeric;
begin
  select * into v_return from public.invoices where boutique_id=new.boutique_id and id=new.invoice_id;
  if not found or lower(coalesce(v_return.type,'')) <> 'retour' then return new; end if;
  if new.source_invoice_line_id is null then raise exception 'source invoice line required for return'; end if;
  select * into v_source from public.invoice_lines where id=new.source_invoice_line_id and boutique_id=new.boutique_id and invoice_id=v_return.return_of_invoice_id for update;
  if not found then raise exception 'invalid source invoice line'; end if;
  if new.product_id is distinct from v_source.product_id then raise exception 'return product does not match source invoice line'; end if;
  select coalesce(sum(rl.qty),0) into v_returned from public.invoice_lines rl join public.invoices ri on ri.boutique_id=rl.boutique_id and ri.id=rl.invoice_id where ri.boutique_id=new.boutique_id and lower(coalesce(ri.type,''))='retour' and ri.return_of_invoice_id=v_return.return_of_invoice_id and rl.source_invoice_line_id=v_source.id and (tg_op='INSERT' or rl.id<>new.id);
  if coalesce(new.qty,0)<=0 or v_returned+new.qty > v_source.qty+0.0005 then raise exception 'return quantity exceeds source invoice line'; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_return_line_provenance on public.invoice_lines;
create trigger trg_enforce_return_line_provenance before insert or update of qty, product_id, source_invoice_line_id on public.invoice_lines for each row execute function public.enforce_return_line_provenance();

create or replace function public.enforce_return_invoice_disbursement()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if lower(coalesce(new.type,''))='retour' and coalesce(new.return_refund_amount,0)>0 and not private.auth_has_permission(new.boutique_id,'decaissement') then raise exception 'forbidden: disbursement permission required'; end if;
  return new;
end $$;
drop trigger if exists trg_enforce_return_invoice_disbursement on public.invoices;
create trigger trg_enforce_return_invoice_disbursement before insert or update of return_refund_amount on public.invoices for each row execute function public.enforce_return_invoice_disbursement();
