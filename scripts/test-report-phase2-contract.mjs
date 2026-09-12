import fs from "node:fs";

const report = fs.readFileSync("src/app/screens/RapportView.tsx", "utf8");
const api = fs.readFileSync("src/lib/reportApi.ts", "utf8");
const migration = fs.readFileSync(".github/audit/candidate-migrations/20260912202000_report_phase2_employee_performance.sql", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(api.includes('get_employee_performance_report'), "Employee report client must call the phase 2 RPC");
assert(report.includes("loadEmployeePerformanceReport"), "Rapport must load employee performance from the server");
assert(report.includes("canSeeMargin ? loadEmployeePerformanceReport"), "Employee performance must not load without margin permission");
assert(report.includes("Performance par employé"), "Employee performance section missing");
assert(report.includes("return_rate") && report.includes("average_basket") && report.includes("sales_count"), "Employee KPI fields missing");
assert(migration.toLowerCase().includes("create or replace function public.get_employee_performance_report"), "Employee performance RPC migration missing");
assert(migration.includes("auth_has_read_permission(p_boutique_id,'marges')"), "Employee performance RPC must require margins permission");
assert(migration.includes("i.invoice_date>=p_from") && migration.includes("i.invoice_date<p_to"), "Employee performance must use bounded invoice_date reads");
assert(migration.includes("invoice_type='retour' then -amount else amount"), "Employee CA must net returns using canonical invoice semantics");
assert(migration.includes("count(*) filter(where invoice_type='vente')"), "Employee sales count must count sale invoices");
assert(migration.includes("count(*) filter(where invoice_type='retour')"), "Employee return count must count return invoices");
assert(migration.includes("revoke all on function public.get_employee_performance_report") && migration.includes("from public,anon"), "Employee RPC must deny public/anon execution");

console.log("report-phase2-contract: ok");
