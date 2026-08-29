from pathlib import Path

api = Path('src/lib/api.ts')
text = api.read_text()
text = text.replace(
    'export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{sourceLineId?:number;productId:number;qty:number}>; refundMethod:string }) {',
    'export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{sourceLineId?:number;productId:number;qty:number}>; refundMethod?:string }) {',
)
text = text.replace('p_refund_method:params.refundMethod,', 'p_refund_method:params.refundMethod ?? null,')
marker = 'export async function recordStockMovement('
if 'export async function refundClientAdvance(' not in text:
    insert = '''export async function refundClientAdvance(params:{ boutiqueId:string; clientId:number; amount:number; paymentMethod:string }) {
  return dataRequest<{
    refund_id:number; client_id:number; amount:number; payment_method:string; refunded_at:string;
    operator_id:string; operator_name:string; remaining_credit:number;
    allocations:Array<{advance_id:number;amount:number}>;
  }>("rpc/refund_client_advance", {
    method:"POST",
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_client_id:params.clientId,
      p_amount:normalizeMoney(params.amount),
      p_payment_method:params.paymentMethod,
      p_idempotency_key:crypto.randomUUID(),
    }),
  });
}

'''
    if marker not in text:
        raise SystemExit('api insert marker missing')
    text = text.replace(marker, insert + marker, 1)
api.write_text(text)

clients = Path('src/app/screens/ClientsView.tsx')
text = clients.read_text()
text = text.replace(
    'recordClientPayment, returnSale, updateClientContact',
    'recordClientPayment, refundClientAdvance, returnSale, updateClientContact',
)
text = text.replace('  const [clientReturnMethod, setClientReturnMethod] = useState<PaymentMethod>("Espèces");\n', '')
text = text.replace('setClientReturnQtys(quantities); setClientReturnMethod("Espèces"); setClientReturnDone(false); setClientReturnInv(invoice); setViewedInvoice(null);', 'setClientReturnQtys(quantities); setClientReturnDone(false); setClientReturnInv(invoice); setViewedInvoice(null);')
text = text.replace('invoiceId:clientReturnInv.id,refundMethod:clientReturnMethod,lines:', 'invoiceId:clientReturnInv.id,lines:')

payment_state = '  const [paymentSummary, setPaymentSummary] = useState<{ applied:number; advance:number }|null>(null);\n'
if 'refundCreditModal' not in text:
    extra = '''  const [refundCreditModal, setRefundCreditModal] = useState(false);
  const [refundCreditAmount, setRefundCreditAmount] = useState("");
  const [refundCreditMethod, setRefundCreditMethod] = useState<PaymentMethod>("Espèces");
  const [refundingCredit, setRefundingCredit] = useState(false);
  const [refundCreditDone, setRefundCreditDone] = useState(false);
'''
    if payment_state not in text:
        raise SystemExit('payment state marker missing')
    text = text.replace(payment_state, payment_state + extra, 1)

method_block_start = '          {!clientReturnDone&&<div className="space-y-2"><p className="text-xs font-black text-muted-foreground">MODE DE REMBOURSEMENT SI UN REMBOURSEMENT EST DÛ</p>'
if method_block_start in text:
    start = text.index(method_block_start)
    end_marker = '          {clientReturnDone?'
    end = text.index(end_marker, start)
    replacement = '''          {!clientReturnDone&&<div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{background:SEM.success.bg,color:SEM.success.accent}}>Ce retour ne rembourse pas automatiquement le client. La créance éventuelle est annulée en priorité, puis le solde déjà payé devient un avoir client. Le remboursement de cet avoir se fait séparément depuis la fiche client.</div>}\n'''
    text = text[:start] + replacement + text[end:]

submit_marker = '    async function applyAdvanceToInvoice(invoice: Invoice) {'
if 'async function submitCreditRefund()' not in text:
    fn = '''    async function submitCreditRefund() {
      if (refundingCredit) return;
      const amount = Number(refundCreditAmount) || 0;
      if (amount <= 0 || amount > totalAvoir + 0.01) return;
      setRefundingCredit(true);
      try {
        const result = await refundClientAdvance({ boutiqueId:boutique.id, clientId:c.id, amount, paymentMethod:refundCreditMethod });
        const consumed = new Map<number,number>();
        result.allocations.forEach(item => consumed.set(item.advance_id, (consumed.get(item.advance_id) ?? 0) + item.amount));
        onUpdate({ clientAdvances:(boutique.clientAdvances ?? []).map(advance => ({
          ...advance,
          allocatedAmount:(advance.allocatedAmount ?? 0) + (consumed.get(advance.id) ?? 0),
        })) });
        logAction("Remboursement avoir client", `${c.nom} · ${fmt(result.amount)} · ${result.payment_method}`, "↩️");
        setRefundCreditDone(true);
        setTimeout(()=>{
          setRefundCreditModal(false); setRefundCreditAmount(""); setRefundCreditMethod("Espèces"); setRefundCreditDone(false); setRefundingCredit(false);
        }, 900);
      } catch (error) {
        setRefundingCredit(false);
        alert(error instanceof Error ? error.message : "Remboursement de l'avoir impossible");
      }
    }

'''
    if submit_marker not in text:
        raise SystemExit('refund function insert marker missing')
    text = text.replace(submit_marker, fn + submit_marker, 1)

