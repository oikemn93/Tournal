create or replace function public.enforce_return_line_provenance()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_return public.invoices%rowtype;
  v_source public.invoice_lines%rowtype;
  v_returned numeric;
begin
  select * into v_return from public.invoices
   where boutique_id=new.boutique_id and id=new.invoice_id;
  if not found or lower(btrim(coalesce(v_return.type,''))) <> 'retour' then
    return new;
  end if;
  if new.source_invoice_line_id is null then
    raise exception 'source invoice line required for return';
  end if;
  select * into v_source from public.invoice_lines
   where id=new.source_invoice_line_id
     and boutique_id=new.boutique_id
     and invoice_id=v_return.return_of_invoice_id
   for update;
  if not found then raise exception 'invalid source invoice line'; end if;
  if new.product_id is distinct from v_source.product_id then
    raise exception 'return product does not match source invoice line';
  end if;
  select coalesce(sum(rl.qty),0) into v_returned
    from public.invoice_lines rl
    join public.invoices ri on ri.boutique_id=rl.boutique_id and ri.id=rl.invoice_id
   where ri.boutique_id=new.boutique_id
     and lower(btrim(coalesce(ri.type,'')))='retour'
     and ri.return_of_invoice_id=v_return.return_of_invoice_id
     and rl.source_invoice_line_id=v_source.id
     and (tg_op='INSERT' or rl.id<>new.id);
  if coalesce(new.qty,0)<=0 or v_returned+new.qty > v_source.qty+0.0005 then
    raise exception 'return quantity exceeds source invoice line';
  end if;
  return new;
end
$function$;

revoke all on function public.enforce_return_line_provenance() from public, anon, authenticated;
