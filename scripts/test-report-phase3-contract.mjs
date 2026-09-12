import fs from "node:fs";

const report = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/candidate-migrations/20260912210000_report_phase3_stock_inventory.sql", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(api.includes("get_stock_inventory_report"), "Phase 3 client must call stock inventory RPC");
assert(report.includes("loadStockInventoryReport"), "Rapport must load stock inventory report");
assert(report.includes("Stock & inventaire"), "Stock & inventory section missing");
assert(report.includes("Seuil produits dormants"), "Dormant threshold control missing");
assert(report.includes("Valorisation FIFO"), "FIFO stock valuation missing");
assert(report.includes("Écart inventaire cumulé"), "Cumulative inventory variance missing");
assert(migration.includes("private.fifo_stock_value"), "Stock valuation must reuse canonical FIFO stock value");
assert(migration.includes("se.entry_date>=p_from") && migration.includes("se.entry_date<p_to"), "Rotation reads must be bounded by period");
assert(migration.includes("se.entry_date>=v_dormant_from"), "Dormancy lookup must be bounded by threshold");
assert(migration.includes("s.finalized_at>=p_from") && migration.includes("s.finalized_at<p_to"), "Inventory history must be bounded by period");
assert(migration.includes("auth_has_read_permission(p_boutique_id,'marges')"), "FIFO value must respect margin permission");
assert(migration.includes("revoke all on function public.get_stock_inventory_report") && migration.includes("from public,anon"), "Phase 3 RPC must deny public/anon");
console.log("report-phase3-contract: ok");
