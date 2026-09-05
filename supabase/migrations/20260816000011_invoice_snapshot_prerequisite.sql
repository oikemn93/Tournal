-- Audit-only reconstruction of invoice identity snapshot columns that predate
-- the retained Git migration history. No historical invoice data is restored.

alter table public.boutiques
  add column if not exists ville text,
  add column if not exists tel text;

alter table public.clients
  add column if not exists type text not null default 'B2C';

alter table public.invoices
  add column if not exists client_email_snapshot text,
  add column if not exists client_adresse_snapshot text,
  add column if not exists client_ville_snapshot text,
  add column if not exists client_type_snapshot text,
  add column if not exists boutique_nom_snapshot text,
  add column if not exists boutique_ville_snapshot text,
  add column if not exists boutique_adresse_snapshot text,
  add column if not exists boutique_tel_snapshot text,
  add column if not exists boutique_email_snapshot text,
  add column if not exists boutique_logo_snapshot text,
  add column if not exists operator_nom_snapshot text;
