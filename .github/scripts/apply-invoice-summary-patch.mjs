import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOne(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`missing patch anchor: ${label}`);
  if (text.indexOf(search, first + search.length) >= 0) throw new Error(`non-unique patch anchor: ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}
function replaceCount(text, search, replacement, expected, label) {
  const count = text.split(search).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, found ${count}`);
  return text.split(search).join(replacement);
}

// Types: explicitly distinguish summary metadata from hydrated invoice lines.
{
  const path = 'src/app/types.ts';
  let text = read(path);
  text = replaceOne(text,
    'export type InvoiceLine = { id?: number; sourceInvoiceLineId?: number; productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };\n\nexport type InvoicePayment',
    'export type InvoiceLine = { id?: number; sourceInvoiceLineId?: number; productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };\nexport type SalePriceHint = { productId: number; sellUnit: string; prixUnit: number; invoiceDate: string };\n\nexport type InvoicePayment',
    'SalePriceHint type');
  text = replaceOne(text,
    '  lines?: InvoiceLine[]; payments?: InvoicePayment[];\n',
    '  lines?: InvoiceLine[]; lineCount?: number; payments?: InvoicePayment[];\n',
    'Invoice lineCount');
  text = replaceOne(text,
    '  categories?: Category[];\n',
    '  categories?: Category[];\n  salePriceHints?: SalePriceHint[];\n  productSaleCounts?: Record<number, number>;\n',
    'Boutique sale metadata');
  write(path, text);
}

// API: summary bootstrap, compact sale metrics, targeted line hydration.
{
  const path = 'src/lib/api.ts';
  let text = read(path);
  const dataRpcAnchor = `async function dataRpc<T>(name: string, params: Record<string, unknown>): Promise<T> {\n  return dataRequest<T>(\`rpc/\${name}\`, {\n    method: "POST",\n    body: JSON.stringify(params),\n  });\n}\n`;
  const dataRpcReplacement = `${dataRpcAnchor}\nexport async function loadInvoiceLines(boutiqueId: string, invoiceId: string) {\n  if (!boutiqueId || !invoiceId) return [];\n  const rows = await dataRpc<any[]>("read_invoice_lines", {\n    p_boutique_id: boutiqueId,\n    p_invoice_ids: [invoiceId],\n  });\n  return rows.map((line: any) => ({\n    id:Number(line.id),\n    sourceInvoiceLineId:line.source_invoice_line_id != null ? Number(line.source_invoice_line_id) : undefined,\n    productId:Number(line.product_id),\n    nom:line.nom,\n    qty:Number(line.qty),\n    unit:line.unit ?? "unité",\n    prixUnit:Number(line.prix_unit),\n    prixAchat:line.prix_achat != null ? Number(line.prix_achat) : undefined,\n    sellUnit:line.sell_unit ?? undefined,\n    sellQty:line.sell_qty != null ? Number(line.sell_qty) : undefined,\n  }));\n}\n`;
  text = replaceOne(text, dataRpcAnchor, dataRpcReplacement, 'loadInvoiceLines');
  text = replaceOne(text,
    'const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, advances, creditRefunds, charges, sessions, auditLogs, userScope] = await Promise.all([',
    'const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, saleMetrics, advances, creditRefunds, charges, sessions, auditLogs, userScope] = await Promise.all([',
    'snapshot destructuring');
  text = replaceOne(text, 'dataRpc<any[]>("read_bounded_invoices", {', 'dataRpc<any[]>("read_bounded_invoice_summaries", {', 'summary RPC routing');
  const paymentBlock = `      dataRpc<any[]>("read_bounded_invoice_payments", {\n        p_boutique_id: boutiqueId,\n        p_from: historyFrom,\n        // Deferred old invoices still need payments posted after the 7-day\n        // cutoff so their current balance cannot be hydrated stale.\n        p_to: options.historyOnly ? null : historyTo ?? null,\n      }), (options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(\`client_advances?select=*\${scoped()}&order=paid_at.desc,id.desc\`)),`;
  const metricBlock = `      dataRpc<any[]>("read_bounded_invoice_payments", {\n        p_boutique_id: boutiqueId,\n        p_from: historyFrom,\n        // Deferred old invoices still need payments posted after the 7-day\n        // cutoff so their current balance cannot be hydrated stale.\n        p_to: options.historyOnly ? null : historyTo ?? null,\n      }),\n      (options.historyOnly ? Promise.resolve({ prices:[], counts:[] }) : dataRpc<any>("read_recent_sale_metrics", {\n        p_boutique_id: boutiqueId,\n        p_from: secondaryHistoryFrom,\n      })),\n      (options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(\`client_advances?select=*\${scoped()}&order=paid_at.desc,id.desc\`)),`;
  text = replaceOne(text, paymentBlock, metricBlock, 'sale metrics request');
  text = replaceOne(text,
    '      entries: [\n',
    `      salePriceHints: (saleMetrics?.prices ?? []).map((hint: any) => ({\n        productId:Number(hint.product_id), sellUnit:hint.sale_unit ?? "", prixUnit:Number(hint.prix_unit), invoiceDate:hint.invoice_date,\n      })),\n      productSaleCounts: Object.fromEntries((saleMetrics?.counts ?? []).map((row: any) => [Number(row.product_id), Number(row.invoice_count)])),\n      entries: [\n`,
    'sale metric mapping');
  const lineMap = '          lines:(i.invoice_lines ?? []).map((l: any)=>({ id:Number(l.id), sourceInvoiceLineId:l.source_invoice_line_id != null ? Number(l.source_invoice_line_id) : undefined, productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), prixAchat:l.prix_achat!=null?Number(l.prix_achat):undefined, sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })),\n';
  text = replaceOne(text, lineMap,
    '          lineCount:Number(i.line_count ?? (i.invoice_lines ?? []).length),\n' + lineMap,
    'invoice lineCount mapping');
  write(path, text);
}

