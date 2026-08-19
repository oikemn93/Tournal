from pathlib import Path

path = Path('src/app/screens/FacturesView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    'import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount, invoicePaymentEvents } from "../utils/payments";\n',
    'import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount, invoicePaymentEvents } from "../utils/payments";\nimport { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";\n',
    'sales helper import',
)

replace_once(
    '  const [client,setClient] = useState(clients[0]?.nom??"");',
    '  const [clientRef,setClientRef] = useState(clients[0] ? `client:${clients[0].id}` : siblings[0] ? `boutique:${siblings[0].id}` : "");',
    'client identity state',
)

replace_once(
    '        setClient(selectedClient.nom);\n        setLines([]);\n        setAcompte("");\n        setModal(true);',
    '        setClientRef(`client:${selectedClient.id}`);\n        setLines([]);\n        setAcompte("");\n        const firstProduct = products[0];\n        if (firstProduct) {\n          const unit = getDefaultSaleUnit(firstProduct, boutique);\n          setLPid(firstProduct.id);\n          setLSellUnit(unit);\n          setLQty("");\n          const last = getLastSalePrice(firstProduct.id, invoices, unit);\n          setLPrix(last != null ? String(last) : "");\n        }\n        setModal(true);',
    'initial client identity',
)

replace_once('''  // Sell options for the invoice line form — mirrors getSellOptions in POS
  function getInvSellOptions(pid: number): string[] {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return [];
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    if (!cat || cat.nbPiecesParLot<=0) return [prod.unit];
    const opts: string[] = ["Lot"];
    if (cat.unitVente !== "pièces") opts.push("Pièce");
    opts.push(cat.unitVente);
    return opts;
  }
  function invToBaseQty(sellQty: number, sellUnit: string, pid: number): number {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return sellQty;
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    if (!cat || cat.nbPiecesParLot<=0) return sellQty;
    if (sellUnit==="Lot") return cat.unitVente==="pièces"
      ? sellQty*cat.nbPiecesParLot
      : sellQty*cat.nbPiecesParLot*(cat.longueurParPiece||1);
    if (sellUnit==="Pièce") return cat.unitVente==="pièces" ? sellQty : sellQty*(cat.longueurParPiece||1);
    return sellQty; // direct unit (yards/mètres)
  }
  function invDefaultUnit(pid: number): string {
    const opts = getInvSellOptions(pid);
    if (opts.length===0) return "";
    const prod = products.find(p=>p.id===pid);
    const cat = (boutique.categories??[]).find(c=>c.nom===prod?.categorie);
    const base = cat?.unitVente ?? prod?.unit ?? "";
    const isFabric = base==="yards"||base==="mètres"||base==="metres";
    if (isFabric && opts.includes(base)) return base;
    if (opts.includes("Pièce")) return "Pièce";
    return opts[0];
  }
''', '''  // Sale defaults are shared with POS so quantity/unit/price behave identically everywhere.
  function getInvSellOptions(pid: number): string[] {
    const prod = products.find(p=>p.id===pid);
    return prod ? getSaleUnitOptions(prod, boutique) : [];
  }
  function invToBaseQty(sellQty: number, sellUnit: string, pid: number): number {
    const prod = products.find(p=>p.id===pid);
    return prod ? toBaseSaleQty(sellQty, sellUnit, prod, boutique) : sellQty;
  }
  function invDefaultUnit(pid: number): string {
    const prod = products.find(p=>p.id===pid);
    return prod ? getDefaultSaleUnit(prod, boutique) : "";
  }
''', 'invoice sale helpers')

replace_once(
    '  const siblingClient = siblings.find(s=>s.nom===client);',
    '''  const selectedClient = clientRef.startsWith("client:")
    ? clients.find(c => c.id === Number(clientRef.slice("client:".length)))
    : undefined;
  const siblingClient = clientRef.startsWith("boutique:")
    ? siblings.find(s => s.id === clientRef.slice("boutique:".length))
    : undefined;
  const selectedClientName = siblingClient?.nom ?? selectedClient?.nom ?? "";''',
    'client selection derivation',
)

replace_once(
    '      id: retId, client: returnInv.client, clientTel: returnInv.clientTel,',
    '      id: retId, clientId:returnInv.clientId, client: returnInv.client, clientTel: returnInv.clientTel,',
    'return client id',
)

