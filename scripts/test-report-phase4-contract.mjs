import fs from "node:fs";

const entry = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const report = entry.includes("RapportViewV2")
  ? fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8")
  : entry;
const client = fs.readFileSync("src/app/screens/ClientReportSection.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/replay-migrations/20260912192118_report_phase4_client_report.sql", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(api.includes("get_client_report"), "Phase 4 client must call client report RPC");
assert(report.includes("loadClientReport"), "Rapport must load client report");
assert(report.includes('title="Clients"') && /section\s*===\s*"clients"/.test(report), "Client section must exist and lazy-load");
assert(client.includes("customer_outstanding_global") || client.includes("outstanding_global"), "Global customer outstanding KPI missing");
assert(client.includes("invoiced_revenue") && client.includes("sales_count"), "Client ranking metrics missing");
assert(client.includes("overdue_global"), "Overdue customer detail missing");
assert(migration.includes("i.invoice_date>=p_from") && migration.includes("i.invoice_date<p_to"), "Client revenue must use bounded invoice dates");
assert(migration.includes("ip.paid_at>=p_from") && migration.includes("ip.paid_at<p_to"), "Client cash must use real paid_at");
assert(migration.includes("r.refunded_at>=p_from") && migration.includes("r.refunded_at<p_to"), "Client cash must subtract real refunds");
assert(migration.includes("greatest(i.montant-coalesce(p.paid,0),0)"), "Outstanding must mirror canonical financial metrics");
assert(migration.includes("auth_has_read_permission(p_boutique_id,'clients')") && migration.includes("auth_has_read_permission(p_boutique_id,'compta')"), "Client report read permissions missing");
assert(migration.includes("revoke all on function public.get_client_report") && migration.includes("from public,anon"), "Phase 4 RPC must deny public/anon");
console.log("report-phase4-contract: ok");
