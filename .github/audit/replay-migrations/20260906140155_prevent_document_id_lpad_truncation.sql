-- Prevent LPAD from truncating invoice/credit counters once they exceed six digits.
-- Existing IDs <= 999999 keep the exact same zero-padded representation.
do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.create_sale(text,uuid,text,text,jsonb,text,bigint,text,boolean)'::regprocedure)
    into v_def;
  v_old := 'lpad(v_numero::text, 6, ''0'')';
  v_new := 'lpad(v_numero::text, greatest(6, length(v_numero::text)), ''0'')';
  if position(v_old in v_def) = 0 then
    raise exception 'create_sale expected invoice-id formatter not found';
  end if;
  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef('public.accept_stock_transfer(uuid,uuid,jsonb)'::regprocedure)
    into v_def;
  v_old := 'lpad(v_numero::text,6,''0'')';
  v_new := 'lpad(v_numero::text,greatest(6,length(v_numero::text)),''0'')';
  if position(v_old in v_def) = 0 then
    raise exception 'accept_stock_transfer expected invoice-id formatter not found';
  end if;
  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef('public.return_sale(text,text,uuid,jsonb,text)'::regprocedure)
    into v_def;
  v_old := 'lpad(v_credit_num::text,6,''0'')';
  v_new := 'lpad(v_credit_num::text,greatest(6,length(v_credit_num::text)),''0'')';
  if position(v_old in v_def) = 0 then
    raise exception 'return_sale expected credit-note formatter not found';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;
