-- Finalize inventory sessions only when the counted product scope remained
-- unchanged since the inventory started. Use >= because PostgreSQL now() is
-- transaction-scoped, so a movement created later in the same transaction can
-- legitimately share the session's started_at timestamp.

create or replace function public.finalize_inventory_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  v_session public.inventory_sessions%rowtype;
  v_line record;
  v_current numeric;
  v_diff numeric;
  v_entry jsonb;
  v_missing integer;
  v_fifo_counted numeric;
begin
  select * into v_session
  from public.inventory_sessions
  where id=p_session_id
  for update;

  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_session.boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if v_session.status='completed' then return public.get_inventory_session(p_session_id); end if;
  if v_session.status<>'draft' then raise exception 'inventory session is closed'; end if;

  select count(*) into v_missing
  from public.inventory_lines
  where session_id=p_session_id and counted_qty is null;
  if v_missing>0 then raise exception 'inventory incomplete: % product(s) not counted',v_missing; end if;

  perform p.id
  from public.products p
  join public.inventory_lines il
    on il.session_id=p_session_id and il.product_id=p.id
  where p.boutique_id=v_session.boutique_id
  order by p.id
  for update of p;

  if exists(
    select 1
    from public.inventory_lines il
    join public.stock_entries se
      on se.boutique_id=v_session.boutique_id
     and se.product_id=il.product_id
    where il.session_id=p_session_id
      and se.created_at>=v_session.started_at
  ) then
    raise exception 'inventory stock changed during count; restart this inventory';
  end if;

  for v_line in
    select * from public.inventory_lines
    where session_id=p_session_id
    order by product_id
  loop
    select stock into v_current
    from public.products
    where boutique_id=v_session.boutique_id and id=v_line.product_id;
    if not found then raise exception 'product % not found',v_line.product_id; end if;

    v_diff:=v_line.counted_qty-v_current;

    if v_diff<>0 then
      v_entry:=public.record_stock_movement(
        v_session.boutique_id,
        v_line.product_id,
        gen_random_uuid(),
        v_diff,
        'inventaire',
        case when v_line.theoretical_qty>0 then v_line.fifo_theoretical_cost/v_line.theoretical_qty else coalesce(v_line.purchase_price,0) end,
        'Inventaire daté '||v_session.as_of_at::text||' · compté '||v_line.counted_qty::text||' '||v_line.unit,
        null::bigint,
        'INV-'||left(p_session_id::text,8)
      );
    else
      v_entry:=null;
    end if;

    v_fifo_counted:=private.fifo_stock_value(
      v_session.boutique_id,
      v_line.product_id,
      v_session.as_of_at,
      v_line.counted_qty
    );

    update public.inventory_lines
    set final_theoretical_qty=v_current,
        difference_qty=v_diff,
        fifo_counted_cost=v_fifo_counted,
        fifo_unit_cost=case when counted_qty>0 then v_fifo_counted/counted_qty else 0 end,
        stock_entry_id=case when v_entry is null then null else (v_entry->>'entry_id')::bigint end,
        updated_at=now()
    where session_id=p_session_id and product_id=v_line.product_id;
  end loop;

  update public.inventory_sessions s
  set status='completed',
      finalized_at=now(),
      updated_at=now(),
      total_theoretical_cost=coalesce(x.theoretical_cost,0),
      total_counted_cost=coalesce(x.counted_cost,0),
      total_theoretical_sales=0,
      total_counted_sales=0,
      total_potential_margin=0,
      total_variance_cost=coalesce(x.counted_cost-x.theoretical_cost,0),
      total_variance_sales=0
  from (
    select sum(fifo_theoretical_cost) theoretical_cost,
           sum(fifo_counted_cost) counted_cost
    from public.inventory_lines
    where session_id=p_session_id
  ) x
  where s.id=p_session_id;

  return public.get_inventory_session(p_session_id);
end
$function$;