// Sales utility: backend hint and locally-created/realtime invoice lines compete by timestamp.
{
  const path = 'src/app/utils/sales.ts';
  let text = read(path);
  text = replaceOne(text,
    'import type { Boutique, Invoice, Product } from "../types";',
    'import type { Boutique, Invoice, Product, SalePriceHint } from "../types";',
    'sales type import');
  const marker = 'export function getLastSalePrice(productId: number, invoices: Invoice[], sellUnit: string): number | null {';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('missing getLastSalePrice');
  const replacement = `export function getLastSalePrice(productId: number, invoices: Invoice[], sellUnit: string, hints: SalePriceHint[] = []): number | null {\n  const targetUnit = normalizedUnit(sellUnit);\n  let best: { price:number; at:string } | null = null;\n  const sorted = [...invoices]\n    .filter(inv => inv.type.toLowerCase() !== "retour")\n    .sort((a, b) => (b.dateRaw ?? b.date).localeCompare(a.dateRaw ?? a.date));\n\n  for (const invoice of sorted) {\n    const line = invoice.lines?.find(item => {\n      if (item.productId !== productId || Number(item.prixUnit) <= 0) return false;\n      return normalizedUnit(item.sellUnit ?? item.unit) === targetUnit;\n    });\n    if (line) { best = { price:Number(line.prixUnit), at:invoice.dateRaw ?? invoice.date }; break; }\n  }\n  for (const hint of hints) {\n    if (hint.productId !== productId || Number(hint.prixUnit) <= 0 || normalizedUnit(hint.sellUnit) !== targetUnit) continue;\n    if (!best || hint.invoiceDate > best.at) best = { price:Number(hint.prixUnit), at:hint.invoiceDate };\n  }\n  return best?.price ?? null;\n}\n`;
  text = text.slice(0, start) + replacement;
  write(path, text);
}

// POS consumes compact sale metrics once the full counter-sale lines leave bootstrap.
{
  const path = 'src/app/screens/POSView.tsx';
  let text = read(path);
  text = replaceCount(text,
    'getLastSalePrice(p.id, invoices, defaultUnit)',
    'getLastSalePrice(p.id, invoices, defaultUnit, boutique.salePriceHints)',
    2,
    'POS last sale price');
  text = replaceOne(text,
    `  function getSalesCount(p: Product) {\n    return invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;\n  }`,
    `  function getSalesCount(p: Product) {\n    return boutique.productSaleCounts?.[p.id] ?? invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;\n  }`,
    'POS bestseller metric');
  write(path, text);
}

