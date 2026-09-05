-- Audit-only structural reconstruction from remote migration 20260819213055.
-- The lost migration linked B2B clients/suppliers to their counterpart boutique.
-- Only schema objects are restored here; its historical function body is not
-- replayed because later retained migrations provide the authoritative transfer
-- implementation. This file must not be merged to main as-is.

alter table public.clients
  add column if not exists linked_boutique_id text
  references public.boutiques(id) on delete set null;

alter table public.suppliers
  add column if not exists linked_boutique_id text
  references public.boutiques(id) on delete set null;

create unique index if not exists clients_linked_boutique_unique
  on public.clients(boutique_id, linked_boutique_id)
  where linked_boutique_id is not null;

create unique index if not exists suppliers_linked_boutique_unique
  on public.suppliers(boutique_id, linked_boutique_id)
  where linked_boutique_id is not null;
