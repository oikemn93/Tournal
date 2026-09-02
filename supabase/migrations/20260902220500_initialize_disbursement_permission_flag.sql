-- Keep the newly introduced cash-out permission explicit on every existing
-- assignment without granting it to anyone. Owners remain authorized by the
-- existing owner rule in private.auth_has_permission().
update public.boutique_assignments
set droits = coalesce(droits, '{}'::jsonb) || jsonb_build_object('decaissement', false)
where not coalesce(droits, '{}'::jsonb) ? 'decaissement';

-- Future rows should still be created by the application/RPCs with an explicit
-- permission map. This assertion prevents this migration from accidentally
-- elevating any existing non-owner assignment.
do $$
begin
  if exists (
    select 1
    from public.boutique_assignments
    where role <> 'owner'
      and coalesce((droits->>'decaissement')::boolean, false)
  ) then
    raise exception 'unexpected existing non-owner disbursement grant';
  end if;
end
$$;
