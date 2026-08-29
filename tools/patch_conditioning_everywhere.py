from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# API: preserve conditioning on transfer lines and send it to the backend.
replace_once(
    "src/lib/api.ts",
    '  stock_transfer_lines:Array<{ product_name:string; unit:string; qty:number; prix_unit:number; discount_percent:number }>;\n',
    '  stock_transfer_lines:Array<{ product_name:string; unit:string; qty:number; prix_unit:number; discount_percent:number; sell_unit:string|null; sell_qty:number|null }>;\n',
)
replace_once(
    "src/lib/api.ts",
    'stock_transfer_lines(product_name,unit,qty,prix_unit,discount_percent)',
    'stock_transfer_lines(product_name,unit,qty,prix_unit,discount_percent,sell_unit,sell_qty)',
)
replace_once(
    "src/lib/api.ts",
    'export async function createStockTransfer(params: { fromBoutiqueId:string; toBoutiqueId:string; lines:Array<{productId:number;qty:number;unitPrice:number;discountPercent:number}>; note?:string }) {\n  return dataRequest<{transfer_id:string;status:string;relationship_type:"same_owner"|"commercial";total_amount:number}>("rpc/create_stock_transfer", { method:"POST", body:JSON.stringify({ p_from_boutique_id:params.fromBoutiqueId,p_to_boutique_id:params.toBoutiqueId,p_idempotency_key:crypto.randomUUID(),p_lines:params.lines.map(line=>({product_id:line.productId,qty:line.qty,unit_price:line.unitPrice,discount_percent:line.discountPercent})),p_note:params.note ?? null }) });\n}\n',
    'export async function createStockTransfer(params: { fromBoutiqueId:string; toBoutiqueId:string; lines:Array<{productId:number;qty:number;unitPrice:number;discountPercent:number;sellUnit?:string;sellQty?:number}>; note?:string }) {\n  return dataRequest<{transfer_id:string;status:string;relationship_type:"same_owner"|"commercial";total_amount:number}>("rpc/create_stock_transfer", { method:"POST", body:JSON.stringify({ p_from_boutique_id:params.fromBoutiqueId,p_to_boutique_id:params.toBoutiqueId,p_idempotency_key:crypto.randomUUID(),p_lines:params.lines.map(line=>({product_id:line.productId,qty:line.qty,unit_price:line.unitPrice,discount_percent:line.discountPercent,sell_unit:line.sellUnit ?? null,sell_qty:line.sellQty ?? null})),p_note:params.note ?? null }) });\n}\n',
)

# POS: show explicit conditioning labels everywhere while retaining unit default.
replace_once(
    "src/app/screens/POSView.tsx",
    'import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";',
    'import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, getSaleUnitLabel, toBaseSaleQty } from "../utils/sales";',
)
replace_once(
    "src/app/screens/POSView.tsx",
    '                    {u}\n                  </button>',
    '                    {getSaleUnitLabel(addModal, boutique, u)}\n                  </button>',
)

# Factures: same shared conditioning vocabulary as POS.
replace_once(
    "src/app/screens/FacturesView.tsx",
    'import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";',
    'import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, getSaleUnitLabel, toBaseSaleQty } from "../utils/sales";',
)
replace_once(
    "src/app/screens/FacturesView.tsx",
    '                const lbl=u==="Lot"?(cat2?\'Lot (\'+cat2.nbPiecesParLot+\'p)\':\'Lot\'):u==="Pièce"?"Pièce":u;\n',
    '                const lbl=prod ? getSaleUnitLabel(prod,boutique,u) : u;\n',
)
replace_once(
    "src/app/screens/FacturesView.tsx",
    '              const cat2=(boutique.categories??[]).find(c=>c.nom===products.find(p=>p.id===lPid)?.categorie);\n              const effUnit=lSellUnit||invDefaultUnit(lPid);',
    '              const prod=products.find(p=>p.id===lPid);\n              const effUnit=lSellUnit||invDefaultUnit(lPid);',
)

