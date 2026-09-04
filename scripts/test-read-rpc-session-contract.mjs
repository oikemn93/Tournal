import fs from 'node:fs';
const readSql=fs.readFileSync('supabase/migrations/20260904184500_make_read_rpcs_session_independent.sql','utf8');
const inventorySql=fs.readFileSync('supabase/migrations/20260904184600_make_inventory_reads_session_independent.sql','utf8');
const sql=`${readSql}\n${inventorySql}`;
for (const fn of [
  'public.get_dashboard_summary',
  'public.get_boutique_partners',
  'public.search_boutique_directory',
  'public.get_fifo_invoice_margin',
  'public.get_fifo_realized_margin',
  'public.get_inventory_session',
  'public.get_inventory_session_internal_unmasked',
  'public.list_inventory_sessions',
  'public.list_inventory_sessions_internal_unmasked',
]) {
  if (!sql.includes(`function ${fn}`)) throw new Error(`missing canonical read RPC definition: ${fn}`);
}
if (sql.includes('private.auth_has_permission')) throw new Error('read RPC migrations must not use app-session-bound auth_has_permission');
if (!sql.includes('private.auth_has_read_permission')) throw new Error('read RPC migrations must use auth_has_read_permission');
if (sql.includes('start_inventory_session')) throw new Error('write RPC start_inventory_session must remain app-session-bound');
for (const token of [
  'revoke all on function public.get_inventory_session_internal_unmasked(uuid) from public, anon, authenticated',
  'revoke all on function public.list_inventory_sessions_internal_unmasked(text,integer) from public, anon, authenticated',
]) if (!inventorySql.includes(token)) throw new Error(`unmasked inventory helper exposure guard missing: ${token}`);
console.log('read_rpc_session_contract_ok');
