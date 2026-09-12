\set ON_ERROR_STOP on

-- Exact production helper used by stock valuation. This CI-only fixture keeps
-- the isolated Database Behavior baseline aligned without modifying the frozen
-- deployable migration tree.
CREATE OR REPLACE FUNCTION private.fifo_stock_value(p_boutique_id text, p_product_id bigint, p_as_of_at timestamp with time zone, p_target_qty numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare r record; v_qties numeric[]:=array[]::numeric[]; v_costs numeric[]:=array[]::numeric[]; v_qty numeric; v_take numeric; v_i int; v_total_qty numeric:=0; v_total_cost numeric:=0; v_target numeric; v_fallback numeric:=0;
begin
 for r in select qty,coalesce(prix_unit,0) cost from public.stock_entries where boutique_id=p_boutique_id and product_id=p_product_id and entry_date<=p_as_of_at order by entry_date,id loop
   if r.qty>0 then if r.cost>0 then v_fallback:=r.cost; end if; v_qties:=array_append(v_qties,r.qty); v_costs:=array_append(v_costs,case when r.cost>0 then r.cost else v_fallback end);
   elsif r.qty<0 then v_qty:=-r.qty; v_i:=1; while v_qty>0 and v_i<=coalesce(array_length(v_qties,1),0) loop if v_qties[v_i]>0 then v_take:=least(v_qty,v_qties[v_i]); v_qties[v_i]:=v_qties[v_i]-v_take; v_qty:=v_qty-v_take; end if; v_i:=v_i+1; end loop; end if;
 end loop;
 if coalesce(array_length(v_qties,1),0)>0 then for v_i in 1..array_length(v_qties,1) loop v_total_qty:=v_total_qty+greatest(v_qties[v_i],0); end loop; end if;
 v_target:=greatest(coalesce(p_target_qty,v_total_qty),0);
 if v_target>v_total_qty then v_total_cost:=v_total_cost+(v_target-v_total_qty)*v_fallback; v_target:=v_total_qty; end if;
 if v_target>0 and coalesce(array_length(v_qties,1),0)>0 then for v_i in reverse array_length(v_qties,1)..1 loop if v_qties[v_i]>0 then v_take:=least(v_target,v_qties[v_i]); v_total_cost:=v_total_cost+v_take*v_costs[v_i]; v_target:=v_target-v_take; exit when v_target<=0; end if; end loop; end if;
 return coalesce(v_total_cost,0);
end $function$;
