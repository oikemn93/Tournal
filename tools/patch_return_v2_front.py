from pathlib import Path

# types
p=Path('src/app/types.ts'); s=p.read_text()
s=s.replace('export type InvoiceLine = { productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };',
'''export type InvoiceLine = { id?: number; sourceInvoiceLineId?: number; productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };''')
s=s.replace('status: InvoiceStatus; type: string; returnOfInvoiceId?: string;',
'''status: InvoiceStatus; type: string; returnOfInvoiceId?: string; creditNoteNumber?: number;
  returnRefundAmount?: number; returnReceivableReduction?: number; returnCreditRestore?: number;''')
p.write_text(s)

# payment semantics: a credit note is settled by its settlement breakdown, never an amount still due.
p=Path('src/app/utils/payments.ts'); s=p.read_text()
s=s.replace('export function invoiceRemainingAmount(invoice: Invoice): number {\n  if (invoice.status === "annulée") return 0;',
'''export function invoiceRemainingAmount(invoice: Invoice): number {
  if (invoice.status === "annulée" || invoice.type.toLowerCase() === "retour") return 0;''')
p.write_text(s)

# API: preserve structural return links/settlement and send exact source line IDs.
p=Path('src/lib/api.ts'); s=p.read_text()
s=s.replace('''          type:i.type,\n          returnOfInvoiceId:i.return_of_invoice_id ?? undefined,\n          origin:i.origin === "client_profile" ? "client_profile" : "pos",''',
'''          type:i.type,
          returnOfInvoiceId:i.return_of_invoice_id ?? undefined,
          creditNoteNumber:i.credit_note_number != null ? Number(i.credit_note_number) : undefined,
          returnRefundAmount:Number(i.return_refund_amount ?? 0),
          returnReceivableReduction:Number(i.return_receivable_reduction ?? 0),
          returnCreditRestore:Number(i.return_credit_restore ?? 0),
          origin:i.origin === "client_profile" ? "client_profile" : "pos",''')
