begin;

set local lock_timeout = '10s';
set local statement_timeout = '30s';

create index if not exists client_advance_allocations_client_idx
  on private.client_advance_allocations (boutique_id, client_id);

create index if not exists client_advance_allocations_operator_idx
  on private.client_advance_allocations (operator_id);

commit;
