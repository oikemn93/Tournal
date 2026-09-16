import vm from "node:vm";
import ts from "typescript";
import fs from "node:fs";

const api = fs.readFileSync("src/lib/dashboardApi.ts", "utf8");
const dashboard = fs.readFileSync("src/app/screens/DashboardView.tsx", "utf8");
const reportEntry = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const report = reportEntry.includes("RapportViewV2") ? fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8") : reportEntry;
const migration = fs.readFileSync(".github/audit/replay-migrations/20260912165219_canonical_financial_metrics.sql", "utf8");
const migrationCompact = migration.replace(/\s+/g, "").toLowerCase();

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(api.includes("loadFinancialMetrics"), "Canonical financial loader missing");
assert(api.includes("get_financial_metrics"), "Canonical financial RPC missing");
assert(api.includes("cash_expenses") && api.includes("operating_cash_expenses"), "Canonical financial API must retain charge metrics for financial reporting");
assert(dashboard.includes("loadFinancialMetrics"), "Dashboard must use canonical financial metrics");
assert(report.includes("loadFinancialMetrics"), "Rapport must use canonical financial metrics");
assert(report.includes("Impayé sur la période"), "Rapport period debt must be labelled explicitly");

assert(!report.includes("const ca           = filtPayments.reduce"), "Rapport must not recompute canonical collected cash locally");
assert(!report.includes("const caTotal      = filtInv.reduce"), "Rapport must not recompute canonical invoiced revenue locally");
assert(!report.includes("new Set(salePayments.map"), "Rapport must not derive sales count from payment events");
assert(!report.includes("invoiceRemainingAmount"), "Rapport must not recompute period outstanding locally");
assert(!report.includes("getFifoRealizedMargin"), "Rapport must not call a separate FIFO RPC");
assert(migrationCompact.includes("'cash_expenses',v_cash_expenses") && migrationCompact.includes("'operating_cash_expenses',v_operating_cash_expenses"), "Canonical server metrics must retain charge fields");

assert(dashboard.includes('const days = period === "30d" ? 30 : 7'), "Dashboard rolling windows must use true 7/30-day bounds");
const boundsSource = dashboard.slice(dashboard.indexOf("function periodBounds"), dashboard.indexOf("export function DashboardView"));
const boundsCode = ts.transpileModule(boundsSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const instant of ["2026-09-16T14:30:00Z", "2026-10-01T00:00:00Z"]) {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [instant])); } }
  const getBounds = vm.runInNewContext(boundsCode + ";periodBounds", { Date: FixedDate });
  for (const [period, days] of [["7d", 7], ["30d", 30]]) {
    const expected = new Date(instant); expected.setDate(expected.getDate() - days);
    assert(getBounds(period).from === expected.toISOString(), "Rolling windows must preserve time of day");
  }
  const midnight = new Date(instant); midnight.setHours(0, 0, 0, 0);
  assert(getBounds("day").from === midnight.toISOString(), "Today must start at local midnight");
  assert(new Date(getBounds("day").to).getTime() === new Date(instant).getTime() + 1000, "Today must end at the current instant");
}
assert(/period\s*===\s*"semaine"/.test(report) && /from\.setDate\(from\.getDate\(\)\s*-\s*7\)/.test(report), "Rapport Semaine must remain a rolling 7-day bound matching Dashboard");

assert(migrationCompact.includes("c.sourcenotin('supplier_receipt','transfer')"), "Canonical direct-charge logic must exclude supplier receipts and transfer shells");
assert(migrationCompact.includes("public.transfer_charge_payments"), "Canonical charge logic must consume transfer payment events");
assert(migrationCompact.includes("tcp.paid_at>=p_from") && migrationCompact.includes("tcp.paid_at<p_to"), "Transfer cash expenses must use real paid_at");
assert(migrationCompact.includes("ip.paid_at>=p_from") && migrationCompact.includes("ip.paid_at<p_to"), "CA encaissé must be bounded by real paid_at");
assert(migrationCompact.includes("i.invoice_date>=p_from") && migrationCompact.includes("i.invoice_date<p_to"), "CA facturé and sales count must use invoice_date");

console.log("financial-metrics-reconciliation: ok");
