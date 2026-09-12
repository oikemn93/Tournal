import fs from "node:fs";

const screen = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const client = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/candidate-migrations/20260912194500_report_phase1_sales_products.sql", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(screen.includes("loadFinancialMetrics"), "Phase 1 KPIs must remain on canonical financial metrics");
assert(screen.includes("loadSalesProductReport"), "Phase 1 product ranking must use bounded server report RPC");
assert(screen.includes("metrics?.sales_count"), "Transaction count must use canonical sales_count");
assert(screen.includes("metrics?.average_basket"), "Average basket must use canonical average_basket");
assert(screen.includes("Modes de paiement"), "Existing payment-mode section must be preserved");
assert(screen.includes("Toutes catégories"), "Product ranking must be filterable by category");
assert(screen.includes("Meilleurs vendeurs") && screen.includes("Plus faibles vendeurs"), "Best and worst product rankings are required");
assert(!screen.includes("const caTotal") && !screen.includes("filtInv.reduce"), "Report screen must not recompute canonical CA locally");

assert(client.includes("get_sales_product_report"), "Report client must call get_sales_product_report");
assert(migration.includes("private.fifo_realized_margin_core"), "Product margin must reuse canonical FIFO core");
assert(migration.includes("i.invoice_date>=p_from") && migration.includes("i.invoice_date<p_to"), "Product report must be bounded by invoice date");
assert(migration.includes("lower(trim(coalesce(i.type,'')))='retour' then -1 else 1"), "Product revenue and quantity must net returns");
assert(migration.includes("private.auth_has_read_permission(p_boutique_id,'marges')"), "Product margin must respect margin permission");
assert(migration.includes("private.auth_has_read_permission(p_boutique_id,'compta')"), "Product report must enforce financial read permission");
assert(migration.includes("public.categories"), "Product report must expose category metadata for filtering");
assert(migration.includes("revoke all on function public.get_sales_product_report"), "Report RPC must revoke public/anon execution");

console.log("report-phase1-contract: ok");
