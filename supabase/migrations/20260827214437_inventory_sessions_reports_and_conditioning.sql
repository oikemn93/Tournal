create table if not exists public.inventory_sessions (
  id uuid primary key default gen_random_uuid(),
  boutique_id text not null references public.boutiques(id) on delete cascade,
  scope_type text not null check (scope_type in ('all','category','product')),
  scope_id text,
  scope_label text not null,
  status text not null default 'draft' check (status in ('draft','completed','cancelled')),
  operator_id uuid not null default auth.uid(),
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  cancelled_at timestamptz,
  total_theoretical_cost numeric not null default 0,
  total_counted_cost numeric not null default 0,
  total_theoretical_sales numeric not null default 0,
  total_counted_sales numeric not null default 0,
  total_potential_margin numeric not null default 0,
  total_variance_cost numeric not null default 0,
  total_variance_sales numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_lines (
  session_id uuid not null references public.inventory_sessions(id) on delete cascade,
  product_id bigint not null,
  product_name text not null,
  category_name text,
  unit text not null,
  theoretical_qty numeric not null,
  final_theoretical_qty numeric,
  counted_qty numeric,
  difference_qty numeric,
  purchase_price numeric not null default 0,
  sale_price numeric not null default 0,
  pieces_per_lot numeric not null default 0,
  length_per_piece numeric not null default 0,
  counting_detail jsonb not null default '{}'::jsonb,
  stock_entry_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, product_id)
);

create index if not exists inventory_sessions_boutique_started_idx on public.inventory_sessions (boutique_id, started_at desc);
create index if not exists inventory_lines_product_idx on public.inventory_lines (product_id);
alter table public.inventory_sessions enable row level security;
alter table public.inventory_lines enable row level security;
revoke all on public.inventory_sessions from anon, authenticated;
revoke all on public.inventory_lines from anon, authenticated;

drop function if exists public.get_inventory_session(uuid);
create function public.get_inventory_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_session public.inventory_sessions%rowtype; v_result jsonb;
begin
  select * into v_session from public.inventory_sessions where id = p_session_id;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_session.boutique_id, 'inventaire') then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'id',s.id,'boutiqueId',s.boutique_id,'scopeType',s.scope_type,'scopeId',s.scope_id,'scopeLabel',s.scope_label,
    'status',s.status,'operatorId',s.operator_id,'operatorName',u.nom,'startedAt',s.started_at,'finalizedAt',s.finalized_at,'cancelledAt',s.cancelled_at,
    'report',jsonb_build_object('theoreticalCost',s.total_theoretical_cost,'countedCost',s.total_counted_cost,'theoreticalSales',s.total_theoretical_sales,'countedSales',s.total_counted_sales,'potentialMargin',s.total_potential_margin,'varianceCost',s.total_variance_cost,'varianceSales',s.total_variance_sales),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'productId',l.product_id,'productName',l.product_name,'categoryName',l.category_name,'unit',l.unit,
      'theoreticalQty',l.theoretical_qty,'finalTheoreticalQty',l.final_theoretical_qty,'countedQty',l.counted_qty,'differenceQty',l.difference_qty,
      'purchasePrice',l.purchase_price,'salePrice',l.sale_price,'piecesPerLot',l.pieces_per_lot,'lengthPerPiece',l.length_per_piece,
      'countingDetail',l.counting_detail,'stockEntryId',l.stock_entry_id
    ) order by l.category_name nulls last,l.product_name) from public.inventory_lines l where l.session_id=s.id),'[]'::jsonb)
  ) into v_result
  from public.inventory_sessions s left join public.platform_users u on u.id=s.operator_id where s.id=p_session_id;
  return v_result;
end $$;

