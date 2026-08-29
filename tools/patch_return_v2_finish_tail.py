from pathlib import Path

# The main completion patch intentionally stops at the invoice-message legacy text.
# Verify the critical earlier changes landed in the working tree before continuing.
clients=Path('src/app/screens/ClientsView.tsx').read_text()
factures=Path('src/app/screens/FacturesView.tsx').read_text()
api=Path('src/lib/api.ts').read_text()
for marker in ('startClientReturn','submitClientReturn','baseInvoiceRemainingAmount'):
    if marker not in clients: raise SystemExit(f'Clients prepatch missing: {marker}')
if 'returnReceivableBySource' not in factures: raise SystemExit('Factures net due prepatch missing')
if 'i.type === "Retour" ? "payé"' not in api: raise SystemExit('API return status prepatch missing')

# Invoice/message/PDF/receipt patch using smaller, robust replacements.
p=Path('src/app/utils/invoice.ts'); s=p.read_text()
s=s.replace('import { invoicePaymentEvents } from "./payments";','import { invoicePaidAmount, invoicePaymentEvents } from "./payments";',1)
s=s.replace('''  if (isReturn) {
    return `*AVOIR DE RETOUR ${inv.id}*''','''  if (isReturn) {
    const refund=Number(inv.returnRefundAmount ?? invoicePaidAmount(inv));
    const receivable=Number(inv.returnReceivableReduction ?? 0);
    const restored=Number(inv.returnCreditRestore ?? 0);
    return `*AVOIR DE RETOUR ${inv.id}*''',1)
s=s.replace('''      `\\n↩️ Montant remboursé: ${fmt(inv.montant)}\\n` +
      (inv.paymentMethod ? `💳 Mode de remboursement: ${inv.paymentMethod}\\n` : "") +
      `📅 ${inv.date}\\nCet avoir atteste du retour de marchandise et du remboursement associé.`;''','''      `\\n↩️ Valeur de l'avoir: ${fmt(inv.montant)}\\n` +
      (refund>0 ? `💸 Remboursé: ${fmt(refund)}\\n` : "") +
      (receivable>0 ? `🧾 Créance annulée: ${fmt(receivable)}\\n` : "") +
      (restored>0 ? `🎟️ Avoir client restauré: ${fmt(restored)}\\n` : "") +
      (refund>0 && inv.paymentMethod ? `💳 Mode de remboursement: ${inv.paymentMethod}\\n` : "") +
      `📅 ${inv.date}\\nCet avoir atteste du retour de marchandise et de son règlement comptable.`;''',1)
# First 'reste' after buildInvoicePDFHtml only.
pdf_start=s.index('export function buildInvoicePDFHtml')
pos=s.index('  const reste = Math.max(0, inv.montant - inv.acompte);',pdf_start)
s=s[:pos]+'''  const reste = isReturn ? 0 : Math.max(0, inv.montant - inv.acompte);
  const returnRefund = isReturn ? Number(inv.returnRefundAmount ?? invoicePaidAmount(inv)) : 0;
  const returnReceivable = isReturn ? Number(inv.returnReceivableReduction ?? 0) : 0;
  const returnCredit = isReturn ? Number(inv.returnCreditRestore ?? 0) : 0;'''+s[pos+len('  const reste = Math.max(0, inv.montant - inv.acompte);'):]
s=s.replace('${isReturn ? "Montant remboursé" : "Total facture"}','${isReturn ? "Valeur de l\'avoir" : "Total facture"}',1)
needle='''      ${!isReturn && inv.acompte > 0 ? `<div class="totals-row" style="margin-top:4px;"><span>Total encaissé</span><span>${fmtF(inv.acompte)}</span></div>` : ""}'''
if needle not in s: raise SystemExit('PDF settlement insertion point missing')
s=s.replace(needle,needle+'''\n      ${isReturn && returnRefund>0 ? `<div class="totals-row" style="margin-top:4px;"><span>Remboursé</span><span>${fmtF(returnRefund)}</span></div>` : ""}
      ${isReturn && returnReceivable>0 ? `<div class="totals-row"><span>Créance annulée</span><span>${fmtF(returnReceivable)}</span></div>` : ""}
      ${isReturn && returnCredit>0 ? `<div class="totals-row"><span>Avoir client restauré</span><span>${fmtF(returnCredit)}</span></div>` : ""}''',1)
s=s.replace('${isReturn ? "Mode de remboursement" : paymentRows.length > 1 ? "Modes de paiement" : "Mode de paiement"}','${isReturn ? "Remboursement effectué" : paymentRows.length > 1 ? "Modes de paiement" : "Mode de paiement"}',1)
s=s.replace("Ce document atteste d'un retour de marchandise (avoir). Conservez-le pour vos archives.","Ce document atteste du retour et de son règlement : remboursement, annulation de créance et/ou restauration d'avoir client selon le cas. Conservez-le pour vos archives.",1)

