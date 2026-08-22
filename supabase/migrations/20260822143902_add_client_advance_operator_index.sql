begin;

set local lock_timeout = '10s';
set local statement_timeout = '30s';

create index if not exists client_advances_operator_id_idx
  on public.client_advances (operator_id);

commit;
