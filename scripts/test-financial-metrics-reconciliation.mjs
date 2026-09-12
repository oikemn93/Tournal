import fs from "node:fs";

const dashboard = fs.readFileSync("src/app/screens/DashboardView.tsx", "utf8");
const report = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const api = fs.readFileSync("src/lib/dashboardApi.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260912190000_canonical_financial_metrics.sql", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const source of [dashboard, report]) {
  assert(source.includes("loadFinancialMetrics"), "Dashboard and Rapport must consume loadFinancialMetrics");
}

assert(api.includes("/rest/v1/rpc/get_financial_metrics"), "Financial client must call get_financial_metrics");
assert(migration.includes("create or replace function public.get_financial_metrics"), "Canonical financial RPC migration missing");
assert(migration.includes("private.fifo_realized_margin_core"), "FIFO margin must have one shared server implementation");
assert(migration.includes("return private.fifo_realized_margin_core"), "Legacy FIFO RPC must delegate to canonical FIFO core");

const canonicalMappings = [
  ["CA facturé", "invoiced_revenue"],
  ["CA encaissé", "collected_cash"],
  ["Ventes", "sales_count"],
  ["Impayé sur la période", "period_outstanding"],
  ["Marge", "realized_margin_fifo"],
];
for (const [label, field] of canonicalMappings) {
  assert(dashboard.includes(field) || label === "Impayé sur la période", `Dashboard missing canonical field ${field}`);
  assert(report.includes(field), `Rapport missing canonical field ${field}`);
}

assert(dashboard.includes("customer_outstanding_global"), "Dashboard must expose global Encours clients");
assert(dashboard.includes('label: "Encours clients"'), "Dashboard global debt must be labelled Encours clients");
assert(report.includes('label:"Impayé sur la période"') || report.includes('label: "Impayé sur la période"'), "Rapport period debt must be labelled explicitly");

assert(!report.includes("const ca           = filtPayments.reduce"), "Rapport must not recompute canonical collected cash locally");
assert(!report.includes("const caTotal      = filtInv.reduce"), "Rapport must not recompute canonical invoiced revenue locally");
assert(!report.includes("new Set(salePayments.map"), "Rapport must not derive sales count from payment events");
assert(!report.includes("invoiceRemainingAmount"), "Rapport must not recompute period outstanding locally");
assert(!report.includes("getFifoRealizedMargin"), "Rapport must not call a separate FIFO RPC");
assert(report.includes("financialMetrics?.cash_expenses"), "Rapport total charges must come from canonical server metrics");
assert(report.includes("financialMetrics?.operating_cash_expenses"), "Report result-after-charges must use canonical operating expenses");

assert(migration.includes("c.source = 'supplier_receipt' then 0"), "Canonical charge logic must exclude supplier receipts");
assert(migration.includes("c.source = 'transfer' then coalesce(c.paid_amount,0)"), "Canonical charge logic must use transfer paid amount");
assert(migration.includes("ip.paid_at >= p_from") && migration.includes("ip.paid_at < p_to"), "CA encaissé must be bounded by real paid_at");
assert(migration.includes("i.invoice_date >= p_from") && migration.includes("i.invoice_date < p_to"), "CA facturé and sales count must use invoice_date");

console.log("financial-metrics-reconciliation: ok");
