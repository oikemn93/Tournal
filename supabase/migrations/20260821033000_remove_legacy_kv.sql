begin;

-- These stores are no longer read or written by the application. The two
-- public stores are empty; the private export was retained only for the
-- completed one-time import and has no runtime consumer.
drop function if exists public.import_legacy_kv_export(jsonb);
drop table if exists public.kv_store_9ae2c303;
drop table if exists public.kv_store_9f1abaad;
drop table if exists private.legacy_kv_export;

commit;
