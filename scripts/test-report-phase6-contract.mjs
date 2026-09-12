import fs from "node:fs";

const section = fs.readFileSync("src/app/screens/FinancialDeepReportSection.tsx", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(section.includes('data-report-phase="6"'), "Phase 6 marker missing");
assert(section.includes("Compte de résultat simplifié"), "P&L section missing");
assert(section.includes("metrics?.invoiced_revenue"), "P&L revenue must use canonical invoiced revenue");
assert(section.includes("metrics.realized_margin_fifo"), "P&L gross margin must use canonical FIFO margin");
assert(section.includes("metrics?.operating_cash_expenses"), "P&L operating expenses must use canonical operating cash expenses");
assert(section.includes("canSeeMargin && <div") && section.includes("Visible uniquement avec la permission Marge"), "P&L must be margin-permission gated");
assert(section.includes("margin_unmatched_lines"), "P&L must preserve FIFO coverage warning");
assert(!section.includes("invoice_payments") && !section.includes("public.invoices") && !section.includes("stock_entries"), "P&L must not recalculate from raw tables");

console.log("report-phase6-contract: ok");
