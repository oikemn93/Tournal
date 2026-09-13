import fs from "node:fs";

const view = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const section = fs.readFileSync("src/app/screens/ChargesReportSection.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const sql = fs.readFileSync(".github/audit/replay-migrations/20260912234655_report_charges_detail.sql", "utf8");
const canonical = fs.readFileSync(".github/audit/replay-migrations/20260912165219_canonical_financial_metrics.sql", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(canonical.includes("'operating_cash_expenses',v_operating_cash_expenses"), "Canonical operating_cash_expenses must remain available");
ok(view.includes('"charges"') && view.includes('title="Charges"'), "Charges accordion is missing from the active report");
ok(view.includes("loadChargeReport") && view.includes('section === "charges"'), "Charges detail must lazy-load");
ok(view.includes("<ChargesReportSection report={charges} metrics={metrics}/>"), "Charges section is not wired to canonical metrics");
ok(section.includes("metrics?.operating_cash_expenses"), "Displayed total must use canonical operating_cash_expenses");
ok(section.includes("Répartition par catégorie") && section.includes("Détail des charges"), "Charges breakdown/detail presentation missing");
ok(section.includes('max-h-[420px] overflow-auto'), "Charges detail must remain bounded");
ok(api.includes('postRpc<ChargeReport>("get_charge_report"'), "Charge report loader missing");
ok(sql.includes("c.source not in ('supplier_receipt','transfer')") && sql.includes("transfer_charge_payments"), "Charge report must mirror canonical cash-event sources");
ok(sql.includes("coalesce(c.categorie,'') <> 'Achat stock'"), "Operating charges must exclude stock purchases like canonical metrics");

console.log("Report charges regression contract passed");
