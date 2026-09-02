import fs from "node:fs";

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return text.split(from).join(to);
}

const apiPath = "src/lib/api.ts";
let api = fs.readFileSync(apiPath, "utf8");
api = replaceRequired(api, "products?select=*", "products_app?select=*", "products app reads");
api = replaceRequired(api, "stock_entries?select=*", "stock_entries_app?select=*", "stock entries app reads");
api = replaceRequired(api, "invoices?select=*,invoice_lines(*)", "invoices_app?select=*", "invoice app reads");
fs.writeFileSync(apiPath, api);

const appPath = "src/app/App.tsx";
let app = fs.readFileSync(appPath, "utf8");
const stockImport = 'import { StockView as RelationalStockView } from "./screens/StockView";';
if (!app.includes('DashboardView as RelationalDashboardView')) {
  app = replaceRequired(app, stockImport, `${stockImport}\nimport { DashboardView as RelationalDashboardView } from "./screens/DashboardView";`, "dashboard import");
}
const oldRender = '{safeTab==="dashboard"    && canAccess("dashboard") && <DashboardView boutique={boutique} onNavigate={(t,f)=>{setNavFilter(f??{});setTab(t);}}/>}';
const newRender = '{safeTab==="dashboard"    && canAccess("dashboard") && <RelationalDashboardView boutiqueId={boutique.id} canSeeMargin={canSeeMargin} onNavigate={(t,f)=>{setNavFilter(f??{});setTab(t);}}/>}';
app = replaceRequired(app, oldRender, newRender, "dashboard render");
fs.writeFileSync(appPath, app);

const ciPath = ".github/workflows/ci.yml";
let ci = fs.readFileSync(ciPath, "utf8");
const anchor = '      - name: Permission read boundaries\n        run: node scripts/test-permission-read-boundaries.mjs\n';
if (!ci.includes("Margin and dashboard isolation")) {
  ci = replaceRequired(ci, anchor, `${anchor}\n      - name: Margin and dashboard isolation\n        run: node scripts/test-margin-dashboard-isolation.mjs\n`, "CI permission test anchor");
}
fs.writeFileSync(ciPath, ci);
