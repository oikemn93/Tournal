import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,t)=>fs.writeFileSync(p,t);
function one(t,a,b,label){const n=t.split(a).length-1;if(n!==1)throw new Error(`${label}: expected 1 found ${n}`);return t.replace(a,b)}
function countReplace(t,a,b,n,label){const c=t.split(a).length-1;if(c!==n)throw new Error(`${label}: expected ${n} found ${c}`);return t.split(a).join(b)}

// src/app/types.ts
{
 const p='src/app/types.ts'; let t=read(p);
 t=one(t,'export type InvoiceLine = { id?: number; sourceInvoiceLineId?: number; productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };\n\nexport type InvoicePayment','export type InvoiceLine = { id?: number; sourceInvoiceLineId?: number; productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };\nexport type SalePriceHint = { productId: number; sellUnit: string; prixUnit: number; invoiceDate: string };\n\nexport type InvoicePayment','SalePriceHint');
 t=one(t,'  lines?: InvoiceLine[]; payments?: InvoicePayment[];\n','  lines?: InvoiceLine[]; lineCount?: number; payments?: InvoicePayment[];\n','lineCount');
 t=one(t,'  categories?: Category[];\n','  categories?: Category[];\n  salePriceHints?: SalePriceHint[];\n  productSaleCounts?: Record<number, number>;\n','Boutique metrics');
 write(p,t);
}

// src/lib/api.ts
{
 const p='src/lib/api.ts'; let t=read(p);
 const anchor=`async function dataRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {\n  return dataRequest<T>(\`rpc/\${name}\`, {\n    method: "POST",\n    body: JSON.stringify(params),\n  });\n}\n`;
 const helper=`${anchor}\nexport async function loadInvoiceLines(boutiqueId: string, invoiceId: string) {\n  if (!boutiqueId || !invoiceId) return [];\n  const rows = await dataRpc<any[]>("read_invoice_lines", { p_boutique_id:boutiqueId, p_invoice_ids:[invoiceId] });\n  return rows.map((line: any) => ({\n    id:Number(line.id), sourceInvoiceLineId:line.source_invoice_line_id != null ? Number(line.source_invoice_line_id) : undefined,\n    productId:Number(line.product_id), nom:line.nom, qty:Number(line.qty), unit:line.unit ?? "unité", prixUnit:Number(line.prix_unit),\n    prixAchat:line.prix_achat != null ? Number(line.prix_achat) : undefined, sellUnit:line.sell_unit ?? undefined, sellQty:line.sell_qty != null ? Number(line.sell_qty) : undefined,\n  }));\n}\n`;
 t=one(t,anchor,helper,'dataRpc helper');
 t=one(t,'const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, advances, creditRefunds, charges, sessions, auditLogs, userScope] = await Promise.all([','const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, saleMetrics, advances, creditRefunds, charges, sessions, auditLogs, userScope] = await Promise.all([','snapshot tuple');
 t=one(t,'dataRpc<any[]>("read_bounded_invoices", {','dataRpc<any[]>("read_bounded_invoice_summaries", {','summary route');
 const pay=`      dataRpc<any[]>("read_bounded_invoice_payments", {\n        p_boutique_id: boutiqueId,\n        p_from: historyFrom,\n        // Deferred old invoices still need payments posted after the 7-day\n        // cutoff so their current balance cannot be hydrated stale.\n        p_to: options.historyOnly ? null : historyTo ?? null,\n      }), (options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(\`client_advances?select=*\${scoped()}&order=paid_at.desc,id.desc\`)),`;
 const payMetrics=`      dataRpc<any[]>("read_bounded_invoice_payments", {\n        p_boutique_id: boutiqueId,\n        p_from: historyFrom,\n        // Deferred old invoices still need payments posted after the 7-day\n        // cutoff so their current balance cannot be hydrated stale.\n        p_to: options.historyOnly ? null : historyTo ?? null,\n      }),\n      (options.historyOnly ? Promise.resolve({ prices:[], counts:[] }) : dataRpc<any>("read_recent_sale_metrics", { p_boutique_id:boutiqueId, p_from:secondaryHistoryFrom })),\n      (options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(\`client_advances?select=*\${scoped()}&order=paid_at.desc,id.desc\`)),`;
 t=one(t,pay,payMetrics,'metrics promise');
 t=one(t,'      entries: [\n',`      salePriceHints: (saleMetrics?.prices ?? []).map((hint: any) => ({ productId:Number(hint.product_id), sellUnit:hint.sale_unit ?? "", prixUnit:Number(hint.prix_unit), invoiceDate:hint.invoice_date })),\n      productSaleCounts: Object.fromEntries((saleMetrics?.counts ?? []).map((row: any) => [Number(row.product_id), Number(row.invoice_count)])),\n      entries: [\n`,'metrics mapping');
 const lines='          lines:(i.invoice_lines ?? []).map((l: any)=>({ id:Number(l.id), sourceInvoiceLineId:l.source_invoice_line_id != null ? Number(l.source_invoice_line_id) : undefined, productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), prixAchat:l.prix_achat!=null?Number(l.prix_achat):undefined, sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })),\n';
 t=one(t,lines,'          lineCount:Number(i.line_count ?? (i.invoice_lines ?? []).length),\n'+lines,'lineCount mapping');
 write(p,t);
}

