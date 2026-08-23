import React, { useState, useRef } from "react";
import { Search, Plus, Edit2, ArrowLeft, History, Camera, Trash2 } from "lucide-react";
import type { Boutique, Product, StockEntry } from "../types";
import { PLACEHOLDER_IMGS, inputCls } from "../constants";
import { fmt, today, imgSrc, resizeImage } from "../utils/formatting";
import { productQty, productMontant, productMontantNet, stockStatus, stockDot } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createProduct, recordStockMovement, updateProduct } from "../../lib/api";

function sortStockEntriesNewestFirst(a: StockEntry, b: StockEntry) {
  const aTime = a.recordedAt ? Date.parse(a.recordedAt) : Number.NaN;
  const bTime = b.recordedAt ? Date.parse(b.recordedAt) : Number.NaN;
  const byTimestamp = (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  return byTimestamp || b.id - a.id;
}

export function StockView({ boutique, onUpdate, logAction, initialFilter }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialFilter?: string;
}) {
  const { products, entries, suppliers } = boutique;
  const charges = boutique.charges ?? [];
  const cats = boutique.categories ?? [];

  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState(initialFilter ?? "all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"nom"|"qty"|"valeur">("nom");
  const [detail, setDetail]   = useState<Product | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Entry form
  const [dUnit, setDUnit] = useState("yards");
  const [dQty, setDQty]   = useState("");
  const [dMontant, setDMontant] = useState("");
  const [dPrixUnit, setDPrixUnit] = useState("");
  const [dSupplierId, setDSupplierId] = useState<number|null>(suppliers[0]?.id ?? null);
  const [dLotMode, setDLotMode] = useState(false);
  const [dLots, setDLots]     = useState("1");
  const [dPieces, setDPieces] = useState("");
  const [dLongueur, setDLongueur] = useState("");
  const [dSku, setDSku] = useState("");
  const dLotQty = dUnit === "pièces"
    ? (Number(dLots) || 1) * (Number(dPieces) || 0)
    : (Number(dLots) || 1) * (Number(dPieces) || 0) * (Number(dLongueur) || 0);

  // New product form
  const [nNom, setNNom]     = useState("");
  const [nUnit, setNUnit]   = useState("yards");
  const [nQty, setNQty]     = useState("");
  const [nMontant, setNMontant] = useState("");
  const [nPrixUnit, setNPrixUnit] = useState("");
  const [nSupplierId, setNSupplierId] = useState<number|null>(suppliers[0]?.id ?? null);
  const [nCat, setNCat]     = useState("");
  const [nImg, setNImg]     = useState<string | null>(null);
  const [nCatNew, setNCatNew] = useState("");
  const [nCatMode, setNCatMode] = useState<"select" | "new">("select");
  const [nLotMode, setNLotMode] = useState(false);
  const [nLots, setNLots]     = useState("1");
  const [nPieces, setNPieces] = useState("");
  const [nLongueur, setNLongueur] = useState("");
  const nLotQty = nUnit === "pièces"
    ? (Number(nLots) || 1) * (Number(nPieces) || 0)
    : (Number(nLots) || 1) * (Number(nPieces) || 0) * (Number(nLongueur) || 0);

  const supplierById = (supplierId?: number|null) => suppliers.find(s => s.id === supplierId);

  function selectNewCat(c: string) {
    setNCat(c);
    const catConfig = cats.find(cat => cat.nom === c);
    if (catConfig) {
      setNUnit(catConfig.unitVente);
      if (catConfig.nbPiecesParLot > 0) {
        setNLotMode(true);
        setNLots("1");
        setNPieces(String(catConfig.nbPiecesParLot));
        setNLongueur(catConfig.longueurParPiece > 0 ? String(catConfig.longueurParPiece) : "");
      } else {
        setNLotMode(false); setNPieces(""); setNLongueur("");
      }
    } else {
      setNLotMode(false);
    }
  }

  // Edit product
  const [editNom, setEditNom] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editPrixAchat, setEditPrixAchat] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoRef  = useRef<HTMLInputElement>(null);

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setNImg(await resizeImage(f));
  }
  async function handleEditPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !detail) return;
    const img = await resizeImage(f);
    onUpdate({ products: products.map(p => p.id === detail.id ? { ...p, img } : p) });
    setDetail({ ...detail, img });
  }

  const catNames = Array.from(new Set([
    ...cats.map(c => c.nom),
    ...products.map(p => p.categorie).filter(Boolean) as string[],
  ]));

  function openDetail(p: Product) {
    const cat = cats.find(c => c.nom === p.categorie);
    const param = (boutique.productParams ?? []).find(x => x.productId === p.id);
    const eff = param ?? (cat && cat.nbPiecesParLot > 0 ? { nbPiecesParLot: cat.nbPiecesParLot, longueurParPiece: cat.longueurParPiece, unitVente: cat.unitVente } : null);
    setDetail(p); setAddMode(false); setEditingProduct(false);
    setDQty(""); setDMontant(""); setDPrixUnit("");
    setDUnit(eff?.unitVente ?? p.unit);
    setDSupplierId(suppliers.find(s => s.nom === p.fournisseur)?.id ?? suppliers[0]?.id ?? null);
    if (eff && eff.nbPiecesParLot > 0) {
      setDLotMode(true); setDLots("1");
      setDPieces(String(eff.nbPiecesParLot));
      setDLongueur(eff.longueurParPiece > 0 ? String(eff.longueurParPiece) : "");
    } else {
      setDLotMode(false); setDLots("1"); setDPieces(""); setDLongueur("");
    }
  }

  async function submitEntry() {
    if (!detail) return;
    const qty = dLotMode ? dLotQty : Number(dQty);
    if (!qty || qty <= 0) return;
    const supplier = supplierById(dSupplierId);
    if (!supplier) { alert("Sélectionnez un fournisseur avant d'enregistrer la réception."); return; }
    const isPieces = dUnit === "pièces";
    const lotExtra = dLotMode ? { nbLots: Number(dLots) || 1, nbPieces: Number(dPieces) || 0, ...(isPieces ? {} : { longueurPiece: Number(dLongueur) || 0 }) } : {};
    try {
      const persisted = await recordStockMovement({ boutiqueId:boutique.id, productId:detail.id, qty, type:"achat", prixUnit:(Number(dMontant) || 0) / qty, note:supplier.nom, supplierId:supplier.id, reference:dSku.trim() || undefined });
      const newEntry = { id: persisted.entry_id, productId: detail.id, qty, unit: dUnit, montantDu: Number(dMontant) || 0, date: today(), recordedAt:new Date().toISOString(), fournisseur: supplier.nom, supplierId:supplier.id, movementType:"achat" as const, reference:dSku.trim() || undefined, ...lotExtra, ...(dSku.trim() ? { sku: dSku.trim() } : {}) };
      const receiptCharge = persisted.charge_id ? {
        id:persisted.charge_id, label:`Réception stock · ${supplier.nom}`, montant:Number(dMontant) || 0,
        date:today(), dateRaw:new Date().toISOString(), categorie:"Achat stock" as const, recurrence:"unique" as const,
        fournisseur:supplier.nom, supplierId:supplier.id, status:"pending" as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:persisted.entry_id, dueDate:persisted.due_date ?? undefined,
      } : null;
      onUpdate({ entries: [...entries, newEntry], ...(receiptCharge ? { charges:[...charges, receiptCharge] } : {}) });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Entrée de stock impossible");
      return;
    }
    const lab = dLotMode
      ? (isPieces ? `${dLots}lot×${dPieces}p=+${qty}p` : `${dLots}lot×${dPieces}p×${dLongueur}${dUnit}=+${qty}${dUnit}`)
      : `+${qty} ${dUnit}`;
    logAction("Entrée stock", `${detail.nom} · ${lab} · ${fmt(Number(dMontant) || 0)}`, "📦");
    setAddMode(false); setDQty(""); setDMontant(""); setDPrixUnit(""); setDSku("");
    setDLotMode(false); setDLots("1"); setDPieces(""); setDLongueur("");
  }

  async function submitNew() {
    if (!nNom.trim()) return;
    const finalCat = nCatMode === "new" ? nCatNew.trim() : nCat;
    const localPid = Date.now();
    let updatedCats = cats;
    if (nCatMode === "new" && nCatNew.trim() && !cats.find(c => c.nom === nCatNew.trim())) {
      updatedCats = [...cats, { id: "cat" + localPid, nom: nCatNew.trim(), unitVente: nUnit, nbPiecesParLot: 0, longueurParPiece: 0 }];
    }
    const initQty = nLotMode ? nLotQty : Number(nQty);
    const supplier = supplierById(nSupplierId);
    if (initQty > 0 && !supplier) { alert("Créez ou sélectionnez un fournisseur avant d'ajouter du stock initial."); return; }
    const lotExtra = nLotMode ? { nbLots: Number(nLots)||1, nbPieces: Number(nPieces)||0, ...(nUnit !== "pièces" ? { longueurPiece: Number(nLongueur)||0 } : {}) } : {};
    let persisted;
    try {
      persisted = await createProduct({ boutiqueId:boutique.id, name:nNom.trim(), unit:nUnit, categoryId:cats.find(c=>c.nom===finalCat)?.id, purchasePrice:Number(nPrixUnit) || 0, salePrice:Number(nPrixUnit) || 0 });
      const movement = initQty > 0 && supplier
        ? await recordStockMovement({ boutiqueId:boutique.id, productId:persisted.product_id, qty:initQty, type:"achat", prixUnit:initQty ? (Number(nMontant) || 0) / initQty : 0, note:supplier.nom, supplierId:supplier.id })
        : null;
      const pid = persisted.product_id;
      const newEntries = movement ? [...entries, { id: movement.entry_id, productId: pid, qty: initQty, unit: nUnit, montantDu: Number(nMontant) || 0, date: today(), recordedAt:new Date().toISOString(), fournisseur: supplier?.nom ?? "", supplierId:supplier?.id, movementType:"achat" as const, ...lotExtra }] : entries;
      const receiptCharge = movement?.charge_id && supplier ? {
        id:movement.charge_id, label:`Réception stock · ${supplier.nom}`, montant:Number(nMontant) || 0,
        date:today(), dateRaw:new Date().toISOString(), categorie:"Achat stock" as const, recurrence:"unique" as const,
        fournisseur:supplier.nom, supplierId:supplier.id, status:"pending" as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:movement.entry_id, dueDate:movement.due_date ?? undefined,
      } : null;
      onUpdate({
        products: [...products, { id: pid, nom: nNom.trim(), img: nImg ?? PLACEHOLDER_IMGS[Math.floor(Math.random() * 4)], unit: nUnit, fournisseur: supplier?.nom ?? "", categorie: finalCat || undefined, prixAchat:Number(nPrixUnit) || 0, prixVente:Number(nPrixUnit) || 0 }],
        entries: newEntries, categories: updatedCats, ...(receiptCharge ? { charges:[...charges, receiptCharge] } : {}),
      });
    } catch (error) { alert(error instanceof Error ? error.message : "Création du produit impossible"); return; }
    logAction("Nouveau produit", `${nNom.trim()}${finalCat ? " · " + finalCat : ""}`, "🆕");
    setNNom(""); setNQty(""); setNMontant(""); setNPrixUnit(""); setNCat(""); setNCatNew(""); setNImg(null); setNCatMode("select");
    setNLotMode(false); setNLots("1"); setNPieces(""); setNLongueur(""); setShowNew(false);
  }

  async function saveProductEdit() {
    const purchasePrice = Number(editPrixAchat);
    if (!detail || !editNom.trim() || !Number.isFinite(purchasePrice) || purchasePrice < 0 || savingProduct) return;
    const category = cats.find(c => c.nom === editCat);
    setSavingProduct(true);
    try {
      await updateProduct({
        boutiqueId:boutique.id,
        productId:detail.id,
        name:editNom.trim(),
        categoryId:editCat ? category?.id : null,
        purchasePrice,
      });
      const updated = { ...detail, nom:editNom.trim(), categorie:editCat || undefined, prixAchat:purchasePrice };
      onUpdate({ products:products.map(p => p.id === detail.id ? updated : p) });
      setDetail(updated);
      setEditingProduct(false);
      logAction("Produit modifié", editNom.trim(), "✏️");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Modification du produit impossible");
    } finally {
      setSavingProduct(false);
    }
  }

  // Stock correction
  const [editingEntryId, setEditingEntryId] = useState<number|null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [stockCorrectionBusy, setStockCorrectionBusy] = useState<number|null>(null);

  async function saveEntryEdit(entryId: number) {
    const original = entries.find(e => e.id === entryId);
    const desiredQty = Number(editEntryQty);
    if (!original || !Number.isFinite(desiredQty) || desiredQty <= 0 || stockCorrectionBusy != null) return;
    const delta = desiredQty - original.qty;
    if (Math.abs(delta) < 0.000001) { setEditingEntryId(null); return; }
    const originalUnitCost = original.qty !== 0 ? Math.abs(original.montantDu / original.qty) : 0;
    setStockCorrectionBusy(entryId);
    try {
      await recordStockMovement({
        boutiqueId:boutique.id,
        productId:original.productId,
        qty:delta,
        type:"ajustement",
        prixUnit:originalUnitCost,
        note:`Correction entrée #${entryId}`,
        supplierId:original.supplierId,
      });
      const adjustment = {
        id:Date.now(), productId:original.productId, qty:delta, unit:original.unit,
        montantDu:delta * originalUnitCost, date:today(), recordedAt:new Date().toISOString(), fournisseur:original.supplierId ? (supplierById(original.supplierId)?.nom ?? original.fournisseur) : `Correction entrée #${entryId}`, supplierId:original.supplierId, movementType:"ajustement" as const,
      };
      onUpdate({ entries:[...entries, adjustment] });
      logAction("Correction stock", `Entrée #${entryId} · ajustement ${delta > 0 ? "+" : ""}${delta} ${original.unit}`, "✏️");
      setEditingEntryId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Correction de stock impossible");
    } finally {
      setStockCorrectionBusy(null);
    }
  }

  async function deleteEntry(entryId: number) {
    const original = entries.find(e => e.id === entryId);
    if (!original || original.qty <= 0 || stockCorrectionBusy != null) return;
    if (!window.confirm("Annuler cette réception ? L'entrée d'origine restera dans l'historique et un mouvement inverse sera ajouté.")) return;
    const unitCost = original.qty !== 0 ? Math.abs(original.montantDu / original.qty) : 0;
    setStockCorrectionBusy(entryId);
    try {
      await recordStockMovement({
        boutiqueId:boutique.id,
        productId:original.productId,
        qty:-original.qty,
        type:"ajustement",
        prixUnit:unitCost,
        note:`Annulation entrée #${entryId}`,
        supplierId:original.supplierId,
      });
      const reversal = {
        id:Date.now(), productId:original.productId, qty:-original.qty, unit:original.unit,
        montantDu:-Math.abs(original.montantDu), date:today(), recordedAt:new Date().toISOString(), fournisseur:original.supplierId ? (supplierById(original.supplierId)?.nom ?? original.fournisseur) : `Annulation entrée #${entryId}`, supplierId:original.supplierId, movementType:"ajustement" as const,
      };
      onUpdate({ entries:[...entries, reversal] });
      logAction("Annulation réception", `Entrée #${entryId} · mouvement inverse ${-original.qty} ${original.unit}`, "↩️");
      setEditingEntryId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Annulation de la réception impossible");
    } finally {
      setStockCorrectionBusy(null);
    }
  }

  const filtered = products.filter(p => {
    const qty = productQty(p.id, entries);
    return p.nom.toLowerCase().includes(search.toLowerCase())
      && (filter === "all" || stockStatus(qty) === filter)
      && (catFilter === "all" || p.categorie === catFilter);
  }).sort((a, b) => {
    if (sortBy === "qty") return productQty(b.id, entries) - productQty(a.id, entries);
    if (sortBy === "valeur") return productMontant(b.id, entries) - productMontant(a.id, entries);
    return a.nom.localeCompare(b.nom);
  });

  return (
    <div data-screen-source="relational-stock" className="space-y-4 pb-24">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher un produit…" className={inputCls + " pl-11"}/>
      </div>

      <div className="flex gap-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        {[{ id: "all", label: "Tout", c: "#7A7055" }, { id: "ok", label: "✓ OK", c: "#1E9B1E" }, { id: "low", label: "⚠ Bas", c: "#C9A227" }, { id: "critical", label: "! Critique", c: "#ef4444" }].map(s => (
          <button key={s.id} onClick={() => setFilter(s.id)} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={{ background: filter === s.id ? s.c : s.c + "22", color: filter === s.id ? "#fff" : s.c }}>{s.label}</button>
        ))}
      </div>

      {catNames.length > 0 && (
        <div className="flex gap-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setCatFilter("all")} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={{ background: catFilter === "all" ? "#1f2937" : "#f3f4f6", color: catFilter === "all" ? "#fff" : "#374151" }}>Toutes</button>
          {catNames.map(c => {
            const cnt = products.filter(p => p.categorie === c).length;
            return (
              <button key={c} onClick={() => setCatFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                style={{ background: catFilter === c ? "#1f2937" : "#f3f4f6", color: catFilter === c ? "#fff" : "#374151" }}>
                {c} <span style={{ opacity: 0.6 }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-bold">Trier :</span>
        {([{ id:"nom" as const, label:"A→Z" }, { id:"qty" as const, label:"Quantité" }, { id:"valeur" as const, label:"Valeur" }]).map(s => (
          <button key={s.id} onClick={() => setSortBy(s.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: sortBy === s.id ? "#1f2937" : "#f3f4f6", color: sortBy === s.id ? "#fff" : "#374151" }}>{s.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map(p => {
          const qty = productQty(p.id, entries);
          const dot = stockDot(stockStatus(qty));
          return (
            <button key={p.id} onClick={() => openDetail(p)} className="bg-card rounded-2xl overflow-hidden border border-border text-left active:scale-[0.97] transition-transform">
              <div className="relative h-36 bg-muted">
                <img src={imgSrc(p.img)} alt={p.nom} className="w-full h-full object-cover"/>
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(22,27,36,.75) 0%,transparent 55%)" }}/>
                <div className="absolute top-2 right-2">
                  <div className="w-3 h-3 rounded-full border-2 border-card" style={{ background: dot }}/>
                </div>
                <div className="absolute bottom-2 left-3 right-3">
                  <p className="text-white font-black text-base leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>{p.nom}</p>
                  {p.categorie && <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ background: "rgba(255,255,255,0.75)", color: "#1C1A10" }}>{p.categorie}</span>}
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black leading-none" style={{ color: dot, fontFamily: "'Nunito', sans-serif" }}>{qty}</span>
                  <span className="text-sm font-bold text-muted-foreground">{p.unit}</span>
                  <Edit2 size={14} className="ml-auto text-muted-foreground"/>
                </div>
                <p className="text-sm font-semibold text-muted-foreground mt-1">{fmt(productMontant(p.id, entries))} dû</p>
              </div>
            </button>
          );
        })}
      </div>

      <button onClick={() => setShowNew(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background: "#3b82f6", boxShadow: "0 0 24px #3b82f660" }}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>

      {detail && (
        <Modal title={editingProduct ? "Modifier le produit" : addMode ? "Recevoir du stock" : detail.nom} color="#374151" onClose={() => { setDetail(null); setAddMode(false); setEditingProduct(false); }}>
          {!addMode && !editingProduct && (
            <>
              <div className="flex gap-3">
                <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleEditPhoto}/>
                <button type="button" onClick={() => editPhotoRef.current?.click()} className="w-20 h-20 rounded-2xl overflow-hidden bg-muted flex-shrink-0 relative group active:scale-95">
                  <img src={imgSrc(detail.img, 160, 160)} alt={detail.nom} className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.45)" }}><Camera size={18} color="white"/></div>
                </button>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted rounded-xl p-3 text-center">
                      <p className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{productQty(detail.id, entries)}</p>
                      <p className="text-xs text-muted-foreground">{detail.unit}</p>
                    </div>
                    <div className="flex-1 bg-muted rounded-xl p-3 text-center">
                      <p className="text-sm font-black" style={{ color: "#C9A227", fontFamily: "'Nunito', sans-serif" }}>{fmt(productMontantNet(detail.id, entries, charges))}</p>
                      <p className="text-xs text-muted-foreground">dû fourn.</p>
                    </div>
                  </div>
                  {detail.categorie && <span className="text-xs px-2 py-0.5 rounded-full font-bold inline-block" style={{ background: "#3b82f622", color: "#3b82f6" }}>{detail.categorie}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingProduct(true); setEditNom(detail.nom); setEditCat(detail.categorie ?? ""); setEditPrixAchat(String(detail.prixAchat ?? 0)); }}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-left" style={{ background: "#EEE9D8", color: "#7A7055" }}>
                  <Edit2 size={13}/> Modifier
                </button>
                <button onClick={() => setAddMode(true)} className="flex-1 py-2.5 rounded-xl text-xs font-black active:scale-95" style={{ background: "#3b82f6", color: "#fff" }}>
                  + Recevoir
                </button>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3"><History size={15} style={{ color: "#3b82f6" }}/><p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>HISTORIQUE</p></div>
                <div className="space-y-2">
                  {entries.filter(e => e.productId === detail.id).sort(sortStockEntriesNewestFirst).map(e => {
                    const isSale = e.qty < 0;
                    const isReturn = e.movementType === "retour";
                    const entrySupplier = supplierById(e.supplierId) ?? suppliers.find(s => s.nom === e.fournisseur);
                    const sc = entrySupplier?.color ?? "#6b7280";
                    const isEditing = editingEntryId === e.id;
                    const entryTime = e.recordedAt ? Date.parse(e.recordedAt) : Number.NaN;
                    const hasDownstreamConsumption = entries.some(candidate => candidate.productId === e.productId && candidate.qty < 0 && ((Number.isFinite(entryTime) && candidate.recordedAt ? Date.parse(candidate.recordedAt) > entryTime : candidate.id > e.id)));
                    if (isEditing) return (
                      <div key={e.id} className="rounded-xl px-3 py-3 space-y-2 border-2" style={{ borderColor:"#3b82f6", background:"#3b82f608" }}>
                        <p className="text-xs font-bold" style={{ color:"#3b82f6" }}>Corriger la quantité</p>
                        <p className="text-xs text-muted-foreground">L'entrée d'origine restera intacte. Tournal ajoutera uniquement le mouvement d'ajustement nécessaire.</p>
                        {hasDownstreamConsumption&&<p className="rounded-lg px-2.5 py-2 text-xs font-semibold" style={{background:"#fef3c7",color:"#92400e"}}>Attention : ce produit a déjà eu des sorties après cette réception. L’ajustement modifie le stock actuel ; les marges des ventes déjà encaissées restent volontairement figées.</p>}
                        <input value={editEntryQty} onChange={e2=>setEditEntryQty(e2.target.value)} placeholder="Nouvelle quantité" type="number" min="0.0001" className={inputCls} autoFocus onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                        <div className="flex gap-2">
                          <button disabled={stockCorrectionBusy===e.id} onClick={()=>setEditingEntryId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-40" style={{ background:"#EEE9D8", color:"#7A7055" }}>Annuler</button>
                          <button disabled={stockCorrectionBusy===e.id} onClick={()=>saveEntryEdit(e.id)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background:"#3b82f6" }}>{stockCorrectionBusy===e.id?"Ajustement…":"Ajouter l'ajustement"}</button>
                        </div>
                      </div>
                    );
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: isSale ? "#ef444410" : "#EEE9D8" }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isSale ? "#ef4444" : sc }}/>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: isSale ? "#ef4444" : "inherit" }}>
                            {isSale ? "−" : "+"}{Math.abs(e.qty)} <span className="text-muted-foreground font-normal">{e.unit}</span>
                            {e.nbPieces ? <span className="text-xs text-muted-foreground font-normal ml-1">({e.nbLots && e.nbLots > 1 ? `${e.nbLots}lots×` : ""}{e.nbPieces}p{e.longueurPiece ? `×${e.longueurPiece}` : ""})</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{isSale ? "Vente" : isReturn ? "Retour client" : e.nbPieces ? "Lot reçu" : "Achat"} · {(entrySupplier?.nom ?? e.fournisseur).replace("Vente → ", "")} · {e.date}{e.sku ? ` · SKU: ${e.sku}` : ""}</p>
                        </div>
                        {!isSale && !isReturn && <p className="text-sm font-black" style={{ color: "#C9A227", fontFamily: "'Nunito', sans-serif" }}>{fmt(e.montantDu)}</p>}
                        {!isSale && !isReturn && (
                          <div className="flex gap-1 ml-1">
                            <button onClick={()=>{ setEditingEntryId(e.id); setEditEntryQty(String(e.qty)); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#3b82f615" }}><Edit2 size={12} style={{ color:"#3b82f6" }}/></button>
                            <button onClick={()=>deleteEntry(e.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={12} style={{ color:"#ef4444" }}/></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {entries.filter(e => e.productId === detail.id).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun mouvement enregistré</p>
                  )}
                </div>
              </div>
            </>
          )}

          {editingProduct && (
            <>
              <button onClick={() => setEditingProduct(false)} className="flex items-center gap-2 text-muted-foreground mb-1"><ArrowLeft size={16}/><span className="text-sm">Retour</span></button>
              <Field label="NOM DU PRODUIT">
                <input value={editNom} onChange={e => setEditNom(e.target.value)} className={inputCls} autoFocus onKeyDown={e => e.key === "Enter" && saveProductEdit()}/>
              </Field>
              <Field label="CATÉGORIE">
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setEditCat("")} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: !editCat ? "#3b82f6" : "#EEE9D8", color: !editCat ? "#fff" : "#6b7280" }}>Aucune</button>
                  {catNames.map(c => (
                    <button key={c} onClick={() => setEditCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: editCat === c ? "#3b82f6" : "#EEE9D8", color: editCat === c ? "#fff" : "#6b7280" }}>{c}</button>
                  ))}
                </div>
              </Field>
              <Field label="PRIX D'ACHAT UNITAIRE">
                <input value={editPrixAchat} onChange={e => setEditPrixAchat(e.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" className={inputCls}/>
              </Field>
              <p className="text-xs text-muted-foreground">Ce prix sera utilisé pour les prochains mouvements ; les mouvements déjà enregistrés restent inchangés.</p>
              <SubmitBtn color={boutique.color} label={savingProduct ? "Enregistrement…" : "Enregistrer les modifications"} onClick={saveProductEdit} disabled={!editNom.trim() || !Number.isFinite(Number(editPrixAchat)) || Number(editPrixAchat) < 0 || savingProduct}/>
            </>
          )}

          {addMode && (
            <>
              <button onClick={() => setAddMode(false)} className="flex items-center gap-2 text-muted-foreground"><ArrowLeft size={16}/><span className="text-sm">Retour</span></button>

              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#3b82f618" }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3b82f6" }}/>
                <span className="text-xs font-black tracking-wider flex-1" style={{ color: "#3b82f6" }}>UNITÉ DE VENTE</span>
                <span className="font-black text-sm" style={{ color: "#3b82f6" }}>{dUnit}</span>
              </div>

              {dLotMode ? (
                <div className="p-4 rounded-2xl space-y-3" style={{ background: "#3b82f608", border: "2px dashed #3b82f633" }}>
                  <p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>RÉCEPTION PAR LOTS</p>
                  <div className={`grid gap-2 ${dUnit !== "pièces" ? "grid-cols-3" : "grid-cols-2"}`}>
                    <Field label="NB LOTS">
                      <input value={dLots} onChange={e => {
                        setDLots(e.target.value);
                        if (dPrixUnit) {
                          const newQty = dUnit === "pièces"
                            ? (Number(e.target.value)||1)*(Number(dPieces)||0)
                            : (Number(e.target.value)||1)*(Number(dPieces)||0)*(Number(dLongueur)||0);
                          if (newQty > 0) setDMontant(String(Math.round(newQty * Number(dPrixUnit))));
                        }
                      }} placeholder="1" type="number" min="1" className={inputCls + " text-center font-black text-lg"} autoFocus/>
                    </Field>
                    <Field label="PIÈCES / LOT">
                      <input value={dPieces} onChange={e => setDPieces(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                    </Field>
                    {dUnit !== "pièces" && (
                      <Field label={`${dUnit.toUpperCase()} / PIÈCE`}>
                        <input value={dLongueur} onChange={e => setDLongueur(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                      </Field>
                    )}
                  </div>
                  {dLotQty > 0 && (
                    <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#3b82f615" }}>
                      <span className="text-xs text-muted-foreground">Total reçu</span>
                      <span className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{dLotQty} {dUnit}</span>
                    </div>
                  )}
                </div>
              ) : (
                <Field label={`QUANTITÉ (${dUnit})`}>
                  <input value={dQty} onChange={e => {
                    setDQty(e.target.value);
                    if (dPrixUnit && Number(e.target.value) > 0) setDMontant(String(Math.round(Number(e.target.value) * Number(dPrixUnit))));
                  }} placeholder="Ex: 30" type="number" className={inputCls + " text-center font-black text-lg"} autoFocus onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label={`PRIX / ${dUnit.toUpperCase()}`} color="#C9A227">
                  <input value={dPrixUnit} onChange={e => {
                    setDPrixUnit(e.target.value);
                    const qty = dLotMode ? dLotQty : Number(dQty);
                    if (qty > 0 && Number(e.target.value) > 0) setDMontant(String(Math.round(qty * Number(e.target.value))));
                    else if (!e.target.value) setDMontant("");
                  }} placeholder="0" type="number" className={inputCls + " text-center font-black"} onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
                <Field label="TOTAL DÛ (F CFA)" color="#C9A227">
                  <input value={dMontant} onChange={e => {
                    setDMontant(e.target.value);
                    const qty = dLotMode ? dLotQty : Number(dQty);
                    if (qty > 0 && Number(e.target.value) > 0) setDPrixUnit(String(Math.round(Number(e.target.value) / qty)));
                    else if (!e.target.value) setDPrixUnit("");
                  }} placeholder="0" type="number" className={inputCls + " text-center font-black"} onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
              </div>

              <Field label="FOURNISSEUR">
                {suppliers.length > 0 ? (
                  <select value={dSupplierId ?? ""} onChange={e => setDSupplierId(e.target.value ? Number(e.target.value) : null)} className={inputCls} style={{ appearance: "none" }}>
                    <option value="">Choisir un fournisseur…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                ) : <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">Créez d'abord un fournisseur pour rattacher cette réception.</p>}
              </Field>
              <Field label="RÉFÉRENCE / SKU (optionnel)"><input value={dSku} onChange={e => setDSku(e.target.value)} placeholder="Ex: WAX-001 ou code interne" className={inputCls}/></Field>
              <SubmitBtn color={boutique.color} label="Enregistrer la réception" onClick={submitEntry} disabled={!dSupplierId || (dLotMode ? dLotQty <= 0 : !dQty || Number(dQty) <= 0)}/>
            </>
          )}
        </Modal>
      )}

      {showNew && (
        <Modal title="Nouveau produit" color="#374151" onClose={() => setShowNew(false)}>
          <Field label="NOM DU PRODUIT">
            <input value={nNom} onChange={e => setNNom(e.target.value)} placeholder="Ex: Bazin Riche Bleu Royal" className={inputCls} autoFocus/>
          </Field>

          <Field label="CATÉGORIE">
            {nCatMode === "select" ? (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setNCat(""); setNLotMode(false); }} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: !nCat ? "#3b82f6" : "#EEE9D8", color: !nCat ? "#fff" : "#6b7280" }}>Aucune</button>
                {catNames.map(c => (
                  <button key={c} onClick={() => selectNewCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: nCat === c ? "#3b82f6" : "#EEE9D8", color: nCat === c ? "#fff" : "#6b7280" }}>{c}</button>
                ))}
                <button onClick={() => { setNCatMode("new"); setNCatNew(""); }} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1" style={{ background: "#EEE9D8", color: "#3b82f6" }}><Plus size={11}/> Nouvelle catégorie</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={nCatNew} onChange={e => setNCatNew(e.target.value)} placeholder="Nom de la catégorie" className={inputCls + " flex-1"} autoFocus onKeyDown={e => { if (e.key === "Enter") { setNCatMode("select"); selectNewCat(nCatNew.trim()); }}}/>
                <button onClick={() => { setNCatMode("select"); selectNewCat(nCatNew.trim()); }} className="px-4 py-3 rounded-xl text-sm font-bold" style={{ background: "#3b82f6", color: "#fff" }}>OK</button>
              </div>
            )}
          </Field>

          {nCat && cats.find(c => c.nom === nCat) ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#3b82f618" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3b82f6" }}/>
              <span className="text-xs font-black tracking-wider flex-1" style={{ color: "#3b82f6" }}>UNITÉ DE VENTE</span>
              <span className="font-black text-sm" style={{ color: "#3b82f6" }}>{nUnit}</span>
            </div>
          ) : (
            <Field label="UNITÉ DE VENTE">
              <div className="flex gap-2">
                {["yards", "mètres", "pièces"].map(u => (
                  <button key={u} onClick={() => setNUnit(u)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: nUnit === u ? "#3b82f6" : "#EEE9D8", color: nUnit === u ? "#fff" : "#6b7280" }}>{u}</button>
                ))}
              </div>
            </Field>
          )}

          {nLotMode ? (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#3b82f608", border: "2px dashed #3b82f633" }}>
              <p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>STOCK INITIAL (PAR LOTS)</p>
              <div className={`grid gap-2 ${nUnit !== "pièces" ? "grid-cols-3" : "grid-cols-2"}`}>
                <Field label="NB LOTS">
                  <input value={nLots} onChange={e => {
                    setNLots(e.target.value);
                    if (nPrixUnit) {
                      const q = nUnit === "pièces"
                        ? (Number(e.target.value)||1)*(Number(nPieces)||0)
                        : (Number(e.target.value)||1)*(Number(nPieces)||0)*(Number(nLongueur)||0);
                      if (q > 0) setNMontant(String(Math.round(q * Number(nPrixUnit))));
                    }
                  }} placeholder="1" type="number" min="1" className={inputCls + " text-center font-black text-lg"}/>
                </Field>
                <Field label="PIÈCES / LOT">
                  <input value={nPieces} onChange={e => setNPieces(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                </Field>
                {nUnit !== "pièces" && (
                  <Field label={`${nUnit.toUpperCase()} / PIÈCE`}>
                    <input value={nLongueur} onChange={e => setNLongueur(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                  </Field>
                )}
              </div>
              {nLotQty > 0 && (
                <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#3b82f615" }}>
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{nLotQty} {nUnit}</span>
                </div>
              )}
            </div>
          ) : (
            <Field label={`STOCK INITIAL (${nUnit}) — optionnel`}>
              <input value={nQty} onChange={e => {
                setNQty(e.target.value);
                if (nPrixUnit && Number(e.target.value) > 0) setNMontant(String(Math.round(Number(e.target.value) * Number(nPrixUnit))));
              }} placeholder="0" type="number" className={inputCls + " text-center font-black text-lg"}/>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label={`PRIX / ${nUnit.toUpperCase()}`} color="#C9A227">
              <input value={nPrixUnit} onChange={e => {
                setNPrixUnit(e.target.value);
                const qty = nLotMode ? nLotQty : Number(nQty);
                if (qty > 0 && Number(e.target.value) > 0) setNMontant(String(Math.round(qty * Number(e.target.value))));
                else if (!e.target.value) setNMontant("");
              }} placeholder="0" type="number" className={inputCls + " text-center font-black"}/>
            </Field>
            <Field label="TOTAL DÛ (F CFA)" color="#C9A227">
              <input value={nMontant} onChange={e => {
                setNMontant(e.target.value);
                const qty = nLotMode ? nLotQty : Number(nQty);
                if (qty > 0 && Number(e.target.value) > 0) setNPrixUnit(String(Math.round(Number(e.target.value) / qty)));
                else if (!e.target.value) setNPrixUnit("");
              }} placeholder="0" type="number" className={inputCls + " text-center font-black"}/>
            </Field>
          </div>

          <Field label="FOURNISSEUR POUR LE STOCK INITIAL">
            {suppliers.length > 0 ? (
              <select value={nSupplierId ?? ""} onChange={e => setNSupplierId(e.target.value ? Number(e.target.value) : null)} className={inputCls} style={{ appearance: "none" }}>
                <option value="">Choisir un fournisseur…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            ) : <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">Optionnel sans stock initial. Créez un fournisseur avant toute réception.</p>}
          </Field>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile}/>
          <button type="button" onClick={() => photoInputRef.current?.click()} className="w-full border-2 border-dashed rounded-2xl overflow-hidden active:scale-[0.98]" style={{ borderColor: nImg ? "#3b82f6" : "rgba(0,0,0,0.12)", background: "#3b82f608" }}>
            {nImg
              ? <img src={nImg} alt="preview" className="w-full h-40 object-cover"/>
              : <div className="p-5 flex flex-col items-center gap-2"><Camera size={28} style={{ color: "#3b82f6" }}/><p className="text-sm font-bold" style={{ color: "#3b82f6" }}>Ajouter une photo (optionnel)</p></div>}
          </button>
          <SubmitBtn color={boutique.color} label="Créer le produit" onClick={submitNew} disabled={!nNom.trim()}/>
        </Modal>
      )}
    </div>
  );
}
