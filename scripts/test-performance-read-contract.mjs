import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260904174500_optimize_read_permission_scopes.sql','utf8');
const app = fs.readFileSync('src/app/App.tsx','utf8');

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
console.log('performance_read_contract_ok');
