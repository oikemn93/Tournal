from pathlib import Path

# --- API snapshot: return docs are always settled documents in UI; preserve active product flag. ---
p=Path('src/lib/api.ts'); s=p.read_text()
s=s.replace('''          status:i.status === "annulée" ? "annulée" : paid >= Number(i.montant) ? "payé" : paid > 0 ? "acompte" : i.status === "en_attente" ? "en attente" : i.status,''',
'''          status:i.status === "annulée" ? "annulée" : i.type === "Retour" ? "payé" : paid >= Number(i.montant) ? "payé" : paid > 0 ? "acompte" : i.status === "en_attente" ? "en attente" : i.status,''',1)
s=s.replace('''products: products.filter(p => p.boutique_id === b.id).map(p => ({ id:p.id, nom:p.nom, img:p.image_url ?? "", unit:p.unit, fournisseur:p.supplier_name ?? "", categorie:categoryById.get(p.category_id)?.nom, prixVente:Number(p.prix_vente ?? 0), prixAchat:Number(p.prix_achat ?? 0) })),''',
'''products: products.filter(p => p.boutique_id === b.id).map(p => ({ id:p.id, nom:p.nom, img:p.image_url ?? "", unit:p.unit, fournisseur:p.supplier_name ?? "", categorie:categoryById.get(p.category_id)?.nom, prixVente:Number(p.prix_vente ?? 0), prixAchat:Number(p.prix_achat ?? 0), actif:p.actif !== false })),''',1)
s=s.replace('''patch.products = products.map(row => ({ id:row.id, nom:row.nom, img:row.image_url ?? "", unit:row.unit, fournisseur:row.supplier_name ?? "", categorie:categoryById.get(row.category_id)?.nom, prixVente:Number(row.prix_vente ?? 0), prixAchat:Number(row.prix_achat ?? 0) }));''',
'''patch.products = products.map(row => ({ id:row.id, nom:row.nom, img:row.image_url ?? "", unit:row.unit, fournisseur:row.supplier_name ?? "", categorie:categoryById.get(row.category_id)?.nom, prixVente:Number(row.prix_vente ?? 0), prixAchat:Number(row.prix_achat ?? 0), actif:row.actif !== false }));''',1)
# Add archive API next to updateProduct.
needle='''export async function updateProduct(params:{ boutiqueId:string; productId:number; name:string; categoryId?:string|null; purchasePrice:number }) {'''
if needle not in s: raise SystemExit('updateProduct anchor missing')
insert='''export async function setProductActive(params:{ boutiqueId:string; productId:number; active:boolean }) {
  const updated = await dataRequest<Array<{ id:number }>>(`products?id=eq.${params.productId}&boutique_id=eq.${encodeURIComponent(params.boutiqueId)}&select=id`, {
    method:"PATCH", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ actif:params.active }),
  });
  if (updated.length !== 1) throw new Error("Archivage refusé ou produit introuvable");
}

'''+needle
s=s.replace(needle,insert,1)
p.write_text(s)

# --- Types: product archive state. ---
p=Path('src/app/types.ts'); s=p.read_text()
s=s.replace('''export type Product    = { id: number; nom: string; img: string; unit: string; fournisseur: string; categorie?: string; couleur?: string; prixVente?: number; prixAchat?: number; alertOk?: number; alertLow?: number };''',
'''export type Product    = { id: number; nom: string; img: string; unit: string; fournisseur: string; categorie?: string; couleur?: string; prixVente?: number; prixAchat?: number; actif?: boolean; alertOk?: number; alertLow?: number };''',1)
p.write_text(s)

# --- Factures: all 'remaining due' UI uses return-aware net receivable. ---
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
s=s.replace('''import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount, invoicePaymentEvents, moneyExceeds, roundMoney } from "../utils/payments";''',
'''import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount as baseInvoiceRemainingAmount, invoicePaymentEvents, moneyExceeds, roundMoney } from "../utils/payments";''',1)
anchor='''  const invoiceHasReturnable = (inv: Invoice) => !!inv.lines && inv.lines.some(l => remainingReturnable(inv, l) > 0);'''
extra=anchor+'''\n  const returnReceivableBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const credit of invoices) {
      if (credit.type.toLowerCase() !== "retour" || !credit.returnOfInvoiceId) continue;
      map.set(credit.returnOfInvoiceId, (map.get(credit.returnOfInvoiceId) ?? 0) + Number(credit.returnReceivableReduction ?? 0));
    }
    return map;
  }, [invoices]);
  const invoiceRemainingAmount = (inv: Invoice) => Math.max(0, roundMoney(baseInvoiceRemainingAmount(inv) - (returnReceivableBySource.get(inv.id) ?? 0)));'''