receipt_start=s.index('export function buildReceiptHtml')
old='''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = Math.max(0, inv.montant - inv.acompte);'''
new='''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = isReturn ? 0 : Math.max(0, inv.montant - inv.acompte);
  const returnRefund = isReturn ? Number(inv.returnRefundAmount ?? invoicePaidAmount(inv)) : 0;
  const returnReceivable = isReturn ? Number(inv.returnReceivableReduction ?? 0) : 0;
  const returnCredit = isReturn ? Number(inv.returnCreditRestore ?? 0) : 0;'''
if old not in s[receipt_start:]: raise SystemExit('Receipt header missing')
s=s[:receipt_start]+s[receipt_start:].replace(old,new,1)
# Only receipt title occurrence after receipt start.
a=s[:receipt_start]; b=s[receipt_start:]
b=b.replace('<title>Ticket ${inv.id}</title>','<title>${isReturn ? "Avoir de retour" : "Ticket"} ${inv.id}</title>',1)
b=b.replace('>RETOUR / AVOIR</div>','>AVOIR DE RETOUR</div>',1)
b=b.replace('''<div class="row"><span class="label">Commande</span><span class="value">${saleDateLabel}</span></div>''','''<div class="row"><span class="label">${isReturn ? "Retour" : "Commande"}</span><span class="value">${saleDateLabel}</span></div>
${isReturn && inv.returnOfInvoiceId ? `<div class="row"><span class="label">Facture source</span><span class="value">${inv.returnOfInvoiceId}</span></div>` : ""}''',1)
b=b.replace('${isReturn ? "TOTAL REMBOURSÉ" : "TOTAL"}','${isReturn ? "VALEUR DE L\'AVOIR" : "TOTAL"}',1)
old_ret='''  ${isReturn ? `
  <div class="row">
    <span class="label">Montant remboursé</span>
    <span class="value">${fnum(inv.montant)}&nbsp;F</span>
  </div>
  ${inv.paymentMethod ? `<div class="row"><span class="label">Mode de remboursement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;">
    <span class="status">RETOUR</span>
  </div>
  ` : `'''
new_ret='''  ${isReturn ? `
  ${returnRefund>0?`<div class="row"><span class="label">Remboursé</span><span class="value">${fnum(returnRefund)}&nbsp;F</span></div>`:""}
  ${returnReceivable>0?`<div class="row"><span class="label">Créance annulée</span><span class="value">${fnum(returnReceivable)}&nbsp;F</span></div>`:""}
  ${returnCredit>0?`<div class="row"><span class="label">Avoir client restauré</span><span class="value">${fnum(returnCredit)}&nbsp;F</span></div>`:""}
  ${returnRefund>0&&inv.paymentMethod ? `<div class="row"><span class="label">Mode de remboursement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;"><span class="status">AVOIR</span></div>
  ` : `'''
if old_ret not in b: raise SystemExit('Receipt settlement block missing')
b=b.replace(old_ret,new_ret,1)
s=a+b
p.write_text(s)

# Rapport: authoritative server FIFO margin, including returns on their return date.
p=Path('src/app/screens/RapportView.tsx'); s=p.read_text()
s=s.replace('import React, { useMemo, useState } from "react";','import React, { useEffect, useMemo, useState } from "react";',1)
s=s.replace('import { invBadge, lineDispQty, lineDispUnit, lineTotal, filterByPeriod, invoiceMargin, supplierBalance } from "../utils/inventory";','import { invBadge, lineDispQty, lineDispUnit, lineTotal, filterByPeriod, supplierBalance } from "../utils/inventory";',1)
s=s.replace('import { filterPaymentEventsByPeriod, formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";','import { filterPaymentEventsByPeriod, formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";\nimport { getFifoRealizedMargin, type FifoRealizedMarginReport } from "../../lib/inventoryApi";',1)
s=s.replace('  const { entries, products } = boutique;','  const { entries } = boutique;',1)
s=s.replace('''  const [exportModal, setExportModal] = useState<"summary"|"full"|null>(null);''','''  const [exportModal, setExportModal] = useState<"summary"|"full"|null>(null);
  const [serverMargin, setServerMargin] = useState<FifoRealizedMarginReport|null>(null);
  const [marginLoading, setMarginLoading] = useState(false);''',1)
old='''  // Product margin (sale price − FIFO cost of goods), returns counted negatively.
  // Only computed/shown for users with the "Voir les marges" right.
  const margeVentesData = filtInv.reduce((acc,inv)=>{
    const m = invoiceMargin(inv, entries, products);
    if (m.hasData) { acc.marge += m.marge; acc.ca += m.ca; acc.cost += m.cost; acc.has = true; }
    return acc;
  }, { marge:0, ca:0, cost:0, has:false });
  const margeVentes    = margeVentesData.marge;
  const tauxMargeVentes= margeVentesData.ca !== 0 ? Math.round(margeVentes/Math.abs(margeVentesData.ca)*100) : 0;
  const resultatApresCharges = margeVentes - chargesExploitation;'''
