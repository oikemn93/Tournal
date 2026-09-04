-- Inventory read RPCs use read authorization so they remain available after
-- the short-lived app session expires. Internal unmasked helpers stay revoked
-- from authenticated users and are only called by the masking wrappers.

create or replace function public.get_inventory_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_boutique text;
  v_payload jsonb;
  v_lines jsonb;
begin
  select boutique_id into v_boutique
  from public.inventory_sessions
  where id = p_session_id;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_read_permission(v_boutique,'inventaire') then raise exception 'forbidden'; end if;

  v_payload := public.get_inventory_session_internal_unmasked(p_session_id);
  if private.auth_has_read_permission(v_boutique,'marges') then
    return v_payload;
  end if;

  v_payload := jsonb_set(
    v_payload,
    '{report}',
    coalesce(v_payload->'report','{}'::jsonb) || jsonb_build_object(
      'theoreticalCost', null,
      'countedCost', null,
      'theoreticalSales', null,
      'countedSales', null,
      'potentialMargin', null,
      'varianceCost', null,
      'varianceSales', null
    ),
    true
  );

  select coalesce(
    jsonb_agg(
      (item - 'purchasePrice' - 'fifoTheoreticalCost' - 'fifoCountedCost' - 'fifoUnitCost')
      || jsonb_build_object(
        'purchasePrice', null,
        'fifoTheoreticalCost', null,
        'fifoCountedCost', null,
        'fifoUnitCost', null
      )
      order by ordinality
    ),
    '[]'::jsonb
  ) into v_lines
  from jsonb_array_elements(coalesce(v_payload->'lines','[]'::jsonb)) with ordinality as line(item, ordinality);

  return jsonb_set(v_payload,'{lines}',v_lines,true);
end;
$function$;

create or replace function public.get_inventory_session_internal_unmasked(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_session public.inventory_sessions%rowtype; v_result jsonb;
begin
  select * into v_session from public.inventory_sessions where id=p_session_id;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_read_permission(v_session.boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'id',s.id,'boutiqueId',s.boutique_id,'scopeType',s.scope_type,'scopeId',s.scope_id,'scopeLabel',s.scope_label,
    'status',s.status,'operatorId',s.operator_id,'operatorName',u.nom,'startedAt',s.started_at,'asOfAt',s.as_of_at,
    'finalizedAt',s.finalized_at,'cancelledAt',s.cancelled_at,
    'report',jsonb_build_object(
      'theoreticalCost',s.total_theoretical_cost,'countedCost',s.total_counted_cost,
      'theoreticalSales',s.total_theoretical_sales,'countedSales',s.total_counted_sales,
      'potentialMargin',s.total_potential_margin,'varianceCost',s.total_variance_cost,'varianceSales',s.total_variance_sales
    ),
    'lines',coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId',l.product_id,'productName',l.product_name,'categoryName',l.category_name,'unit',l.unit,
        'theoreticalQty',l.theoretical_qty,'finalTheoreticalQty',l.final_theoretical_qty,'countedQty',l.counted_qty,
        'differenceQty',l.difference_qty,'purchasePrice',l.purchase_price,'salePrice',l.sale_price,
        'fifoTheoreticalCost',l.fifo_theoretical_cost,'fifoCountedCost',l.fifo_counted_cost,'fifoUnitCost',l.fifo_unit_cost,
        'piecesPerLot',l.pieces_per_lot,'lengthPerPiece',l.length_per_piece,'countingDetail',l.counting_detail,
        'stockEntryId',l.stock_entry_id
      ) order by l.category_name nulls last,l.product_name)
      from public.inventory_lines l where l.session_id=s.id
    ),'[]'::jsonb)
  ) into v_result
  from public.inventory_sessions s left join public.platform_users u on u.id=s.operator_id
  where s.id=p_session_id;
  return v_result;
end;
$function$;

create or replace function public.list_inventory_sessions(p_boutique_id text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_payload jsonb;
  v_masked jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  v_payload := public.list_inventory_sessions_internal_unmasked(p_boutique_id,p_limit);
  if private.auth_has_read_permission(p_boutique_id,'marges') then
    return v_payload;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_set(
        item,
        '{report}',
        coalesce(item->'report','{}'::jsonb) || jsonb_build_object(
          'theoreticalCost', null,
          'countedCost', null,
          'theoreticalSales', null,
          'countedSales', null,
          'potentialMargin', null,
          'varianceCost', null,
          'varianceSales', null
        ),
        true
      )
      order by ordinality
    ),
    '[]'::jsonb
  ) into v_masked
  from jsonb_array_elements(coalesce(v_payload,'[]'::jsonb)) with ordinality as session(item, ordinality);
  return v_masked;
end;
$function$;

create or replace function public.list_inventory_sessions_internal_unmasked(p_boutique_id text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_result jsonb;
begin
  if not private.auth_has_read_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(item order by started_at desc),'[]'::jsonb) into v_result
  from (
    select s.started_at,jsonb_build_object(
      'id',s.id,'scopeType',s.scope_type,'scopeId',s.scope_id,'scopeLabel',s.scope_label,'status',s.status,
      'operatorId',s.operator_id,'operatorName',u.nom,'startedAt',s.started_at,'asOfAt',s.as_of_at,
      'finalizedAt',s.finalized_at,
      'report',jsonb_build_object(
        'theoreticalCost',s.total_theoretical_cost,'countedCost',s.total_counted_cost,
        'theoreticalSales',s.total_theoretical_sales,'countedSales',s.total_counted_sales,
        'potentialMargin',s.total_potential_margin,'varianceCost',s.total_variance_cost,'varianceSales',s.total_variance_sales
      ),
      'lineCount',(select count(*) from public.inventory_lines l where l.session_id=s.id),
      'countedCount',(select count(*) from public.inventory_lines l where l.session_id=s.id and l.counted_qty is not null)
    ) item
    from public.inventory_sessions s left join public.platform_users u on u.id=s.operator_id
    where s.boutique_id=p_boutique_id
    order by s.started_at desc
    limit greatest(1,least(coalesce(p_limit,20),100))
  ) q;
  return v_result;
end;
$function$;

revoke all on function public.get_inventory_session_internal_unmasked(uuid) from public, anon, authenticated;
revoke all on function public.list_inventory_sessions_internal_unmasked(text,integer) from public, anon, authenticated;
