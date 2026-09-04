import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260904174500_optimize_read_permission_scopes.sql','utf8');
const app = fs.readFileSync('src/app/App.tsx','utf8');
const api = fs.readFileSync('src/lib/api.ts','utf8');

const requiredSql = [
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
for (const token of requiredSql) {
  if (!sql.includes(token)) throw new Error(`missing performance SQL contract: ${token}`);
}
if (/create or replace view public\.(?:invoices_app|stock_entries_app|products_app)[\s\S]*private\.auth_has_(?:any_)?read_permission/.test(sql)) {
  throw new Error('optimized app views must not reintroduce per-row auth_has_*_read_permission calls');
}

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
if (!api.includes('entry_date=lt.${encodeURIComponent(historyTo)}')) throw new Error('deferred stock history must have an upper bound');
if (!api.includes('dataRequestAll<any>(`stock_entries_app?select=*${scoped()}${stockWindow}`')) throw new Error('history-only snapshot must still fetch bounded stock entries');
if (!app.includes('function mergeOlderBootstrapHistory')) throw new Error('deferred history merge helper missing');
if (!app.includes('for (const row of olderRows)') || !app.includes('for (const row of currentRows)')) throw new Error('deferred merge must prefer current/realtime rows on duplicate IDs');
if (!app.includes('historyOnly: true')) throw new Error('older history must load outside the initial bootstrap');
if (!app.includes('FULL_BOOTSTRAP_HISTORY_DAYS') || !app.includes('BOUNDED_BOOTSTRAP_HISTORY_DAYS')) throw new Error('deferred history window constants missing');

console.log('performance_read_contract_ok');
