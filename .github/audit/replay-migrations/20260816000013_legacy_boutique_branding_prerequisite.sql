-- Audit-only structural prerequisite.
-- The remote 20260813062809 legacy restoration function already inserts into
-- public.boutiques(color, initials), but no migration in the retained remote
-- journal records their creation. Production currently has both as nullable
-- text columns with no default, immediately after updated_at. Restore only that
-- pre-existing structure for clean replay. This file must not be merged to main.

alter table public.boutiques
  add column if not exists color text,
  add column if not exists initials text;