s=s.replace('''          lines:(i.invoice_lines ?? []).map((l: any)=>({ productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), prixAchat:l.prix_achat!=null?Number(l.prix_achat):undefined, sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })),''',
'''          lines:(i.invoice_lines ?? []).map((l: any)=>({ id:Number(l.id), sourceInvoiceLineId:l.source_invoice_line_id != null ? Number(l.source_invoice_line_id) : undefined, productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), prixAchat:l.prix_achat!=null?Number(l.prix_achat):undefined, sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })),''')
s=s.replace('''return { id:row.id, clientId:row.client_id ?? undefined, client:row.client_nom ?? "Client comptoir", clientTel:row.client_tel ?? undefined, clientType:row.client_type_snapshot ?? client?.type ?? undefined, clientEmailSnapshot:row.client_email_snapshot ?? undefined, clientAdresseSnapshot:row.client_adresse_snapshot ?? undefined, clientVilleSnapshot:row.client_ville_snapshot ?? undefined, clientTypeSnapshot:row.client_type_snapshot ?? undefined, boutiqueNomSnapshot:row.boutique_nom_snapshot ?? undefined, boutiqueVilleSnapshot:row.boutique_ville_snapshot ?? undefined, boutiqueAdresseSnapshot:row.boutique_adresse_snapshot ?? undefined, boutiqueTelSnapshot:row.boutique_tel_snapshot ?? undefined, boutiqueEmailSnapshot:row.boutique_email_snapshot ?? undefined, boutiqueLogoSnapshot:row.boutique_logo_snapshot ?? undefined, montant:Number(row.montant), acompte:paid, date:syncDate(row.invoice_date), dateRaw:row.invoice_date, dueDate:row.due_date ?? undefined, status:row.status === "annulée" ? "annulée" : paid >= Number(row.montant) ? "payé" : paid > 0 ? "acompte" : row.status === "en_attente" ? "en attente" : row.status, type:row.type, returnOfInvoiceId:row.return_of_invoice_id ?? undefined, origin:row.origin === "client_profile" ? "client_profile" : "pos",''',
'''return { id:row.id, clientId:row.client_id ?? undefined, client:row.client_nom ?? "Client comptoir", clientTel:row.client_tel ?? undefined, clientType:row.client_type_snapshot ?? client?.type ?? undefined, clientEmailSnapshot:row.client_email_snapshot ?? undefined, clientAdresseSnapshot:row.client_adresse_snapshot ?? undefined, clientVilleSnapshot:row.client_ville_snapshot ?? undefined, clientTypeSnapshot:row.client_type_snapshot ?? undefined, boutiqueNomSnapshot:row.boutique_nom_snapshot ?? undefined, boutiqueVilleSnapshot:row.boutique_ville_snapshot ?? undefined, boutiqueAdresseSnapshot:row.boutique_adresse_snapshot ?? undefined, boutiqueTelSnapshot:row.boutique_tel_snapshot ?? undefined, boutiqueEmailSnapshot:row.boutique_email_snapshot ?? undefined, boutiqueLogoSnapshot:row.boutique_logo_snapshot ?? undefined, montant:Number(row.montant), acompte:row.type === "Retour" ? Number(row.return_refund_amount ?? paid) : paid, date:syncDate(row.invoice_date), dateRaw:row.invoice_date, dueDate:row.due_date ?? undefined, status:row.status === "annulée" ? "annulée" : row.type === "Retour" ? "payé" : paid >= Number(row.montant) ? "payé" : paid > 0 ? "acompte" : row.status === "en_attente" ? "en attente" : row.status, type:row.type, returnOfInvoiceId:row.return_of_invoice_id ?? undefined, creditNoteNumber:row.credit_note_number != null ? Number(row.credit_note_number) : undefined, returnRefundAmount:Number(row.return_refund_amount ?? 0), returnReceivableReduction:Number(row.return_receivable_reduction ?? 0), returnCreditRestore:Number(row.return_credit_restore ?? 0), origin:row.origin === "client_profile" ? "client_profile" : "pos",''')
s=s.replace('''lines:(row.invoice_lines ?? []).map((line:any) => ({ productId:line.product_id, nom:line.nom, qty:Number(line.qty), unit:line.unit ?? "unité", prixUnit:Number(line.prix_unit), prixAchat:line.prix_achat != null ? Number(line.prix_achat) : undefined, sellUnit:line.sell_unit ?? undefined, sellQty:line.sell_qty ? Number(line.sell_qty) : undefined }))''',
'''lines:(row.invoice_lines ?? []).map((line:any) => ({ id:Number(line.id), sourceInvoiceLineId:line.source_invoice_line_id != null ? Number(line.source_invoice_line_id) : undefined, productId:line.product_id, nom:line.nom, qty:Number(line.qty), unit:line.unit ?? "unité", prixUnit:Number(line.prix_unit), prixAchat:line.prix_achat != null ? Number(line.prix_achat) : undefined, sellUnit:line.sell_unit ?? undefined, sellQty:line.sell_qty ? Number(line.sell_qty) : undefined }))''')
old='''export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{productId:number;qty:number}>; refundMethod:string }) {
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
new='''export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{sourceLineId?:number;productId:number;qty:number}>; refundMethod:string }) {
  return dataRequest<{
    return_invoice_id:string; credit_note_number:number; source_invoice_id:string; total:number; returned_at:string; refund_method:string|null;
    refund_amount:number; receivable_reduction:number; credit_restore:number; restored_advance_id:number|null;
    payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" } | null;
  }>("rpc/return_sale", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_lines:params.lines.map(line=>({ sourceLineId:line.sourceLineId ?? null, productId:line.productId, qty:line.qty })),
      p_refund_method:params.refundMethod,
    }),
  });
}'''
if old not in s: raise SystemExit('returnSale block not found')
s=s.replace(old,new,1)
p.write_text(s)

# Factures: exact line accounting, correct packaged-unit preview, clear credit-note status/share.
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
s=s.replace('''  const reste = Math.max(0, inv.montant - inv.acompte);''','''  const isReturn = inv.type.toLowerCase() === "retour";
  const reste = isReturn ? 0 : Math.max(0, inv.montant - inv.acompte);''',1)
s=s.replace('''    return `Bonjour ${inv.client}\\n\\nVoici votre facture ${inv.id} de ${boutique.nom}.\\nTotal : ${fmtN(inv.montant)} F\\n${statusLine}\\n\\nConsulter / télécharger la facture :\\n${url}\\n\\nLien valable 48 h. Après expiration, la facture peut être régénérée sur demande.\\n\\nMerci pour votre confiance.`;''',
'''    const doc = isReturn ? "avoir de retour" : "facture";
    const source = isReturn && inv.returnOfInvoiceId ? `\\nRetour sur facture : ${inv.returnOfInvoiceId}` : "";
    return `Bonjour ${inv.client}\\n\\nVoici votre ${doc} ${inv.id} de ${boutique.nom}.\\nMontant : ${fmtN(inv.montant)} F${source}\\n${isReturn ? `Remboursé : ${fmtN(inv.returnRefundAmount ?? inv.acompte)} F` : statusLine}\\n\\nConsulter / télécharger le document :\\n${url}\\n\\nLien valable 48 h. Le document peut être régénéré sur demande.\\n\\nMerci pour votre confiance.`;''',1)
s=s.replace('''const subject = encodeURIComponent(`Facture ${inv.id} — ${boutique.nom}`);''','''const subject = encodeURIComponent(`${isReturn ? "Avoir de retour" : "Facture"} ${inv.id} — ${boutique.nom}`);''',1)
s=s.replace('''const text = `Facture ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F. ${reste > 0 ? `Reste ${fmtN(reste)} F. ` : "Payée. "}Lien valable 48 h : ${share.url}`;''',
'''const text = isReturn
      ? `Avoir de retour ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F.${inv.returnOfInvoiceId ? ` Retour sur ${inv.returnOfInvoiceId}.` : ""} Lien valable 48 h : ${share.url}`
      : `Facture ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F. ${reste > 0 ? `Reste ${fmtN(reste)} F. ` : "Payée. "}Lien valable 48 h : ${share.url}`;''',1)
s=s.replace('''<Modal title="Partager la facture" color="#374151" onClose={onClose}>''','''<Modal title={isReturn ? "Partager l'avoir de retour" : "Partager la facture"} color={isReturn ? "#dc2626" : "#374151"} onClose={onClose}>''',1)
s=s.replace('''{reste<=0?"Payé":inv.acompte>0?"Acompte":"Impayé"}''','''{isReturn?"Avoir":reste<=0?"Payé":inv.acompte>0?"Acompte":"Impayé"}''',1)
s=s.replace('''Aucun PDF n'est stocké tant que le client ne demande pas sa facture.''','''Aucun PDF n'est stocké tant que le client ne demande pas son document.''',1)

