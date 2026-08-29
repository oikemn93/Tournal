from pathlib import Path


def one(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f'{label}: expected 1 match, got {text.count(old)}')
    return text.replace(old, new, 1)

api_path = Path('src/lib/api.ts')
api = api_path.read_text()
api = one(
    api,
    'export async function addBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string) {\n  return dataRequest<{boutique_id:string;nom:string;ville:string|null;tel:string|null}>("rpc/add_boutique_partner", {\n    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId }),\n  });\n}',
    'export async function addBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string, phone:string) {\n  return dataRequest<{boutique_id:string;nom:string;ville:string|null;tel:string|null}>("rpc/add_boutique_partner", {\n    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId, p_phone:phone }),\n  });\n}',
    'addBoutiquePartner signature',
)
api_path.write_text(api)

path = Path('src/app/screens/TransfersView.tsx')
s = path.read_text()
s = one(s,
    'type DraftLine = { productId: number; nom: string; unit: string; qty: number; sellUnit: string; sellQty: number; unitPrice: number };',
    'type DraftLine = { draftId: string; productId: number; nom: string; unit: string; qty: number; sellUnit: string; sellQty: number; unitPrice: number };',
    'DraftLine')

s = one(s,
'''    for (const b of accountDestinations) map.set(b.id, { id:b.id, nom:b.nom, ville:b.ville, tel:b.tel, isPartner:false });''',
'''    // Never expose unrelated application boutiques in the transfer picker.
    // Own boutiques remain directly available; every external destination must
    // first be added manually through the phone-only directory.
    for (const b of accountDestinations.filter(b => sameOwnerIds.has(b.id))) {
      map.set(b.id, { id:b.id, nom:b.nom, ville:b.ville, tel:b.tel, isPartner:false });
    }''',
    'destination privacy')

s = one(s,
    '      await addBoutiquePartner(boutique.id, entry.boutique_id);',
    '      await addBoutiquePartner(boutique.id, entry.boutique_id, directoryQuery);',
    'partner phone proof')

old_add = '''    const stock = productQty(p.id, boutique.entries);
    if (!sellQty || sellQty <= 0 || baseQty > stock) return toast.error(`Quantité invalide (stock : ${stock} ${p.unit})`);
    if (price < 0) return toast.error("Prix invalide");
    setDraftLines(prev => [...prev.filter(l => l.productId !== p.id), { productId: p.id, nom: p.nom, unit: p.unit, qty: baseQty, sellUnit, sellQty, unitPrice: price }]);'''
new_add = '''    const stock = productQty(p.id, boutique.entries);
    const alreadyDrafted = draftLines.filter(l => l.productId === p.id).reduce((sum,l) => sum + l.qty, 0);
    if (!sellQty || sellQty <= 0 || baseQty <= 0) return toast.error("Quantité invalide");
    if (alreadyDrafted + baseQty > stock) return toast.error(`Stock insuffisant : ${alreadyDrafted + baseQty} ${p.unit} demandés pour ${stock} disponibles`);
    if (price < 0) return toast.error("Prix invalide");
    setDraftLines(prev => [...prev, { draftId:crypto.randomUUID(), productId: p.id, nom: p.nom, unit: p.unit, qty: baseQty, sellUnit, sellQty, unitPrice: price }]);'''
s = one(s, old_add, new_add, 'append multi conditioning')

old_confirm = '''    const mappings = (receiving.stock_transfer_lines ?? []).map(line => {
      const selected = receiveMappings[line.id] ?? "new";
      return selected === "new"
        ? { transferLineId:line.id, createNew:true }
        : { transferLineId:line.id, destinationProductId:Number(selected) };
    });'''
new_confirm = '''    const seenNewSourceProducts = new Set<number>();
    const mappings = (receiving.stock_transfer_lines ?? []).flatMap(line => {
      const selected = receiveMappings[line.id] ?? "new";
      if (selected !== "new") return [{ transferLineId:line.id, destinationProductId:Number(selected) }];
      // For several conditioning lines of the same source product, create the
      // destination product once. Later lines omit the mapping so the backend
      // reuses the exact product created by the first line in this transaction.
      if (seenNewSourceProducts.has(line.source_product_id)) return [];
      seenNewSourceProducts.add(line.source_product_id);
      return [{ transferLineId:line.id, createNew:true }];
    });'''
s = one(s, old_confirm, new_confirm, 'receive duplicate mapping')

old_select = '''                <select value={receiveMappings[line.id] ?? "new"} onChange={e=>setReceiveMappings(prev=>({...prev,[line.id]:e.target.value}))} className={inputCls}>'''
new_select = '''                <select value={receiveMappings[line.id] ?? "new"} onChange={e=>{
                  const value=e.target.value;
                  setReceiveMappings(prev=>{
                    const next={...prev};
                    for (const sibling of receiving.stock_transfer_lines ?? []) if (sibling.source_product_id===line.source_product_id) next[sibling.id]=value;
                    return next;
                  });
                }} className={inputCls}>'''
s = one(s, old_select, new_select, 'sync receiving mapping')

s = one(s, '<div key={l.productId} className="flex items-center gap-2 px-3 py-2 rounded-xl"', '<div key={l.draftId} className="flex items-center gap-2 px-3 py-2 rounded-xl"', 'draft key')
s = one(s,
    'setDraftLines(prev => prev.filter(x => x.productId !== l.productId))',
    'setDraftLines(prev => prev.filter(x => x.draftId !== l.draftId))',
    'draft remove one')

# Clarify the directory rule in the transfer form itself.
s = one(s,
    '<option value="">Choisir une boutique…</option>',
    '<option value="">Choisir une boutique autorisée…</option>',
    'destination placeholder')
s = one(s,
    '''              {destinationBoutique && (
                <p className="text-xs text-muted-foreground px-1">{destinationBoutique.tel ? `Tél. ${destinationBoutique.tel}` : "Téléphone non renseigné"}{destinationBoutique.ville ? ` · ${destinationBoutique.ville}` : ""}</p>
              )}''',
    '''              {destinationBoutique ? (
                <p className="text-xs text-muted-foreground px-1">{destinationBoutique.tel ? `Tél. ${destinationBoutique.tel}` : "Téléphone non renseigné"}{destinationBoutique.ville ? ` · ${destinationBoutique.ville}` : ""}</p>
              ) : (
                <button type="button" onClick={()=>setDirectoryOpen(true)} className="text-xs font-black px-1 text-left" style={{color:TRANSFER_COLOR}}>Destinataire externe absent ? Ajoutez-le d’abord avec son numéro dans l’annuaire.</button>
              )}''',
    'directory hint')

path.write_text(s)
print('transfer directory + multi-conditioning patch applied')
