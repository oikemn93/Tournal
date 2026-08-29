from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"ambiguous pattern: {label} ({text.count(old)})")
    return text.replace(old, new, 1)

api_path = Path('src/lib/api.ts')
api = api_path.read_text()
marker = 'export async function createProduct(params:{ boutiqueId:string; name:string; unit:string; categoryId?:string; purchasePrice?:number; salePrice?:number }) {'
if 'export async function createCategory(' not in api:
    api_block = '''export async function createCategory(params:{ boutiqueId:string; name:string; unitVente:string; piecesPerLot?:number; lengthPerPiece?:number }) {
  return dataRequest<{category_id:string;name:string;unit_vente:string;pieces_per_lot:number;length_per_piece:number}>("rpc/create_category", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_idempotency_key:crypto.randomUUID(),
      p_nom:params.name,
      p_unit_vente:params.unitVente,
      p_pieces_per_lot:params.piecesPerLot ?? 0,
      p_length_per_piece:params.lengthPerPiece ?? 0,
    }),
  });
}

export async function updateCategory(params:{ boutiqueId:string; categoryId:string; name:string; unitVente:string; piecesPerLot?:number; lengthPerPiece?:number }) {
  return dataRequest<{category_id:string;name:string;unit_vente:string;pieces_per_lot:number;length_per_piece:number}>("rpc/update_category", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_category_id:params.categoryId,
      p_nom:params.name,
      p_unit_vente:params.unitVente,
      p_pieces_per_lot:params.piecesPerLot ?? 0,
      p_length_per_piece:params.lengthPerPiece ?? 0,
    }),
  });
}

export async function deleteCategory(params:{ boutiqueId:string; categoryId:string }) {
  return dataRequest<{category_id:string;name:string;unlinked_products:number}>("rpc/delete_category", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_category_id:params.categoryId }),
  });
}

'''
    api = replace_once(api, marker, api_block + marker, 'api category insertion')
api_path.write_text(api)

app_path = Path('src/app/App.tsx')
app = app_path.read_text()
if 'createCategory, updateCategory, deleteCategory' not in app.split('\n', 5)[2]:
    app = replace_once(
        app,
        'updateBoutiqueProfile, type BoutiqueSyncEvent',
        'updateBoutiqueProfile, createCategory, updateCategory, deleteCategory, type BoutiqueSyncEvent',
        'App api import',
    )

old_catalogue = '''  function saveEdit(catId: string) {
    const old = cats.find(c => c.id === catId);
    const updated = cats.map(c => c.id !== catId ? c : { ...c, nom: eNom.trim() || c.nom, unitVente: eUnit, nbPiecesParLot: Number(ePieces) || 0, longueurParPiece: Number(eLongueur) || 0 });
    let updatedProds = products;
    if (old && eNom.trim() && eNom.trim() !== old.nom) updatedProds = products.map(p => p.categorie === old.nom ? { ...p, categorie: eNom.trim() } : p);
    onUpdate({ categories: updated, products: updatedProds });
    logAction("Catégorie modifiée", eNom.trim(), "📦");
    setEditingId(null);
  }

  function deleteCat(cat: Category) {
    const updatedProds = products.map(p => p.categorie === cat.nom ? { ...p, categorie: undefined } : p);
    onUpdate({ categories: cats.filter(c => c.id !== cat.id), products: updatedProds });
    logAction("Catégorie supprimée", cat.nom, "🗑️");
    if (expandedId === cat.id) setExpandedId(null);
  }

  function createCat() {
    if (!nNom.trim()) return;
    const nc: Category = { id: "cat" + Date.now(), nom: nNom.trim(), unitVente: nUnit, nbPiecesParLot: Number(nPieces) || 0, longueurParPiece: Number(nLongueur) || 0 };
    onUpdate({ categories: [...cats, nc] });
    logAction("Nouvelle catégorie", nNom.trim(), "📂");
    setNNom(""); setNUnit("yards"); setNPieces(""); setNLongueur(""); setShowNew(false);
  }
'''
new_catalogue = '''  async function saveEdit(catId: string) {
    const old = cats.find(c => c.id === catId);
    if (!old) return;
    const name = eNom.trim() || old.nom;
    const pieces = Number(ePieces) || 0;
    const length = Number(eLongueur) || 0;
    try {
      await updateCategory({ boutiqueId:boutique.id, categoryId:catId, name, unitVente:eUnit, piecesPerLot:pieces, lengthPerPiece:length });
      const updated = cats.map(c => c.id !== catId ? c : { ...c, nom:name, unitVente:eUnit, nbPiecesParLot:pieces, longueurParPiece:length });
      const updatedProds = name !== old.nom ? products.map(p => p.categorie === old.nom ? { ...p, categorie:name } : p) : products;
      onUpdate({ categories: updated, products: updatedProds });
      logAction("Catégorie modifiée", name, "📦");
      setEditingId(null);
      toast.success("Conditionnement enregistré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement du conditionnement impossible");
    }
  }

  async function deleteCat(cat: Category) {
    try {
      await deleteCategory({ boutiqueId:boutique.id, categoryId:cat.id });
      const updatedProds = products.map(p => p.categorie === cat.nom ? { ...p, categorie: undefined } : p);
      onUpdate({ categories: cats.filter(c => c.id !== cat.id), products: updatedProds });
      logAction("Catégorie supprimée", cat.nom, "🗑️");
      if (expandedId === cat.id) setExpandedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression de la catégorie impossible");
    }
  }

  async function createCat() {
    if (!nNom.trim()) return;
    try {
      const created = await createCategory({ boutiqueId:boutique.id, name:nNom.trim(), unitVente:nUnit, piecesPerLot:Number(nPieces) || 0, lengthPerPiece:Number(nLongueur) || 0 });
      const nc: Category = { id:created.category_id, nom:created.name, unitVente:created.unit_vente, nbPiecesParLot:Number(created.pieces_per_lot), longueurParPiece:Number(created.length_per_piece) };
      onUpdate({ categories: [...cats, nc] });
      logAction("Nouvelle catégorie", nNom.trim(), "📂");
      setNNom(""); setNUnit("yards"); setNPieces(""); setNLongueur(""); setShowNew(false);
      toast.success("Catégorie et conditionnement enregistrés");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création de la catégorie impossible");
    }
  }
'''
if old_catalogue in app:
    app = app.replace(old_catalogue, new_catalogue, 1)
