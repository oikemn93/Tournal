import fs from "node:fs";

const view = fs.readFileSync("src/app/screens/RapportViewV2.tsx", "utf8");
const team = fs.readFileSync("src/app/screens/TeamReportSection.tsx", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

ok(view.includes("TeamReportSection"), "Team stage 3 component must be active");
ok(view.includes("previousTeam") && view.includes("setPreviousTeam"), "Previous team period must be tracked");
ok(view.includes("loadEmployeePerformanceReport({ boutiqueId: boutique.id, ...prevBounds })"), "Team comparison must load the equivalent previous period");
ok(view.includes('section === "team"'), "Team detail must remain lazy-loaded");
ok(team.includes('data-report-ui-team-stage="3"'), "Team stage marker missing");
ok(team.includes("Contribution au CA"), "Contribution visualization missing");
ok(team.includes("#{index+1}") && team.includes("Rang"), "Explicit employee ranking missing");
ok(team.includes("contribution.toFixed(1)"), "Contribution percentage missing");
ok(team.includes("Taux de retour") && team.includes("return_rate"), "Return-rate metric missing");
ok(team.includes("Panier moyen équipe") && team.includes("average_basket"), "Average-basket metric missing");
ok(team.includes("ArrowUpRight") && team.includes("ArrowDownRight"), "Variation arrows missing");
ok(team.includes("text-emerald-600") && team.includes("text-red-600") && team.includes("text-amber-600") && team.includes("text-muted-foreground"), "Semantic colors missing");
ok(team.includes("toggleSort") && team.includes('toggleSort("invoiced_revenue")') && team.includes('toggleSort("contribution")'), "Sortable team table missing");
ok(team.includes('max-h-[440px] overflow-auto'), "Team detail table must remain bounded");

console.log("report-ui-team-stage3: ok");
