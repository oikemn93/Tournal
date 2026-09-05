\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

-- Audit-only function diagnostics. No application data or function bodies are
-- emitted in clear; only identities, scalar attributes and component hashes.
select
  n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as identity,
  md5(pg_get_functiondef(p.oid)) as def_hash,
  p.prokind::text,
  p.prosecdef::text,
  p.provolatile::text,
  p.proparallel::text,
  p.proleakproof::text,
  md5(coalesce(array_to_string(p.proconfig,','),'')) as config_hash,
  md5(coalesce((
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
  ),'')) as acl_hash
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind in ('f','p')
order by identity;
