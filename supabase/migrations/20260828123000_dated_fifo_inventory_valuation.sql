-- Dated inventory sessions and FIFO stock valuation.
-- Production migration: dated_fifo_inventory_valuation.
-- Adds inventory_sessions.as_of_at and FIFO valuation snapshots to inventory_lines.
-- Inventory theoretical quantity is reconstructed from stock_entries up to as_of_at.
-- Finalization applies only the counted-vs-theoretical delta to current stock, so movements
-- after the situation date are preserved. Sale-price based potential margin is retired.
-- The private.fifo_stock_value helper consumes negative movements FIFO and values ending
-- inventory from the remaining newest layers. Positive inventory surplus uses the latest
-- documented acquisition cost as fallback.

alter table public.inventory_sessions add column if not exists as_of_at timestamptz;
alter table public.inventory_lines add column if not exists fifo_theoretical_cost numeric not null default 0;
alter table public.inventory_lines add column if not exists fifo_counted_cost numeric not null default 0;
alter table public.inventory_lines add column if not exists fifo_unit_cost numeric not null default 0;

-- Full function definitions are applied in production migration dated_fifo_inventory_valuation
-- and follow-up fix_fifo_stock_value_arrays. Keep this repository marker aligned with the
-- deployed schema; future schema dumps should replace this marker with canonical definitions.
comment on column public.inventory_sessions.as_of_at is 'Inventory situation timestamp used to reconstruct theoretical stock.';
comment on column public.inventory_lines.fifo_theoretical_cost is 'FIFO value of theoretical stock at the inventory situation timestamp.';
comment on column public.inventory_lines.fifo_counted_cost is 'FIFO value of physically counted stock.';
comment on column public.inventory_lines.fifo_unit_cost is 'Derived FIFO unit cost for the counted quantity.';
