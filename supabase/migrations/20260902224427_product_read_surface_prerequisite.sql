-- Audit-only compatibility prerequisite for the secure read-surface migration.
-- products.image_url predates the retained production migration journal: the
-- first retained migration that references it is 20260902224428, while no
-- retained DDL creates it. Production defines it as nullable text with no
-- default. Restore only that missing structural column for clean replay.
-- This file must not be merged to main.

alter table public.products
  add column if not exists image_url text;
