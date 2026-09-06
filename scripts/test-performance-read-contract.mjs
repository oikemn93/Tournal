import fs from 'node:fs';

// Canonical replay sources mirror the production-applied migrations without
// reopening the repository's frozen deployable Supabase migration tree.
const scopeSql = fs.readFileSync('supabase/migrations/20260904174500_optimize_read_permission_scopes.sql','utf8');
const boundedSql = fs.readFileSync('.github/audit/replay-migrations/20260906121208_bounded_rls_read_paths.sql','utf8');
const payloadSql = fs.readFileSync('.github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql','utf8');
const app = fs.readFileSync('src/app/App.tsx','utf8');
const api = fs.readFileSync('src/lib/api.ts','utf8');

const requiredScopeSql = [
  'private.auth_read_boutique_ids',
  'private.auth_owned_boutique_ids',
  'alter policy "invoices: select permitted"',
  'alter policy "invoice_payments: select permitted"',
  'alter policy "stock_entries: select permitted"',
  'create or replace view public.invoices_app',
  'create or replace view public.stock_entries_app',
  'create or replace view public.products_app',
  "in (select s.boutique_id from private.auth_read_boutique_ids",
];
for (const token of requiredScopeSql) {
  if (!scopeSql.includes(token)) throw new Error(`missing performance SQL contract: ${token}`);
}
if (/create or replace view public\.(?:invoices_app|stock_entries_app|products_app)[\s\S]*private\.auth_has_(?:any_)?read_permission/.test(scopeSql)) {
  throw new Error('optimized app views must not reintroduce per-row auth_has_*_read_permission calls');
}

const requiredBoundedSql = [
  'private.auth_can_read_boutique',
  'private.read_bounded_invoices',
  'private.read_bounded_stock_entries',
  'private.read_bounded_invoice_payments',
  'with filtered as materialized',
  'i.invoice_date >= p_from',
  's.entry_date >= p_from',
  'p.paid_at >= p_from',
  "case when v_can_view_margin then l.prix_achat else null::numeric end",
  "case when v_can_view_margin then s.prix_unit else null::numeric end",
  "where status = 'en_attente'",
];
for (const token of requiredBoundedSql) {
  if (!boundedSql.includes(token)) throw new Error(`missing bounded read contract: ${token}`);
}
if ((payloadSql.match(/security invoker/gi) ?? []).length !== 3) {
  throw new Error('all three public bounded read RPCs must remain SECURITY INVOKER');
}
if ((payloadSql.match(/returns jsonb/gi) ?? []).length !== 3 || (payloadSql.match(/jsonb_agg/gi) ?? []).length !== 3) {
  throw new Error('public bounded reads must return lossless JSON array payloads');
}
if (!boundedSql.includes('revoke all on function private.auth_can_read_boutique(text, text[]) from public, anon, authenticated')) {
  throw new Error('targeted authorization helper must not be directly executable by API roles');
}

for (const rpc of ['read_bounded_stock_entries','read_bounded_invoices','read_bounded_invoice_payments']) {
  if (!api.includes(`dataRpc<any[]>("${rpc}"`)) throw new Error(`bootstrap does not use ${rpc}`);
}
if (api.includes('stock_entries_app?select=*') && api.includes('stockWindow')) throw new Error('bootstrap regressed to barrier stock view');
if (api.includes('invoices_app?select=*') && api.includes('invoiceWindow')) throw new Error('bootstrap regressed to barrier invoice view');
if (api.includes('INVOICE_PAYMENT_SELECT')) throw new Error('bootstrap regressed to direct payment RLS path');
if (!api.includes('p_include_pending: !options.historyOnly')) throw new Error('initial invoice bootstrap must retain older pending invoices');
if (!api.includes('p_to: options.historyOnly ? null : historyTo ?? null')) throw new Error('deferred old invoices must retain newer payments needed for current balance');

const lazyScreens = ['StockView','DashboardView','FacturesView','POSView','ClientsView','FournisseursView','ChargesView','RapportView','TransfersView','InventoryView'];
for (const screen of lazyScreens) {
  if (!app.includes(`import("./screens/${screen}")`)) throw new Error(`screen is not lazy-loaded: ${screen}`);
  if (app.includes(`from "./screens/${screen}"`)) throw new Error(`static screen import regressed: ${screen}`);
}
if (!app.includes('React.lazy(loader)') || !app.includes('<React.Suspense')) {
  throw new Error('lazy screen boundary is missing');
}

if (!api.includes('const BOOTSTRAP_HISTORY_DAYS = 7;')) throw new Error('initial bootstrap window must stay bounded to 7 days');
if (!api.includes('export const FULL_BOOTSTRAP_HISTORY_DAYS = 30;')) throw new Error('30-day history retention contract is missing');
if (!app.includes('function mergeOlderBootstrapHistory')) throw new Error('deferred history merge helper missing');
if (!app.includes('for (const row of olderRows)') || !app.includes('for (const row of currentRows)')) throw new Error('deferred merge must prefer current/realtime rows on duplicate IDs');
if (!app.includes('historyOnly: true')) throw new Error('older history must load outside the initial bootstrap');
if (!app.includes('FULL_BOOTSTRAP_HISTORY_DAYS') || !app.includes('BOUNDED_BOOTSTRAP_HISTORY_DAYS')) throw new Error('deferred history window constants missing');

console.log('performance_read_contract_ok');
