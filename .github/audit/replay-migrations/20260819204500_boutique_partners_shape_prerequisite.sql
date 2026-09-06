-- Audit-only compatibility prerequisite.
-- scripts/ci-db-baseline.sql contains a minimal boutique_partners table, while
-- remote migration 20260819205051 creates the full historical structure with
-- CREATE TABLE IF NOT EXISTS. Complete the pre-existing audit table so that
-- replaying the real migration yields the same schema. No data is inserted.
-- This file must not be merged to main.

alter table public.boutique_partners
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='boutique_partners_boutique_id_fkey'
      and conrelid='public.boutique_partners'::regclass
  ) then
    alter table public.boutique_partners
      add constraint boutique_partners_boutique_id_fkey
      foreign key (boutique_id) references public.boutiques(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='boutique_partners_partner_boutique_id_fkey'
      and conrelid='public.boutique_partners'::regclass
  ) then
    alter table public.boutique_partners
      add constraint boutique_partners_partner_boutique_id_fkey
      foreign key (partner_boutique_id) references public.boutiques(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='boutique_partners_created_by_fkey'
      and conrelid='public.boutique_partners'::regclass
  ) then
    alter table public.boutique_partners
      add constraint boutique_partners_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='boutique_partners_check'
      and conrelid='public.boutique_partners'::regclass
  ) then
    alter table public.boutique_partners
      add constraint boutique_partners_check
      check (boutique_id <> partner_boutique_id);
  end if;
end
$$;