old_block='''  // Quantities already returned, per source invoice and product. Every return
  // restores stock via an entry tagged "Retour <sourceInvoiceId>", mirroring the
  // return_sale RPC, so summing those entries tells us how much of each line has
  // already been sent back. This prevents returning the same invoice repeatedly.
  const returnedByInvoiceProduct = useMemo(() => {
    const map = new Map<string, number>();
    const prefix = "Retour ";
    for (const e of entries) {
      const note = e.fournisseur ?? "";
      if (!note.startsWith(prefix)) continue;
      const sourceId = note.slice(prefix.length);
      const key = `${sourceId}::${e.productId}`;
      map.set(key, (map.get(key) ?? 0) + Number(e.qty || 0));
    }
    return map;
  }, [entries]);
  const remainingReturnable = (inv: Invoice, line: InvoiceLine) =>
    Math.max(0, line.qty - (returnedByInvoiceProduct.get(`${inv.id}::${line.productId}`) ?? 0));
  const invoiceHasReturnable = (inv: Invoice) =>
    !!inv.lines && inv.lines.some(l => remainingReturnable(inv, l) > 0);'''
new_block='''  // Return integrity is line-based. Product-level fallback is kept only for old in-memory rows
  // that have not yet received their canonical invoice-line ID from realtime.
  const returnedBySourceLine = useMemo(() => {
    const map = new Map<number, number>();
    for (const credit of invoices) {
      if (credit.type.toLowerCase() !== "retour") continue;
      for (const line of credit.lines ?? []) {
        if (line.sourceInvoiceLineId == null) continue;
        map.set(line.sourceInvoiceLineId, (map.get(line.sourceInvoiceLineId) ?? 0) + Number(line.qty || 0));
      }
    }
    return map;
  }, [invoices]);
  const legacyReturnedByInvoiceProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const credit of invoices) {
      if (credit.type.toLowerCase() !== "retour" || !credit.returnOfInvoiceId) continue;
      for (const line of credit.lines ?? []) {
        if (line.sourceInvoiceLineId != null) continue;
        const key = `${credit.returnOfInvoiceId}::${line.productId}`;
        map.set(key, (map.get(key) ?? 0) + Number(line.qty || 0));
      }
    }
    return map;
  }, [invoices]);
  const remainingReturnable = (inv: Invoice, line: InvoiceLine) => Math.max(0,
    line.qty - (line.id != null ? (returnedBySourceLine.get(line.id) ?? 0) : (legacyReturnedByInvoiceProduct.get(`${inv.id}::${line.productId}`) ?? 0)),
  );
  const invoiceHasReturnable = (inv: Invoice) => !!inv.lines && inv.lines.some(l => remainingReturnable(inv, l) > 0);'''