replace_once('''  async function submit() {
    if (!client||lines.length===0 || submittingInvoice) return;
    setSubmittingInvoice(true);
    const isSiblingTransfer = !!siblingClient;
    const ct  = isSiblingTransfer ? "Inter-tenant" : (clients.find(c=>c.nom===client)?.type??"B2C");
    const cTel = clients.find(c=>c.nom===client)?.tel;
    let persisted;
    try {
      persisted = await createSale({ boutiqueId:boutique.id, client, clientTel:cTel, lines });
''', '''  async function submit() {
    if (!clientRef || !selectedClientName || lines.length===0 || submittingInvoice) return;
    setSubmittingInvoice(true);
    const isSiblingTransfer = !!siblingClient;
    const ct  = isSiblingTransfer ? "Inter-tenant" : (selectedClient?.type??"B2C");
    const cTel = selectedClient?.tel;
    let persisted;
    try {
      persisted = await createSale({ boutiqueId:boutique.id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, lines });
''', 'invoice submit identity')

replace_once('''    const selectedClient = clients.find(c=>c.nom===client);
    const newInv: Invoice = {
      id, clientId:selectedClient?.id, client, clientTel:cTel, clientType:selectedClient?.type,
''', '''    const newInv: Invoice = {
      id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, clientType:selectedClient?.type,
''', 'new invoice canonical client')

replace_once(
    '    logAction(isSiblingTransfer?"Transfert inter-tenant":"Nouvelle facture", `${id} · ${client} · ${fmt(montant)}`, isSiblingTransfer?"🔄":"🧾");',
    '    logAction(isSiblingTransfer?"Transfert inter-tenant":"Nouvelle facture", `${id} · ${selectedClientName} · ${fmt(montant)}`, isSiblingTransfer?"🔄":"🧾");',
    'invoice audit client',
)

replace_once(
    '<button onClick={()=>{ setLines([]); setAcompte(""); setLQty(""); setLPrix(""); setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95"',
    '<button onClick={()=>{ setLines([]); setAcompte(""); const first=products[0]; if(first){ const unit=getDefaultSaleUnit(first,boutique); setLPid(first.id); setLSellUnit(unit); setLQty(""); const last=getLastSalePrice(first.id,invoices,unit); setLPrix(last!=null?String(last):""); } setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95"',
    'new invoice defaults',
)

replace_once('''          <select value={client} onChange={e=>setClient(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            {siblings.length>0&&<optgroup label="🏪 Mes autres boutiques">{siblings.map(sb=><option key={sb.id} value={sb.nom}>{sb.nom} — {sb.ville} (inter-tenant)</option>)}</optgroup>}
            <optgroup label="Clients">{clients.map(c=><option key={c.id} value={c.nom}>{c.nom} ({c.type})</option>)}</optgroup>
          </select>
''', '''          <select value={clientRef} onChange={e=>setClientRef(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            {siblings.length>0&&<optgroup label="🏪 Mes autres boutiques">{siblings.map(sb=><option key={sb.id} value={`boutique:${sb.id}`}>{sb.nom} — {sb.ville} (inter-tenant)</option>)}</optgroup>}
            <optgroup label="Clients">{clients.map(c=><option key={c.id} value={`client:${c.id}`}>{c.nom} ({c.type})</option>)}</optgroup>
          </select>
''', 'client select ids')

replace_once(
    '<select value={lPid} onChange={e=>{ const newPid=Number(e.target.value); setLPid(newPid); setLSellUnit(invDefaultUnit(newPid)); }} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none"',
    '<select value={lPid} onChange={e=>{ const newPid=Number(e.target.value); const prod=products.find(p=>p.id===newPid); setLPid(newPid); setLQty(""); if(prod){ const unit=getDefaultSaleUnit(prod,boutique); setLSellUnit(unit); const last=getLastSalePrice(prod.id,invoices,unit); setLPrix(last!=null?String(last):""); } else { setLSellUnit(""); setLPrix(""); } }} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none"',
    'invoice product defaults',
)

replace_once(
    'return(<button key={u} onClick={()=>setLSellUnit(u)} className="flex-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap"',
    'return(<button key={u} onClick={()=>{ setLSellUnit(u); setLQty(""); const last=getLastSalePrice(lPid,invoices,u); setLPrix(last!=null?String(last):""); }} className="flex-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap"',
    'invoice unit defaults',
)

replace_once(
    '<SubmitBtn color={boutique.color} label={submittingInvoice ? "Création…" : "Créer la facture"} onClick={submit} disabled={submittingInvoice || !client||lines.length===0}/>',
    '<SubmitBtn color={boutique.color} label={submittingInvoice ? "Création…" : "Créer la facture"} onClick={submit} disabled={submittingInvoice || !clientRef||lines.length===0}/>',
    'invoice submit disabled',
)

path.write_text(text)
print('Factures identity and sale defaults patched successfully')