elif 'async function saveEdit(catId: string)' not in app:
    raise SystemExit('missing CatalogueSection category CRUD block')
app_path.write_text(app)

stock_path = Path('src/app/screens/StockView.tsx')
stock = stock_path.read_text()
if 'createCategory, createProduct' not in stock:
    stock = replace_once(
        stock,
        'correctSupplierReceipt, createProduct, recordStockMovement',
        'correctSupplierReceipt, createCategory, createProduct, recordStockMovement',
        'StockView category import',
    )
old_stock = '''    const finalCat = nCatMode === "new" ? nCatNew.trim() : nCat;
    const localPid = Date.now();
    let updatedCats = cats;
    if (nCatMode === "new" && nCatNew.trim() && !cats.find(c => c.nom === nCatNew.trim())) {
      updatedCats = [...cats, { id: "cat" + localPid, nom: nCatNew.trim(), unitVente: nUnit, nbPiecesParLot: 0, longueurParPiece: 0 }];
    }
    const initQty = nLotMode ? nLotQty : Number(nQty);'''
new_stock = '''    const finalCat = nCatMode === "new" ? nCatNew.trim() : nCat;
    let updatedCats = cats;
    let categoryId = cats.find(c=>c.nom===finalCat)?.id;
    if (nCatMode === "new" && nCatNew.trim() && !categoryId) {
      try {
        const createdCategory = await createCategory({ boutiqueId:boutique.id, name:nCatNew.trim(), unitVente:nUnit, piecesPerLot:nLotMode ? (Number(nPieces) || 0) : 0, lengthPerPiece:nLotMode ? (Number(nLongueur) || 0) : 0 });
        categoryId = createdCategory.category_id;
        updatedCats = [...cats, { id:createdCategory.category_id, nom:createdCategory.name, unitVente:createdCategory.unit_vente, nbPiecesParLot:Number(createdCategory.pieces_per_lot), longueurParPiece:Number(createdCategory.length_per_piece) }];
      } catch (error) {
        alert(error instanceof Error ? error.message : "Création de la catégorie impossible");
        return;
      }
    }
    const initQty = nLotMode ? nLotQty : Number(nQty);'''
if old_stock in stock:
    stock = stock.replace(old_stock, new_stock, 1)
elif 'let categoryId = cats.find(c=>c.nom===finalCat)?.id;' not in stock:
    raise SystemExit('missing StockView new category block')
stock = stock.replace('categoryId:cats.find(c=>c.nom===finalCat)?.id,', 'categoryId,', 1)
stock_path.write_text(stock)

print('conditioning persistence patch applied')
