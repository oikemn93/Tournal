import fs from 'node:fs';

const initialSql = fs.readFileSync('.github/audit/replay-migrations/20260906133509_invoice_summary_and_targeted_lines.sql','utf8');
const compatSql = fs.readFileSync('.github/audit/replay-migrations/20260906133711_retain_registered_invoice_lines_in_summary.sql','utf8');
const metricsSql = fs.readFileSync('.github/audit/replay-migrations/20260906134120_recent_sale_metrics.sql','utf8');
const api = fs.readFileSync('src/lib/api.ts','utf8');
const factures = fs.readFileSync('src/app/screens/FacturesView.tsx','utf8');
const pos = fs.readFileSync('src/app/screens/POSView.tsx','utf8');
const sales = fs.readFileSync('src/app/utils/sales.ts','utf8');
const types = fs.readFileSync('src/app/types.ts','utf8');

for (const token of [
  'private.read_bounded_invoice_summaries',
  'public.read_bounded_invoice_summaries',
  'private.read_invoice_lines',
  'public.read_invoice_lines',
  'cardinality(p_invoice_ids) > 50',
  "case when v_can_view_margin then l.prix_achat else null::numeric end",
  'revoke all on function public.read_invoice_lines(text, text[]) from public, anon',
]) {
  if (!initialSql.includes(token)) throw new Error(`missing invoice summary/detail SQL contract: ${token}`);
}
if (!compatSql.includes("i.client_id is not null") || !compatSql.includes("'line_count'")) {
  throw new Error('registered-client line compatibility or line_count missing');
}
for (const token of ['private.read_recent_sale_metrics','public.read_recent_sale_metrics','distinct on (product_id,sale_unit)','count(distinct invoice_id)::integer']) {
  if (!metricsSql.includes(token)) throw new Error(`missing compact sale metrics contract: ${token}`);
}
if (!api.includes('dataRpc<any[]>("read_bounded_invoice_summaries"')) throw new Error('bootstrap must use invoice summaries');
if (!api.includes('dataRpc<any>("read_recent_sale_metrics"')) throw new Error('bootstrap must fetch compact sale metrics');
if (!api.includes('dataRpc<any[]>("read_invoice_lines"')) throw new Error('targeted invoice hydration RPC missing');
if (!api.includes('lineCount:Number(i.line_count ?? (i.invoice_lines ?? []).length)')) throw new Error('invoice summary lineCount mapping missing');
if (!types.includes('lineCount?: number') || !types.includes('salePriceHints?: SalePriceHint[]') || !types.includes('productSaleCounts?: Record<number, number>')) throw new Error('summary metadata types missing');
if (!factures.includes('async function hydrateInvoice(inv: Invoice)') || !factures.includes('await loadInvoiceLines(boutique.id, inv.id)')) throw new Error('Factures hydration cache missing');
if (!factures.includes('void openInvoicePayment(inv)') || !factures.includes('void openInvoiceShare(inv)')) throw new Error('Factures direct line-dependent actions must hydrate first');
if (!pos.includes('boutique.productSaleCounts?.[p.id]')) throw new Error('POS bestseller compact metric missing');
if (!sales.includes('hints: SalePriceHint[] = []') || !sales.includes('hint.invoiceDate > best.at')) throw new Error('last-sale price hint fallback missing');
if (factures.includes('setEncaissInv(inv);setEncaissSplit') || factures.includes('setShareInv(inv);')) throw new Error('counter invoice action bypasses hydration');

console.log('invoice_summary_contract_ok');
