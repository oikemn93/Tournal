import fs from "node:fs";

const dashboard = fs.readFileSync("src/app/screens/DashboardView.tsx", "utf8");
const reportEntry = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const report = reportEntry.includes("RapportViewV2")
  ? fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8")
  : reportEntry;
const api = fs.readFileSync("src/lib/dashboardApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/replay-migrations/20260912165219_canonical_financial_metrics.sql", "utf8");
const migrationLower = migration.toLowerCase();
const migrationCompact = migrationLower.replace(/\s+/g, "");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(dashboard.includes("loadFinancialMetrics"), "Dashboard must consume loadFinancialMetrics");
assert(report.includes("loadFinancialMetrics"), "Active Rapport view must consume loadFinancialMetrics");
if (report !== reportEntry) {
  assert(reportEntry.includes("RapportViewV2"), "Rapport entry must delegate to the active V2 view");
}

assert(api.includes("/rest/v1/rpc/get_financial_metrics"), "Financial client must call get_financial_metrics");
assert(migrationLower.includes("create or replace function public.get_financial_metrics"), "Canonical financial RPC migration missing");
assert(migrationLower.includes("private.fifo_realized_margin_core"), "FIFO margin must have one shared server implementation");
assert(migrationCompact.includes("returnprivate.fifo_realized_margin_core"), "Legacy FIFO RPC must delegate to canonical FIFO core");

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
assert(report.includes("Impayé sur la période"), "Rapport period debt must be labelled explicitly");

assert(!report.includes("const ca           = filtPayments.reduce"), "Rapport must not recompute canonical collected cash locally");
assert(!report.includes("const caTotal      = filtInv.reduce"), "Rapport must not recompute canonical invoiced revenue locally");
assert(!report.includes("new Set(salePayments.map"), "Rapport must not derive sales count from payment events");
assert(!report.includes("invoiceRemainingAmount"), "Rapport must not recompute period outstanding locally");
assert(!report.includes("getFifoRealizedMargin"), "Rapport must not call a separate FIFO RPC");
assert(api.includes("cash_expenses") && api.includes("operating_cash_expenses"), "Canonical financial API must retain charge metrics for financial reporting");
assert(migrationCompact.includes("'cash_expenses',v_cash_expenses") && migrationCompact.includes("'operating_cash_expenses',v_operating_cash_expenses"), "Canonical server metrics must retain charge fields");

assert(dashboard.includes('const days = period === "30d" ? 30 : 7'), "Dashboard rolling windows must use true 7/30-day bounds");
assert(!dashboard.includes("from.setHours(0, 0, 0, 0)"), "Dashboard 7-day period must not truncate to calendar-day midnight");
assert(report.includes('period === "semaine"') && report.includes("from.setDate(from.getDate() - 7)"), "Rapport Semaine must remain a rolling 7-day bound matching Dashboard");

assert(migrationCompact.includes("c.sourcenotin('supplier_receipt','transfer')"), "Canonical direct-charge logic must exclude supplier receipts and transfer shells");
assert(migrationCompact.includes("public.transfer_charge_payments"), "Canonical charge logic must consume transfer payment events");
assert(migrationCompact.includes("tcp.paid_at>=p_from") && migrationCompact.includes("tcp.paid_at<p_to"), "Transfer cash expenses must use real paid_at");
assert(migrationCompact.includes("ip.paid_at>=p_from") && migrationCompact.includes("ip.paid_at<p_to"), "CA encaissé must be bounded by real paid_at");
assert(migrationCompact.includes("i.invoice_date>=p_from") && migrationCompact.includes("i.invoice_date<p_to"), "CA facturé and sales count must use invoice_date");

console.log("financial-metrics-reconciliation: ok");
