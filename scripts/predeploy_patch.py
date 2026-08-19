from pathlib import Path

path = Path('src/app/screens/TransfersView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    'import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock } from "lucide-react";',
    'import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock, Search } from "lucide-react";',
    'search icon import',
)
replace_once(
    'import { productQty } from "../utils/inventory";',
    'import { productQty } from "../utils/inventory";\nimport { getLastSalePrice } from "../utils/sales";',
    'last sale price import',
)
replace_once(
    '  const [destination, setDestination] = useState("");\n  const [note, setNote] = useState("");',
    '  const [destination, setDestination] = useState("");\n  const [destinationSearch, setDestinationSearch] = useState("");\n  const [note, setNote] = useState("");',
    'destination search state',
)
replace_once(
    '''  const destinationBoutique = destinations.find(b => b.id === destination);\n  const isSameOwner = destination ? sameOwnerIds.has(destination) : null;\n\n  const draftTotal = useMemo(''',
    '''  const destinationBoutique = destinations.find(b => b.id === destination);\n  const isSameOwner = destination ? sameOwnerIds.has(destination) : null;\n  const destinationFrequency = useMemo(() => {\n    const counts = new Map<string, number>();\n    for (const transfer of transfers) {\n      const otherId = transfer.from_boutique_id === boutique.id ? transfer.to_boutique_id : transfer.from_boutique_id;\n      if (otherId !== boutique.id) counts.set(otherId, (counts.get(otherId) ?? 0) + 1);\n    }\n    return counts;\n  }, [transfers, boutique.id]);\n  const filteredDestinations = useMemo(() => {\n    const q = destinationSearch.trim().toLowerCase().replace(/\\s+/g, "");\n    return [...destinations]\n      .filter(b => {\n        if (!q) return true;\n        const haystack = `${b.nom} ${b.ville ?? ""} ${b.tel ?? ""}`.toLowerCase().replace(/\\s+/g, "");\n        return haystack.includes(q);\n      })\n      .sort((a, b) => {\n        const sameOwnerDelta = Number(sameOwnerIds.has(b.id)) - Number(sameOwnerIds.has(a.id));\n        if (sameOwnerDelta) return sameOwnerDelta;\n        const freqDelta = (destinationFrequency.get(b.id) ?? 0) - (destinationFrequency.get(a.id) ?? 0);\n        return freqDelta || a.nom.localeCompare(b.nom);\n      });\n  }, [destinations, destinationSearch, destinationFrequency]);\n\n  const draftTotal = useMemo(''',
    'destination ranking',
)
replace_once(
    '''  function selectProduct(pid: string) {\n    setDLineProductId(pid);\n    const p = availableProducts.find(p => p.id === Number(pid));\n    setDLinePrice(p?.prixVente ? String(p.prixVente) : "");\n  }''',
    '''  function selectProduct(pid: string) {\n    setDLineProductId(pid);\n    setDLineQty("");\n    const p = availableProducts.find(p => p.id === Number(pid));\n    if (!p) { setDLinePrice(""); return; }\n    const lastSale = getLastSalePrice(p.id, boutique.invoices, p.unit);\n    const receipts = boutique.entries.filter(e => e.productId === p.id && e.qty > 0 && e.montantDu > 0);\n    const receivedQty = receipts.reduce((sum, e) => sum + e.qty, 0);\n    const weightedCost = receivedQty > 0 ? receipts.reduce((sum, e) => sum + e.montantDu, 0) / receivedQty : null;\n    const suggested = lastSale ?? weightedCost ?? p.prixVente ?? null;\n    setDLinePrice(suggested != null && suggested > 0 ? String(Math.round(suggested)) : "");\n  }''',
    'transfer price suggestion',
)
replace_once(
    '    setDestination(""); setNote(""); setDraftLines([]);',
    '    setDestination(""); setDestinationSearch(""); setNote(""); setDraftLines([]);',
    'reset destination search',
)
replace_once(
    '''          <Field label="BOUTIQUE DESTINATAIRE">\n            <select value={destination} onChange={e => setDestination(e.target.value)} className={inputCls}>\n              <option value="">Choisir une boutique…</option>\n              {sameOwnerIds.size > 0 && (\n                <optgroup label="Même propriétaire (interne)">\n                  {destinations.filter(b => sameOwnerIds.has(b.id)).map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}\n                </optgroup>\n              )}\n              {destinations.filter(b => !sameOwnerIds.has(b.id)).length > 0 && (\n                <optgroup label="Autre propriétaire (commercial)">\n                  {destinations.filter(b => !sameOwnerIds.has(b.id)).map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}\n                </optgroup>\n              )}\n            </select>\n          </Field>''',
    '''          <Field label="BOUTIQUE DESTINATAIRE">\n            <div className="space-y-2">\n              <div className="relative">\n                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>\n                <input value={destinationSearch} onChange={e=>setDestinationSearch(e.target.value)} placeholder="Rechercher nom, téléphone ou ville…" className={inputCls+" pl-9"}/>\n              </div>\n              <select value={destination} onChange={e => setDestination(e.target.value)} className={inputCls}>\n                <option value="">Choisir une boutique…</option>\n                {filteredDestinations.map(b => {\n                  const count = destinationFrequency.get(b.id) ?? 0;\n                  const relation = sameOwnerIds.has(b.id) ? "interne" : "commercial";\n                  return <option key={b.id} value={b.id}>{b.nom}{b.ville ? ` — ${b.ville}` : ""}{b.tel ? ` · ${b.tel}` : ""} · {relation}{count > 0 ? ` · ${count} transfert${count>1?"s":""}` : ""}</option>;\n                })}\n              </select>\n              {destinationBoutique && (\n                <p className="text-xs text-muted-foreground px-1">{destinationBoutique.tel ? `Tél. ${destinationBoutique.tel}` : "Téléphone non renseigné"}{destinationBoutique.ville ? ` · ${destinationBoutique.ville}` : ""}</p>\n              )}\n            </div>\n          </Field>''',
    'searchable destination selector',
)
replace_once(
    '<input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/>',
    '<div><input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Dernier prix vendu, sinon coût moyen stock</p></div>',
    'price hint',
)

path.write_text(text)
print('Transfer search and pricing patched successfully')
