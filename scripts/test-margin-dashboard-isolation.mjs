import fs from "node:fs";

const api = fs.readFileSync("src/lib/api.ts", "utf8");
const app = fs.readFileSync("src/app/App.tsx", "utf8");
const dashboard = fs.readFileSync("src/app/screens/DashboardView.tsx", "utf8");
const prepare = fs.readFileSync("supabase/migrations/20260903_prepare_margin_dashboard_secure_reads.sql", "utf8");
const enforce = fs.readFileSync("supabase/migrations/20260903_enforce_margin_dashboard_isolation.sql", "utf8");
const migration = `${prepare}\n${enforce}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!api.includes("products?select=*"), "Raw products select=* must not return to browser reads");
assert(!api.includes("stock_entries?select=*"), "Raw stock_entries select=* must not return to browser reads");
assert(!api.includes("invoices?select=*,invoice_lines(*)"), "Raw invoice-line embedding must use invoices_app");
assert(api.includes("products_app?select=*"), "products_app must back application catalogue reads");
assert(api.includes("stock_entries_app?select=*"), "stock_entries_app must back stock history reads");
assert(api.includes("invoices_app?select=*"), "invoices_app must back invoice reads");

assert(app.includes("DashboardView as RelationalDashboardView"), "App must import aggregate DashboardView");
assert(app.includes("<RelationalDashboardView boutiqueId={boutique.id}"), "App must render aggregate DashboardView");
assert(dashboard.includes("loadDashboardSummary"), "Dashboard must use aggregate RPC client");
assert(!dashboard.includes("boutique.invoices") && !dashboard.includes("boutique.charges") && !dashboard.includes("boutique.clients"), "Dashboard must not compute from raw boutique datasets");

for (const view of ["products_app", "stock_entries_app", "invoices_app"]) {
  assert(prepare.includes(`public.${view}`), `Missing phase-1 ${view} view`);
}
assert(prepare.includes("case when private.auth_has_permission(p.boutique_id, 'marges') then p.prix_achat else null end"), "Product purchase price must be masked by marges");
assert(prepare.includes("'prix_achat', case when private.auth_has_permission(l.boutique_id, 'marges') then l.prix_achat else null end"), "Invoice-line purchase cost must be masked by marges");
assert(prepare.includes("create or replace function public.get_dashboard_summary"), "Dashboard aggregate RPC missing from phase 1");

assert(!prepare.includes("revoke select on public.products from authenticated"), "Phase 1 must remain backwards compatible with the current frontend");
assert(enforce.includes("revoke select on public.products from authenticated"), "Phase 2 must revoke direct product cost reads");
assert(enforce.includes("revoke select on public.invoice_lines from authenticated"), "Phase 2 must revoke direct invoice-line cost reads");
assert(enforce.includes("revoke select on public.stock_entries from authenticated"), "Phase 2 must revoke direct stock cost reads");
assert(!enforce.includes("'dashboard'"), "Dashboard must not remain in raw-table permission unions after phase 2");

console.log("margin-dashboard-isolation: ok");
