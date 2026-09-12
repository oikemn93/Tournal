import fs from "node:fs";

const report = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const team = fs.readFileSync("src/app/screens/TeamReportSection.tsx", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(report.includes('import { TeamReportSection } from "./TeamReportSection"'), "Focused team section must be imported");
ok(report.includes('<TeamReportSection report={team}/>'), "Focused team section must be active");
ok(report.includes('section === "team"') && report.includes("loadEmployeePerformanceReport"), "Team report must remain lazy-loaded");
ok(report.includes('canSeeMargin && <Accordion title="Équipe"'), "Team analytics must remain permission-gated");
ok(team.includes("Contribution au chiffre d’affaires") && team.includes("share.toFixed(1)"), "Employee contribution percentage missing");
ok(team.includes("Rang") && team.includes("#{rank"), "Explicit employee rank missing");
ok(team.includes("return_rate") && team.includes("returns_count"), "Return quality indicators missing");
ok(team.includes('toggleSort("operator_name")') && team.includes('toggleSort("invoiced_revenue")') && team.includes('toggleSort("sales_count")') && team.includes('toggleSort("average_basket")') && team.includes('toggleSort("return_rate")'), "Team table sorting incomplete");
ok(team.includes('max-h-[420px] overflow-auto'), "Team detail table must stay bounded");
ok(team.includes("text-amber-600"), "Return-rate attention state must use semantic amber");
ok(!team.includes("text-blue-") && !team.includes("text-purple-") && !team.includes("text-indigo-"), "Team report must not introduce a new semantic palette");

console.log("Report team UI contract passed");
