-- Audit-only structural reconstruction of production migrations
-- 20260814175910 (transfers_and_financial_charges_core) and
-- 20260814180133 (allow_transfer_payment_source).
-- Historical rows/backfills are intentionally omitted.

alter table public.stock_transfers
  add column if not exists relationship_type text,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists invoice_id text,
  add column if not exists charge_id bigint,
  add column if not exists updated_at timestamptz not null default now();

alter table public.stock_transfers
  drop constraint if exists stock_transfers_relationship_type_check,
  add constraint stock_transfers_relationship_type_check
    check (relationship_type is null or relationship_type in ('same_owner','commercial'));

alter table public.stock_transfer_lines
  add column if not exists discount_percent numeric not null default 0;
alter table public.stock_transfer_lines
  drop constraint if exists stock_transfer_lines_discount_check,
  add constraint stock_transfer_lines_discount_check
    check (discount_percent >= 0 and discount_percent <= 100);

alter table public.charges
  add column if not exists fournisseur text,
  add column if not exists status text not null default 'paid',
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists transfer_id uuid,
  add column if not exists source text not null default 'manual';

alter table public.charges
  drop constraint if exists charges_paid_amount_check,
  add constraint charges_paid_amount_check
    check (paid_amount >= 0 and paid_amount <= montant);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='charges_transfer_id_fkey'
      and conrelid='public.charges'::regclass
  ) then
    alter table public.charges
      add constraint charges_transfer_id_fkey
      foreign key (transfer_id) references public.stock_transfers(id) on delete set null;
  end if;
end
$$;

alter table public.invoice_payments
  drop constraint if exists invoice_payments_source_check,
  add constraint invoice_payments_source_check
    check (source in ('invoice','client_fifo','legacy_backfill','transfer'));
