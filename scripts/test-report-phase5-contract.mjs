import fs from "node:fs";

const section = fs.readFileSync("src/app/screens/FinancialDeepReportSection.tsx", "utf8");
const clientSection = fs.readFileSync("src/app/screens/ClientReportSection.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const canonical = fs.readFileSync(".github/audit/replay-migrations/20260912165219_canonical_financial_metrics.sql", "utf8");
const sales = fs.readFileSync(".github/audit/replay-migrations/20260912174106_report_phase1_sales_products.sql", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(clientSection.includes("loadFinancialMetrics") && clientSection.includes("loadSalesProductReport"), "Phase 5 must reuse canonical financial and sales report loaders");
assert(clientSection.includes("<FinancialDeepReportSection"), "Phase 5 section is not rendered in Rapport");
assert(section.includes("metrics?.collected_cash") && section.includes("metrics?.cash_expenses") && section.includes("metrics?.operating_cash_expenses"), "Cash flow must use canonical cash metrics");
assert(section.includes("row.realized_margin_fifo") && section.includes("margin_unmatched_lines"), "Margin breakdown must use canonical FIFO product margin and coverage metadata");
assert(section.includes("Marge par produit et catégorie") && section.includes("Flux de trésorerie"), "Phase 5 UI sections are missing");
assert(api.includes("Omit<ClientReport, \"boutique_id\">") && api.includes("boutique_id: params.boutiqueId"), "Phase 5 context must stay client-side; no new DB contract required");
assert(canonical.includes("'collected_cash',v_collected_cash") && canonical.includes("'cash_expenses',v_cash_expenses") && canonical.includes("'operating_cash_expenses',v_operating_cash_expenses"), "Canonical cash metrics changed or missing");
assert(sales.includes("private.fifo_realized_margin_core") && sales.includes("'realized_margin_fifo'"), "Sales product report must still delegate margin to canonical FIFO core");
assert(!section.includes("invoice_payments") && !section.includes("public.invoices") && !section.includes("stock_entries"), "Phase 5 UI must not recalculate financials from raw history");

console.log("report-phase5-contract: ok");
