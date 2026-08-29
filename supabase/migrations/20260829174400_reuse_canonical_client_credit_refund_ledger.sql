-- The project already has client_credit_refunds + refund_client_credit_fifo.
-- Keep one canonical refund ledger/RPC and remove the temporary duplicate introduced
-- while separating registered-client returns from immediate counter refunds.

do $$ begin
  if exists(select 1 from public.client_advance_refunds limit 1) then
    raise exception 'client_advance_refunds is not empty; refusing cleanup';
  end if;
end $$;

drop function if exists public.refund_client_advance(text,bigint,numeric,text,uuid);
drop table if exists public.client_advance_refunds;