if old_block not in s: raise SystemExit('return tracking block not found')
s=s.replace(old_block,new_block,1)
s=s.replace('''returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) })''',
'''returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ sourceLineId:l.id, productId:l.productId, qty:l.qty })) })''',1)
s=s.replace('''      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,''',
'''      lines: returnLines.map(line=>({ ...line, sourceInvoiceLineId:line.id })), montant: refundTotal, acompte:Number(persisted.refund_amount ?? 0),
      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,
      creditNoteNumber:persisted.credit_note_number, returnRefundAmount:Number(persisted.refund_amount ?? 0), returnReceivableReduction:Number(persisted.receivable_reduction ?? 0), returnCreditRestore:Number(persisted.credit_restore ?? 0),''',1)
s=s.replace('''      payments: persisted.payment ? [{''','''      payments: persisted.payment ? [{''',1)
s=s.replace('''    const restoreEntries: StockEntry[] = returnLines.map((l,i) => ({''','''    const restoreEntries: StockEntry[] = returnLines.map((l,i) => ({''',1)
s=s.replace('''            const total = returnInv.lines.reduce((s,l,i)=>s+(returnQtys[i]??0)*l.prixUnit,0);''',
'''            const total = returnInv.lines.reduce((sum,line,index)=>{
              const baseQty=returnQtys[index]??0;
              return sum + (line.qty>0 ? (baseQty/line.qty)*lineTotal(line) : 0);
            },0);''',1)
s=s.replace('''<span className="font-bold text-sm" style={{ color:"#ef4444" }}>Montant remboursé</span>''','''<span className="font-bold text-sm" style={{ color:"#ef4444" }}>Valeur de l'avoir</span>''',1)
s=s.replace('''              <p className="text-xs text-muted-foreground">Le mode choisi sera enregistré sur l'avoir et dans l'écriture de remboursement.</p>''',
'''              <p className="text-xs text-muted-foreground">Le serveur réduit d'abord une éventuelle créance impayée, restaure ensuite l'avoir client utilisé, puis rembourse uniquement le solde réellement encaissé. Le mode ci-dessus ne s'applique qu'à la partie effectivement remboursée.</p>''',1)
# sold-unit controls
old_controls='''                  <button disabled={rem<=0} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.max(0,(q[i]??0)-1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Minus size={12} style={{ color:"#ef4444" }}/></button>
                  <span className="w-8 text-center font-black text-sm" style={{ color:"#ef4444" }}>{returnQtys[i] ?? 0}</span>
                  <button disabled={(returnQtys[i] ?? 0) >= rem} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.min(rem,(q[i]??0)+1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Plus size={12} style={{ color:"#ef4444" }}/></button>'''
new_controls='''                  {(() => {
                    const step = l.sellQty != null && l.sellQty > 0 && l.qty > 0 ? l.qty / l.sellQty : 1;
                    const base = returnQtys[i] ?? 0;
                    const display = l.sellQty != null && l.qty > 0 ? base * l.sellQty / l.qty : base;
                    return <>
                      <button disabled={rem<=0} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.max(0,(q[i]??0)-step)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Minus size={12} style={{ color:"#ef4444" }}/></button>
                      <span className="min-w-12 text-center font-black text-sm" style={{ color:"#ef4444" }}>{new Intl.NumberFormat("fr-FR",{maximumFractionDigits:3}).format(display)} <span className="text-[10px]">{lineDispUnit(l)}</span></span>
                      <button disabled={base >= rem-0.0005} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.min(rem,(q[i]??0)+step)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Plus size={12} style={{ color:"#ef4444" }}/></button>
                    </>;
                  })()}'''
