import fs from "node:fs";

const ui=fs.readFileSync("src/app/screens/RapportViewV2.tsx","utf8");
const bar=fs.readFileSync("src/app/screens/ReportFilterBar.tsx","utf8");
const api=fs.readFileSync("src/lib/reportApi.ts","utf8");
const sql=fs.readFileSync(".github/audit/replay-migrations/20260913133000_report_global_filters_search.sql","utf8");
function ok(v,m){if(!v)throw new Error(m)}

ok(ui.includes('<ReportFilterBar')&&bar.includes('data-report-global-filters="server"'),"always-visible global filter bar missing");
ok(bar.includes('Recherche transversale du rapport')&&bar.includes('Filtre catégorie produit')&&bar.includes('Filtre employé')&&bar.includes('Filtre mode de paiement')&&bar.includes('Filtre type de client'),"global search/filter controls incomplete");
ok(api.includes('get_report_filter_options')&&api.includes('search_report_entities'),"bounded server search/options loaders missing");
ok(api.includes('get_sales_product_report_filtered')&&api.includes('get_employee_performance_report_filtered')&&api.includes('get_client_report_filtered')&&api.includes('get_stock_inventory_report_filtered'),"filtered section loaders missing");
ok(ui.includes('loadFilteredSalesProductReport')&&ui.includes('loadFilteredEmployeePerformanceReport')&&ui.includes('loadFilteredClientReport')&&ui.includes('loadFilteredStockInventoryReport'),"active report sections are not wired to server filters");
ok(ui.includes('hasReportFilters(filters)')&&ui.includes('setSales(null)')&&ui.includes('setTeam(null)')&&ui.includes('setStock(null)')&&ui.includes('setClients(null)'),"filter changes must invalidate relevant lazy caches");
ok(ui.includes('250')&&ui.includes('AbortController')&&ui.includes('searchReportEntities'),"search must debounce and abort stale requests");
ok(bar.includes('KPIs globaux restent la référence canonique'),"canonical KPI scope must be explicit while filtered details are active");
ok(sql.includes('private.report_filtered_sales_events')&&sql.includes('i.invoice_date>=p_from')&&sql.includes('i.invoice_date<p_to'),"filtered sales source must remain period-bounded server-side");
ok(sql.includes('p_category_id')&&sql.includes('p_operator_id')&&sql.includes('p_payment_method')&&sql.includes('p_client_type'),"combinable filter dimensions missing from server contract");
ok(sql.includes("private.fifo_outflow_cost")&&sql.includes("return_invoice_id"),"filtered margin must reuse FIFO cost primitives for sales and returns");
ok(sql.includes('p_limit integer default 8')&&sql.includes('least(coalesce(p_limit,8),20)'),"cross-entity search must be result-bounded");
ok(!bar.includes('text-blue-')&&!bar.includes('text-purple-')&&!bar.includes('text-indigo-'),"filter UI must not introduce a new report palette");
console.log("report-global-filters: ok");
