// One-shot branch patcher. Removed before merge.
import fs from "node:fs";

function replaceIfPresent(text, from, to) {
  return text.includes(from) ? text.split(from).join(to) : text;
}

const apiPath = "src/lib/api.ts";
let api = fs.readFileSync(apiPath, "utf8");
api = replaceIfPresent(api, "products?select=*", "products_app?select=*");
api = replaceIfPresent(api, "stock_entries?select=*", "stock_entries_app?select=*");
api = replaceIfPresent(api, "invoices?select=*,invoice_lines(*)", "invoices_app?select=*");
fs.writeFileSync(apiPath, api);

const appPath = "src/app/App.tsx";
let app = fs.readFileSync(appPath, "utf8");
const stockImport = 'import { StockView as RelationalStockView } from "./screens/StockView";';
if (!app.includes('DashboardView as RelationalDashboardView')) {
  if (!app.includes(stockImport)) throw new Error("Missing dashboard import anchor");
  app = app.replace(stockImport, `${stockImport}\nimport { DashboardView as RelationalDashboardView } from "./screens/DashboardView";`);
}
const oldRender = '{safeTab==="dashboard"    && canAccess("dashboard") && <DashboardView boutique={boutique} onNavigate={(t,f)=>{setNavFilter(f??{});setTab(t);}}/>}';
const newRender = '{safeTab==="dashboard"    && canAccess("dashboard") && <RelationalDashboardView boutiqueId={boutique.id} canSeeMargin={canSeeMargin} onNavigate={(t,f)=>{setNavFilter(f??{});setTab(t);}}/>}';
app = replaceIfPresent(app, oldRender, newRender);
fs.writeFileSync(appPath, app);

const migrationPath = "supabase/migrations/20260903_isolate_margin_data_and_dashboard.sql";
let migration = fs.readFileSync(migrationPath, "utf8");
migration = replaceIfPresent(migration, "d.day::date", "d.bucket_day::date");
migration = replaceIfPresent(migration, "order by d.day", "order by d.bucket_day");
migration = replaceIfPresent(migration, "date_trunc('day', i.invoice_date) day,", "date_trunc('day', i.invoice_date) as bucket_day,");
fs.writeFileSync(migrationPath, migration);
