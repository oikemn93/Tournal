import fs from "node:fs";

const view = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const sales = fs.readFileSync("src/app/screens/SalesReportSection.tsx", "utf8");
const stock = fs.readFileSync("src/app/screens/StockReportSection.tsx", "utf8");
const clients = fs.readFileSync("src/app/screens/ClientReportSection.tsx", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(/setMetrics\(null\);\s*setPrevious\(null\);\s*setMetricsLoading\(true\)/.test(view), "Period changes must clear prior KPI values before reload");
ok(view.includes("Chargement des indicateurs de la période"), "Report must show explicit KPI loading state");
ok(view.includes("Impossible de charger ce rapport, réessayer"), "Section RPC failures must render explicit retry error state");
ok(view.includes("marginCoverageWarning") && view.includes("Couverture FIFO"), "FIFO coverage warning must be visible at report top level");
ok(clients.includes("Clients en retard · global") && clients.includes("Retard total · global"), "Client overdue KPIs must be labelled global");
ok(clients.includes("factures sans client enregistré"), "Client global/detail reconciliation note must be visible");
ok(view.includes("<StockReportSection"), "Active Stock accordion must use the temporality-aware stock section");

ok(stock.includes("Stock actuel · aujourd’hui"), "Current stock metrics must be explicitly separated from historical period data");
ok(stock.includes("l’état actuel, même si la période du Rapport est historique"), "Stock temporal disclaimer missing");
ok(stock.includes("Écarts d’inventaire sur la période") && stock.includes("inventory_variances"), "Inventory variances returned by RPC must be shown");
ok(stock.includes("Activité sur la période sélectionnée"), "Period stock activity must be visually distinct from current stock");

ok(/const\s+filteredRevenue\s*=\s*rows\.reduce/.test(sales), "Sales filtered CA must derive from filtered rows");
ok(/label="CA produits"\s+value=\{fmt\(filteredRevenue\)\}/.test(sales), "Sales CA card must use filtered revenue");
ok(/value\s*:\s*rows\.filter/.test(sales), "Category visualization must use the same filtered rows");
ok(/category\s*===\s*"all"\s*&&\s*metrics/.test(sales), "Canonical global reconciliation warning must only compare the unfiltered scope");

console.log("Report P1 contract passed: loading, errors, stock temporality, inventory variances, sales filter, clients, FIFO warning");
