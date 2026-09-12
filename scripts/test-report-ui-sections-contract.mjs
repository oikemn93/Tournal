import fs from "node:fs";
const ui=fs.readFileSync("src/app/screens/RapportViewV2.tsx","utf8");
const entry=fs.readFileSync("src/app/screens/RapportView.tsx","utf8");
function ok(v,m){if(!v)throw new Error(m)}
ok(entry.includes('RapportViewV2'),"new report UI not active");
ok(ui.includes('loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds })'),"canonical KPI source missing");
ok(ui.includes('loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds })'),"previous-period comparison missing");
ok(ui.includes('if (section === "sales"')&&ui.includes('if (section === "team"')&&ui.includes('if (section === "stock"')&&ui.includes('if (section === "clients"')&&ui.includes('if (section === "finance"'),"sections are not lazy-loaded");
const bootstrapStart=ui.indexOf('useEffect(() =>');
const bootstrapEnd=ui.indexOf('async function toggle', bootstrapStart);
const bootstrap=ui.slice(bootstrapStart, bootstrapEnd);
ok(!bootstrap.includes('loadSalesProductReport')&&!bootstrap.includes('loadEmployeePerformanceReport')&&!bootstrap.includes('loadStockInventoryReport')&&!bootstrap.includes('loadClientReport'),"detail RPC must not load with KPI bootstrap");
ok(ui.includes("Résumé d'abord · détails chargés à la demande"),"visual hierarchy marker missing");
ok(ui.includes('<Bars')&&ui.includes('<table'),"summary/chart/detail hierarchy missing");
ok(ui.includes('onClick={()=>setSort("product_name")}')&&ui.includes('onClick={()=>setSort("quantity")}')&&ui.includes('onClick={()=>setSort("invoiced_revenue")}'),"clickable sales sorting missing");
ok(ui.includes('max-h-[420px] overflow-auto'),"bounded detail table scrolling missing");
ok(ui.includes('text-red-600')&&ui.includes('text-amber-600'),"semantic warning colors missing");
ok(ui.includes('Les exports PDF/CSV seront regroupés ici'),"export must be separated from analysis");
console.log("report-ui-sections-contract: ok");