# Transfers: use the exact same conditioning model as POS/Factures.
replace_once(
    "src/app/screens/TransfersView.tsx",
    'import { getLastSalePrice } from "../utils/sales";',
    'import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitLabel, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    'type DraftLine = { productId: number; nom: string; unit: string; qty: number; unitPrice: number; discountPercent: number };',
    'type DraftLine = { productId: number; nom: string; unit: string; qty: number; sellUnit: string; sellQty: number; unitPrice: number; discountPercent: number };',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '  const [dLineQty, setDLineQty] = useState("");\n  const [dLinePrice, setDLinePrice] = useState("");',
    '  const [dLineQty, setDLineQty] = useState("");\n  const [dLineSellUnit, setDLineSellUnit] = useState("");\n  const [dLinePrice, setDLinePrice] = useState("");',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '  const draftTotal = useMemo(\n    () => draftLines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPercent / 100), 0),',
    '  const draftTotal = useMemo(\n    () => draftLines.reduce((s, l) => s + l.sellQty * l.unitPrice * (1 - l.discountPercent / 100), 0),',
)
old_select = '''  function selectProduct(pid: string) {
    setDLineProductId(pid);
    setDLineQty("");
    const p = availableProducts.find(p => p.id === Number(pid));
    if (!p) { setDLinePrice(""); return; }
    const lastSale = getLastSalePrice(p.id, boutique.invoices, p.unit);
    const receipts = boutique.entries.filter(e => e.productId === p.id && e.qty > 0 && e.montantDu > 0);
    const receivedQty = receipts.reduce((sum, e) => sum + e.qty, 0);
    const weightedCost = receivedQty > 0 ? receipts.reduce((sum, e) => sum + e.montantDu, 0) / receivedQty : null;
    const suggested = lastSale ?? weightedCost ?? p.prixVente ?? null;
    setDLinePrice(suggested != null && suggested > 0 ? String(Math.round(suggested)) : "");
  }

  function addDraftLine() {
    const p = availableProducts.find(p => p.id === Number(dLineProductId));
    if (!p) return toast.error("Produit invalide");
    const q = Number(dLineQty), price = Number(dLinePrice), disc = Number(dLineDiscount);
    const stock = productQty(p.id, boutique.entries);
    if (!q || q <= 0 || q > stock) return toast.error(`Quantité invalide (stock : ${stock} ${p.unit})`);
    if (price < 0) return toast.error("Prix invalide");
    if (disc < 0 || disc > 100) return toast.error("Remise invalide (0-100%)");
    setDraftLines(prev => [...prev.filter(l => l.productId !== p.id), { productId: p.id, nom: p.nom, unit: p.unit, qty: q, unitPrice: price, discountPercent: disc }]);
    setDLineProductId(""); setDLineQty(""); setDLinePrice(""); setDLineDiscount("0");
  }
'''
new_select = '''  function transferSuggestedPrice(p: (typeof availableProducts)[number], sellUnit: string) {
    const lastSale = getLastSalePrice(p.id, boutique.invoices, sellUnit);
    if (lastSale != null) return lastSale;
    const receipts = boutique.entries.filter(e => e.productId === p.id && e.qty > 0 && e.montantDu > 0);
    const receivedQty = receipts.reduce((sum, e) => sum + e.qty, 0);
    const basePrice = p.prixVente && p.prixVente > 0
      ? p.prixVente
      : receivedQty > 0 ? receipts.reduce((sum, e) => sum + e.montantDu, 0) / receivedQty : 0;
    const factor = toBaseSaleQty(1, sellUnit, p, boutique);
    return basePrice > 0 ? basePrice * factor : null;
  }

  function selectProduct(pid: string) {
    setDLineProductId(pid);
    setDLineQty("");
    const p = availableProducts.find(p => p.id === Number(pid));
    if (!p) { setDLineSellUnit(""); setDLinePrice(""); return; }
    const defaultUnit = getDefaultSaleUnit(p, boutique);
    setDLineSellUnit(defaultUnit);
    const suggested = transferSuggestedPrice(p, defaultUnit);
    setDLinePrice(suggested != null && suggested > 0 ? String(Math.round(suggested)) : "");
  }

  function selectTransferUnit(unit: string) {
    setDLineSellUnit(unit);
    setDLineQty("");
    const p = availableProducts.find(p => p.id === Number(dLineProductId));
    if (!p) return;
    const suggested = transferSuggestedPrice(p, unit);
    setDLinePrice(suggested != null && suggested > 0 ? String(Math.round(suggested)) : "");
  }

  function addDraftLine() {
    const p = availableProducts.find(p => p.id === Number(dLineProductId));
    if (!p) return toast.error("Produit invalide");
    const sellQty = Number(dLineQty), price = Number(dLinePrice), disc = Number(dLineDiscount);
    const sellUnit = dLineSellUnit || getDefaultSaleUnit(p, boutique);
    const baseQty = toBaseSaleQty(sellQty, sellUnit, p, boutique);
    const stock = productQty(p.id, boutique.entries);
    if (!sellQty || sellQty <= 0 || baseQty > stock) return toast.error(`Quantité invalide (stock : ${stock} ${p.unit})`);
    if (price < 0) return toast.error("Prix invalide");
    if (disc < 0 || disc > 100) return toast.error("Remise invalide (0-100%)");
    setDraftLines(prev => [...prev.filter(l => l.productId !== p.id), { productId: p.id, nom: p.nom, unit: p.unit, qty: baseQty, sellUnit, sellQty, unitPrice: price, discountPercent: disc }]);
    setDLineProductId(""); setDLineQty(""); setDLineSellUnit(""); setDLinePrice(""); setDLineDiscount("0");
  }
'''
replace_once("src/app/screens/TransfersView.tsx", old_select, new_select)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '    setDLineProductId(""); setDLineQty(""); setDLinePrice(""); setDLineDiscount("0");\n    setNewModal(false);',
    '    setDLineProductId(""); setDLineQty(""); setDLineSellUnit(""); setDLinePrice(""); setDLineDiscount("0");\n    setNewModal(false);',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '        lines: draftLines.map(l => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, discountPercent: l.discountPercent })),',
    '        lines: draftLines.map(l => ({ productId: l.productId, qty: l.qty, sellUnit:l.sellUnit, sellQty:l.sellQty, unitPrice: l.unitPrice, discountPercent: l.discountPercent })),',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '<span className="text-muted-foreground ml-2 flex-shrink-0">{l.qty} {l.unit} × {fmt(Number(l.prix_unit))}{l.discount_percent > 0 ? ` −${l.discount_percent}%` : ""}</span>',
    '<span className="text-muted-foreground ml-2 flex-shrink-0">{Number(l.sell_qty ?? l.qty)} {l.sell_unit ?? l.unit} × {fmt(Number(l.prix_unit))}{l.discount_percent > 0 ? ` −${l.discount_percent}%` : ""}{l.sell_unit ? ` · ${l.qty} ${l.unit} stock` : ""}</span>',
)
old_form = '''              <div className="grid grid-cols-3 gap-2">
                <input type="number" min="0.01" step="any" value={dLineQty} onChange={e => setDLineQty(e.target.value)} placeholder="Quantité" className={inputCls}/>
                <div><input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Dernier prix vendu, sinon coût moyen stock</p></div>
                <input type="number" min="0" max="100" step="any" value={dLineDiscount} onChange={e => setDLineDiscount(e.target.value)} placeholder="Remise %" className={inputCls}/>
              </div>
'''
new_form = '''              {dLineProductId && (() => {
                const product = availableProducts.find(p => p.id === Number(dLineProductId));
                if (!product) return null;
                const options = getSaleUnitOptions(product, boutique);
                return options.length > 1 ? (
                  <div>
                    <p className="text-[10px] font-black tracking-wider text-muted-foreground mb-1.5">CONDITIONNEMENT · UNITÉ PAR DÉFAUT</p>
                    <div className="flex gap-2 flex-wrap">
                      {options.map(unit => <button key={unit} type="button" onClick={() => selectTransferUnit(unit)} className="flex-1 min-w-[100px] py-2 rounded-xl text-xs font-black" style={{background:dLineSellUnit===unit?TRANSFER_COLOR:TRANSFER_COLOR+"18",color:dLineSellUnit===unit?"#fff":TRANSFER_COLOR}}>{getSaleUnitLabel(product,boutique,unit)}</button>)}
                    </div>
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min="0.01" step="any" value={dLineQty} onChange={e => setDLineQty(e.target.value)} placeholder={dLineSellUnit ? `Qté ${dLineSellUnit}` : "Quantité"} className={inputCls}/>
                <div><input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Prix par conditionnement sélectionné</p></div>
                <input type="number" min="0" max="100" step="any" value={dLineDiscount} onChange={e => setDLineDiscount(e.target.value)} placeholder="Remise %" className={inputCls}/>
              </div>
              {dLineProductId && Number(dLineQty)>0 && (() => {
                const product = availableProducts.find(p => p.id === Number(dLineProductId));
                if (!product || !dLineSellUnit) return null;
                const base = toBaseSaleQty(Number(dLineQty),dLineSellUnit,product,boutique);
                return base === Number(dLineQty) && dLineSellUnit === product.unit ? null : <p className="text-xs font-bold px-2" style={{color:TRANSFER_COLOR}}>{Number(dLineQty)} {dLineSellUnit} = {base} {product.unit} prélevés du stock</p>;
              })()}
'''
replace_once("src/app/screens/TransfersView.tsx", old_form, new_form)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '                const lineAmt = l.qty * l.unitPrice * (1 - l.discountPercent / 100);',
    '                const lineAmt = l.sellQty * l.unitPrice * (1 - l.discountPercent / 100);',
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '<p className="text-xs text-muted-foreground">{l.qty} {l.unit} × {fmt(l.unitPrice)}{l.discountPercent > 0 ? ` −${l.discountPercent}%` : ""}</p>',
    '<p className="text-xs text-muted-foreground">{l.sellQty} {l.sellUnit} × {fmt(l.unitPrice)}{l.discountPercent > 0 ? ` −${l.discountPercent}%` : ""} · {l.qty} {l.unit} stock</p>',
)

print("conditioning patch applied")
