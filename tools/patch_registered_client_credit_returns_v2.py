from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'{label} missing')
    p.write_text(s.replace(old,new,1))

# TYPES
p=Path('src/app/types.ts'); s=p.read_text()
if 'export type ClientCreditRefund' not in s:
    anchor='''export type ClientAdvance = {\n  id: number;\n  clientId: number;\n  amount: number;\n  allocatedAmount?: number;\n  paymentMethod: PaymentMethod;\n  paidAt: string;\n  recordedAt?: string;\n  operatorId?: string;\n  operatorName: string;\n  note?: string;\n};'''
    if anchor not in s: raise SystemExit('types ClientAdvance anchor missing')
    s=s.replace(anchor,anchor+'''\n\nexport type ClientCreditRefund = {\n  id: number;\n  clientId: number;\n  amount: number;\n  paymentMethod: Exclude<PaymentMethod, "Avoir client">;\n  refundedAt: string;\n  date: string;\n  dateRaw: string;\n  operatorId?: string;\n  operatorName: string;\n  note?: string;\n};''',1)
if 'returnClientCreditAmount?: number' not in s:
    s=s.replace('returnRefundAmount?: number; returnReceivableReduction?: number; returnCreditRestore?: number;', 'returnRefundAmount?: number; returnReceivableReduction?: number; returnCreditRestore?: number; returnClientCreditAmount?: number;',1)
if 'clientCreditRefunds?: ClientCreditRefund[]' not in s:
    s=s.replace('clientAdvances?: ClientAdvance[];', 'clientAdvances?: ClientAdvance[];\n  clientCreditRefunds?: ClientCreditRefund[];',1)
p.write_text(s)

# API snapshot + types
p=Path('src/lib/api.ts'); s=p.read_text()
s=s.replace('products:[], entries:[], suppliers:[], clients:[], clientAdvances:[], invoices:[],', 'products:[], entries:[], suppliers:[], clients:[], clientAdvances:[], clientCreditRefunds:[], invoices:[],',1)
s=s.replace('const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, advances, charges, sessions, auditLogs, userScope] = await Promise.all([', 'const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, advances, creditRefunds, charges, sessions, auditLogs, userScope] = await Promise.all([',1)
s=s.replace('dataRequest<any[]>(`invoice_payments?select=*${scoped()}&order=paid_at.asc`), dataRequest<any[]>(`client_advances?select=*${scoped()}&order=paid_at.desc,id.desc`), dataRequest<any[]>(`charges?select=*${scoped()}`),', 'dataRequest<any[]>(`invoice_payments?select=*${scoped()}&order=paid_at.asc`), dataRequest<any[]>(`client_advances?select=*${scoped()}&order=paid_at.desc,id.desc`),\n      dataRequest<any[]>(`client_credit_refunds?select=*${scoped()}&order=refunded_at.desc,id.desc`), dataRequest<any[]>(`charges?select=*${scoped()}`),',1)
advance_anchor='''      clientAdvances: advances.filter(a => a.boutique_id === b.id).map(a => ({\n        id:Number(a.id), clientId:Number(a.client_id), amount:Number(a.amount),\n        allocatedAmount:Number(a.allocated_amount ?? 0),\n        paymentMethod:a.payment_method, paidAt:a.paid_at, recordedAt:a.recorded_at,\n        operatorId:a.operator_id ?? undefined, operatorName:a.operator_name, note:a.note ?? undefined,\n      })),'''
if 'clientCreditRefunds: creditRefunds.filter' not in s:
    if advance_anchor not in s: raise SystemExit('api advance map anchor missing')
    s=s.replace(advance_anchor,advance_anchor+'''\n      clientCreditRefunds: creditRefunds.filter(r => r.boutique_id === b.id).map(r => ({\n        id:Number(r.id), clientId:Number(r.client_id), amount:Number(r.amount), paymentMethod:r.payment_method,\n        refundedAt:r.refunded_at, date:day(r.refunded_at), dateRaw:r.refunded_at,\n        operatorId:r.operator_id ?? undefined, operatorName:r.operator_name, note:r.note ?? undefined,\n      })),''',1)
