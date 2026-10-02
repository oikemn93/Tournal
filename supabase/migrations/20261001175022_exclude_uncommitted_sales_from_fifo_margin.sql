do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.pronamespace='private'::regnamespace
    and p.proname='fifo_realized_margin_core'
  limit 1;

  if v_def is null then raise exception 'fifo_realized_margin_core not found'; end if;
  if position('and coalesce(i.status,'''') <> ''annulée''' in v_def)=0 then
    raise exception 'fifo realized margin signature changed';
  end if;

  v_def := replace(
    v_def,
    'and coalesce(i.status,'''') <> ''annulée''',
    'and coalesce(i.status,'''') <> ''annulée'' and (lower(trim(coalesce(i.type,''''))) = ''retour'' or i.stock_deducted_at is not null)'
  );
  execute v_def;
end $$;
