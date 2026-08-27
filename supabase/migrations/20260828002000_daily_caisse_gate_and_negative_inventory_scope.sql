create or replace function public.start_inventory_session(p_boutique_id text, p_scope_type text, p_scope_id text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_id uuid := gen_random_uuid();
  v_label text;
  v_count integer;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if p_scope_type not in ('all','category','product') then raise exception 'invalid inventory scope'; end if;

  if p_scope_type='all' then
    v_label := 'Tous les produits';
  elsif p_scope_type='category' then
    select nom into v_label from public.categories where boutique_id=p_boutique_id and id=p_scope_id;
    if not found then raise exception 'category not found'; end if;
  else
    select nom into v_label from public.products where boutique_id=p_boutique_id and id=p_scope_id::bigint;
    if not found then raise exception 'product not found'; end if;
  end if;

  insert into public.inventory_sessions(id,boutique_id,scope_type,scope_id,scope_label,operator_id)
  values(v_id,p_boutique_id,p_scope_type,p_scope_id,v_label,auth.uid());

  insert into public.inventory_lines(
    session_id,product_id,product_name,category_name,unit,theoretical_qty,
    purchase_price,sale_price,pieces_per_lot,length_per_piece
  )
  select
    v_id,p.id,p.nom,c.nom,p.unit,p.stock,coalesce(p.prix_achat,0),coalesce(p.prix_vente,0),
    coalesce(p.pieces_per_lot,c.pieces_per_lot,0),coalesce(p.length_per_piece,c.length_per_piece,0)
  from public.products p
  left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id
  where p.boutique_id=p_boutique_id
    and (coalesce(p.actif,true) or coalesce(p.stock,0) <> 0)
    and case p_scope_type
      when 'all' then true
      when 'category' then p.category_id=p_scope_id
      when 'product' then p.id=p_scope_id::bigint
      else false
    end
  order by c.nom nulls last,p.nom;

  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'no product in inventory scope'; end if;
  return public.get_inventory_session(v_id);
end
$function$;

create or replace function private.enforce_daily_caisse_on_receipt()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enabled boolean := false;
  v_open_today boolean := false;
  v_invoice_type text;
begin
  if auth.uid() is null then return new; end if;

  select coalesce(s.caisse_daily_control_enabled,false)
    into v_enabled
  from public.auth_settings s
  where s.boutique_id = new.boutique_id;

  if not coalesce(v_enabled,false) then return new; end if;

  if tg_table_name = 'invoice_payments' then
    if coalesce(new.amount,0) <= 0 or coalesce(new.source,'') in ('client_advance','legacy_backfill') then
      return new;
    end if;
    select lower(coalesce(i.type,'')) into v_invoice_type
    from public.invoices i
    where i.boutique_id=new.boutique_id and i.id=new.invoice_id;
    if v_invoice_type='retour' then return new; end if;
  end if;

  select exists(
    select 1
    from public.caisse_sessions cs
    where cs.boutique_id=new.boutique_id
      and cs.closed_at is null
      and (cs.opened_at at time zone 'Africa/Dakar')::date = (now() at time zone 'Africa/Dakar')::date
  ) into v_open_today;

  if not v_open_today then
    raise exception 'caisse_opening_required' using hint='Ouvrez la caisse du jour avant tout encaissement.';
  end if;
  return new;
end
$function$;

revoke all on function private.enforce_daily_caisse_on_receipt() from public, anon, authenticated;

drop trigger if exists trg_invoice_payments_daily_caisse on public.invoice_payments;
create trigger trg_invoice_payments_daily_caisse
before insert on public.invoice_payments
for each row execute function private.enforce_daily_caisse_on_receipt();