// src/app/utils/sales.ts
{
 const p='src/app/utils/sales.ts'; let t=read(p);
 t=one(t,'import type { Boutique, Invoice, Product } from "../types";','import type { Boutique, Invoice, Product, SalePriceHint } from "../types";','sales import');
 const marker='export function getLastSalePrice(productId: number, invoices: Invoice[], sellUnit: string): number | null {';
 const start=t.indexOf(marker); if(start<0)throw new Error('getLastSalePrice missing');
 t=t.slice(0,start)+`export function getLastSalePrice(productId: number, invoices: Invoice[], sellUnit: string, hints: SalePriceHint[] = []): number | null {\n  const targetUnit = normalizedUnit(sellUnit);\n  let best: { price:number; at:string } | null = null;\n  const sorted = [...invoices].filter(inv => inv.type.toLowerCase() !== "retour").sort((a,b)=>(b.dateRaw ?? b.date).localeCompare(a.dateRaw ?? a.date));\n  for (const invoice of sorted) {\n    const line = invoice.lines?.find(item => item.productId===productId && Number(item.prixUnit)>0 && normalizedUnit(item.sellUnit ?? item.unit)===targetUnit);\n    if (line) { best={price:Number(line.prixUnit),at:invoice.dateRaw ?? invoice.date}; break; }\n  }\n  for (const hint of hints) {\n    if (hint.productId!==productId || Number(hint.prixUnit)<=0 || normalizedUnit(hint.sellUnit)!==targetUnit) continue;\n    if (!best || hint.invoiceDate > best.at) best={price:Number(hint.prixUnit),at:hint.invoiceDate};\n  }\n  return best?.price ?? null;\n}\n`;
 write(p,t);
}

// POSView: 2 price calls + bestseller metric.
{
 const p='src/app/screens/POSView.tsx'; let t=read(p);
 const re=/getLastSalePrice\(p\.id, invoices, defaultUnit\)/g; const m=t.match(re)??[]; if(m.length!==2)throw new Error(`POS price calls: ${m.length}`);
 t=t.replace(re,'getLastSalePrice(p.id, invoices, defaultUnit, boutique.salePriceHints)');
 t=one(t,'  function getSalesCount(p: Product) {\n    return invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;\n  }','  function getSalesCount(p: Product) {\n    return boutique.productSaleCounts?.[p.id] ?? invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;\n  }','POS sales count');
 write(p,t);
}

