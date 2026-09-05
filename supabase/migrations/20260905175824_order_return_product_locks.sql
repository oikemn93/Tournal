-- Process returned products in a deterministic order. Two concurrent returns
-- for different invoices may touch the same products; ordering by product id
-- prevents them from acquiring product locks in opposite orders.
do $migration$
declare
  v_definition text;
  v_old text := $old$  for v_line in
    select jsonb_build_object('sourceLineId',(x->>'sourceLineId')::bigint,'qty',sum((x->>'qty')::numeric)) from jsonb_array_elements(v_resolved) x group by (x->>'sourceLineId')::bigint
  loop$old$;
  v_new text := $new$  for v_line in
    select jsonb_build_object(
      'sourceLineId', (x->>'sourceLineId')::bigint,
      'qty', sum((x->>'qty')::numeric)
    )
    from jsonb_array_elements(v_resolved) x
    join public.invoice_lines source_line
      on source_line.id = (x->>'sourceLineId')::bigint
     and source_line.boutique_id = p_boutique_id
     and source_line.invoice_id = p_invoice_id
    group by (x->>'sourceLineId')::bigint, source_line.product_id
    order by source_line.product_id, (x->>'sourceLineId')::bigint
  loop$new$;
begin
  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)
  into v_definition;

  if position(v_new in v_definition) > 0 then
    return;
  end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'return_sale product-lock loop marker not found';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;

revoke all on function public.return_sale(text,text,uuid,jsonb,text) from public, anon;
grant execute on function public.return_sale(text,text,uuid,jsonb,text) to authenticated, service_role;
