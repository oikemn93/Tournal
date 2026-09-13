import fs from "node:fs";

const ui=fs.readFileSync("src/app/screens/RapportViewV2.tsx","utf8");
function ok(value,message){if(!value)throw new Error(message)}

ok(ui.includes('data-screen-source="canonical-report-v10-filters"')||ui.includes('data-screen-source="canonical-report-v9-navigation"'),"professional report shell marker missing");
ok(ui.includes('aria-label="Catégories du rapport"')&&ui.includes('role="tablist"'),"fixed category navigation missing");
ok(ui.includes('role="tab"')&&ui.includes('aria-selected={open===section.id}'),"tabs must expose active state");
ok(ui.includes('role="tabpanel"')&&ui.includes('data-report-active-section={activeSection.id}'),"single active report panel missing");
ok(!ui.includes('function Accordion(')&&!ui.includes('<Accordion title='),"accordion stack must be removed");
ok(ui.includes('setOpen("sales")'),"sales must be the default section after scope changes");
ok(ui.includes('open==="sales"&&body("sales"')&&ui.includes('open==="stock"&&body("stock"')&&ui.includes('open==="clients"&&body("clients"')&&ui.includes('open==="finance"&&body("finance"'),"active section rendering must stay exclusive");
ok(ui.includes('loadSalesProductReport')&&ui.includes('loadStockInventoryReport')&&ui.includes('loadClientReport')&&ui.includes('loadChargeReport'),"lazy server loaders must remain wired");
ok(ui.includes('<ReportKpiBand') && ui.indexOf('<ReportKpiBand') < ui.indexOf('data-report-active-section'),"global KPIs must stay above section detail");
ok(ui.includes('sticky top-2 z-30'),"report header and tabs must remain sticky");
ok(ui.includes('groupBoutiques.length>1')&&ui.includes('id:"group"'),"multi-boutique tab must remain conditional");

console.log("report-navigation-tabs: ok");

ok(ui.indexOf("<ReportKpiBand") < ui.indexOf("</header>"), "KPIs must be inside the sticky header");
ok(ui.includes("setSectionLoading(null);setOpen(section)"), "Cached tabs must clear aborted loading state");
ok(ui.includes("if(!sections.some(item=>item.id===section))return"), "Hidden sections must not issue requests");
ok(ui.includes('event.key==="ArrowRight"') && ui.includes('event.key==="Home"'), "Tabs must support keyboard navigation");
