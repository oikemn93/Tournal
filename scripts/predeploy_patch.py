from pathlib import Path

path = Path('src/app/screens/POSView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    'import { createSale, recordPayment, cancelPendingInvoice } from "../../lib/api";\n',
    'import { createSale, recordPayment, cancelPendingInvoice } from "../../lib/api";\nimport { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";\n',
    'sales helper import',
)
replace_once('  const [addQty, setAddQty] = useState("1");', '  const [addQty, setAddQty] = useState("");', 'normal quantity default')
replace_once('  const [expQty, setExpQty] = useState("1");', '  const [expQty, setExpQty] = useState("");', 'express quantity default')

replace_once('''  function getSellOptions(p: Product): string[] {
    const cat = posCats.find(c => c.nom === p.categorie);
    if (!cat || cat.nbPiecesParLot <= 0) return [p.unit];
    const opts: string[] = ["Lot"];
    if (cat.unitVente !== "pièces") opts.push("Pièce");
    opts.push(cat.unitVente);
    return opts;
  }

  function toBaseQty(sellQty: number, sellUnit: string, p: Product): number {
    const cat = posCats.find(c => c.nom === p.categorie);
    if (!cat || cat.nbPiecesParLot <= 0) return sellQty;
    if (sellUnit === "Lot")
      return cat.unitVente === "pièces"
        ? sellQty * cat.nbPiecesParLot
        : sellQty * cat.nbPiecesParLot * (cat.longueurParPiece || 1);
    if (sellUnit === "Pièce")
      return cat.unitVente === "pièces" ? sellQty : sellQty * (cat.longueurParPiece || 1);
    return sellQty;
  }
''', '''  function getSellOptions(p: Product): string[] {
    return getSaleUnitOptions(p, boutique);
  }

  function toBaseQty(sellQty: number, sellUnit: string, p: Product): number {
    return toBaseSaleQty(sellQty, sellUnit, p, boutique);
  }
''', 'unit helpers')

replace_once('''  function openExpress(e: React.MouseEvent, p: Product) {
    e.stopPropagation();
    const opts = getSellOptions(p);
    const cat = posCats.find(c => c.nom === p.categorie);
    const baseU = cat?.unitVente ?? p.unit;
    const isFabric = baseU === "yards" || baseU === "mètres" || baseU === "metres";
    const defaultUnit = isFabric && opts.includes(baseU) ? baseU : opts.includes("Pièce") ? "Pièce" : opts[0];
    setExpressModal(p);
    setExpSellUnit(defaultUnit);
    setExpQty("1");
    setExpPrice(p.prixVente ? String(p.prixVente) : "");
    setExpMethod("Espèces");
    setExpDone(false);
  }
''', '''  function openExpress(e: React.MouseEvent, p: Product) {
    e.stopPropagation();
    const defaultUnit = getDefaultSaleUnit(p, boutique);
    const lastPrice = getLastSalePrice(p.id, invoices, defaultUnit);
    setExpressModal(p);
    setExpSellUnit(defaultUnit);
    setExpQty("");
    setExpPrice(lastPrice != null ? String(lastPrice) : "");
    setExpMethod("Espèces");
    setExpDone(false);
  }
''', 'express defaults')

replace_once('''  function openAdd(p: Product) {
    const inCart = cart.find(i => i.productId === p.id);
    const opts = getSellOptions(p);
    const cat2 = posCats.find(c => c.nom === p.categorie);
    const baseU = cat2?.unitVente ?? p.unit;
    const isFabric = baseU === "yards" || baseU === "mètres" || baseU === "metres";
    const defaultUnit = inCart?.sellUnit ?? (
      isFabric && opts.includes(baseU) ? baseU :
      opts.includes("Pièce") ? "Pièce" :
      opts[0]
    );
    setAddModal(p);
    setAddSellUnit(defaultUnit);
    setAddQty(inCart ? String(inCart.sellQty ?? inCart.qty) : "");
    setAddPrice(inCart ? String(inCart.prixUnit) : "");
  }
''', '''  function openAdd(p: Product) {
    const inCart = cart.find(i => i.productId === p.id);
    const defaultUnit = inCart?.sellUnit ?? getDefaultSaleUnit(p, boutique);
    const lastPrice = inCart ? inCart.prixUnit : getLastSalePrice(p.id, invoices, defaultUnit);
    setAddModal(p);
    setAddSellUnit(defaultUnit);
    setAddQty(inCart ? String(inCart.sellQty ?? inCart.qty) : "");
    setAddPrice(lastPrice != null ? String(lastPrice) : "");
  }
''', 'normal sale defaults')

replace_once(
    '<button key={u} onClick={() => setExpSellUnit(u)} className="flex-1 py-3 rounded-xl text-sm font-bold"',
    '<button key={u} onClick={() => { setExpSellUnit(u); setExpQty(""); const last = getLastSalePrice(expressModal.id, invoices, u); setExpPrice(last != null ? String(last) : ""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"',
    'express unit change',
)
replace_once(
    '<button key={u} onClick={() => { setAddSellUnit(u); setAddQty(""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"',
    '<button key={u} onClick={() => { setAddSellUnit(u); setAddQty(""); const last = getLastSalePrice(addModal.id, invoices, u); setAddPrice(last != null ? String(last) : ""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"',
    'normal unit change',
)

path.write_text(text)
print('POS sale defaults patched successfully')
