import fs from 'node:fs';

const app = fs.readFileSync('src/app/App.tsx', 'utf8');
const api = fs.readFileSync('src/lib/api.ts', 'utf8');

for (const rpc of ['read_bounded_stock_entries','read_bounded_invoice_summaries','read_bounded_invoice_payments']) {
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
const hasLazyBoundary = app.includes('React.lazy(loader)') || app.includes('React.lazy(() => loader().catch');
if (!hasLazyBoundary || !app.includes('<React.Suspense')) {
  throw new Error('lazy screen boundary is missing');
}

if (!api.includes('const BOOTSTRAP_HISTORY_DAYS = 7;')) throw new Error('initial bootstrap window must stay bounded to 7 days');
if (!api.includes('export const FULL_BOOTSTRAP_HISTORY_DAYS = 30;')) throw new Error('30-day history retention contract is missing');
if (!app.includes('function mergeOlderBootstrapHistory')) throw new Error('deferred history merge helper missing');
if (!app.includes('for (const row of olderRows)') || !app.includes('for (const row of currentRows)')) throw new Error('deferred merge must prefer current/realtime rows on duplicate IDs');
if (!app.includes('historyOnly: true')) throw new Error('older history must load outside the initial bootstrap');
if (!app.includes('FULL_BOOTSTRAP_HISTORY_DAYS') || !app.includes('BOUNDED_BOOTSTRAP_HISTORY_DAYS')) throw new Error('deferred history window constants missing');

console.log('performance_read_contract_ok');
