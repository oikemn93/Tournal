-- Audit-only prerequisite for the historical replay.
-- The synthetic CI baseline defines the same function identity with the old
-- parameter name p_stock_entry_id. PostgreSQL does not permit renaming an
-- input parameter through CREATE OR REPLACE FUNCTION, while production's
-- canonical signature is p_outflow_entry_id.

drop function if exists private.fifo_outflow_cost(text, bigint, bigint);

create function private.fifo_outflow_cost(
  p_boutique_id text,
  p_product_id bigint,
  p_outflow_entry_id bigint
) returns numeric
language sql stable
as $$ select 0::numeric $$;
