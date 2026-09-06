\set ON_ERROR_STOP on

-- Audit-only structural fingerprint. No table data is read.
-- The expected values were computed read-only from production on 2026-09-06
-- with the exact same canonicalization below.
-- Column physical ordinal position (attnum) is intentionally excluded: the
-- synthetic replay baseline cannot preserve historical storage order, while
-- name/type/nullability/default/identity/generated semantics remain strict.
-- Function ACL storage representation is also normalized to effective grants:
-- NULL proacl and an explicit ACL containing the same effective privileges are
-- semantically equivalent in PostgreSQL and must not produce a false diff.
create temp table audit_expected_fingerprint(
  category text primary key,
  object_count bigint not null,
  md5 text not null
) on commit preserve rows;

insert into audit_expected_fingerprint(category, object_count, md5) values
  ('columns',     639, '1f4fc9b2f7b25f05bddb6a03fff155e2'),
  ('constraints', 255, 'e90f367fcc6dd044a41d7f858b9f9ec9'),
  ('functions',    198, '437292377c94009217fbf8f0ae88cfac'),
  ('indexes',      192, 'fced787fcb2de669f9753271be7d5134'),
  ('policies',      88, '2e88704fe8bd522a1b4edaf602697a64'),
  ('relations',     77, 'fe47306893a1d143b92e1e3b9f6aa9a2'),
  ('triggers',      86, '70b805e2d01f8efc8598b96070dc30da'),
  ('types',          0, 'd41d8cd98f00b204e9800998ecf8427e');

create temp table audit_actual_fingerprint as
with
relations as (
  select concat_ws('|',n.nspname,c.relname,c.relkind::text,c.relrowsecurity::text,c.relforcerowsecurity::text,coalesce(array_to_string(c.reloptions,','),'')) as x
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
),
columns as (
  select concat_ws('|',n.nspname||'.'||c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull::text,coalesce(pg_get_expr(ad.adbin,ad.adrelid,true),''),a.attidentity::text,a.attgenerated::text) as x
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
),
constraints as (
  select concat_ws('|',n.nspname||'.'||c.relname,con.conname,con.contype::text,con.condeferrable::text,con.condeferred::text,con.convalidated::text,pg_get_constraintdef(con.oid,true)) as x
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private')
),
indexes as (
  select concat_ws('|',n.nspname||'.'||t.relname,i.relname,ix.indisunique::text,ix.indisprimary::text,ix.indisvalid::text,pg_get_indexdef(i.oid)) as x
  from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname in ('public','private')
),
policies as (
  select concat_ws('|',schemaname||'.'||tablename,policyname,permissive,array_to_string(roles,','),cmd,coalesce(qual,''),coalesce(with_check,'')) as x
  from pg_policies where schemaname in ('public','private')
),
functions as (
  select concat_ws('|',
           n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
           p.prokind::text,
           p.prosecdef::text,
           p.provolatile::text,
           p.proparallel::text,
           p.proleakproof::text,
           coalesce(array_to_string(p.proconfig,','),''),
           coalesce((
             select string_agg(
                      concat_ws(':',
                        case when a.grantee=0 then 'PUBLIC' else gr.rolname end,
                        a.privilege_type,
                        a.is_grantable::text,
                        grantor.rolname),
                      ',' order by
                        case when a.grantee=0 then 'PUBLIC' else gr.rolname end,
                        a.privilege_type,
                        a.is_grantable::text,
                        grantor.rolname)
             from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
             left join pg_roles gr on gr.oid=a.grantee
             left join pg_roles grantor on grantor.oid=a.grantor
           ),''),
           pg_get_functiondef(p.oid)) as x
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
),
triggers as (
  select concat_ws('|',n.nspname||'.'||c.relname,t.tgname,pg_get_triggerdef(t.oid,true)) as x
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth') and not t.tgisinternal
),
types as (
  select concat_ws('|',n.nspname||'.'||t.typname,t.typtype::text,coalesce(string_agg(e.enumlabel,',' order by e.enumsortorder),'')) as x
  from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_enum e on e.enumtypid=t.oid
  where n.nspname in ('public','private') and t.typtype in ('e','d')
  group by n.nspname,t.typname,t.typtype
),
objects as (
  select 'relations' category,x from relations union all
  select 'columns',x from columns union all
  select 'constraints',x from constraints union all
  select 'indexes',x from indexes union all
  select 'policies',x from policies union all
  select 'functions',x from functions union all
  select 'triggers',x from triggers union all
  select 'types',x from types
),
categories(category) as (values ('relations'),('columns'),('constraints'),('indexes'),('policies'),('functions'),('triggers'),('types'))
select c.category,
       count(o.x)::bigint as object_count,
       md5(coalesce(string_agg(o.x,E'\n' order by o.x),'')) as md5
from categories c
left join objects o using(category)
group by c.category;

select a.category,
       a.object_count as actual_count,
       e.object_count as expected_count,
       a.md5 as actual_md5,
       e.md5 as expected_md5,
       (a.object_count=e.object_count and a.md5=e.md5) as matches
from audit_actual_fingerprint a
join audit_expected_fingerprint e using(category)
order by a.category;

do $audit$
begin
  if exists (
    select 1
    from audit_actual_fingerprint a
    join audit_expected_fingerprint e using(category)
    where a.object_count <> e.object_count or a.md5 <> e.md5
  ) then
    raise exception 'schema fingerprint differs from production';
  end if;
end
$audit$;

\echo schema_fingerprint_matches_production
-- The business smoke is deliberately included only after the fingerprint gate.
\ir ../../scripts/test-business-smoke.sql