// Factures hydrates counter-sale lines before every line-dependent surface.
{
  const path = 'src/app/screens/FacturesView.tsx';
  let text = read(path);
  text = replaceOne(text,
    'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare, loadBoutiqueHistoryRange } from "../../lib/api";',
    'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare, loadBoutiqueHistoryRange, loadInvoiceLines } from "../../lib/api";',
    'Factures API import');
  text = replaceCount(text,
    'getLastSalePrice(firstProduct.id, invoices, unit)',
    'getLastSalePrice(firstProduct.id, invoices, unit, boutique.salePriceHints)',
    1,
    'Factures initial last price');
  text = replaceCount(text,
    'getLastSalePrice(lPid, invoices, effectiveUnit)',
    'getLastSalePrice(lPid, invoices, effectiveUnit, boutique.salePriceHints)',
    1,
    'Factures line last price');
  const stateAnchor = '  const [status,setStatus] = useState<InvoiceStatus>("en attente");\n';
  const stateReplacement = `${stateAnchor}  const invoiceLineCache = React.useRef(new Map<string, InvoiceLine[]>());\n\n  async function hydrateInvoice(inv: Invoice): Promise<Invoice> {\n    const expected = inv.lineCount ?? inv.lines?.length ?? 0;\n    const current = inv.lines ?? [];\n    if (current.length >= expected) return inv;\n    let hydrated = invoiceLineCache.current.get(inv.id);\n    if (!hydrated) {\n      hydrated = await loadInvoiceLines(boutique.id, inv.id);\n      invoiceLineCache.current.set(inv.id, hydrated);\n    }\n    return { ...inv, lines:hydrated, lineCount:hydrated.length };\n  }\n\n  async function openInvoiceDetail(inv: Invoice) {\n    try { setDetailInv(await hydrateInvoice(inv)); }\n    catch (error) { alert(error instanceof Error ? error.message : "Détail de facture indisponible"); }\n  }\n  async function openInvoicePayment(inv: Invoice) {\n    try {\n      const hydrated = await hydrateInvoice(inv);\n      setEncaissInv(hydrated);\n      setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(hydrated) }]);\n    } catch (error) { alert(error instanceof Error ? error.message : "Facture indisponible pour encaissement"); }\n  }\n  async function openInvoiceShare(inv: Invoice) {\n    try { setShareInv(await hydrateInvoice(inv)); }\n    catch (error) { alert(error instanceof Error ? error.message : "Facture indisponible pour partage"); }\n  }\n`;
  text = replaceOne(text, stateAnchor, stateReplacement, 'Factures hydration helpers');
  text = replaceOne(text,
    '      if (invoice) setDetailInv(invoice);',
    '      if (invoice) void openInvoiceDetail(invoice);',
    'initial invoice hydration');
  text = replaceOne(text,
    '<div className="w-full text-left cursor-pointer" onClick={()=>{ if (canCollectThisInvoice) { setEncaissInv(inv); setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]); } else { setDetailInv(inv); } }}>',
    '<div className="w-full text-left cursor-pointer" onClick={()=>{ void (canCollectThisInvoice ? openInvoicePayment(inv) : openInvoiceDetail(inv)); }}>',
    'invoice row hydration');
  text = replaceOne(text,
    'onClick={e=>{e.stopPropagation();setEncaissInv(inv);setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]);}}',
    'onClick={e=>{e.stopPropagation();void openInvoicePayment(inv);}}',
    'invoice payment hydration');
  text = replaceOne(text,
    'onClick={e=>{e.stopPropagation();setShareInv(inv);}}',
    'onClick={e=>{e.stopPropagation();void openInvoiceShare(inv);}}',
    'invoice share hydration');
  text = replaceOne(text,
    '{inv.lines&&inv.lines.length>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lines.length} produit{inv.lines.length>1?"s":""}</p>}',
    '{(inv.lineCount ?? inv.lines?.length ?? 0)>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lineCount ?? inv.lines?.length ?? 0} produit{(inv.lineCount ?? inv.lines?.length ?? 0)>1?"s":""}</p>}',
    'invoice line count display');
  write(path, text);
}

