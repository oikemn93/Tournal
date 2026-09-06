-- Audit-only structural prerequisite recovered from production migration
-- 20260813080602 (enforce_per_boutique_invoice_numbers_v2).
create table if not exists private.invoice_number_counters (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  last_numero bigint not null check (last_numero >= 0),
  updated_at timestamptz not null default now()
);