old_credit = '''        {totalAvoir>0&&<section className="rounded-2xl p-3.5 border" style={{borderColor:SEM.success.accent+"44",background:SEM.success.bg}}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black tracking-wider" style={{color:SEM.success.accent}}>AVOIR CLIENT DISPONIBLE</p><p className="text-xs text-muted-foreground mt-1">À proposer pour régler une prochaine facture.</p></div>
            <p className="text-xl font-black" style={{color:SEM.success.accent,fontFamily:"'Nunito',sans-serif"}}>{fmt(totalAvoir)}</p>
          </div>
        </section>}'''
new_credit = '''        {totalAvoir>0&&<section className="rounded-2xl p-3.5 border" style={{borderColor:SEM.success.accent+"44",background:SEM.success.bg}}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black tracking-wider" style={{color:SEM.success.accent}}>AVOIR CLIENT DISPONIBLE</p><p className="text-xs text-muted-foreground mt-1">Utilisable sur une prochaine facture ou remboursable sur demande du client.</p></div>
            <p className="text-xl font-black" style={{color:SEM.success.accent,fontFamily:"'Nunito',sans-serif"}}>{fmt(totalAvoir)}</p>
          </div>
          {canReturn&&<button type="button" onClick={()=>{setRefundCreditAmount(String(totalAvoir));setRefundCreditMethod("Espèces");setRefundCreditDone(false);setRefundCreditModal(true);}} className="mt-3 w-full rounded-xl bg-white py-2.5 text-xs font-black" style={{color:SEM.success.accent}}>↩️ Rembourser l'avoir</button>}
        </section>}'''
if old_credit in text:
    text = text.replace(old_credit, new_credit, 1)

payment_modal_marker = '        {paymentModal&&<Modal title="Versement client"'
if 'refundCreditModal&&<Modal title="Rembourser l\'avoir"' not in text:
    modal = '''        {refundCreditModal&&<Modal title="Rembourser l'avoir" color={SEM.danger.accent} onClose={()=>{if(!refundingCredit)setRefundCreditModal(false);}}>
          <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{background:SEM.success.bg,color:SEM.success.accent}}>Avoir disponible : {fmt(totalAvoir)}. Ce remboursement consomme l'avoir du client et crée un mouvement de remboursement traçable.</div>
          <Field label="MONTANT À REMBOURSER"><input value={refundCreditAmount} onChange={e=>setRefundCreditAmount(e.target.value)} type="number" min="0" max={totalAvoir} className={inputCls}/></Field>
          <Field label="MOYEN DE REMBOURSEMENT"><div className="grid grid-cols-2 gap-2">{PAYMENT_METHODS.map(method=><button key={method} type="button" onClick={()=>setRefundCreditMethod(method)} className="rounded-xl px-3 py-3 text-sm font-bold" style={{background:refundCreditMethod===method?(PM_COLOR[method]??"#6b7280")+"18":"#f9fafb",color:refundCreditMethod===method?(PM_COLOR[method]??"#374151"):"#6b7280",border:refundCreditMethod===method?`2px solid ${(PM_COLOR[method]??"#6b7280")}55`:"2px solid transparent"}}>{PM_ICON[method]} {method}</button>)}</div></Field>
          {refundCreditDone?<div className="rounded-xl bg-green-50 p-4 text-center text-sm font-black text-green-700">Avoir remboursé ✓</div>:<SubmitBtn color={SEM.danger.accent} label={refundingCredit?"Remboursement…":"Confirmer le remboursement"} onClick={()=>void submitCreditRefund()} disabled={refundingCredit||(Number(refundCreditAmount)||0)<=0||(Number(refundCreditAmount)||0)>totalAvoir+0.01}/>} 
        </Modal>}
'''
    if payment_modal_marker not in text:
        raise SystemExit('refund modal insert marker missing')
    text = text.replace(payment_modal_marker, modal + payment_modal_marker, 1)

clients.write_text(text)