drop function if exists public.list_inventory_sessions(text,integer);
create function public.list_inventory_sessions(p_boutique_id text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_result jsonb;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(item order by started_at desc),'[]'::jsonb) into v_result from (
    select s.started_at,jsonb_build_object(
      'id',s.id,'scopeType',s.scope_type,'scopeId',s.scope_id,'scopeLabel',s.scope_label,'status',s.status,
      'operatorId',s.operator_id,'operatorName',u.nom,'startedAt',s.started_at,'finalizedAt',s.finalized_at,
      'report',jsonb_build_object('theoreticalCost',s.total_theoretical_cost,'countedCost',s.total_counted_cost,'theoreticalSales',s.total_theoretical_sales,'countedSales',s.total_counted_sales,'potentialMargin',s.total_potential_margin,'varianceCost',s.total_variance_cost,'varianceSales',s.total_variance_sales),
      'lineCount',(select count(*) from public.inventory_lines l where l.session_id=s.id),
      'countedCount',(select count(*) from public.inventory_lines l where l.session_id=s.id and l.counted_qty is not null)
    ) item
    from public.inventory_sessions s left join public.platform_users u on u.id=s.operator_id
    where s.boutique_id=p_boutique_id order by s.started_at desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) q;
  return v_result;
end $$;

drop function if exists public.start_inventory_session(text,text,text);
create function public.start_inventory_session(p_boutique_id text,p_scope_type text,p_scope_id text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_id uuid:=gen_random_uuid(); v_label text; v_count integer;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if p_scope_type not in ('all','category','product') then raise exception 'invalid inventory scope'; end if;
  if p_scope_type='all' then v_label:='Tous les produits';
  elsif p_scope_type='category' then select nom into v_label from public.categories where boutique_id=p_boutique_id and id=p_scope_id; if not found then raise exception 'category not found'; end if;
  else select nom into v_label from public.products where boutique_id=p_boutique_id and id=p_scope_id::bigint; if not found then raise exception 'product not found'; end if; end if;
  insert into public.inventory_sessions(id,boutique_id,scope_type,scope_id,scope_label,operator_id) values(v_id,p_boutique_id,p_scope_type,p_scope_id,v_label,auth.uid());
  insert into public.inventory_lines(session_id,product_id,product_name,category_name,unit,theoretical_qty,purchase_price,sale_price,pieces_per_lot,length_per_piece)
  select v_id,p.id,p.nom,c.nom,p.unit,p.stock,coalesce(p.prix_achat,0),coalesce(p.prix_vente,0),coalesce(p.pieces_per_lot,c.pieces_per_lot,0),coalesce(p.length_per_piece,c.length_per_piece,0)
  from public.products p left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id
  where p.boutique_id=p_boutique_id and coalesce(p.actif,true) and (p_scope_type='all' or (p_scope_type='category' and p.category_id=p_scope_id) or (p_scope_type='product' and p.id=p_scope_id::bigint))
  order by c.nom nulls last,p.nom;
  get diagnostics v_count=row_count; if v_count=0 then raise exception 'no product in inventory scope'; end if;
  return public.get_inventory_session(v_id);
end $$;

drop function if exists public.save_inventory_count(uuid,bigint,numeric,jsonb);
create function public.save_inventory_count(p_session_id uuid,p_product_id bigint,p_counted_qty numeric,p_counting_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_boutique text; v_status text;
begin
  select boutique_id,status into v_boutique,v_status from public.inventory_sessions where id=p_session_id for update;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_boutique,'inventaire') then raise exception 'forbidden'; end if;
  if v_status<>'draft' then raise exception 'inventory session is closed'; end if;
  if p_counted_qty is null or p_counted_qty<0 then raise exception 'invalid counted quantity'; end if;
  update public.inventory_lines set counted_qty=p_counted_qty,counting_detail=coalesce(p_counting_detail,'{}'::jsonb),updated_at=now() where session_id=p_session_id and product_id=p_product_id;
  if not found then raise exception 'inventory product not found'; end if;
  update public.inventory_sessions set updated_at=now() where id=p_session_id;
  return public.get_inventory_session(p_session_id);
end $$;

drop function if exists public.finalize_inventory_session(uuid);
create function public.finalize_inventory_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_session public.inventory_sessions%rowtype; v_line record; v_current numeric; v_diff numeric; v_entry jsonb; v_missing integer;
begin
  select * into v_session from public.inventory_sessions where id=p_session_id for update;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_session.boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if v_session.status='completed' then return public.get_inventory_session(p_session_id); end if;
  if v_session.status<>'draft' then raise exception 'inventory session is closed'; end if;
  select count(*) into v_missing from public.inventory_lines where session_id=p_session_id and counted_qty is null;
  if v_missing>0 then raise exception 'inventory incomplete: % product(s) not counted',v_missing; end if;
  for v_line in select * from public.inventory_lines where session_id=p_session_id order by product_id loop
    select stock into v_current from public.products where boutique_id=v_session.boutique_id and id=v_line.product_id for update;
    if not found then raise exception 'product % not found',v_line.product_id; end if;
    v_diff:=v_line.counted_qty-v_current;
    if v_diff<>0 then
      v_entry:=public.record_stock_movement(v_session.boutique_id,v_line.product_id,gen_random_uuid(),v_diff,'inventaire',coalesce(v_line.purchase_price,0),'Inventaire '||p_session_id::text||' · compté '||v_line.counted_qty::text||' '||v_line.unit,null::bigint,'INV-'||left(p_session_id::text,8));
    else v_entry:=null; end if;
    update public.inventory_lines set final_theoretical_qty=v_current,difference_qty=v_diff,stock_entry_id=case when v_entry is null then null else (v_entry->>'entry_id')::bigint end,updated_at=now() where session_id=p_session_id and product_id=v_line.product_id;
  end loop;
  update public.inventory_sessions s set status='completed',finalized_at=now(),updated_at=now(),
    total_theoretical_cost=coalesce(x.theoretical_cost,0),total_counted_cost=coalesce(x.counted_cost,0),
    total_theoretical_sales=coalesce(x.theoretical_sales,0),total_counted_sales=coalesce(x.counted_sales,0),
    total_potential_margin=coalesce(x.counted_sales-x.counted_cost,0),total_variance_cost=coalesce(x.variance_cost,0),total_variance_sales=coalesce(x.variance_sales,0)
  from (select sum(coalesce(final_theoretical_qty,theoretical_qty)*purchase_price) theoretical_cost,sum(counted_qty*purchase_price) counted_cost,sum(coalesce(final_theoretical_qty,theoretical_qty)*sale_price) theoretical_sales,sum(counted_qty*sale_price) counted_sales,sum(difference_qty*purchase_price) variance_cost,sum(difference_qty*sale_price) variance_sales from public.inventory_lines where session_id=p_session_id) x
  where s.id=p_session_id;
  return public.get_inventory_session(p_session_id);
end $$;

drop function if exists public.cancel_inventory_session(uuid);
create function public.cancel_inventory_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_boutique text; v_status text;
begin
  select boutique_id,status into v_boutique,v_status from public.inventory_sessions where id=p_session_id for update;
  if not found then raise exception 'inventory session not found'; end if;
  if not private.auth_has_permission(v_boutique,'inventaire') then raise exception 'forbidden'; end if;
  if v_status='completed' then raise exception 'completed inventory cannot be cancelled'; end if;
  update public.inventory_sessions set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_session_id;
  return public.get_inventory_session(p_session_id);
end $$;

revoke all on function public.get_inventory_session(uuid) from public,anon;
revoke all on function public.list_inventory_sessions(text,integer) from public,anon;
revoke all on function public.start_inventory_session(text,text,text) from public,anon;
revoke all on function public.save_inventory_count(uuid,bigint,numeric,jsonb) from public,anon;
revoke all on function public.finalize_inventory_session(uuid) from public,anon;
revoke all on function public.cancel_inventory_session(uuid) from public,anon;
grant execute on function public.get_inventory_session(uuid) to authenticated;
grant execute on function public.list_inventory_sessions(text,integer) to authenticated;
grant execute on function public.start_inventory_session(text,text,text) to authenticated;
grant execute on function public.save_inventory_count(uuid,bigint,numeric,jsonb) to authenticated;
grant execute on function public.finalize_inventory_session(uuid) to authenticated;
grant execute on function public.cancel_inventory_session(uuid) to authenticated;
