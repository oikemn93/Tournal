-- Audit-only reconstruction of structural objects created by the missing
-- production migration 20260813030754 (tournal_secure_compatibility_state).
-- No historical data or policies are restored here.

create table if not exists public.boutique_state (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.platform_users(id) on delete set null
);

create table if not exists public.groupes (
  id text primary key,
  nom text not null unique,
  created_at timestamptz not null default now()
);
