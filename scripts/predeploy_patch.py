from pathlib import Path

# ── Inventory supplier balance: separate purchase debt from payments ──────────
inv_path = Path('src/app/utils/inventory.ts')
inv = inv_path.read_text()
old = '''export function supplierBalance(nom: string, entries: StockEntry[], charges?: Charge[]) {
  const dû = entries.filter(e => e.fournisseur === nom && e.qty > 0).reduce((s, e) => s + e.montantDu, 0);
  const payé = (charges ?? []).filter(c => c.fournisseur === nom).reduce((s, c) => s + c.montant, 0);
  return Math.max(0, dû - payé);
}'''
new = '''export function supplierBalance(nom: string, entries: StockEntry[], charges?: Charge[]) {
  const linkedCharges = (charges ?? []).filter(c => c.fournisseur === nom);
  const regularPurchases = entries
    .filter(e => e.fournisseur === nom && e.qty > 0)
    .reduce((s, e) => s + e.montantDu, 0);
  const transferPurchases = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + c.montant, 0);
  const regularPayments = linkedCharges
    .filter(c => c.source !== "transfer")
    .reduce((s, c) => s + c.montant, 0);
  const transferPayments = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + Number(c.paidAmount ?? 0), 0);
  return Math.max(0, regularPurchases + transferPurchases - regularPayments - transferPayments);
}'''
if old not in inv:
    raise SystemExit('supplierBalance anchor not found')
inv = inv.replace(old, new, 1)
inv_path.write_text(inv)

# ── API: persist selected supplier on manual charges ─────────────────────────
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
old = '''export async function createCharge(params:{ boutiqueId:string; label:string; amount:number; category:string; note?:string }) {
  return dataRequest<{ charge_id:number }>("rpc/create_charge", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_label:params.label,p_montant:params.amount,p_categorie:params.category,p_note:params.note ?? null }) });
}'''
new = '''export async function createCharge(params:{ boutiqueId:string; label:string; amount:number; category:string; note?:string; supplier?:string }) {
  return dataRequest<{ charge_id:number }>("rpc/create_charge", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_label:params.label,p_montant:params.amount,p_categorie:params.category,p_note:params.note ?? null,p_fournisseur:params.supplier ?? null }) });
}'''
if old not in api:
    raise SystemExit('createCharge anchor not found')
api = api.replace(old, new, 1)
api_path.write_text(api)

# ── Charges screen: send supplier to backend and clarify cash totals ──────────
charges_path = Path('src/app/screens/ChargesView.tsx')
charges = charges_path.read_text()
old = '''    try { persisted = await createCharge({ boutiqueId:boutique.id, label:label.trim(), amount:Number(montant), category:cat, note:note.trim() || undefined }); }'''
new = '''    try { persisted = await createCharge({ boutiqueId:boutique.id, label:label.trim(), amount:Number(montant), category:cat, note:note.trim() || undefined, supplier:linkedFourn }); }'''
if old not in charges:
    raise SystemExit('Charges createCharge call anchor not found')
charges = charges.replace(old, new, 1)
charges = charges.replace('''<span className="text-xs font-bold text-muted-foreground">TOTAL CHARGES</span>''', '''<span className="text-xs font-bold text-muted-foreground">SORTIES / CHARGES PAYÉES</span>''', 1)
charges_path.write_text(charges)

# ── Supplier screen: transfer purchase is debt, not an immediate payment ─────
sup_path = Path('src/app/screens/FournisseursView.tsx')
sup = sup_path.read_text()
old = '''        const isOpen=expanded===s.id; const balance=supplierBalance(s.nom,entries,boutique.charges); const se=entries.filter(e=>e.fournisseur===s.nom&&e.qty>0).sort((a,b)=>b.id-a.id);'''
new = '''        const isOpen=expanded===s.id;
        const balance=supplierBalance(s.nom,entries,boutique.charges);
        const se=entries.filter(e=>e.fournisseur===s.nom&&e.qty>0).sort((a,b)=>b.id-a.id);
        const transferPurchases=(boutique.charges??[]).filter(c=>c.source==="transfer"&&c.fournisseur===s.nom).sort((a,b)=>b.id-a.id);'''
if old not in sup:
    raise SystemExit('Supplier card data anchor not found')
sup = sup.replace(old, new, 1)
sup = sup.replace('''<p className="text-xs text-muted-foreground">{se.length} livraisons</p>''', '''<p className="text-xs text-muted-foreground">{se.length+transferPurchases.length} achats/livraisons</p>''', 1)
old = '''              {(() => { const pays = (boutique.charges??[]).filter(c=>c.fournisseur===s.nom).sort((a,b)=>b.id-a.id); return pays.length>0?(
                <div className="px-4 pb-3 border-t border-border">
                  <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{ color:SEM.success.text }}>PAIEMENTS EFFECTUÉS</p>
                  <div className="space-y-2">
                    {pays.map(c=>(
                      <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background:SEM.success.bg }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:SEM.success.accent }}/>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{c.label}</p>
                          <p className="text-xs text-muted-foreground">{c.date}</p>
                        </div>
                        <p className="text-sm font-black" style={{ color:SEM.success.text, fontFamily:"'Nunito',sans-serif" }}>−{fmt(c.montant)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ):null; })()}'''
new = '''              {transferPurchases.length>0&&<div className="px-4 pb-3 border-t border-border">
                <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{color:"#ea580c"}}>ACHATS PAR TRANSFERT</p>
                <div className="space-y-2">{transferPurchases.map(c=>{
                  const paid=Number(c.paidAmount??0); const due=Math.max(0,c.montant-paid);
                  return <div key={c.id} className="rounded-xl px-3 py-2.5" style={{background:"#fff7ed"}}>
                    <div className="flex items-center justify-between"><p className="text-sm font-bold">{c.label}</p><p className="text-sm font-black" style={{color:"#ea580c"}}>{fmt(c.montant)}</p></div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground"><span>{c.date}</span><span>Réglé {fmt(paid)} · Reste {fmt(due)}</span></div>
                  </div>;
                })}</div>
              </div>}
              {(() => {
                const manualPays=(boutique.charges??[]).filter(c=>c.fournisseur===s.nom&&c.source!=="transfer");
                const transferPays=transferPurchases.filter(c=>Number(c.paidAmount??0)>0);
                const pays=[...manualPays,...transferPays].sort((a,b)=>b.id-a.id);
                return pays.length>0?(
                <div className="px-4 pb-3 border-t border-border">
                  <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{ color:SEM.success.text }}>PAIEMENTS EFFECTUÉS</p>
                  <div className="space-y-2">
                    {pays.map(c=>{
                      const paid=c.source==="transfer"?Number(c.paidAmount??0):c.montant;
                      return <div key={`${c.id}-${c.source}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background:SEM.success.bg }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:SEM.success.accent }}/>
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold">{c.label}</p><p className="text-xs text-muted-foreground">{c.date}</p></div>
                        <p className="text-sm font-black" style={{ color:SEM.success.text, fontFamily:"'Nunito',sans-serif" }}>−{fmt(paid)}</p>
                      </div>;
                    })}
                  </div>
                </div>
              ):null; })()}'''
if old not in sup:
    raise SystemExit('Supplier payments block anchor not found')
sup = sup.replace(old, new, 1)
sup_path.write_text(sup)

print('Supplier debts and charge persistence corrected successfully')