if anchor not in s: raise SystemExit('Factures net due anchor missing')
s=s.replace(anchor,extra,1)
# Remove unused local synthetic return stock block.
start='''    // Restore stock
    const restoreEntries: StockEntry[] = returnLines.map((l,i) => ({
      id: Date.now() + i, productId: l.productId, qty: l.qty, unit: l.unit,
      montantDu: 0, movementType:"retour", date: today(), fournisseur: `Retour ${returnInv.id}`,
    }));
    // return_sale already persisted the stock restoration; realtime refreshes entries.'''
s=s.replace(start,'''    // return_sale already persisted the stock restoration; realtime refreshes entries.''',1)
# Add restored client credit immediately with canonical ID, avoiding a stale balance before realtime.
old='''    onUpdate({ invoices: [...invoices, retInv] });'''
new='''    const restoredAdvance = persisted.credit_restore > 0 && persisted.restored_advance_id && returnInv.clientId != null ? {
      id:Number(persisted.restored_advance_id), clientId:returnInv.clientId, amount:Number(persisted.credit_restore), allocatedAmount:0,
      paymentMethod:"Autre" as PaymentMethod, paidAt:persisted.returned_at, recordedAt:persisted.returned_at,
      operatorId:currentUser.id, operatorName:currentUser.nom, note:`Avoir restauré par ${retId} sur ${returnInv.id}`,
    } : null;
    onUpdate({ invoices: [...invoices, retInv], ...(restoredAdvance ? { clientAdvances:[...(boutique.clientAdvances ?? []),restoredAdvance] } : {}) });'''
if old not in s: raise SystemExit('Factures onUpdate return missing')
s=s.replace(old,new,1)
p.write_text(s)

# --- Clients: native Return v2 + net receivable UI. ---
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
s=s.replace('''import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw } from "lucide-react";''',
'''import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, Minus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw } from "lucide-react";''',1)
s=s.replace('''import type { Boutique, Client, ClientType, Invoice, PaymentMethod, PlatformUser } from "../types";''',
'''import type { Boutique, Client, ClientType, Invoice, InvoiceLine, PaymentMethod, PlatformUser } from "../types";''',1)
s=s.replace('''import { invBadge } from "../utils/inventory";''','''import { invBadge, lineDispQty, lineDispUnit, lineTotal } from "../utils/inventory";''',1)
s=s.replace('''import { PAYMENT_METHODS, PM_ICON } from "../constants";''','''import { PAYMENT_METHODS, PM_ICON, PM_COLOR } from "../constants";''',1)
s=s.replace('''import { applyClientAdvanceFifo, applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, deleteClientIfUnused, recordClientPayment, updateClientContact, updateClientPaymentTerms, updateClientProfile, WHOLESALE_MARKER } from "../../lib/api";''',
'''import { applyClientAdvanceFifo, applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, deleteClientIfUnused, recordClientPayment, returnSale, updateClientContact, updateClientPaymentTerms, updateClientProfile, WHOLESALE_MARKER } from "../../lib/api";''',1)
s=s.replace('''import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";''',
'''import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount as baseInvoiceRemainingAmount, roundMoney } from "../utils/payments";''',1)
state_anchor='''  const [viewedInvoiceMarginLoading, setViewedInvoiceMarginLoading] = useState(false);'''
states=state_anchor+'''\n  const [clientReturnInv, setClientReturnInv] = useState<Invoice|null>(null);
  const [clientReturnQtys, setClientReturnQtys] = useState<Record<number,number>>({});
  const [clientReturnMethod, setClientReturnMethod] = useState<PaymentMethod>("Espèces");
  const [clientReturnBusy, setClientReturnBusy] = useState(false);
  const [clientReturnDone, setClientReturnDone] = useState(false);'''
