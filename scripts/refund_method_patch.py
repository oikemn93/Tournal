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
if new not in api:
    if old not in api: raise SystemExit('returnSale api anchor missing')
    api = api.replace(old,new,1)
api_path.write_text(api)

p=Path('src/app/screens/FacturesView.tsx')
s=p.read_text()
old='''  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnDone, setReturnDone] = useState(false);'''
new='''  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>("Espèces");
  const [returnDone, setReturnDone] = useState(false);'''
if new not in s:
    if old not in s: raise SystemExit('return state anchor missing')
    s=s.replace(old,new,1)

old='''    setReturnQtys(initQtys);
    setReturnDone(false);
    setReturnInv(inv);'''
new='''    setReturnQtys(initQtys);
    setReturnMethod("Espèces");
    setReturnDone(false);
    setReturnInv(inv);'''
if new not in s:
    if old not in s: raise SystemExit('open return anchor missing')
    s=s.replace(old,new,1)

old='''persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });'''
new='''persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });'''
if new not in s:
    if old not in s: raise SystemExit('return call anchor missing')
    s=s.replace(old,new,1)

# Persist the method immediately on the local return invoice object when the
# existing object literal is built. This keeps UI, print and reports consistent.
needle='''      operatorNom: currentUser.nom, operatorColor: currentUser.color,'''
replacement='''      operatorNom: currentUser.nom, operatorColor: currentUser.color,
      paymentMethod: persisted.refund_method as PaymentMethod,
      payments: persisted.payment ? [{
        id:persisted.payment.id,
        amount:persisted.payment.amount,
        paymentMethod:persisted.payment.payment_method as PaymentMethod,
        paidAt:persisted.payment.paid_at,
        operatorId:persisted.payment.operator_id,
        operatorName:persisted.payment.operator_name,
        batchId:persisted.payment.batch_id,
        source:persisted.payment.source,
      }] : [],'''
if replacement not in s:
    pos=s.find(needle, s.find('const retInv'))
    if pos<0: raise SystemExit('return invoice operator anchor missing')
    s=s[:pos]+s[pos:].replace(needle,replacement,1)

# Insert selector directly before the return completion branch.
ui_anchor='''          {returnDone ? ('''
ui='''          {!returnDone && (
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
'''
if 'MODE DE REMBOURSEMENT' not in s:
    if ui_anchor not in s: raise SystemExit('return UI anchor missing')
    s=s.replace(ui_anchor,ui+ui_anchor,1)
p.write_text(s)
print('refund method functional patch applied')
