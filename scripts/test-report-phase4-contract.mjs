import fs from "node:fs";

const report = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const section = fs.readFileSync("src/app/components/ClientReportSection.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/candidate-migrations/20260912223000_report_phase4_clients.sql", "utf8");

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(api.includes("get_client_report"), "Phase 4 client must call client report RPC");
assert(report.includes("loadClientReport"), "Rapport must load client report");
assert(report.includes("ClientReportSection"), "Rapport must render client report section");
assert(section.includes("Encours clients") && section.includes("En retard"), "Client section must expose outstanding and overdue metrics");
assert(section.includes("Seuil clients inactifs"), "Client inactivity threshold control missing");
assert(migration.includes("auth_has_read_permission(p_boutique_id,'clients')"), "Client RPC must require clients read permission");
assert(migration.includes("i.invoice_date>=p_from") && migration.includes("i.invoice_date<p_to"), "Client invoiced revenue must use bounded invoice_date");
assert(migration.includes("ip.paid_at>=p_from") && migration.includes("ip.paid_at<p_to"), "Client cash must use real paid_at");
assert(migration.includes("r.refunded_at>=p_from") && migration.includes("r.refunded_at<p_to"), "Client refunds must use real refunded_at");
assert(migration.includes("greatest(i.montant-coalesce(p.paid,0),0)"), "Client outstanding must use invoice balance after payments");
assert(migration.includes("coalesce(i.due_date"), "Client overdue balance must honor due date/payment terms");
assert(migration.includes("revoke all on function public.get_client_report") && migration.includes("from public,anon"), "Phase 4 RPC must deny public/anon");
assert(!migration.includes("fifo_") && !migration.includes("realized_margin"), "Client report must not leak margin data");
console.log("report-phase4-contract: ok");