if state_anchor not in s: raise SystemExit('Clients state anchor missing')
s=s.replace(state_anchor,states,1)
# Inside detail client: derive return maps/net due/helpers and native functions.
anchor='''    const retours = clientInvoices.filter(i=>isReturn(i));'''
block=anchor+'''\n    const returnedBySourceLine = new Map<number,number>();
    const legacyReturnedByProduct = new Map<string,number>();
    const returnReceivableBySource = new Map<string,number>();
    retours.forEach(credit => {
      if (credit.returnOfInvoiceId) returnReceivableBySource.set(credit.returnOfInvoiceId,(returnReceivableBySource.get(credit.returnOfInvoiceId)??0)+Number(credit.returnReceivableReduction??0));
      (credit.lines??[]).forEach(line => {
        if (line.sourceInvoiceLineId != null) returnedBySourceLine.set(line.sourceInvoiceLineId,(returnedBySourceLine.get(line.sourceInvoiceLineId)??0)+Number(line.qty||0));
        else if (credit.returnOfInvoiceId) {
          const key=`${credit.returnOfInvoiceId}::${line.productId}`;
          legacyReturnedByProduct.set(key,(legacyReturnedByProduct.get(key)??0)+Number(line.qty||0));
        }
      });
    });
    const invoiceRemainingAmount = (invoice: Invoice) => Math.max(0,roundMoney(baseInvoiceRemainingAmount(invoice)-(returnReceivableBySource.get(invoice.id)??0)));
    const remainingReturnable = (invoice:Invoice,line:InvoiceLine) => Math.max(0,line.qty-(line.id!=null?(returnedBySourceLine.get(line.id)??0):(legacyReturnedByProduct.get(`${invoice.id}::${line.productId}`)??0)));
    const invoiceHasReturnable = (invoice:Invoice) => !!invoice.lines?.some(line=>remainingReturnable(invoice,line)>0.0005);

    function startClientReturn(invoice:Invoice) {
      if (!invoice.lines?.length || !invoiceHasReturnable(invoice)) return;
      const quantities:Record<number,number>={};
      invoice.lines.forEach((line,index)=>{quantities[index]=remainingReturnable(invoice,line);});
      setClientReturnQtys(quantities); setClientReturnMethod("Espèces"); setClientReturnDone(false); setClientReturnInv(invoice); setViewedInvoice(null);
    }

    async function submitClientReturn() {
      if (!clientReturnInv?.lines || clientReturnBusy) return;
      const returnLines=clientReturnInv.lines.map((line,index)=>{
        const qty=clientReturnQtys[index]??0;
        const proportionalSellQty=line.sellUnit&&line.sellQty!=null&&line.qty>0?line.sellQty*qty/line.qty:undefined;
        return {...line,qty,...(proportionalSellQty!=null?{sellQty:proportionalSellQty}:{})};
      }).filter(line=>line.qty>0);
      if (!returnLines.length) return;
      if (clientReturnInv.lines.some((line,index)=>(clientReturnQtys[index]??0)>remainingReturnable(clientReturnInv,line)+0.0005)) { alert("La quantité retournée dépasse le solde disponible."); return; }
      setClientReturnBusy(true);
      try {
        const persisted=await returnSale({boutiqueId:boutique.id,invoiceId:clientReturnInv.id,refundMethod:clientReturnMethod,lines:returnLines.map(line=>({sourceLineId:line.id,productId:line.productId,qty:line.qty}))});
        const credit:Invoice={
          id:persisted.return_invoice_id,clientId:clientReturnInv.clientId,client:clientReturnInv.client,clientTel:clientReturnInv.clientTel,clientType:clientReturnInv.clientType,
          lines:returnLines.map(line=>({...line,sourceInvoiceLineId:line.id})),montant:Number(persisted.total),acompte:Number(persisted.refund_amount??0),date:today(),dateRaw:persisted.returned_at,status:"payé",type:"Retour",returnOfInvoiceId:clientReturnInv.id,
          creditNoteNumber:persisted.credit_note_number,returnRefundAmount:Number(persisted.refund_amount??0),returnReceivableReduction:Number(persisted.receivable_reduction??0),returnCreditRestore:Number(persisted.credit_restore??0),
          operatorId:currentUser.id,operatorNom:currentUser.nom,operatorColor:currentUser.color,paymentMethod:persisted.refund_method as PaymentMethod|undefined,
          payments:persisted.payment?[{id:persisted.payment.id,amount:persisted.payment.amount,paymentMethod:persisted.payment.payment_method as PaymentMethod,paidAt:persisted.payment.paid_at,operatorId:persisted.payment.operator_id,operatorName:persisted.payment.operator_name,batchId:persisted.payment.batch_id,source:persisted.payment.source}]:[],
        };
        const restoredAdvance=persisted.credit_restore>0&&persisted.restored_advance_id&&clientReturnInv.clientId!=null?{
          id:Number(persisted.restored_advance_id),clientId:clientReturnInv.clientId,amount:Number(persisted.credit_restore),allocatedAmount:0,paymentMethod:"Autre" as PaymentMethod,
          paidAt:persisted.returned_at,recordedAt:persisted.returned_at,operatorId:currentUser.id,operatorName:currentUser.nom,note:`Avoir restauré par ${persisted.return_invoice_id} sur ${clientReturnInv.id}`,
        }:null;
        onUpdate({invoices:[...boutique.invoices,credit],...(restoredAdvance?{clientAdvances:[...(boutique.clientAdvances??[]),restoredAdvance]}:{})});
        logAction("Retour articles",`${persisted.return_invoice_id} ← ${clientReturnInv.id} · ${returnLines.length} ligne(s) · ${fmt(Number(persisted.total))}`,"↩️");
        setClientReturnDone(true);
        setTimeout(()=>{setClientReturnInv(null);setClientReturnDone(false);setClientReturnBusy(false);},1200);
      } catch(error) { setClientReturnBusy(false); alert(error instanceof Error?error.message:"Retour impossible"); }
    }'''
