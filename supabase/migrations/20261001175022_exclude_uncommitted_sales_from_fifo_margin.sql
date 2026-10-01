-- Exclude sales whose stock has not yet been committed from realized FIFO margin.
do $$
declare v_def text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.pronamespace='private'::regnamespace and p.proname='fifo_realized_margin_core'
  limit 1;
  v_old := '      and lower(trim(coalesce(i.type,''''))) in (''''vente'''',''''retour'''')
      and coalesce(i.status,'''''') <> ''''annulée''''
      and i.invoice_date >= p_from_at';
  v_new := '      and lower(trim(coalesce(i.type,''''))) in (''''vente'''',''''retour'''')
      and coalesce(i.status,'''''') <> ''''annulée'''' and (lower(trim(coalesce(i.type,''''))) = ''''retour'''' or i.stock_deducted_at is not null)
      and i.invoice_date >= p_from_at';
  if position(v_old in v_def)=0 then raise exception 'fifo core signature changed; migration aborted'; end if;
  execute replace(v_def,v_old,v_new);
end $$;
