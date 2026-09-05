-- Audit-only reconstruction of the structural state established by
-- production migration 20260813025950 (tournal_additive_relational_schema).
-- No production data or historical secrets are included.

alter table public.platform_users
  add column if not exists color text not null default '#888888',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.boutiques
  add column if not exists adresse text,
  add column if not exists email text,
  add column if not exists logo_url text,
  add column if not exists devise text not null default 'FCFA',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.boutique_assignments
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.auth_settings (
  boutique_id text primary key references public.boutiques(id) on delete cascade,
  lock_minutes integer not null default 5,
  session_minutes integer not null default 480,
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text not null,
  boutique_id text not null references public.boutiques(id) on delete cascade,
  nom text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (boutique_id, id)
);

alter table public.products
  add column if not exists category_id text,
  add column if not exists prix_vente numeric(12,2) not null default 0,
  add column if not exists unit text not null default 'unite',
  add column if not exists sell_unit text,
  add column if not exists sell_qty numeric(12,3),
  add column if not exists barcode text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists products_boutique_id_id_audit_uq on public.products(boutique_id,id);

alter table public.stock_entries
  add column if not exists operator_id uuid references public.platform_users(id) on delete set null,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();
create unique index if not exists stock_entries_boutique_id_id_audit_uq on public.stock_entries(boutique_id,id);

create table if not exists public.suppliers (
  id bigint not null,
  boutique_id text not null references public.boutiques(id) on delete cascade,
  nom text not null,
  ville text,
  tel text,
  email text,
  contact text,
  initials text,
  color text,
  last_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (boutique_id,id)
);

alter table public.clients
  add column if not exists tel text,
  add column if not exists email text,
  add column if not exists adresse text,
  add column if not exists ville text,
  add column if not exists contact text,
  add column if not exists last_invoice_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists clients_boutique_id_id_audit_uq on public.clients(boutique_id,id);

alter table public.invoices
  add column if not exists client_nom text,
  add column if not exists client_tel text,
  add column if not exists acompte numeric(12,2) not null default 0,
  add column if not exists payment_method text,
  add column if not exists operator_id uuid references public.platform_users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists invoices_boutique_id_id_audit_uq on public.invoices(boutique_id,id);

alter table public.invoice_lines
  alter column nom drop not null,
  add column if not exists unit text,
  add column if not exists sell_unit text,
  add column if not exists created_at timestamptz not null default now();

alter table public.charges
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists charges_boutique_id_id_audit_uq on public.charges(boutique_id,id);

create table if not exists public.export_import_log (
  id bigint generated always as identity primary key,
  boutique_id text not null references public.boutiques(id) on delete cascade,
  user_id uuid references public.platform_users(id) on delete set null,
  operation text not null check (operation in ('export','import')),
  status text not null default 'success' check (status in ('success','partial','failed')),
  file_name text,
  schema_version integer not null,
  manifest jsonb not null,
  duration_ms integer,
  error_detail text,
  created_at timestamptz not null default now()
);
