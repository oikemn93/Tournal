-- Audit-only reconstruction of private transaction primitives that predate
-- the retained Git migration history. No idempotency data is restored.

create table if not exists private.idempotency_keys (
  user_id uuid not null,
  operation text not null,
  key uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation, key)
);

create sequence if not exists private.product_id_seq;
create sequence if not exists private.stock_entry_id_seq;
create sequence if not exists private.supplier_id_seq;
create sequence if not exists private.client_id_seq;
create sequence if not exists private.charge_id_seq;

alter table public.invoice_lines alter column id add generated always as identity;
