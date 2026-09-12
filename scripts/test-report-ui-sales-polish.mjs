import fs from "node:fs";

const entry = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const sales = fs.readFileSync("src/app/screens/SalesReportSection.tsx", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(entry.includes('import { SalesReportSection } from "./SalesReportSection"'), "Focused sales section is not wired into Rapport");
ok(entry.includes('<SalesReportSection report={sales} metrics={metrics} canSeeMargin={canSeeMargin}/>'), "Rapport must pass canonical metrics to the focused sales section");
ok(sales.includes('data-report-ui-stage="3-sales"'), "Sales UI stage marker missing");
ok(sales.includes("Produits qui portent le CA") && sales.includes("Répartition par catégorie"), "Sales visual summaries missing");
ok(sales.includes("Meilleurs vendeurs") && sales.includes("Plus faibles vendeurs"), "Best/worst product summaries missing");
ok(sales.includes("Écart de rapprochement produit") && sales.includes("metrics.invoiced_revenue"), "Canonical reconciliation warning missing");
ok(sales.includes("max-h-[420px] overflow-auto"), "Sales detail table must remain bounded");
ok(sales.includes('chooseSort("product_name")') && sales.includes('chooseSort("quantity")') && sales.includes('chooseSort("invoiced_revenue")'), "Sales detail sorting missing");
ok(sales.includes('text-amber-800') && !sales.includes('text-blue-') && !sales.includes('text-purple-'), "Sales semantic color contract changed");

console.log("report-ui-sales-polish: ok");
