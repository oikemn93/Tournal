from pathlib import Path
import re

# 1) Inventory API: per-invoice FIFO margin RPC.
p=Path('src/lib/inventoryApi.ts'); s=p.read_text()
needle='export async function getFifoRealizedMargin(params: { boutiqueId: string; fromAt: string; toAt: string }): Promise<FifoRealizedMarginReport> {'
if needle not in s: raise SystemExit('inventory API anchor missing')
insert='''export async function getFifoInvoiceMargin(params: { boutiqueId: string; invoiceId: string }): Promise<FifoRealizedMarginReport> {\n  return normalizeMarginReport(await rpc<any>("get_fifo_invoice_margin", { p_boutique_id: params.boutiqueId, p_invoice_id: params.invoiceId }));\n}\n\n'''
s=s.replace(needle,insert+needle,1); p.write_text(s)

# 2) Client invoice modal: internal realized FIFO margin, permission-gated.
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
imp='import { POSView as EmbeddedClientPOSView } from "./POSView";'
s=s.replace(imp,imp+'\nimport { getFifoInvoiceMargin, type FifoRealizedMarginReport } from "../../lib/inventoryApi";',1)
anchor='  const [viewedInvoice, setViewedInvoice] = useState<Invoice|null>(null);'
s=s.replace(anchor,anchor+'\n  const [viewedInvoiceMargin, setViewedInvoiceMargin] = useState<FifoRealizedMarginReport|null>(null);\n  const [viewedInvoiceMarginLoading, setViewedInvoiceMarginLoading] = useState(false);',1)
anchor2='  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);'
block='''  const marginAssignment = currentUser.assignments.find(assignment => assignment.boutiqueId === boutique.id);\n  const canSeeMargin = currentUser.isSuperAdmin || !!marginAssignment?.droits?.marges;\n  useEffect(() => {\n    let cancelled = false;\n    if (!viewedInvoice || !canSeeMargin || viewedInvoice.type.toLowerCase() === "retour" || viewedInvoice.status === "annulée" || invoicePaidAmount(viewedInvoice) <= 0) {\n      setViewedInvoiceMargin(null);\n      setViewedInvoiceMarginLoading(false);\n      return () => { cancelled = true; };\n    }\n    setViewedInvoiceMarginLoading(true);\n    void getFifoInvoiceMargin({ boutiqueId:boutique.id, invoiceId:viewedInvoice.id })\n      .then(report => { if (!cancelled) setViewedInvoiceMargin(report); })\n      .catch(error => { console.warn("Marge FIFO facture indisponible", error); if (!cancelled) setViewedInvoiceMargin(null); })\n      .finally(() => { if (!cancelled) setViewedInvoiceMarginLoading(false); });\n    return () => { cancelled = true; };\n  }, [boutique.id, viewedInvoice?.id, viewedInvoice?.status, viewedInvoice?.acompte, canSeeMargin]);\n'''
s=s.replace(anchor2,block+anchor2,1)
modal_anchor='''          <div className="space-y-2">{(viewedInvoice.lines ?? []).map((line,index)=><div key={index} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs"><div><p className="font-bold">{line.nom}</p><p className="text-muted-foreground">{line.sellQty ?? line.qty} {line.sellUnit ?? line.unit}</p></div><p className="font-black">{fmt((line.sellQty ?? line.qty) * line.prixUnit)}</p></div>)}</div>'''
margin_ui='''          {canSeeMargin && viewedInvoice.type.toLowerCase() !== "retour" && viewedInvoice.status !== "annulée" && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">\n            <p className="text-[10px] font-black tracking-wider text-emerald-800">RENTABILITÉ INTERNE · FIFO</p>\n            {invoicePaidAmount(viewedInvoice) <= 0 ? <p className="mt-1 text-xs text-emerald-900/70">La marge réalisée sera disponible après la première sortie de stock.</p> : viewedInvoiceMarginLoading ? <p className="mt-1 text-xs text-emerald-900/70">Calcul de la marge…</p> : viewedInvoiceMargin ? <div className="mt-2 grid grid-cols-3 gap-2 text-center">\n              <div className="rounded-xl bg-white/70 p-2"><p className="text-[10px] text-muted-foreground">COÛT FIFO</p><p className="text-sm font-black">{fmt(viewedInvoiceMargin.fifoCost)}</p></div>\n              <div className="rounded-xl bg-white/70 p-2"><p className="text-[10px] text-muted-foreground">MARGE RÉALISÉE</p><p className={`text-sm font-black ${viewedInvoiceMargin.realizedMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(viewedInvoiceMargin.realizedMargin)}</p></div>\n              <div className="rounded-xl bg-white/70 p-2"><p className="text-[10px] text-muted-foreground">TAUX DE MARQUE</p><p className={`text-sm font-black ${viewedInvoiceMargin.realizedMargin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(viewedInvoiceMargin.marginRate)} %</p></div>\n              {viewedInvoiceMargin.unmatchedLines > 0 && <p className="col-span-3 text-[10px] font-bold text-amber-700">Couverture FIFO {new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(viewedInvoiceMargin.coverageRate)} % · {viewedInvoiceMargin.unmatchedLines} ligne(s) à rapprocher</p>}\n            </div> : <p className="mt-1 text-xs text-amber-700">Marge FIFO indisponible pour cette facture.</p>}\n          </div>}\n'''
if modal_anchor not in s: raise SystemExit('client modal anchor missing')
s=s.replace(modal_anchor,modal_anchor+'\n'+margin_ui,1)