if anchor not in s: raise SystemExit('Clients return helper anchor missing')
s=s.replace(anchor,block,1)
# total outstanding now automatically local helper; status update after FIFO client cash allocation.
s=s.replace('''            status:paid >= invoice.montant ? "payé" : "acompte",''','''            status:invoiceRemainingAmount(invoice)-applied <= 0.01 ? "payé" : "acompte",''',1)
# Button availability and action.
s=s.replace('''              const canReturnInvoice = canReturn && !isReturn && inv.status !== "annulée" && paid > 0 && (inv.lines?.length ?? 0) > 0;''',
'''              const canReturnInvoice = canReturn && !isReturn && inv.status !== "annulée" && paid > 0 && (inv.lines?.length ?? 0) > 0 && invoiceHasReturnable(inv);''',1)
s=s.replace('''{canReturnInvoice&&<button type="button" onClick={()=>onOpenInvoice(inv.id)} className="rounded-lg px-2 py-2 text-[11px] font-black inline-flex items-center gap-1"''',
'''{canReturnInvoice&&<button type="button" onClick={()=>startClientReturn(inv)} className="rounded-lg px-2 py-2 text-[11px] font-black inline-flex items-center gap-1"''',1)
s=s.replace('''{canReturn && viewedInvoice.type.toLowerCase() !== "retour" && viewedInvoice.status !== "annulée" && invoicePaidAmount(viewedInvoice) > 0 && (viewedInvoice.lines?.length ?? 0) > 0 && <button type="button" onClick={()=>{const id=viewedInvoice.id;setViewedInvoice(null);onOpenInvoice(id);}}''',
'''{canReturn && viewedInvoice.type.toLowerCase() !== "retour" && viewedInvoice.status !== "annulée" && invoicePaidAmount(viewedInvoice) > 0 && (viewedInvoice.lines?.length ?? 0) > 0 && invoiceHasReturnable(viewedInvoice) && <button type="button" onClick={()=>startClientReturn(viewedInvoice)}''',1)
# Add source return state to client list content after maturity.
needle='''                  {maturity&&<p className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold" style={{background:maturity.bg,color:maturity.color}}>{maturity.text}</p>}'''
insert=needle+'''\n                  {!isReturn&&retours.some(r=>r.returnOfInvoiceId===inv.id)&&<p className="mt-1 text-[11px] font-black text-red-700">↩ {invoiceHasReturnable(inv)?"Retour partiel":"Retournée intégralement"}</p>}'''
s=s.replace(needle,insert,1)
# Insert native return modal before payment modal.
modal_anchor='''        {paymentModal&&<Modal title="Versement client" color={SEM.success.accent}'''
modal='''        {clientReturnInv&&clientReturnInv.lines&&<Modal title={`Retour · ${clientReturnInv.id}`} color={SEM.danger.accent} onClose={()=>{if(!clientReturnBusy){setClientReturnInv(null);setClientReturnDone(false);}}}>
          <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Sélectionnez les quantités dans l'unité vendue. L'avoir, le stock, la créance et le remboursement sont enregistrés dans une seule transaction.</div>
          <div className="space-y-2">{clientReturnInv.lines.map((line,index)=>{
            const rem=remainingReturnable(clientReturnInv,line); const base=clientReturnQtys[index]??0;
            const step=line.sellQty!=null&&line.sellQty>0&&line.qty>0?line.qty/line.sellQty:1;
            const display=line.sellQty!=null&&line.qty>0?base*line.sellQty/line.qty:base;
            return <div key={line.id??index} className="flex items-center gap-3 rounded-xl bg-muted p-3" style={rem<=0?{opacity:.55}:{}}>
              <div className="flex-1"><p className="text-sm font-bold">{line.nom}</p><p className="text-xs text-muted-foreground">Vendu : {lineDispQty(line)} {lineDispUnit(line)} · {fmt(line.prixUnit)}</p></div>
              <button disabled={base<=0} onClick={()=>setClientReturnQtys(q=>({...q,[index]:Math.max(0,(q[index]??0)-step)}))} className="h-8 w-8 rounded-lg bg-red-100 disabled:opacity-40"><Minus size={12} className="mx-auto text-red-700"/></button>
              <span className="min-w-16 text-center text-xs font-black text-red-700">{new Intl.NumberFormat("fr-FR",{maximumFractionDigits:3}).format(display)} {lineDispUnit(line)}</span>
              <button disabled={base>=rem-0.0005} onClick={()=>setClientReturnQtys(q=>({...q,[index]:Math.min(rem,(q[index]??0)+step)}))} className="h-8 w-8 rounded-lg bg-red-100 disabled:opacity-40"><Plus size={12} className="mx-auto text-red-700"/></button>
            </div>;
          })}</div>
          {(()=>{const value=clientReturnInv.lines!.reduce((sum,line,index)=>{const qty=clientReturnQtys[index]??0;return sum+(line.qty>0?(qty/line.qty)*lineTotal(line):0);},0);return <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3"><span className="text-sm font-black text-red-700">Valeur de l'avoir</span><span className="text-xl font-black text-red-700">{fmt(value)}</span></div>;})()}
          {!clientReturnDone&&<div className="space-y-2"><p className="text-xs font-black text-muted-foreground">MODE DE REMBOURSEMENT SI UN REMBOURSEMENT EST DÛ</p><div className="grid grid-cols-2 gap-2">{PAYMENT_METHODS.map(method=><button key={method} type="button" onClick={()=>setClientReturnMethod(method)} className="rounded-xl px-3 py-3 text-sm font-bold" style={{background:clientReturnMethod===method?(PM_COLOR[method]??"#6b7280")+"18":"#f9fafb",color:clientReturnMethod===method?(PM_COLOR[method]??"#374151"):"#6b7280",border:clientReturnMethod===method?`2px solid ${(PM_COLOR[method]??"#6b7280")}55`:"2px solid transparent"}}>{PM_ICON[method]} {method}</button>)}</div><p className="text-xs text-muted-foreground">Le serveur annule d'abord la créance non encaissée, restaure ensuite un éventuel avoir client, puis rembourse seulement l'argent réellement encaissé.</p></div>}
          {clientReturnDone?<div className="rounded-xl bg-green-50 p-4 text-center text-sm font-black text-green-700">Retour enregistré ✓</div>:<SubmitBtn color={SEM.danger.accent} label={clientReturnBusy?"Enregistrement…":"Confirmer le retour"} onClick={()=>void submitClientReturn()} disabled={clientReturnBusy||!Object.values(clientReturnQtys).some(q=>q>0)}/>} 
        </Modal>}
        {paymentModal&&<Modal title="Versement client" color={SEM.success.accent}'''