if 'returnClientCreditAmount:Number(i.return_client_credit_amount' not in s:
    s=s.replace('returnCreditRestore:Number(i.return_credit_restore ?? 0),', 'returnCreditRestore:Number(i.return_credit_restore ?? 0),\n          returnClientCreditAmount:Number(i.return_client_credit_amount ?? i.return_credit_restore ?? 0),',1)
s=s.replace('return_invoice_id:string; credit_note_number:number; source_invoice_id:string; total:number; returned_at:string; refund_method:string|null;\n    refund_amount:number; receivable_reduction:number; credit_restore:number; restored_advance_id:number|null;', 'return_invoice_id:string; credit_note_number:number; source_invoice_id:string; total:number; returned_at:string; registered_client:boolean; refund_method:string|null;\n    refund_amount:number; receivable_reduction:number; client_credit_amount:number; credit_restore:number; restored_advance_id:number|null;',1)
p.write_text(s)

# CLIENTS: explicit client-credit return value, refund history, immediate local state
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
if 'returnClientCreditAmount:Number(persisted.client_credit_amount' not in s:
    s=s.replace('returnCreditRestore:Number(persisted.credit_restore??0),', 'returnCreditRestore:Number(persisted.credit_restore??0),returnClientCreditAmount:Number(persisted.client_credit_amount??persisted.credit_restore??0),',1)
old='''        const restoredAdvance=persisted.credit_restore>0&&persisted.restored_advance_id&&clientReturnInv.clientId!=null?{\n          id:Number(persisted.restored_advance_id),clientId:clientReturnInv.clientId,amount:Number(persisted.credit_restore),allocatedAmount:0,paymentMethod:"Autre" as PaymentMethod,\n          paidAt:persisted.returned_at,recordedAt:persisted.returned_at,operatorId:currentUser.id,operatorName:currentUser.nom,note:`Avoir restauré par ${persisted.return_invoice_id} sur ${clientReturnInv.id}`,\n        }:null;'''
new='''        const returnedCredit=Number(persisted.client_credit_amount??persisted.credit_restore??0);\n        const restoredAdvance=returnedCredit>0&&persisted.restored_advance_id&&clientReturnInv.clientId!=null?{\n          id:Number(persisted.restored_advance_id),clientId:clientReturnInv.clientId,amount:returnedCredit,allocatedAmount:0,paymentMethod:"Autre" as PaymentMethod,\n          paidAt:persisted.returned_at,recordedAt:persisted.returned_at,operatorId:currentUser.id,operatorName:currentUser.nom,note:`Avoir créé par ${persisted.return_invoice_id} sur ${clientReturnInv.id}`,\n        }:null;'''
if old in s: s=s.replace(old,new,1)
if 'const clientCreditRefunds = (boutique.clientCreditRefunds ?? [])' not in s:
    anchor='''    const clientAdvances = (boutique.clientAdvances ?? []).filter(advance => advance.clientId === c.id)\n      .sort((a,b)=>b.paidAt.localeCompare(a.paidAt));'''
    if anchor not in s: raise SystemExit('clients advances local anchor missing')
    s=s.replace(anchor,anchor+'''\n    const clientCreditRefunds = (boutique.clientCreditRefunds ?? []).filter(refund => refund.clientId === c.id)\n      .sort((a,b)=>b.refundedAt.localeCompare(a.refundedAt));''',1)