// Performance contract locks the new summary/detail split and compact metrics.
{
  const path = 'scripts/test-performance-read-contract.mjs';
  let text = read(path);
  text = replaceOne(text,
    "const payloadSql = fs.readFileSync('.github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql','utf8');\n",
    "const payloadSql = fs.readFileSync('.github/audit/replay-migrations/20260906121437_bounded_read_json_payloads.sql','utf8');\nconst summarySql = fs.readFileSync('.github/audit/replay-migrations/20260906133711_retain_registered_invoice_lines_in_summary.sql','utf8');\nconst detailSql = fs.readFileSync('.github/audit/replay-migrations/20260906133509_invoice_summary_and_targeted_lines.sql','utf8');\nconst saleMetricsSql = fs.readFileSync('.github/audit/replay-migrations/20260906134120_recent_sale_metrics.sql','utf8');\nconst factures = fs.readFileSync('src/app/screens/FacturesView.tsx','utf8');\nconst pos = fs.readFileSync('src/app/screens/POSView.tsx','utf8');\nconst sales = fs.readFileSync('src/app/utils/sales.ts','utf8');\n",
    'performance contract sources');
  text = replaceOne(text,
    "for (const rpc of ['read_bounded_stock_entries','read_bounded_invoices','read_bounded_invoice_payments']) {\n  if (!api.includes(`dataRpc<any[]>(\"${rpc}\"`)) throw new Error(`bootstrap does not use ${rpc}`);\n}\n",
    `for (const rpc of ['read_bounded_stock_entries','read_bounded_invoice_summaries','read_bounded_invoice_payments']) {\n  if (!api.includes(\`dataRpc<any[]>("\${rpc}"\`)) throw new Error(\`bootstrap does not use \${rpc}\`);\n}\nif (!api.includes('dataRpc<any>("read_recent_sale_metrics"')) throw new Error('bootstrap does not load compact sale metrics');\nif (!api.includes('dataRpc<any[]>("read_invoice_lines"')) throw new Error('targeted invoice line hydration missing');\nif (!summarySql.includes("i.client_id is not null") || !summarySql.includes("'line_count'")) throw new Error('registered-client compatibility or line count missing from summary');\nif (!detailSql.includes('cardinality(p_invoice_ids) > 50')) throw new Error('targeted invoice line batch must stay bounded');\nif (!detailSql.includes('case when v_can_view_margin then l.prix_achat else null::numeric end')) throw new Error('targeted invoice lines must preserve margin masking');\nif (!saleMetricsSql.includes('count(distinct invoice_id)::integer') || !saleMetricsSql.includes('distinct on (product_id,sale_unit)')) throw new Error('compact sale metrics contract missing');\nif (!factures.includes('await hydrateInvoice(inv)') || !factures.includes('void openInvoicePayment(inv)') || !factures.includes('void openInvoiceShare(inv)')) throw new Error('Factures must hydrate before line-dependent actions');\nif (!pos.includes('boutique.productSaleCounts?.[p.id]') || !sales.includes('hints: SalePriceHint[] = []')) throw new Error('POS compact sale metadata fallback missing');\n`,
    'performance RPC contract');
  write(path, text);
}

// Keep the remote migration ledger complete, including the already-removed QA harness history.
{
  const path = '.github/audit/remote-migration-manifest.txt';
  let text = read(path);
  const rows = [
    '20260906124614|qa_perf_c748912f_http_harness',
    '20260906124746|qa_perf_c748912f_harness_metrics',
    '20260906125009|qa_perf_c748912f_capability_harness',
    '20260906132626|remove_temporary_qa_perf_harness',
    '20260906133509|invoice_summary_and_targeted_lines',
    '20260906133711|retain_registered_invoice_lines_in_summary',
    '20260906134120|recent_sale_metrics',
  ];
  for (const row of rows) if (!text.includes(`${row}\n`)) text += `${row}\n`;
  write(path, text);
}

// Self-clean: the workflow commits only product/audit changes, not this temporary patcher.
fs.rmSync('.github/scripts/apply-invoice-summary-patch.mjs');
fs.rmSync('.github/workflows/apply-invoice-summary-patch.yml');
console.log('invoice_summary_patch_applied');