if modal_anchor not in s: raise SystemExit('Clients modal insertion anchor missing')
s=s.replace(modal_anchor,modal,1)
p.write_text(s)

# --- Invoice/PDF/receipt: settlement-aware credit note wording. ---
p=Path('src/app/utils/invoice.ts'); s=p.read_text()
# Import paid helper for safe fallback.
s=s.replace('''import { invoicePaymentEvents } from "./payments";''','''import { invoicePaidAmount, invoicePaymentEvents } from "./payments";''',1)
old='''    return `*AVOIR DE RETOUR ${inv.id}* — ${boutique.nom}\n` +
      (inv.returnOfInvoiceId ? `↩️ Retour sur facture ${inv.returnOfInvoiceId}\n` : "") +
      `📋 Client: ${inv.client}\n` +
      (lines ? `\n${lines}\n` : "") +
      `\n↩️ Montant remboursé: ${fmt(inv.montant)}\n` +
      (inv.paymentMethod ? `💳 Mode de remboursement: ${inv.paymentMethod}\n` : "") +
      `📅 ${inv.date}\nCet avoir atteste du retour de marchandise et du remboursement associé.`;'''
new='''    const refund=Number(inv.returnRefundAmount ?? invoicePaidAmount(inv));
    const receivable=Number(inv.returnReceivableReduction ?? 0);
    const restored=Number(inv.returnCreditRestore ?? 0);
    return `*AVOIR DE RETOUR ${inv.id}* — ${boutique.nom}\n` +
      (inv.returnOfInvoiceId ? `↩️ Retour sur facture ${inv.returnOfInvoiceId}\n` : "") +
      `📋 Client: ${inv.client}\n` +
      (lines ? `\n${lines}\n` : "") +
      `\n↩️ Valeur de l'avoir: ${fmt(inv.montant)}\n` +
      (refund>0?`💸 Remboursé: ${fmt(refund)}\n`:"") +
      (receivable>0?`🧾 Créance annulée: ${fmt(receivable)}\n`:"") +
      (restored>0?`🎟️ Avoir client restauré: ${fmt(restored)}\n`:"") +
      (refund>0&&inv.paymentMethod ? `💳 Mode de remboursement: ${inv.paymentMethod}\n` : "") +
      `📅 ${inv.date}\nCet avoir atteste du retour de marchandise et de son règlement comptable.`;'''