s=s.replace('const totalEncaissé = ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)-retours.reduce((s,i)=>s+invoicePaidAmount(i),0);', 'const totalEncaissé = ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)-retours.reduce((s,i)=>s+invoicePaidAmount(i),0)-clientCreditRefunds.reduce((s,r)=>s+r.amount,0);',1)
s=s.replace('const paymentHistoryCount = clientPayments.length + clientAdvances.length;', 'const paymentHistoryCount = clientPayments.length + clientAdvances.length + clientCreditRefunds.length;',1)
old_update='''        onUpdate({ clientAdvances:(boutique.clientAdvances ?? []).map(advance => ({\n          ...advance,\n          allocatedAmount:(advance.allocatedAmount ?? 0) + (consumed.get(advance.id) ?? 0),\n        })) });'''
new_update='''        onUpdate({\n          clientAdvances:(boutique.clientAdvances ?? []).map(advance => ({\n            ...advance,\n            allocatedAmount:(advance.allocatedAmount ?? 0) + (consumed.get(advance.id) ?? 0),\n          })),\n          clientCreditRefunds:[...(boutique.clientCreditRefunds ?? []),{\n            id:result.refund_id,clientId:c.id,amount:result.amount,paymentMethod:result.payment_method as Exclude<PaymentMethod,"Avoir client">,\n            refundedAt:result.refunded_at,date:today(),dateRaw:result.refunded_at,operatorId:result.operator_id,operatorName:result.operator_name,note:"Remboursement avoir client",\n          }],\n        });'''
if old_update in s: s=s.replace(old_update,new_update,1)
# Add visible refund history immediately after client advances history section.
history_marker='''          </>}\n        </section>}'''
if 'REMBOURSEMENTS D\'AVOIR' not in s:
    refund_hist='''          {clientCreditRefunds.length>0&&<div className="mt-4 border-t border-border pt-4">\n            <p className="mb-3 text-xs font-black tracking-wider text-muted-foreground">REMBOURSEMENTS D'AVOIR</p>\n            <div className="space-y-2">{clientCreditRefunds.slice(0,20).map(refund=><div key={refund.id} className="flex items-center justify-between gap-3 text-xs"><div><p className="font-bold">💸 {refund.paymentMethod}</p><p className="text-muted-foreground">{formatPreciseDateTime(refund.refundedAt)} · {refund.operatorName}</p></div><p className="font-black text-red-600">− {fmt(refund.amount)}</p></div>)}</div>\n          </div>}\n'''
    if history_marker not in s: raise SystemExit('clients payment history marker missing')
    s=s.replace(history_marker,refund_hist+history_marker,1)
# Refund method must not offer internal credit as an outgoing payment method.
s=s.replace('{PAYMENT_METHODS.map(method=><button key={method} type="button" onClick={()=>setRefundCreditMethod(method)}', '{PAYMENT_METHODS.filter(method=>method!=="Avoir client").map(method=><button key={method} type="button" onClick={()=>setRefundCreditMethod(method)}',1)
s=s.replace('fmt(Number(viewedInvoice.returnCreditRestore??0))', 'fmt(Number(viewedInvoice.returnClientCreditAmount??viewedInvoice.returnCreditRestore??0))',1)
p.write_text(s)

# FACTURES: registered customers never choose refund mode during return; separate credit refunds reduce caisse.
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
if 'sessionCreditRefundEvents' not in s:
    anchor='''  const caissePaymentEvents = [...sessionEvents, ...sessionAdvanceEvents];'''
    if anchor not in s: raise SystemExit('factures caisse events anchor missing')
    s=s.replace(anchor,'''  const sessionCreditRefundEvents = isCaisseOpen && caisseSession\n    ? (boutique.clientCreditRefunds ?? []).filter(refund => refund.refundedAt >= caisseSession.openedAt).map(refund => ({ paidAt:refund.refundedAt, paymentMethod:refund.paymentMethod, signedAmount:-refund.amount }))\n    : [];\n  const caissePaymentEvents = [...sessionEvents, ...sessionAdvanceEvents, ...sessionCreditRefundEvents];''',1)
s=s.replace('setReturnMethod("Espèces");\n    setReturnDone(false);', 'if (inv.clientId == null) setReturnMethod("Espèces");\n    setReturnDone(false);',1)
s=s.replace('persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ sourceLineId:l.id, productId:l.productId, qty:l.qty })) });', 'persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, ...(returnInv.clientId == null ? { refundMethod:returnMethod } : {}), lines:returnLines.map(l=>({ sourceLineId:l.id, productId:l.productId, qty:l.qty })) });',1)
if 'returnClientCreditAmount:Number(persisted.client_credit_amount' not in s:
    s=s.replace('returnCreditRestore:Number(persisted.credit_restore ?? 0),', 'returnCreditRestore:Number(persisted.credit_restore ?? 0), returnClientCreditAmount:Number(persisted.client_credit_amount ?? persisted.credit_restore ?? 0),',1)
