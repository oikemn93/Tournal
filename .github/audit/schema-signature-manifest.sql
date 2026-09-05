\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

-- Audit-only schema signature manifest. Emits object identity plus an MD5 of
-- the same semantic canonicalization used by schema-fingerprint.sql. It never
-- reads application table data and never prints function bodies or defaults in
-- clear; only object identities and hashes are exported.
with
relations as (
  select 'relations'::text as category,
         n.nspname||'.'||c.relname as identity,
         concat_ws('|',n.nspname,c.relname,c.relkind::text,c.relrowsecurity::text,c.relforcerowsecurity::text,coalesce(array_to_string(c.reloptions,','),'')) as x
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
),
columns as (
  select 'columns'::text,
         n.nspname||'.'||c.relname||'.'||a.attname,
         concat_ws('|',n.nspname||'.'||c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull::text,coalesce(pg_get_expr(ad.adbin,ad.adrelid,true),''),a.attidentity::text,a.attgenerated::text)
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
),
constraints as (
  select 'constraints'::text,
         n.nspname||'.'||c.relname||'.'||con.conname,
         concat_ws('|',n.nspname||'.'||c.relname,con.conname,con.contype::text,con.condeferrable::text,con.condeferred::text,con.convalidated::text,pg_get_constraintdef(con.oid,true))
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private')
),
indexes as (
  select 'indexes'::text,
         n.nspname||'.'||t.relname||'.'||i.relname,
         concat_ws('|',n.nspname||'.'||t.relname,i.relname,ix.indisunique::text,ix.indisprimary::text,ix.indisvalid::text,pg_get_indexdef(i.oid))
  from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname in ('public','private')
),
policies as (
  select 'policies'::text,
         schemaname||'.'||tablename||'.'||policyname,
         concat_ws('|',schemaname||'.'||tablename,policyname,permissive,array_to_string(roles,','),cmd,coalesce(qual,''),coalesce(with_check,''))
  from pg_policies where schemaname in ('public','private')
),
functions as (
  select 'functions'::text,
         n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         concat_ws('|',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',p.prokind::text,p.prosecdef::text,p.provolatile::text,p.proparallel::text,p.proleakproof::text,coalesce(array_to_string(p.proconfig,','),''),coalesce(p.proacl::text,''),pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
),
triggers as (
  select 'triggers'::text,
         n.nspname||'.'||c.relname||'.'||t.tgname,
         concat_ws('|',n.nspname||'.'||c.relname,t.tgname,pg_get_triggerdef(t.oid,true))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth') and not t.tgisinternal
),
types as (
  select 'types'::text,
         n.nspname||'.'||t.typname,
         concat_ws('|',n.nspname||'.'||t.typname,t.typtype::text,coalesce(string_agg(e.enumlabel,',' order by e.enumsortorder),''))
  from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_enum e on e.enumtypid=t.oid
  where n.nspname in ('public','private') and t.typtype in ('e','d')
  group by n.nspname,t.typname,t.typtype
),
objects(category,identity,x) as (
  select * from relations union all
  select * from columns union all
  select * from constraints union all
  select * from indexes union all
  select * from policies union all
  select * from functions union all
  select * from triggers union all
  select * from types
)
select category, identity, md5(x)
from objects
order by category, identity;