if old_controls not in s: raise SystemExit('return controls not found')
s=s.replace(old_controls,new_controls,1)
s=s.replace('''{isReturn && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background:SEM.danger.bg, color:SEM.danger.text }}><RotateCcw size={9}/> Retour</span>}''',
'''{isReturn && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background:SEM.danger.bg, color:SEM.danger.text }}><RotateCcw size={9}/> Avoir de retour</span>}''',1)
# original invoice return state
old='''          const linkedReturns = invoices.filter(item => item.returnOfInvoiceId === detailInv.id);
          if (!linkedReturns.length) return null;
          const returnedAmount = linkedReturns.reduce((sum,item)=>sum+item.montant,0);
          return <div className="rounded-xl px-3 py-2 text-xs font-black flex items-center justify-between gap-2" style={{background:"#fef2f2",color:"#b91c1c"}}>
            <span className="flex items-center gap-2"><RotateCcw size={14}/> {linkedReturns.length} retour{linkedReturns.length>1?"s":""} enregistré{linkedReturns.length>1?"s":""}</span>
            <span>{fmt(returnedAmount)}</span>
          </div>;'''
new='''          const linkedReturns = invoices.filter(item => item.returnOfInvoiceId === detailInv.id);
          if (!linkedReturns.length) return null;
          const returnedAmount = linkedReturns.reduce((sum,item)=>sum+item.montant,0);
          const fullyReturned = !invoiceHasReturnable(detailInv);
          return <div className="rounded-xl px-3 py-2 text-xs font-black flex items-center justify-between gap-2" style={{background:"#fef2f2",color:"#b91c1c"}}>
            <span className="flex items-center gap-2"><RotateCcw size={14}/> {fullyReturned ? "Retournée intégralement" : "Retour partiel"} · {linkedReturns.length} avoir{linkedReturns.length>1?"s":""}</span>
            <span>{fmt(returnedAmount)}</span>
          </div>;'''
if old not in s: raise SystemExit('linked return detail not found')
s=s.replace(old,new,1)
# settlement breakdown in return detail
needle='''        {detailInv.type === "Retour" && detailInv.returnOfInvoiceId && (
          <div className="rounded-xl px-3 py-2 text-xs font-black flex items-center gap-2" style={{background:"#fef2f2",color:"#b91c1c"}}>
            <RotateCcw size={14}/> Retour sur facture {detailInv.returnOfInvoiceId}
          </div>
        )}'''
insert=needle+'''\n        {detailInv.type === "Retour" && <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-red-50 p-2"><p className="text-[10px] text-red-700">REMBOURSÉ</p><p className="text-sm font-black text-red-700">{fmt(detailInv.returnRefundAmount ?? invoicePaidAmount(detailInv))}</p></div>
          <div className="rounded-xl bg-amber-50 p-2"><p className="text-[10px] text-amber-700">CRÉANCE ANNULÉE</p><p className="text-sm font-black text-amber-700">{fmt(detailInv.returnReceivableReduction ?? 0)}</p></div>
          <div className="rounded-xl bg-teal-50 p-2"><p className="text-[10px] text-teal-700">AVOIR RESTAURÉ</p><p className="text-sm font-black text-teal-700">{fmt(detailInv.returnCreditRestore ?? 0)}</p></div>
        </div>}'''
s=s.replace(needle,insert,1)
p.write_text(s)

# Clients: keep returns obvious and document actions coherent. Direct return button opens the canonical invoice workflow.
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
s=s.replace('''<button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 Facture PDF</button>
            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 Ticket caisse</button>''',
'''<button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>
            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? "Justificatif remboursement" : "Ticket caisse"}</button>''',1)
s=s.replace('''{canReturnInvoice&&<button type="button" onClick={()=>onOpenInvoice(inv.id)}''','''{canReturnInvoice&&<button type="button" onClick={()=>onOpenInvoice(inv.id)}''',1)
p.write_text(s)

# Reporting: keep net CA after returns, but do not contaminate average basket with refunds from another date.
p=Path('src/app/screens/RapportView.tsx'); s=p.read_text()
s=s.replace('''  const nbVentes     = new Set(filtPayments.filter(payment=>payment.signedAmount>0).map(payment=>payment.invoiceId)).size;
  const panierMoyen  = nbVentes > 0 ? ca / nbVentes : 0;''',
'''  const salePayments = filtPayments.filter(payment=>payment.signedAmount>0);
  const nbVentes     = new Set(salePayments.map(payment=>payment.invoiceId)).size;
  const caBrutVentes = salePayments.reduce((sum,payment)=>sum+payment.signedAmount,0);
  const panierMoyen  = nbVentes > 0 ? caBrutVentes / nbVentes : 0;''',1)
p.write_text(s)
