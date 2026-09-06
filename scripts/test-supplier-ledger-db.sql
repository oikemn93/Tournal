\set ON_ERROR_STOP on

do $supplier_contract$
declare
  f text;
begin
  select pg_get_functiondef('public.record_supplier_payment(text,bigint,uuid,numeric,text,text,date)'::regprocedure) into f;
  if position('public.stock_entries' in f) > 0 then raise exception 'supplier payment must not derive debt from stock entries'; end if;
  if position($needle$source = 'supplier_receipt'$needle$ in f) = 0 then raise exception 'supplier payment must allocate supplier receipts'; end if;

  select pg_get_functiondef('public.get_supplier_current_balances(text)'::regprocedure) into f;
  if position('supplier_receipt' in f) = 0 or position('stock_entries' in f) > 0 then raise exception 'supplier balance must be payable-ledger based'; end if;

  select pg_get_functiondef('public.correct_supplier_receipt(text,bigint,uuid,numeric,numeric)'::regprocedure) into f;
  if position('receipt correction would make stock negative' in f) = 0 then raise exception 'receipt correction stock floor missing'; end if;

  select pg_get_functiondef('public.get_dashboard_summary(text,timestamp with time zone,timestamp with time zone)'::regprocedure) into f;
  if position('supplier_receipt' in f) = 0 or position('transfer_charge_payments' in f) = 0 then raise exception 'dashboard cash charge source contract missing'; end if;
end
$supplier_contract$;

select 'supplier_ledger_db_contract_ok' as result;
