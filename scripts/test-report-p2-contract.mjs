import fs from "node:fs";
const kpi = fs.readFileSync("src/app/screens/ReportKpiBand.tsx", "utf8");
const financial = fs.readFileSync("src/app/screens/FinancialDeepReportSection.tsx", "utf8");
const stock = fs.readFileSync("src/app/screens/StockReportSection.tsx", "utf8");
const view = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
function assert(condition, message) { if (!condition) throw new Error(message); }
assert(kpi.includes('label: "Marge opérationnelle"'), "P2: operational margin label missing");
assert(!kpi.includes('label: "Marge nette"'), "P2: misleading net margin label still present");
assert(kpi.includes("Marge FIFO réalisée moins charges d'exploitation décaissées"), "P2: operational margin definition missing");
assert(financial.includes("metrics?.fifo_cost") && financial.includes("Coût des marchandises vendues net (FIFO)"), "P2: P&L must consume canonical fifo_cost directly");
assert(!financial.includes("margin_revenue") || !financial.includes("- Number(metrics.realized_margin_fifo"), "P2: P&L must not derive FIFO cost by subtraction");
assert(stock.includes('rotation_class === "lente"') && !stock.includes('rotation_class === "lente" ||'), "P2: slow rotation must exclude dormant products");
assert(stock.includes("window.setTimeout(() => onDays(draftDays), 450)"), "P2: dormant threshold debounce missing");
assert(view.includes("Math.abs(item.value)/max*100") && view.includes("Math.abs(row.invoiced_revenue)"), "P2: signed client revenue chart width must use absolute values");
console.log("report-p2-contract: ok");