if old not in s: raise SystemExit('Invoice message return block missing')
s=s.replace(old,new,1)
s=s.replace('''  const reste = Math.max(0, inv.montant - inv.acompte);''','''  const reste = isReturn ? 0 : Math.max(0, inv.montant - inv.acompte);
  const returnRefund = isReturn ? Number(inv.returnRefundAmount ?? invoicePaidAmount(inv)) : 0;
  const returnReceivable = isReturn ? Number(inv.returnReceivableReduction ?? 0) : 0;
  const returnCredit = isReturn ? Number(inv.returnCreditRestore ?? 0) : 0;''',1)
s=s.replace('''<span class="totals-total-label">${isReturn ? "Montant remboursé" : "Total facture"}</span>
        <span class="totals-total-value">${isReturn ? "- " : ""}${fmtF(inv.montant)}</span>''',
'''<span class="totals-total-label">${isReturn ? "Valeur de l'avoir" : "Total facture"}</span>
        <span class="totals-total-value">${isReturn ? "- " : ""}${fmtF(inv.montant)}</span>''',1)
needle='''      ${!isReturn && inv.acompte > 0 ? `<div class="totals-row" style="margin-top:4px;"><span>Total encaissé</span><span>${fmtF(inv.acompte)}</span></div>` : ""}'''
replacement=needle+'''\n      ${isReturn && returnRefund>0 ? `<div class="totals-row" style="margin-top:4px;"><span>Remboursé</span><span>${fmtF(returnRefund)}</span></div>` : ""}
      ${isReturn && returnReceivable>0 ? `<div class="totals-row"><span>Créance annulée</span><span>${fmtF(returnReceivable)}</span></div>` : ""}
      ${isReturn && returnCredit>0 ? `<div class="totals-row"><span>Avoir client restauré</span><span>${fmtF(returnCredit)}</span></div>` : ""}'''
s=s.replace(needle,replacement,1)
s=s.replace('''<div class="payment-title">${isReturn ? "Mode de remboursement" : paymentRows.length > 1 ? "Modes de paiement" : "Mode de paiement"}</div>''',
'''<div class="payment-title">${isReturn ? "Remboursement effectué" : paymentRows.length > 1 ? "Modes de paiement" : "Mode de paiement"}</div>''',1)
s=s.replace('''${isReturn ? "Ce document atteste d'un retour de marchandise (avoir). Conservez-le pour vos archives." :''',
'''${isReturn ? "Ce document atteste du retour et de son règlement : remboursement, annulation de créance et/ou restauration d'avoir client selon le cas. Conservez-le pour vos archives." :''',1)
# Receipt function: add settlement vars to its first occurrence after isReturn.
receipt_anchor='''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = Math.max(0, inv.montant - inv.acompte);'''
receipt_new='''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = isReturn ? 0 : Math.max(0, inv.montant - inv.acompte);
  const returnRefund = isReturn ? Number(inv.returnRefundAmount ?? invoicePaidAmount(inv)) : 0;
  const returnReceivable = isReturn ? Number(inv.returnReceivableReduction ?? 0) : 0;
  const returnCredit = isReturn ? Number(inv.returnCreditRestore ?? 0) : 0;'''
