-- External suppliers have no linked boutique. SQL NULL must mean "not self".
-- Preserve the deployed function body and its permissions; change only this check.
do $fix$
declare
  definition text;
  old_check constant text := 'v_is_self_supplier := v_supplier.linked_boutique_id = p_boutique_id;';
  new_check constant text := 'v_is_self_supplier := coalesce(v_supplier.linked_boutique_id = p_boutique_id, false);';
begin
  select pg_get_functiondef('public.record_stock_movement(text,bigint,uuid,numeric,text,numeric,text,bigint,text)'::regprocedure)
    into definition;
  if position(old_check in definition) > 0 then
    execute replace(definition, old_check, new_check);
  elsif position(new_check in definition) = 0 then
    raise exception 'Unexpected record_stock_movement definition; review before applying';
  end if;
end
$fix$;
