from pathlib import Path

# Rapport: receivables are net of credit-note debt reductions.
p=Path('src/app/screens/RapportView.tsx'); s=p.read_text()
old='''  const impayé       = filtInv.filter(i=>invoiceSign(i)>0).reduce((s,i)=>s+invoiceRemainingAmount(i),0);'''
new='''  const returnReceivableBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const credit of invoices) {
      if (credit.type.toLowerCase() !== "retour" || !credit.returnOfInvoiceId) continue;
      map.set(credit.returnOfInvoiceId, (map.get(credit.returnOfInvoiceId) ?? 0) + Number(credit.returnReceivableReduction ?? 0));
    }
    return map;
  }, [invoices]);
  const netInvoiceRemaining = (invoice: typeof invoices[number]) => Math.max(0, invoiceRemainingAmount(invoice) - (returnReceivableBySource.get(invoice.id) ?? 0));
  const impayé       = filtInv.filter(i=>invoiceSign(i)>0).reduce((sum,invoice)=>sum+netInvoiceRemaining(invoice),0);'''
if old not in s: raise SystemExit('Rapport impaye anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Stock: expose archive control and visually identify archived products.
p=Path('src/app/screens/StockView.tsx'); s=p.read_text()
old='''              <div className="flex gap-2">
                <button onClick={() => { setEditingProduct(true); setEditNom(detail.nom); setEditCat(detail.categorie ?? ""); setEditPrixAchat(String(detail.prixAchat ?? 0)); }}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-left" style={{ background: "#EEE9D8", color: "#7A7055" }}>
                  <Edit2 size={13}/> Modifier
                </button>
                <button onClick={() => setAddMode(true)} className="flex-1 py-2.5 rounded-xl text-xs font-black active:scale-95" style={{ background: "#3b82f6", color: "#fff" }}>
                  + Recevoir
                </button>
              </div>'''
new='''              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setEditingProduct(true); setEditNom(detail.nom); setEditCat(detail.categorie ?? ""); setEditPrixAchat(String(detail.prixAchat ?? 0)); }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold" style={{ background: "#EEE9D8", color: "#7A7055" }}>
                  <Edit2 size={13}/> Modifier
                </button>
                <button onClick={()=>void toggleProductArchive()} className="py-2.5 rounded-xl text-xs font-black active:scale-95" style={{ background:detail.actif===false?"#f0fdf4":"#f3f4f6", color:detail.actif===false?"#166534":"#6b7280" }}>
                  {detail.actif===false ? "♻ Réactiver" : "📦 Archiver"}
                </button>
                <button disabled={detail.actif===false} onClick={() => setAddMode(true)} className="py-2.5 rounded-xl text-xs font-black active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "#3b82f6", color: "#fff" }} title={detail.actif===false?"Réactivez le produit avant une nouvelle réception":"Recevoir du stock"}>
                  + Recevoir
                </button>
              </div>
              {detail.actif===false&&<div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Produit archivé · historique conservé · indisponible pour les nouvelles ventes.</div>}'''
if old not in s: raise SystemExit('Stock detail actions anchor missing')
s=s.replace(old,new,1)
# Add archive badge on list item beside category line if stable phrase exists.
s=s.replace('''{p.categorie&&<span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background:"#3b82f622",color:"#3b82f6" }}>{p.categorie}</span>}''',
'''{p.categorie&&<span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background:"#3b82f622",color:"#3b82f6" }}>{p.categorie}</span>}{p.actif===false&&<span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">Archivé</span>}''',1)
p.write_text(s)

# POS: archived products disappear from new-sales catalog, while existing pending orders can still render their old lines.
p=Path('src/app/screens/POSView.tsx'); s=p.read_text()
s=s.replace('''  const allPosCats = Array.from(new Set(products.map(p => p.categorie).filter(Boolean) as string[]));''',
'''  const saleProducts = products.filter(product => product.actif !== false);
  const allPosCats = Array.from(new Set(saleProducts.map(p => p.categorie).filter(Boolean) as string[]));''',1)
s=s.replace('''  const filtered = products
    .filter(p => p.nom.toLowerCase().includes(search.toLowerCase()))''',
'''  const filtered = saleProducts
    .filter(p => p.nom.toLowerCase().includes(search.toLowerCase()))''',1)
# Defensive guards if stale UI opens an archived product.
s=s.replace('''  function openExpress(e: React.MouseEvent, p: Product) {
    e.stopPropagation();''','''  function openExpress(e: React.MouseEvent, p: Product) {
    e.stopPropagation();
    if (p.actif === false) return;''',1)
# Find normal product modal opener pattern and guard in add function if present.
if 'function openAdd' in s:
    s=s.replace('''function openAdd(p: Product) {''','''function openAdd(p: Product) {
    if (p.actif === false) return;''',1)
p.write_text(s)

# Factures: direct invoice creation product selector only offers active products.
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
# Initialize line product from active set, not archived first product.
s=s.replace('''  const [lPid,setLPid]=useState<number>(products[0]?.id??0);''','''  const activeProducts = products.filter(product=>product.actif!==false);
  const [lPid,setLPid]=useState<number>(activeProducts[0]?.id??0);''',1)
s=s.replace('''const first=products[0]; if(first){''','''const first=activeProducts[0]; if(first){''',1)
s=s.replace('''{products.map(p=><option key={p.id} value={p.id}>{p.nom} (stock: {productQty(p.id,entries)} {p.unit})</option>)}''',
'''{activeProducts.map(p=><option key={p.id} value={p.id}>{p.nom} (stock: {productQty(p.id,entries)} {p.unit})</option>)}''',1)
# Ensure product lookups still use all products for historical display; only selection is filtered.
p.write_text(s)

# Type guard already supports actif; verify expected markers.
checks={
 'src/app/screens/RapportView.tsx':['returnReceivableBySource','netInvoiceRemaining'],
 'src/app/screens/StockView.tsx':['toggleProductArchive','Produit archivé'],
 'src/app/screens/POSView.tsx':['saleProducts','product.actif !== false'],
 'src/app/screens/FacturesView.tsx':['activeProducts'],
}
for file,markers in checks.items():
    text=Path(file).read_text()
    for marker in markers:
        if marker not in text: raise SystemExit(f'{file}: missing {marker}')
