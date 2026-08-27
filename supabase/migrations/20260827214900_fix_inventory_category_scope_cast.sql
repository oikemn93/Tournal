create or replace function public.start_inventory_session(p_boutique_id text,p_scope_type text,p_scope_id text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_id uuid:=gen_random_uuid(); v_label text; v_count integer;
begin
  if not private.auth_has_permission(p_boutique_id,'inventaire') then raise exception 'forbidden'; end if;
  if p_scope_type not in ('all','category','product') then raise exception 'invalid inventory scope'; end if;
  if p_scope_type='all' then v_label:='Tous les produits';
  elsif p_scope_type='category' then
    select nom into v_label from public.categories where boutique_id=p_boutique_id and id=p_scope_id;
    if not found then raise exception 'category not found'; end if;
  else
    select nom into v_label from public.products where boutique_id=p_boutique_id and id=p_scope_id::bigint;
    if not found then raise exception 'product not found'; end if;
  end if;

  insert into public.inventory_sessions(id,boutique_id,scope_type,scope_id,scope_label,operator_id)
  values(v_id,p_boutique_id,p_scope_type,p_scope_id,v_label,auth.uid());

  insert into public.inventory_lines(session_id,product_id,product_name,category_name,unit,theoretical_qty,purchase_price,sale_price,pieces_per_lot,length_per_piece)
  select v_id,p.id,p.nom,c.nom,p.unit,p.stock,coalesce(p.prix_achat,0),coalesce(p.prix_vente,0),
         coalesce(p.pieces_per_lot,c.pieces_per_lot,0),coalesce(p.length_per_piece,c.length_per_piece,0)
  from public.products p
  left join public.categories c on c.boutique_id=p.boutique_id and c.id=p.category_id
  where p.boutique_id=p_boutique_id
    and coalesce(p.actif,true)
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
end $$;
