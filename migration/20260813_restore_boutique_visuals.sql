-- Restore visual attributes that are part of the final legacy export.
-- Run only after private.legacy_kv_export has been populated.
begin;

alter table public.boutiques add column if not exists color text;
alter table public.boutiques add column if not exists initials text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists supplier_name text;

with legacy_boutiques as (
  select jsonb_array_elements(value) as boutique
  from private.legacy_kv_export
  where key = 'boutiques'
)
update public.boutiques target
set
  color = coalesce(nullif(legacy_boutiques.boutique ->> 'color', ''), target.color, '#C9A227'),
  initials = coalesce(nullif(legacy_boutiques.boutique ->> 'initials', ''), target.initials)
from legacy_boutiques
where target.id = legacy_boutiques.boutique ->> 'id';

with legacy_boutiques as (
  select jsonb_array_elements(value) as boutique
  from private.legacy_kv_export
  where key = 'boutiques'
), legacy_products as (
  select boutique ->> 'id' as boutique_id, product
  from legacy_boutiques
  cross join lateral jsonb_array_elements(coalesce(boutique -> 'products', '[]'::jsonb)) as product
)
update public.products target
set
  image_url = coalesce(nullif(legacy_products.product ->> 'img', ''), target.image_url),
  supplier_name = coalesce(nullif(legacy_products.product ->> 'fournisseur', ''), target.supplier_name)
from legacy_products
where target.boutique_id = legacy_products.boutique_id
  and target.id = (legacy_products.product ->> 'id')::bigint;

commit;
