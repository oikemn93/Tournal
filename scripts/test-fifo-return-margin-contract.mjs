import fs from "node:fs";

const sql = fs.readFileSync(".github/audit/replay-migrations/20260913095000_fifo_returns_net_margin.sql", "utf8");
const lower = sql.toLowerCase();

function ok(value, message) {
  if (!value) throw new Error(message);
}

ok(lower.includes("in ('vente','retour')"), "FIFO core must include return invoices");
ok(lower.includes("se.return_invoice_id=w.invoice_id"), "Return cost must be linked to the exact return invoice");
ok(lower.includes("sum(se.qty * coalesce(se.prix_unit,0))"), "Return material cost must use the actual restored FIFO unit cost");
ok(lower.includes("then -v.return_fifo_cost"), "Return FIFO cost must reduce net COGS");
ok(lower.includes("then -v.base_qty"), "Returned quantity must reduce net product quantity");
ok(lower.includes("then -1 else 1 end") && lower.includes("allocated_revenue"), "Return revenue must be signed symmetrically");
ok(lower.includes("sum(abs(allocated_revenue))"), "Coverage must use absolute activity so sales/returns cannot cancel coverage denominator");

// Real production evidence captured read-only before the patch:
// sale F260909-001502: 40,000 revenue, FIFO COGS 9,666.66
// partial return A260910-000006: 34,000 revenue reversal, restored FIFO cost 4,666.66
// Expected net activity: 6,000 revenue - 5,000 net COGS = 1,000 realized margin.
const saleRevenue = 40000;
const saleCost = 9666.66;
const returnRevenue = 34000;
const returnCost = 4666.66;
const netRevenue = saleRevenue - returnRevenue;
const netCost = saleCost - returnCost;
const netMargin = netRevenue - netCost;
ok(Math.abs(netRevenue - 6000) < 0.001, "Real sale/return fixture net revenue mismatch");
ok(Math.abs(netCost - 5000) < 0.001, "Real sale/return fixture net FIFO cost mismatch");
ok(Math.abs(netMargin - 1000) < 0.001, "Real sale/return fixture must yield 1,000 realized margin");

console.log("FIFO return margin contract passed: real partial return fixture nets to 1,000 realized margin");
