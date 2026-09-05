create or replace function public.accept_stock_transfer_custom(
  p_transfer_id uuid,
  p_idempotency_key uuid,
  p_line_mappings jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $$
declare
  v_response jsonb;
  v_mapping jsonb;
  v_product_id bigint;
  v_category_id text;
  v_name text;
  v_pieces numeric;
  v_length numeric;
  v_sell_unit text;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_line_mappings is null or jsonb_typeof(p_line_mappings) <> 'array' then raise exception 'invalid line mappings'; end if;

  v_response := public.accept_stock_transfer(p_transfer_id, p_idempotency_key, p_line_mappings);

  for v_mapping in select value from jsonb_array_elements(p_line_mappings)
  loop
    if coalesce((v_mapping->>'create_new')::boolean,false) then
      select stl.destination_product_id into v_product_id
      from public.stock_transfer_lines stl
      join public.stock_transfers st on st.id=stl.transfer_id
      where stl.transfer_id=p_transfer_id
        and stl.id=(v_mapping->>'transfer_line_id')::bigint
        and st.to_boutique_id = (select boutique_id from public.products where id=stl.destination_product_id)
      limit 1;

      if v_product_id is not null then
        v_name := nullif(btrim(v_mapping->>'new_name'),'');
        v_category_id := nullif(v_mapping->>'category_id','');
        v_sell_unit := nullif(btrim(v_mapping->>'sell_unit'),'');
        v_pieces := nullif(v_mapping->>'pieces_per_lot','')::numeric;
        v_length := nullif(v_mapping->>'length_per_piece','')::numeric;

        if v_category_id is not null and not exists (
          select 1 from public.categories c
          join public.stock_transfers st on st.id=p_transfer_id
          where c.id=v_category_id and c.boutique_id=st.to_boutique_id
        ) then
          raise exception 'destination category not found';
        end if;

        update public.products p
        set nom=coalesce(v_name,p.nom),
            category_id=case when v_mapping ? 'category_id' then v_category_id else p.category_id end,
            pieces_per_lot=coalesce(v_pieces,p.pieces_per_lot),
            length_per_piece=coalesce(v_length,p.length_per_piece),
            sell_unit=coalesce(v_sell_unit,p.sell_unit),
            updated_at=now()
        from public.stock_transfers st
        where st.id=p_transfer_id
          and p.id=v_product_id
          and p.boutique_id=st.to_boutique_id;
      end if;
    end if;
  end loop;

  return v_response;
end
$$;

revoke all on function public.accept_stock_transfer_custom(uuid,uuid,jsonb) from public;
grant execute on function public.accept_stock_transfer_custom(uuid,uuid,jsonb) to authenticated;
