from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

# API client: expose the atomic multi-payment RPC.
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
anchor = '''export async function recordPayment(params: { boutiqueId:string; invoiceId:string; amount:number; paymentMethod:string }) {
  return dataRequest<{ invoice_id:string; acompte:number; applied_amount:number; status:string; stock_deducted:boolean; payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" } }>("rpc/record_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_invoice_id:params.invoiceId, p_idempotency_key:crypto.randomUUID(), p_amount:params.amount, p_payment_method:params.paymentMethod }),
  });
}
'''
addition = anchor + '''
export async function recordMultiPayment(params: { boutiqueId:string; invoiceId:string; payments:Array<{amount:number;paymentMethod:string}> }) {
  return dataRequest<{ invoice_id:string; acompte:number; applied_amount:number; status:string; stock_deducted:boolean; batch_id:string; payments:Array<{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" }> }>("rpc/record_multi_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_payments:params.payments,
    }),
  });
}
'''
if 'export async function recordMultiPayment' not in api:
    api = replace_once(api, anchor, addition, 'recordMultiPayment API')
api_path.write_text(api)

# Factures: one atomic call, preserve current chips UX, auto-fill the unallocated remainder.
f_path = Path('src/app/screens/FacturesView.tsx')
f = f_path.read_text()
f = replace_once(
    f,
    'import { createSale, recordPayment, returnSale, openCaisseSession, closeCaisseSession } from "../../lib/api";',
    'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession } from "../../lib/api";',
    'recordMultiPayment import',
)
old_submit = '''  async function submitEncaiss() {
    if (!canCollectPayment || !encaissInv || submittingPayment) return;
    const validSplit = encaissSplit.filter(s => s.amount > 0);
    const totalSplit = validSplit.reduce((s, e) => s + e.amount, 0);
    if (validSplit.length === 0 || totalSplit <= 0) return;
    setSubmittingPayment(true);
    let updatedInv: Invoice = { ...encaissInv };
    let saleEntries: StockEntry[] = [];
    try {
      for (const entry of validSplit) {
        const persisted = await recordPayment({ boutiqueId:boutique.id, invoiceId:encaissInv.id, amount:entry.amount, paymentMethod:entry.method });
        const newStatus: InvoiceStatus = persisted.status === "payée" ? "payé" : "acompte";
        updatedInv = {
          ...updatedInv,
          acompte:persisted.acompte,
          status:newStatus,
          paymentMethod:entry.method,
          paymentSplit:validSplit,
          payments:[...(updatedInv.payments ?? []), {
            id:persisted.payment.id,
            amount:persisted.payment.amount,
            paymentMethod:persisted.payment.payment_method as PaymentMethod,
            paidAt:persisted.payment.paid_at,
            operatorId:persisted.payment.operator_id,
            operatorName:persisted.payment.operator_name,
            batchId:persisted.payment.batch_id,
            source:persisted.payment.source,
          }],
        };
        if (persisted.stock_deducted && saleEntries.length === 0) {
          saleEntries = (encaissInv.lines ?? []).map((line, index) => ({
            id: Date.now() + index,
            productId: line.productId,
            qty: -line.qty,
            unit: line.unit,
            montantDu: 0,
            date: today(),
            fournisseur: `Vente ${encaissInv.id}`,
            invoiceId: encaissInv.id,
          }));
        }
      }
    } catch (error) {
      setSubmittingPayment(false);
      alert(error instanceof Error ? error.message : "Encaissement impossible");
      return;
    }
    onUpdate({
      invoices: invoices.map(i => i.id === encaissInv.id ? updatedInv : i),
      ...(saleEntries.length ? { entries: [...entries, ...saleEntries] } : {}),
    });
    const methodLabel = validSplit.length > 1
      ? validSplit.map(s => `${PM_ICON[s.method]} ${fmt(s.amount)}`).join(" + ")
      : `${validSplit[0].method}`;
    logAction("Encaissement", `${encaissInv.id} · +${fmt(totalSplit)} · ${methodLabel}`, "💵");
    setTimeout(() => agentPrint(buildReceiptHtml(updatedInv, boutique, currentUser.nom)), 200);
    setEncaissDone(true);
    setTimeout(() => { setEncaissInv(null); setEncaissSplit([{ method:"Espèces", amount:0 }]); setEncaissDone(false); setSubmittingPayment(false); }, 1400);
  }
'''
new_submit = '''  async function submitEncaiss() {
    if (!canCollectPayment || !encaissInv || submittingPayment) return;
    const validSplit = encaissSplit.filter(s => s.amount > 0);
    const totalSplit = validSplit.reduce((s, e) => s + e.amount, 0);
    if (validSplit.length === 0 || totalSplit <= 0) return;
    if (totalSplit > invoiceRemainingAmount(encaissInv)) {
      alert("Le total des paiements dépasse le reste à encaisser.");
      return;
    }
    setSubmittingPayment(true);
    let updatedInv: Invoice = { ...encaissInv };
    let saleEntries: StockEntry[] = [];
    try {
      const persisted = await recordMultiPayment({
        boutiqueId:boutique.id,
        invoiceId:encaissInv.id,
        payments:validSplit.map(entry => ({ amount:entry.amount, paymentMethod:entry.method })),
      });
      const newPayments = persisted.payments.map(payment => ({
        id:payment.id,
        amount:payment.amount,
        paymentMethod:payment.payment_method as PaymentMethod,
        paidAt:payment.paid_at,
        operatorId:payment.operator_id,
        operatorName:payment.operator_name,
        batchId:payment.batch_id,
        source:payment.source,
      }));
      updatedInv = {
        ...updatedInv,
        acompte:persisted.acompte,
        status:persisted.status === "payée" ? "payé" : "acompte",
        paymentMethod:validSplit[validSplit.length - 1].method,
        paymentSplit:validSplit,
        payments:[...(updatedInv.payments ?? []), ...newPayments],
      };
      if (persisted.stock_deducted) {
        saleEntries = (encaissInv.lines ?? []).map((line, index) => ({
          id: Date.now() + index,
          productId: line.productId,
          qty: -line.qty,
          unit: line.unit,
          montantDu: 0,
          date: today(),
          fournisseur: `Vente ${encaissInv.id}`,
          invoiceId: encaissInv.id,
        }));
      }
    } catch (error) {
      setSubmittingPayment(false);
      alert(error instanceof Error ? error.message : "Encaissement impossible");
      return;
    }
    onUpdate({
      invoices: invoices.map(i => i.id === encaissInv.id ? updatedInv : i),
      ...(saleEntries.length ? { entries: [...entries, ...saleEntries] } : {}),
    });
    const methodLabel = validSplit.length > 1
      ? validSplit.map(s => `${PM_ICON[s.method]} ${fmt(s.amount)}`).join(" + ")
      : `${validSplit[0].method}`;
    logAction("Encaissement", `${encaissInv.id} · +${fmt(totalSplit)} · ${methodLabel}`, "💵");
    setTimeout(() => agentPrint(buildReceiptHtml(updatedInv, boutique, currentUser.nom)), 200);
    setEncaissDone(true);
    setTimeout(() => { setEncaissInv(null); setEncaissSplit([{ method:"Espèces", amount:0 }]); setEncaissDone(false); setSubmittingPayment(false); }, 1400);
  }
'''
f = replace_once(f, old_submit, new_submit, 'atomic submitEncaiss')

