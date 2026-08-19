-- Introduce the explicit POS payment permission for legacy assignments.
-- Preserve any assignment where the permission was already explicitly set.
update public.boutique_assignments
set droits = jsonb_set(
  coalesce(droits, '{}'::jsonb),
  '{encaissement_vente}',
  to_jsonb(case when role in ('owner','manager') then true else false end),
  true
)
where not (coalesce(droits, '{}'::jsonb) ? 'encaissement_vente');
