import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source=fs.readFileSync('src/lib/reportApi.ts','utf8').replaceAll('import.meta.env','({})');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const calls=[];const exports={};
vm.runInNewContext(code,{exports,require:()=>({refreshSessionIfNeeded:async()=>({access_token:'test'})}),fetch:async(url,options)=>{calls.push({url,...options});return{ok:true,json:async()=>({page:{rows:[]}})};}});
const signal=new AbortController().signal;
const params={boutiqueId:'shop',from:'2026-01-01',to:'2026-02-01',filters:{categoryId:'cat',operatorId:'employee',paymentMethod:'cash',clientType:'pro',entityKind:'product',entityId:'42'},page:{offset:50,sort:'name',direction:'asc'},signal};
for(const name of ['SalesProduct','EmployeePerformance','StockInventory','Client']) {
  await exports[`loadFiltered${name}Report`](params);
  const call=calls.at(-1),body=JSON.parse(call.body);
  assert(call.url.endsWith('/get_report_section_page'));
  assert.equal(call.signal,signal);
  assert.equal(body.p_limit,50);assert.equal(body.p_offset,50);assert.equal(body.p_sort,'name');
  assert.deepEqual(body.p_filters,params.filters);
}
await exports.loadSalesProductReport({boutiqueId:'shop',from:'a',to:'b',signal});
assert(calls.at(-1).url.endsWith('/get_sales_product_report'),'financial detail retains its complete global payload');
const migration=fs.readFileSync('supabase/migrations/20260913113655_report_paged_sections.sql','utf8');
assert(!/create\s+or\s+replace\s+function\s+(public\.)?get_financial_metrics/i.test(migration));
assert(migration.includes('limit v_limit offset v_offset'));
const page=fs.readFileSync('src/app/screens/ReportPage.tsx','utf8');
assert(page.indexOf('page.summary.map')<page.indexOf('page.chart.map((item')));
assert(page.indexOf('page.chart.map((item')<page.indexOf('<table'));
console.log('report page: payload limits, combined filters, signals and global finance isolation passed');
