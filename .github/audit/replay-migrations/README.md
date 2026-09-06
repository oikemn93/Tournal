# Audit-only replay migrations

These SQL files are reconstruction inputs for the canonical database replay workflow only.

They are deliberately stored outside `supabase/migrations/` and MUST NOT be deployed or marked as applied in the production Supabase migration ledger. The CI workflow copies them into its ephemeral runner workspace solely to reconstruct and verify the production schema fingerprint and business smoke matrix.

Production migration tracking remains authoritative and unchanged. Future deployable migrations belong in `supabase/migrations/` and are handled separately from this replay history.