if receipt_anchor not in s: raise SystemExit('receipt anchor missing')
s=s.replace(receipt_anchor,receipt_new,1)
s=s.replace('''<title>Ticket ${inv.id}</title>''','''<title>${isReturn ? "Avoir de retour" : "Ticket"} ${inv.id}</title>''',1)
s=s.replace('''${isReturn ? `<div class="bold big" style="margin-top:2mm;border:2px solid #000;padding:1mm 2mm;">RETOUR / AVOIR</div>` : ""}''',
'''${isReturn ? `<div class="bold big" style="margin-top:2mm;border:2px solid #000;padding:1mm 2mm;">AVOIR DE RETOUR</div>` : ""}''',1)
s=s.replace('''<div class="row"><span class="label">Commande</span><span class="value">${saleDateLabel}</span></div>''',
'''<div class="row"><span class="label">${isReturn ? "Retour" : "Commande"}</span><span class="value">${saleDateLabel}</span></div>
${isReturn && inv.returnOfInvoiceId ? `<div class="row"><span class="label">Facture source</span><span class="value">${inv.returnOfInvoiceId}</span></div>` : ""}''',1)
s=s.replace('''<span class="label bold">${isReturn ? "TOTAL REMBOURSÉ" : "TOTAL"}</span>''','''<span class="label bold">${isReturn ? "VALEUR DE L'AVOIR" : "TOTAL"}</span>''',1)
old_return='''  ${isReturn ? `
  <div class="row">
    <span class="label">Montant remboursé</span>
    <span class="value">${fnum(inv.montant)}&nbsp;F</span>
  </div>
  ${inv.paymentMethod ? `<div class="row"><span class="label">Mode de remboursement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;">
    <span class="status">RETOUR</span>
  </div>
  ` : `'''
new_return='''  ${isReturn ? `
  ${returnRefund>0?`<div class="row"><span class="label">Remboursé</span><span class="value">${fnum(returnRefund)}&nbsp;F</span></div>`:""}
  ${returnReceivable>0?`<div class="row"><span class="label">Créance annulée</span><span class="value">${fnum(returnReceivable)}&nbsp;F</span></div>`:""}
  ${returnCredit>0?`<div class="row"><span class="label">Avoir client restauré</span><span class="value">${fnum(returnCredit)}&nbsp;F</span></div>`:""}
  ${returnRefund>0&&inv.paymentMethod ? `<div class="row"><span class="label">Mode de remboursement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;"><span class="status">AVOIR</span></div>
  ` : `'''
if old_return not in s: raise SystemExit('receipt return settlement block missing')
s=s.replace(old_return,new_return,1)
p.write_text(s)

# --- Rapport: use authoritative server FIFO margin, including return reversals. ---
p=Path('src/app/screens/RapportView.tsx'); s=p.read_text()
s=s.replace('''import React, { useMemo, useState } from "react";''','''import React, { useEffect, useMemo, useState } from "react";''',1)
s=s.replace('''import { invBadge, lineDispQty, lineDispUnit, lineTotal, filterByPeriod, invoiceMargin, supplierBalance } from "../utils/inventory";''',
'''import { invBadge, lineDispQty, lineDispUnit, lineTotal, filterByPeriod, supplierBalance } from "../utils/inventory";''',1)
s=s.replace('''import { filterPaymentEventsByPeriod, formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";''',
'''import { filterPaymentEventsByPeriod, formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";
import { getFifoRealizedMargin, type FifoRealizedMarginReport } from "../../lib/inventoryApi";''',1)
state='''  const [exportModal, setExportModal] = useState<"summary"|"full"|null>(null);'''
state_new=state+'''\n  const [serverMargin, setServerMargin] = useState<FifoRealizedMarginReport|null>(null);
  const [marginLoading, setMarginLoading] = useState(false);'''
