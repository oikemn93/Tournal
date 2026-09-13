import fs from "node:fs";

const entry = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const activeView = entry.includes("RapportViewV2")
  ? fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8")
  : entry;
const band = fs.readFileSync("src/app/screens/ReportKpiBand.tsx", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(activeView.includes('data-screen-source="canonical-report-v7-ui"') || activeView.includes('data-screen-source="canonical-report-v6-ui"'), "UI refresh marker missing");
assert(activeView.includes("sticky top-2") && activeView.includes("Rapport"), "Compact sticky report header missing");
assert(activeView.includes("previousBounds") || activeView.includes("previousPeriodBounds"), "Previous-period bounds missing");
assert(activeView.includes("loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds })") || activeView.includes("loadFinancialMetrics({ boutiqueId: boutique.id, ...comparisonBounds })"), "Previous-period comparison must reuse canonical financial metrics RPC");
assert(activeView.includes("<ReportKpiBand metrics={metrics} previous={previous}") || activeView.includes("<ReportKpiBand metrics={metrics} previous={previousMetrics}"), "Summary KPI band is not rendered");
assert(band.includes("CA encaissé") && band.includes("CA facturé") && band.includes("Nombre de ventes") && band.includes("Panier moyen"), "Primary KPI set incomplete");
assert(band.includes("Marge opérationnelle") && band.includes("canSeeMargin") && band.includes("Marge FIFO réalisée moins charges d'exploitation décaissées"), "Operational margin KPI must stay permission-gated and semantically explicit");
assert(!band.includes('label: "Marge nette"'), "Report must not label the simplified operational metric as net accounting margin");
assert(band.includes("ArrowUpRight") && band.includes("ArrowDownRight") && band.includes("text-emerald-600") && band.includes("text-red-600"), "Semantic variation indicators missing");
assert(!band.includes("invoice_payments") && !band.includes("public.invoices") && !band.includes("stock_entries"), "Presentation layer must not recalculate canonical financials from raw tables");

console.log("report-ui-stage1: ok");
