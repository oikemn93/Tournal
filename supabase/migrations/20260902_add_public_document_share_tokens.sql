create table if not exists public.document_shares (
  token_hash text primary key,
  boutique_id text not null,
  document_type text not null,
  document_ref text not null,
  storage_path text not null,
  download_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists document_shares_expiry_idx on public.document_shares (expires_at);
create index if not exists document_shares_document_idx on public.document_shares (boutique_id, document_type, document_ref);

alter table public.document_shares enable row level security;
revoke all on table public.document_shares from anon, authenticated;
comment on table public.document_shares is 'Opaque short-link metadata for temporary customer documents. Service-role only; public access is mediated by the document-share Edge Function.';