s=s.replace(state,state_new,1)
old_margin='''  // Product margin (sale price − FIFO cost of goods), returns counted negatively.
  // Only computed/shown for users with the "Voir les marges" right.
  const margeVentesData = filtInv.reduce((acc,inv)=>{
    const m = invoiceMargin(inv, entries, products);
    if (m.hasData) { acc.marge += m.marge; acc.ca += m.ca; acc.cost += m.cost; acc.has = true; }
    return acc;
  }, { marge:0, ca:0, cost:0, has:false });
  const margeVentes    = margeVentesData.marge;
  const tauxMargeVentes= margeVentesData.ca !== 0 ? Math.round(margeVentes/Math.abs(margeVentesData.ca)*100) : 0;
  const resultatApresCharges = margeVentes - chargesExploitation;'''
new_margin='''  const marginPeriod = useMemo(() => {
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
  const margeVentesData = { marge:serverMargin?.realizedMargin??0, ca:serverMargin?.revenue??0, cost:serverMargin?.fifoCost??0, has:!!serverMargin };
  const margeVentes=margeVentesData.marge;
  const tauxMargeVentes=serverMargin?.marginRate??0;
  const resultatApresCharges=margeVentes-chargesExploitation;'''
if old_margin not in s: raise SystemExit('Rapport margin block missing')
s=s.replace(old_margin,new_margin,1)
# Add coverage warning before reportPaymentMethods comment.
anchor='''  // Credits are created by an overpayment and become an "Avoir client" payment'''
warn='''  const marginCoverageWarning = canSeeMargin && serverMargin && (serverMargin.coverageRate < 99.99 || serverMargin.unmatchedLines > 0)
    ? `Couverture FIFO ${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(serverMargin.coverageRate)} % · ${serverMargin.unmatchedLines} ligne(s) sans coût fiable`
    : null;

'''+anchor
s=s.replace(anchor,warn,1)
# Add warning text in generated summary just after sub line.
s=s.replace('''<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${formatPreciseDateTime(new Date().toISOString())}</div>''',
'''<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${formatPreciseDateTime(new Date().toISOString())}</div>
${marginCoverageWarning?`<div style="padding:8px 10px;background:#fffbeb;color:#92400e;border-radius:8px;margin-bottom:12px;font-weight:700">${marginCoverageWarning}</div>`:""}''',1)
# prevent stale local product destructuring warning (products no longer used by margin)
s=s.replace('''  const { entries, products } = boutique;''','''  const { entries } = boutique;''',1)
p.write_text(s)

# --- Stock: explicit archive/unarchive rather than deletion. ---
p=Path('src/app/screens/StockView.tsx'); s=p.read_text()
s=s.replace('''import { correctSupplierReceipt, createProduct, recordStockMovement, updateProduct } from "../../lib/api";''',
'''import { correctSupplierReceipt, createProduct, recordStockMovement, setProductActive, updateProduct } from "../../lib/api";''',1)
# Add function after saveProductEdit function block by a stable next marker.
marker='''  const filtered = products.filter(p => {'''
archive='''  async function toggleProductArchive() {
    if (!detail) return;
    const next=detail.actif===false;
    try {
      await setProductActive({boutiqueId:boutique.id,productId:detail.id,active:next});
      const updated={...detail,actif:next};
      onUpdate({products:products.map(product=>product.id===detail.id?updated:product)}); setDetail(updated);
      logAction(next?"Produit réactivé":"Produit archivé",detail.nom,next?"♻️":"📦");
    } catch(error){alert(error instanceof Error?error.message:"Archivage impossible");}
  }

'''+marker
if marker not in s: raise SystemExit('Stock filtered marker missing')
s=s.replace(marker,archive,1)
# Add archive button near edit UI by replacing first edit button title occurrence.
needle='''<button onClick={()=>{setEditNom(detail.nom);setEditCat(detail.categorie??"");setEditPrixAchat(String(detail.prixAchat??0));setEditingProduct(true);}}'''
if needle in s:
    # find containing button closure is hard; add small button immediately before this button.
    s=s.replace(needle,'''<button onClick={()=>void toggleProductArchive()} className="px-3 py-2 rounded-xl text-xs font-black" style={{background:detail.actif===false?"#f0fdf4":"#f3f4f6",color:detail.actif===false?"#166534":"#6b7280"}}>{detail.actif===false?"Réactiver":"Archiver"}</button>\n              '''+needle,1)
p.write_text(s)
