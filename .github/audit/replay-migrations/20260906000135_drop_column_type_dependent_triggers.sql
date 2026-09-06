-- AUDIT ONLY: temporarily drop user triggers on tables whose column types are
-- aligned in 20260906000140. Exact production triggers are recreated afterward.

do $audit$
declare r record;
begin
  for r in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='public'
      and c.relname in (
        'caisse_sessions','charges','client_credit_refunds','clients',
        'invoice_lines','invoices','products','stock_entries'
      )
  loop
    execute format('drop trigger %I on %I.%I', r.tgname, r.nspname, r.relname);
  end loop;
end
$audit$;
