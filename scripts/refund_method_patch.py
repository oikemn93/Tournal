from pathlib import Path

api_path = Path('src/lib/api.ts')
api = api_path.read_text()
old = '''export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{productId:number;qty:number}> }) {
  return dataRequest<{ return_invoice_id:string; source_invoice_id:string; total:number; returned_at:string }>("rpc/return_sale", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_invoice_id:params.invoiceId, p_idempotency_key:crypto.randomUUID(), p_lines:params.lines }),
  });
}'''
new = '''export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{productId:number;qty:number}>; refundMethod:string }) {
  return dataRequest<{
    return_invoice_id:string; source_invoice_id:string; total:number; returned_at:string; refund_method:string;
    payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" };
  }>("rpc/return_sale", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_lines:params.lines,
      p_refund_method:params.refundMethod,
    }),
  });
}'''
if old not in api: raise SystemExit('returnSale api anchor missing')
api = api.replace(old, new, 1)
api_path.write_text(api)

p = Path('src/app/screens/FacturesView.tsx')
s = p.read_text()
old = '''  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnDone, setReturnDone] = useState(false);'''
new = '''  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>("Espèces");
  const [returnDone, setReturnDone] = useState(false);'''
if old not in s: raise SystemExit('return state anchor missing')
s = s.replace(old,new,1)

old = '''    setReturnQtys(initQtys);
    setReturnDone(false);
    setReturnInv(inv);'''
new = '''    setReturnQtys(initQtys);
    setReturnMethod("Espèces");
    setReturnDone(false);
    setReturnInv(inv);'''
if old not in s: raise SystemExit('open return anchor missing')
s = s.replace(old,new,1)

old = '''      persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });'''
new = '''      persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });'''
if old not in s: raise SystemExit('return call anchor missing')
s = s.replace(old,new,1)

old = '''      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,
      operatorNom: currentUser.nom, operatorColor: currentUser.color,'''
new = '''      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,
      operatorNom: currentUser.nom, operatorColor: currentUser.color,
      paymentMethod: persisted.refund_method as PaymentMethod,
      payments: [{
        id:persisted.payment.id,
        amount:persisted.payment.amount,
        paymentMethod:persisted.payment.payment_method as PaymentMethod,
        paidAt:persisted.payment.paid_at,
        operatorId:persisted.payment.operator_id,
        operatorName:persisted.payment.operator_name,
        batchId:persisted.payment.batch_id,
        source:persisted.payment.source,
      }],'''
if old not in s: raise SystemExit('return invoice payment anchor missing')
s = s.replace(old,new,1)

old = '''    logAction("Retour articles", `${retId} ← ${returnInv.id} · ${returnLines.length} article(s) · ${fmt(refundTotal)}`, "↩️");'''
new = '''    logAction("Retour articles", `${retId} ← ${returnInv.id} · ${returnLines.length} article(s) · ${fmt(refundTotal)} · remboursement ${persisted.refund_method}`, "↩️");'''
if old not in s: raise SystemExit('return log anchor missing')
s = s.replace(old,new,1)

old = '''          })()}
          {returnDone ? ('''
new = '''          })()}
          {!returnDone && (
            <div className="space-y-2">
              <p className="text-xs font-black tracking-wider text-muted-foreground">MODE DE REMBOURSEMENT</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(method => (
                  <button key={method} type="button" onClick={()=>setReturnMethod(method)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-bold" style={{ background:returnMethod===method?(PM_COLOR[method]??"#6b7280")+"18":"#f9fafb", border:returnMethod===method?`2px solid ${(PM_COLOR[method]??"#6b7280")}55`:"2px solid transparent", color:returnMethod===method?(PM_COLOR[method]??"#374151"):"#6b7280" }}>
                    <span>{PM_ICON[method]}</span><span>{method}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Le mode choisi sera enregistré sur l'avoir et dans l'écriture de remboursement.</p>
            </div>
          )}
          {returnDone ? ('''
if old not in s: raise SystemExit('return method UI anchor missing')
s = s.replace(old,new,1)
p.write_text(s)

# Return documents: label refund method explicitly.
ip = Path('src/app/utils/invoice.ts')
i = ip.read_text()
old = '''      `\\n↩️ Montant remboursé: ${fmt(inv.montant)}\\n` +
      `📅 ${inv.date}\\nCe document atteste d'un retour de marchandise.`;'''
new = '''      `\\n↩️ Montant remboursé: ${fmt(inv.montant)}\\n` +
      (inv.paymentMethod ? `💳 Mode de remboursement: ${inv.paymentMethod}\\n` : "") +
      `📅 ${inv.date}\\nCe document atteste d'un retour de marchandise.`;'''
if old not in i: raise SystemExit('return message anchor missing')
i = i.replace(old,new,1)
old = '''  const paymentRows = [...paymentByMethod.entries()].map(([method, amount]) => ({ method, amount }));'''
new = '''  const paymentRows = [...paymentByMethod.entries()].map(([method, amount]) => ({ method, amount }));
  const paymentBlockTitle = isReturn ? "Mode de remboursement" : "Modes de paiement";'''
if old not in i: raise SystemExit('payment rows anchor missing')
i = i.replace(old,new,1)
old = '''<div class="payment-title">MODES DE PAIEMENT</div>'''
if old in i:
    i = i.replace(old, '''<div class="payment-title">${paymentBlockTitle}</div>''', 1)
else:
    # tolerate current title casing if already dynamic elsewhere
    old2 = '''<div class="payment-title">Modes de paiement</div>'''
    if old2 not in i: raise SystemExit('payment title anchor missing')
    i = i.replace(old2, '''<div class="payment-title">${paymentBlockTitle}</div>''', 1)
ip.write_text(i)
print('refund method patch applied')