new='''  const marginPeriod = useMemo(() => {
    const now=new Date(); let from:Date; let to=new Date(now.getTime()+1);
    if(period==="jour"){from=new Date(now);from.setHours(0,0,0,0);}
    else if(period==="semaine"){from=new Date(now);from.setDate(now.getDate()-7);}
    else if(period==="mois"){from=new Date(now.getFullYear(),now.getMonth(),1);}
    else if(period==="annee"){from=new Date(now.getFullYear(),0,1);}
    else {from=customFrom?new Date(`${customFrom}T00:00:00`):new Date(now);to=customTo?new Date(`${customTo}T23:59:59.999`):to;}
    return {fromAt:from.toISOString(),toAt:to.toISOString()};
  },[period,customFrom,customTo]);
  useEffect(()=>{
    let cancelled=false;
    if(!canSeeMargin){setServerMargin(null);return ()=>{cancelled=true;};}
    setMarginLoading(true);
    void getFifoRealizedMargin({boutiqueId:boutique.id,...marginPeriod})
      .then(report=>{if(!cancelled)setServerMargin(report);})
      .catch(error=>{console.warn("Marge FIFO serveur indisponible",error);if(!cancelled)setServerMargin(null);})
      .finally(()=>{if(!cancelled)setMarginLoading(false);});
    return ()=>{cancelled=true;};
  },[boutique.id,canSeeMargin,marginPeriod.fromAt,marginPeriod.toAt]);
  const margeVentesData={marge:serverMargin?.realizedMargin??0,ca:serverMargin?.revenue??0,cost:serverMargin?.fifoCost??0,has:!!serverMargin};
  const margeVentes=margeVentesData.marge;
  const tauxMargeVentes=serverMargin?.marginRate??0;
  const resultatApresCharges=margeVentes-chargesExploitation;
  const marginCoverageWarning=canSeeMargin&&serverMargin&&(serverMargin.coverageRate<99.99||serverMargin.unmatchedLines>0)
    ? `Couverture FIFO ${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(serverMargin.coverageRate)} % · ${serverMargin.unmatchedLines} ligne(s) sans coût fiable`
    : null;'''
if old not in s: raise SystemExit('Rapport legacy margin block missing')
s=s.replace(old,new,1)
s=s.replace('''<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${formatPreciseDateTime(new Date().toISOString())}</div>''','''<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${formatPreciseDateTime(new Date().toISOString())}</div>
${marginCoverageWarning?`<div style="padding:8px 10px;background:#fffbeb;color:#92400e;border-radius:8px;margin-bottom:12px;font-weight:700">${marginCoverageWarning}</div>`:""}''',1)
p.write_text(s)

# Stock: explicit archive/unarchive instead of physical deletion.
p=Path('src/app/screens/StockView.tsx'); s=p.read_text()
s=s.replace('import { correctSupplierReceipt, createProduct, recordStockMovement, updateProduct } from "../../lib/api";','import { correctSupplierReceipt, createProduct, recordStockMovement, setProductActive, updateProduct } from "../../lib/api";',1)
marker='  const filtered = products.filter(p => {'
if marker not in s: raise SystemExit('Stock filter marker missing')
s=s.replace(marker,'''  async function toggleProductArchive() {
    if (!detail) return;
    const next=detail.actif===false;
    try {
      await setProductActive({boutiqueId:boutique.id,productId:detail.id,active:next});
      const updated={...detail,actif:next};
      onUpdate({products:products.map(product=>product.id===detail.id?updated:product)}); setDetail(updated);
      logAction(next?"Produit réactivé":"Produit archivé",detail.nom,next?"♻️":"📦");
    } catch(error){alert(error instanceof Error?error.message:"Archivage impossible");}
  }

'''+marker,1)
needle='<button onClick={()=>{setEditNom(detail.nom);setEditCat(detail.categorie??"");setEditPrixAchat(String(detail.prixAchat??0));setEditingProduct(true);}}'
if needle in s:
    s=s.replace(needle,'''<button onClick={()=>void toggleProductArchive()} className="px-3 py-2 rounded-xl text-xs font-black" style={{background:detail.actif===false?"#f0fdf4":"#f3f4f6",color:detail.actif===false?"#166534":"#6b7280"}}>{detail.actif===false?"Réactiver":"Archiver"}</button>
              '''+needle,1)
p.write_text(s)

# Build-time safeguards.
checks={
 'src/app/screens/ClientsView.tsx':['submitClientReturn','clientReturnInv','invoiceHasReturnable'],
 'src/app/screens/FacturesView.tsx':['returnReceivableBySource','baseInvoiceRemainingAmount'],
 'src/app/utils/invoice.ts':['returnReceivable','Avoir client restauré'],
 'src/app/screens/RapportView.tsx':['getFifoRealizedMargin','serverMargin'],
 'src/lib/api.ts':['setProductActive','i.type === "Retour" ? "payé"'],
}
for file,markers in checks.items():
    text=Path(file).read_text()
    for marker in markers:
        if marker not in text: raise SystemExit(f'{file}: missing {marker}')
