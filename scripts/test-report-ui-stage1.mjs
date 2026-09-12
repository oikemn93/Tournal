import fs from "node:fs";

const view = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const band = fs.readFileSync("src/app/screens/ReportKpiBand.tsx", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(view.includes('data-screen-source="canonical-report-v6-ui"'), "UI refresh marker missing");
assert(view.includes("sticky top-2") && view.includes("Vue de performance"), "Compact sticky report header missing");
assert(view.includes("previousPeriodBounds") && view.includes("loadFinancialMetrics({ boutiqueId: boutique.id, ...comparisonBounds })"), "Previous-period comparison must reuse canonical financial metrics RPC");
assert(view.includes("<ReportKpiBand metrics={metrics} previous={previousMetrics}"), "Summary KPI band is not rendered");
assert(band.includes("CA encaissé") && band.includes("CA facturé") && band.includes("Nombre de ventes") && band.includes("Panier moyen"), "Primary KPI set incomplete");
assert(band.includes("Marge nette") && band.includes("canSeeMargin"), "Margin KPI must stay permission-gated");
assert(band.includes("ArrowUpRight") && band.includes("ArrowDownRight") && band.includes("text-emerald-600") && band.includes("text-red-600"), "Semantic variation indicators missing");
assert(!band.includes("invoice_payments") && !band.includes("public.invoices") && !band.includes("stock_entries"), "Presentation layer must not recalculate canonical financials from raw tables");

console.log("report-ui-stage1: ok");