old='''          {!returnDone && (\n            <div className="space-y-2">\n              <p className="text-xs font-black tracking-wider text-muted-foreground">MODE DE REMBOURSEMENT</p>'''
if old in s:
    s=s.replace(old,'''          {!returnDone && returnInv.clientId == null && (\n            <div className="space-y-2">\n              <p className="text-xs font-black tracking-wider text-muted-foreground">MODE DE REMBOURSEMENT</p>''',1)
    explanatory='''          {returnInv.clientId != null && !returnDone && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Client enregistré : aucune sortie d'argent lors du retour. La créance éventuelle est annulée d'abord, puis le solde devient un avoir client. Le remboursement de cet avoir se fait séparément depuis Clients.</div>}\n'''
    submit_anchor='''          {returnDone ? ('''
    if submit_anchor not in s: raise SystemExit('factures return submit anchor missing')
    s=s.replace(submit_anchor,explanatory+submit_anchor,1)
p.write_text(s)

# RAPPORT: separate client-credit refunds are outgoing cash/mobile-money flows.
p=Path('src/app/screens/RapportView.tsx'); s=p.read_text()
if 'filtCreditRefunds' not in s:
    s=s.replace('const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo);\n  const filtCh', 'const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo);\n  const filtCreditRefunds = filterByPeriod(boutique.clientCreditRefunds ?? [], period, customFrom, customTo);\n  const filtCh',1)
s=s.replace('const ca           = filtPayments.reduce((sum,payment)=>sum + payment.signedAmount,0);', 'const ca           = filtPayments.reduce((sum,payment)=>sum + payment.signedAmount,0) - filtCreditRefunds.reduce((sum,refund)=>sum + refund.amount,0);',1)
old='''  const byMethode = reportPaymentMethods.map(m => ({\n    m, total: filtPayments.filter(payment=>payment.paymentMethod===m).reduce((sum,payment)=>sum + payment.signedAmount,0),\n    count: filtPayments.filter(payment=>payment.paymentMethod===m).length,\n  })).filter(r=>r.count>0);'''
if old in s:
    s=s.replace(old,'''  const byMethode = reportPaymentMethods.map(m => {\n    const payments = filtPayments.filter(payment=>payment.paymentMethod===m);\n    const refunds = filtCreditRefunds.filter(refund=>refund.paymentMethod===m);\n    return { m, total:payments.reduce((sum,payment)=>sum + payment.signedAmount,0)-refunds.reduce((sum,refund)=>sum+refund.amount,0), count:payments.length+refunds.length };\n  }).filter(r=>r.count>0);''',1)
p.write_text(s)

# DOCUMENTS: use explicit new field, retain old field fallback for historical rows.
p=Path('src/app/utils/invoice.ts'); s=p.read_text()
s=s.replace('Number(inv.returnCreditRestore ?? 0)', 'Number(inv.returnClientCreditAmount ?? inv.returnCreditRestore ?? 0)')
s=s.replace('Avoir client restauré', 'Avoir client créé')
p.write_text(s)

# Verification markers.
checks={
 'src/app/types.ts':['ClientCreditRefund','returnClientCreditAmount','clientCreditRefunds'],
 'src/lib/api.ts':['client_credit_refunds?select=*','returnClientCreditAmount:Number','client_credit_amount:number'],
 'src/app/screens/ClientsView.tsx':['clientCreditRefunds','REMBOURSEMENTS D\'AVOIR','returnClientCreditAmount:Number','Rembourser l\'avoir'],
 'src/app/screens/FacturesView.tsx':['sessionCreditRefundEvents','returnInv.clientId == null','Client enregistré : aucune sortie d\'argent'],
 'src/app/screens/RapportView.tsx':['filtCreditRefunds','refunds.reduce'],
 'src/app/utils/invoice.ts':['returnClientCreditAmount','Avoir client créé'],
}
for path,needles in checks.items():
    text=Path(path).read_text()
    for needle in needles:
        if needle not in text: raise SystemExit(f'missing {needle!r} in {path}')
print('registered client return-to-credit v2 patch verified')