old_add = '''              <button type="button" onClick={()=>setEncaissSplit(prev=>[...prev, {method:"Espèces", amount:0}])}
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl"
                style={{background:SEM.success.bg, color:SEM.success.accent}}>
                <PlusCircle size={12}/> Ajouter
              </button>'''
new_add = '''              <button type="button"
                disabled={encaissSplit.reduce((sum,item)=>sum+item.amount,0) >= invoiceRemainingAmount(encaissInv)}
                onClick={()=>setEncaissSplit(prev=>{
                  const allocated = prev.reduce((sum,item)=>sum+item.amount,0);
                  const remaining = Math.max(0, invoiceRemainingAmount(encaissInv) - allocated);
                  if (remaining <= 0) return prev;
                  const method = PAYMENT_METHODS.find(m=>!prev.some(item=>item.method===m)) ?? "Espèces";
                  return [...prev, {method, amount:remaining}];
                })}
                className="flex items-center gap-1.5 text-sm font-black px-3.5 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                style={{background:SEM.success.bg, color:SEM.success.accent}}>
                <PlusCircle size={15}/> Ajouter un paiement
              </button>'''
f = replace_once(f, old_add, new_add, 'larger remaining-aware add payment')
f_path.write_text(f)

print('Atomic multipayment frontend patched successfully')