# Remove optimistic stock deduction on client advance: backend + realtime are authoritative.
s=re.sub(r'''        const stockEntries = result\.stock_deducted\n          \? \(invoice\.lines \?\? \[\]\)\.map\(\(line, index\) => \(\{.*?\n          : \[\];\n''','',s,flags=re.S)
s=s.replace('          ...(stockEntries.length ? { entries:[...entries, ...stockEntries] } : {}),\n','',1)
p.write_text(s)

# 3) POS express: never add a second synthetic stock movement locally.
p=Path('src/app/screens/POSView.tsx'); s=p.read_text()
s=re.sub(r'''      const saleEntries: StockEntry\[\] = paid\.stock_deducted\n        \? \[\{.*?\n        : \[\];\n''','',s,flags=re.S)
s=s.replace('        ...(saleEntries.length ? { entries:[...entries, ...saleEntries] } : {}),\n','',1)
p.write_text(s)

# 4) Factures: same rule for payment, creation-with-payment and returns.
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
s=s.replace('    let saleEntries: StockEntry[] = [];\n','',1)
s=re.sub(r'''      if \(persisted\.stock_deducted\) \{\n        saleEntries = \(encaissInv\.lines \?\? \[\]\)\.map\(\(line, index\) => \(\{.*?\n        \}\n''','',s,flags=re.S)
s=s.replace('      ...(saleEntries.length ? { entries: [...entries, ...saleEntries] } : {}),\n','',1)
s=re.sub(r'''    const saleEntries: StockEntry\[\] = initialPayment\?\.stock_deducted\n      \? lines\.map\(\(line,index\)=>\(\{.*?\n      : \[\];\n''','',s,flags=re.S)
s=s.replace('      ...(saleEntries.length ? { entries:[...entries,...saleEntries] } : {}),\n','',1)
# Returns are persisted by return_sale too; avoid the same temporary double increment.
s=re.sub(r'''    // Restore stock\n    const restoreEntries: StockEntry\[\] = returnLines\.map\(\(l,i\) => \(\{.*?\n    \}\)\);\n    onUpdate\(\{ invoices: \[\.\.\.invoices, retInv\], entries: \[\.\.\.entries, \.\.\.restoreEntries\] \}\);''','    // Stock restoration is persisted by return_sale and arrives through realtime.\n    onUpdate({ invoices: [...invoices, retInv] });',s,flags=re.S)
p.write_text(s)
