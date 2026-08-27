-- Keep the current single-row logo fallback bounded while the UI migrates to
-- object storage URLs. Current production logo is ~346 KB and remains valid.
alter table public.boutiques
  drop constraint if exists boutiques_logo_url_size_check;

alter table public.boutiques
  add constraint boutiques_logo_url_size_check
  check (logo_url is null or octet_length(logo_url) <= 600000) not valid;

alter table public.boutiques validate constraint boutiques_logo_url_size_check;

comment on column public.boutiques.logo_url is
  'Boutique logo reference. Prefer a Storage URL; legacy bounded data:image URLs remain supported (max 600 KB).';
