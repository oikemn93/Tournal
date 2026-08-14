do $$
declare
  v_seq text;
  v_max_id bigint;
begin
  select pg_get_serial_sequence('public.invoice_lines', 'id') into v_seq;
  if v_seq is null then
    raise exception 'invoice_lines.id has no serial sequence';
  end if;

  select coalesce(max(id), 0) into v_max_id
  from public.invoice_lines;

  perform setval(v_seq, greatest(v_max_id, 1), true);
end;
$$;