// FacturesView: add hydration cache and route every list action through it.
{
 const p='src/app/screens/FacturesView.tsx'; let t=read(p);
 t=one(t,'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare, loadBoutiqueHistoryRange } from "../../lib/api";','import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare, loadBoutiqueHistoryRange, loadInvoiceLines } from "../../lib/api";','Factures import');
 const priceRe=/getLastSalePrice\(([^\n\)]*)\)/g; let pc=0;
 t=t.replace(priceRe,(whole,args)=>{pc++; return args.includes('boutique.salePriceHints')?whole:`getLastSalePrice(${args},boutique.salePriceHints)`});
 if(pc!==4)throw new Error(`Factures price calls: expected 4 found ${pc}`);
 const state='  const [status,setStatus] = useState<InvoiceStatus>("en attente");\n';
 const helpers=`${state}  const invoiceLineCache = React.useRef(new Map<string, InvoiceLine[]>());\n\n  async function hydrateInvoice(inv: Invoice): Promise<Invoice> {\n    const expected=inv.lineCount ?? inv.lines?.length ?? 0;\n    const current=inv.lines ?? [];\n    if (current.length >= expected) return inv;\n    let hydrated=invoiceLineCache.current.get(inv.id);\n    if (!hydrated) { hydrated=await loadInvoiceLines(boutique.id,inv.id); invoiceLineCache.current.set(inv.id,hydrated); }\n    return { ...inv, lines:hydrated, lineCount:hydrated.length };\n  }\n  async function openInvoiceDetail(inv: Invoice) { try { setDetailInv(await hydrateInvoice(inv)); } catch(error) { alert(error instanceof Error ? error.message : "Détail de facture indisponible"); } }\n  async function openInvoicePayment(inv: Invoice) {\n    try { const hydrated=await hydrateInvoice(inv); setEncaissInv(hydrated); setEncaissSplit([{method:"Espèces",amount:invoiceRemainingAmount(hydrated)}]); }\n    catch(error) { alert(error instanceof Error ? error.message : "Facture indisponible pour encaissement"); }\n  }\n  async function openInvoiceShare(inv: Invoice) { try { setShareInv(await hydrateInvoice(inv)); } catch(error) { alert(error instanceof Error ? error.message : "Facture indisponible pour partage"); } }\n`;
 t=one(t,state,helpers,'Factures helpers');
 t=one(t,'      if (invoice) setDetailInv(invoice);','      if (invoice) void openInvoiceDetail(invoice);','initial detail');
 t=one(t,'<div className="w-full text-left cursor-pointer" onClick={()=>{ if (canCollectThisInvoice) { setEncaissInv(inv); setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]); } else { setDetailInv(inv); } }}>','<div className="w-full text-left cursor-pointer" onClick={()=>{ void (canCollectThisInvoice ? openInvoicePayment(inv) : openInvoiceDetail(inv)); }}>','row action');
 t=one(t,'onClick={e=>{e.stopPropagation();setEncaissInv(inv);setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]);}}','onClick={e=>{e.stopPropagation();void openInvoicePayment(inv);}}','wallet action');
 t=one(t,'onClick={e=>{e.stopPropagation();setShareInv(inv);}}','onClick={e=>{e.stopPropagation();void openInvoiceShare(inv);}}','share action');
 t=one(t,'{inv.lines&&inv.lines.length>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lines.length} produit{inv.lines.length>1?"s":""}</p>}','{(inv.lineCount ?? inv.lines?.length ?? 0)>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lineCount ?? inv.lines?.length ?? 0} produit{(inv.lineCount ?? inv.lines?.length ?? 0)>1?"s":""}</p>}','line count UI');
 write(p,t);
}

// CI: run the focused contract immediately after the broad performance contract.
{
 const p='.github/workflows/ci.yml'; let t=read(p);
 t=one(t,'      - name: Performance read contract\n        run: node scripts/test-performance-read-contract.mjs\n','      - name: Performance read contract\n        run: node scripts/test-performance-read-contract.mjs\n\n      - name: Invoice summary hydration contract\n        run: node scripts/test-invoice-summary-contract.mjs\n','CI invoice contract');
 write(p,t);
}

// Remote migration inventory, including schema-neutral QA harness history.
{
 const p='.github/audit/remote-migration-manifest.txt'; let t=read(p);
 for (const row of [
  '20260906124614|qa_perf_c748912f_http_harness',
  '20260906124746|qa_perf_c748912f_harness_metrics',
  '20260906125009|qa_perf_c748912f_capability_harness',
  '20260906132626|remove_temporary_qa_perf_harness',
  '20260906133509|invoice_summary_and_targeted_lines',
  '20260906133711|retain_registered_invoice_lines_in_summary',
  '20260906134120|recent_sale_metrics',
 ]) if(!t.includes(row+'\n')) t+=row+'\n';
 write(p,t);
}

for (const p of ['.github/scripts/apply-invoice-summary-patch.mjs','.github/scripts/apply-invoice-summary-patch-v2.mjs','.github/workflows/apply-invoice-summary-patch.yml']) fs.rmSync(p,{force:true});
console.log('invoice_summary_patch_v2_applied');
