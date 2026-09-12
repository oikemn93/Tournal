import fs from "node:fs";

const screen = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const client = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/replay-migrations/20260912174106_report_phase1_sales_products.sql", "utf8");
const compactSql = migration.replace(/\s+/g, " ");

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
assert(/i\.invoice_date\s*>=\s*p_from/.test(migration) && /i\.invoice_date\s*<\s*p_to/.test(migration), "Product report must be bounded by invoice date");
assert(/lower\(trim\(coalesce\(l\.invoice_type,''\)\)\)\s*=\s*'retour'\s+then\s+-1\s+else\s+1/i.test(compactSql), "Product revenue and quantity must net returns");
assert(/private\.auth_has_read_permission\(p_boutique_id\s*,\s*'marges'\)/.test(migration), "Product margin must respect margin permission");
assert(/private\.auth_has_read_permission\(p_boutique_id\s*,\s*'compta'\)/.test(migration), "Product report must enforce financial read permission");
assert(migration.includes("public.categories"), "Product report must expose category metadata for filtering");
assert(migration.includes("revoke all on function public.get_sales_product_report"), "Report RPC must revoke public/anon execution");

console.log("report-phase1-contract: ok");
