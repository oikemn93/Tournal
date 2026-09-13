import fs from "node:fs";

const view = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(view.includes("useRef"), "Report must keep request generation/controller refs");
ok(/reportGenerationRef\.current\s*\+=\s*1/.test(view), "Period/boutique changes must advance report generation");
ok(/controller\?\.abort\(\)/.test(view), "Period/boutique changes must abort section requests");
ok(view.includes("setSales(null)") && view.includes("setTeam(null)") && view.includes("setStock(null)") && view.includes("setClients(null)") && view.includes("setCharges(null)"), "All section caches must clear on report scope change");
ok(/generation\s*===\s*reportGenerationRef\.current/.test(view), "Every section response must be generation-guarded");
ok(/signal\s*:\s*controller\.signal/.test(view), "Section calls must receive AbortController signals");
ok(view.includes("refreshStock") && /sectionControllersRef\.current\.stock\?\.abort\(\)/.test(view), "Stock refresh must abort its prior request");
ok(api.includes("signal?: AbortSignal"), "RPC client must expose AbortSignal");
ok(/fetch\([^;]+signal\s*\}/s.test(api), "RPC fetch must receive AbortSignal");
for (const name of ["get_sales_product_report", "get_employee_performance_report", "get_stock_inventory_report", "get_client_report", "get_charge_report"]) {
  const at = api.indexOf(`\"${name}\"`);
  ok(at >= 0, `${name} client missing`);
  const tail = api.slice(at, at + 500);
  ok(tail.includes("params.signal"), `${name} must forward params.signal`);
}

console.log("Report P0 race contract passed: stale section responses cannot repopulate a new scope");
