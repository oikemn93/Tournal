\if :{?assert_patched}
do $test$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)
  into v_definition;

  if position('order by source_line.product_id, (x->>''sourceLineId'')::bigint' in v_definition) = 0 then
    raise exception 'return_sale does not acquire product locks in deterministic order';
  end if;
  if has_function_privilege('anon', 'public.return_sale(text,text,uuid,jsonb,text)', 'execute') then
    raise exception 'anon must not execute return_sale';
  end if;
  if not has_function_privilege('authenticated', 'public.return_sale(text,text,uuid,jsonb,text)', 'execute')
     or not has_function_privilege('service_role', 'public.return_sale(text,text,uuid,jsonb,text)', 'execute') then
    raise exception 'expected return_sale execution grants are missing';
  end if;
end
$test$;
\else
create or replace function public.return_sale(
  p_boutique_id text,
  p_invoice_id text,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_refund_method text default null
)
returns jsonb
language plpgsql
security definer
as $function$
declare
  v_resolved jsonb := '[]'::jsonb;
  v_line jsonb;
begin
  for v_line in
    select jsonb_build_object('sourceLineId',(x->>'sourceLineId')::bigint,'qty',sum((x->>'qty')::numeric)) from jsonb_array_elements(v_resolved) x group by (x->>'sourceLineId')::bigint
  loop
    null;
  end loop;

  return '{}'::jsonb;
end
$function$;
\endif
