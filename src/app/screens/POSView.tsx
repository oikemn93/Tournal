import React, { useState, useEffect } from "react";
import { Search, Plus, Minus, ChevronRight, ShoppingBag, Store, Trash2, CheckCircle, AlertCircle, X, Smartphone, ClipboardList } from "lucide-react";
import type { Boutique, CartItem, Invoice, CaisseSession, Product, PlatformUser } from "../types";
import { SEM, inputCls, PAYMENT_METHODS, PM_ICON, PM_COLOR } from "../constants";
import { fmt, today, imgSrc } from "../utils/formatting";
import { productQty, lineTotal, lineDispQty, lineDispUnit } from "../utils/inventory";
import { silentPrint, buildOrderTicketHtml, printCaisseReport, agentPrint, connectQZ, PA } from "../utils/invoice";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { closeCaisseSession, createSale, openCaisseSession } from "../../lib/api";

export function POSView({ boutique, allBoutiques, currentUser, onUpdate, logAction }: {
  boutique: Boutique; allBoutiques: Boutique[]; currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const POS_COLOR = boutique.color;
  const { products, entries, invoices } = boutique;
  const session = boutique.caisseSession;
  const isSessionOpen = !!(session && !session.closedAt);

  // Caisse open/close
  const [fondCaisse, setFondCaisse] = useState("0");
  const [closeModal, setCloseModal] = useState(false);
  const [savingCaisse, setSavingCaisse] = useState(false);

  // Order taking
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addModal, setAddModal] = useState<Product|null>(null);
  const [addQty, setAddQty] = useState("1");
  const [addPrice, setAddPrice] = useState("");
  const [addSellUnit, setAddSellUnit] = useState("");
  const posCats = boutique.categories ?? [];

  function getSellOptions(p: Product): string[] {
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

  function sellConversion(sellQty: number, sellUnit: string, p: Product): string | null {
    const cat = posCats.find(c => c.nom === p.categorie);
    if (!cat || !sellQty) return null;
    const base = toBaseQty(sellQty, sellUnit, p);
    if (base === sellQty && sellUnit === cat.unitVente) return null;
    return `${base} ${cat.unitVente}`;
  }
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientNom, setClientNom] = useState("");
  const [clientTel, setClientTel] = useState("+221 ");
  const [done, setDone] = useState(false);
  const [lastInv, setLastInv] = useState<Invoice|null>(null);
  const [posTab, setPosTab] = useState<"produits"|"commandes">("produits");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [printJob, setPrintJob] = useState<{status:"printing"|"ok"|"fail"|"fallback";html:string;label:string}|null>(null);

  // Auto-connect QZ Tray if configured
  useEffect(()=>{ if (boutique.autoPrint && boutique.printerName && PA.status==="idle") connectQZ(boutique.printerName); },[]);

  async function doPrint(html: string, label: string) {
    setPrintJob({ status:"printing", html, label });
    const result = await agentPrint(html);
    setPrintJob(j=>j?{...j, status:result}:null);
    if (result !== "fail") setTimeout(()=>setPrintJob(null), 3500);
  }

  // Pending (unpaid) orders that can still be modified before encaissement
  const pendingOrders = invoices.filter(i => i.acompte === 0 && i.status === "en attente" && i.type !== "Retour");

  const todayStr = new Date().toISOString().split("T")[0];
  const todayInv = invoices.filter(i => i.dateRaw === todayStr && i.acompte > 0);
  const totalJour = todayInv.reduce((s, i) => s + i.acompte, 0);
  const byMethod = PAYMENT_METHODS.map(m => ({
    m,
    total: todayInv.filter(i => i.paymentMethod === m).reduce((s, i) => s + i.acompte, 0),
    count: todayInv.filter(i => i.paymentMethod === m).length,
  }));
  const totalEspeces = byMethod.find(b => b.m === "Espèces")?.total ?? 0;

  const [posCatFilter, setPosCatFilter] = useState("all");
  const [posSort, setPosSort] = useState<"nom"|"stock_asc"|"stock_desc"|"bestseller">("nom");
  const [posViewMode, setPosViewMode] = useState<"grid"|"list">("grid");

  const allPosCats = Array.from(new Set(products.map(p => p.categorie).filter(Boolean) as string[]));

  function getStock(p: Product) {
    return entries.filter(e => e.productId === p.id).reduce((s, e) => s + e.qty, 0);
  }

  function getSalesCount(p: Product) {
    return invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;
  }

  const filtered = products
    .filter(p => p.nom.toLowerCase().includes(search.toLowerCase()))
    .filter(p => posCatFilter === "all" || p.categorie === posCatFilter)
    .sort((a, b) => {
      if (posSort === "nom") return a.nom.localeCompare(b.nom);
      if (posSort === "bestseller") return getSalesCount(b) - getSalesCount(a);
      const sa = getStock(a), sb = getStock(b);
      return posSort === "stock_asc" ? sa - sb : sb - sa;
    });
  const cartTotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  async function openCaisse() {
    if (savingCaisse) return;
    setSavingCaisse(true);
    try {
      const saved = await openCaisseSession({ boutiqueId:boutique.id, fondOuverture:Number(fondCaisse) || 0 });
      const s: CaisseSession = { id:saved.session_id, openedAt:saved.opened_at, openedBy:currentUser.nom, fondDeCaisse:saved.fond_ouverture };
      onUpdate({ caisseSession:s });
      logAction("Ouverture caisse", `Fond : ${fmt(s.fondDeCaisse)}`, "🏪");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d’ouvrir la caisse");
    } finally {
      setSavingCaisse(false);
    }
  }

  async function closeCaisse() {
    if (!session) return;
    if (savingCaisse) return;
    setSavingCaisse(true);
    try {
      const saved = await closeCaisseSession({ boutiqueId:boutique.id, sessionId:String(session.id), totalVentes:totalJour });
      const closed: CaisseSession = { ...session, closedAt:saved.closed_at, closedBy:currentUser.nom };
      const history = [...(boutique.caisseHistory ?? []), closed];
      printCaisseReport(closed, boutique, invoices);
      onUpdate({ caisseSession:closed, caisseHistory:history });
      logAction("Fermeture caisse", `Total encaissé : ${fmt(totalJour)}`, "🔒");
      setCloseModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de fermer la caisse");
    } finally {
      setSavingCaisse(false);
    }
  }

  function openAdd(p: Product) {
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
  function confirmAdd() {
    if (!addModal || !addQty || !addPrice || Number(addQty) <= 0) return;
    const sellQtyN = Number(addQty);
    const prix = Number(addPrice);
    const opts = getSellOptions(addModal);
    const cat = posCats.find(c => c.nom === addModal.categorie);
    const baseUnit = cat?.unitVente ?? addModal.unit;
    const isSell = opts.length > 1 && addSellUnit !== baseUnit;
    const baseQty = isSell ? toBaseQty(sellQtyN, addSellUnit, addModal) : sellQtyN;
    const item: CartItem = {
      productId: addModal.id, nom: addModal.nom, img: addModal.img,
      unit: baseUnit, qty: baseQty, prixUnit: prix,
      ...(isSell ? { sellUnit: addSellUnit, sellQty: sellQtyN } : {}),
    };
    setCart(prev => { const ex = prev.find(i => i.productId === addModal.id); if (ex) return prev.map(i => i.productId === addModal.id ? item : i); return [...prev, item]; });
    setAddModal(null);
  }
  function removeFromCart(productId: number) { setCart(prev => prev.filter(i => i.productId !== productId)); }
  function updateCartQty(productId: number, newDispQty: number) {
    if (newDispQty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      if (item.sellUnit && item.sellQty !== undefined) {
        const p = products.find(pr => pr.id === productId);
        const newBase = p ? toBaseQty(newDispQty, item.sellUnit, p) : newDispQty;
        return { ...item, sellQty: newDispQty, qty: newBase };
      }
      return { ...item, qty: newDispQty };
    }));
  }

  function resetCheckout() {
    setCart([]); setClientNom(""); setClientTel("+221 ");
    setCheckoutOpen(false); setDone(false); setLastInv(null);
  }

  async function checkout() {
    if (cart.length === 0 || submittingOrder) return;
    const client = clientNom.trim() || "Client comptoir";
    const orderLines = cart.map(i => ({ productId: i.productId, nom: i.nom, qty: i.qty, unit: i.unit, prixUnit: i.prixUnit, sellUnit: i.sellUnit, sellQty: i.sellQty }));
    setSubmittingOrder(true);
    try {
      const saved = await createSale({ boutiqueId:boutique.id, client, clientTel:clientTel.trim() || undefined, lines:orderLines });
      const newInv: Invoice = {
        id:saved.invoice_id, client, clientTel:clientTel.trim() || undefined, lines:orderLines,
        montant:saved.total, acompte:0, date:today(), dateRaw:new Date().toISOString(),
        status:"en attente", type:"vente", operatorNom:currentUser.nom, operatorColor:currentUser.color,
      };
      onUpdate({ invoices:[...invoices, newInv] });
      logAction("Commande PDV", `${newInv.id} · ${client} · ${fmt(saved.total)}`, "🛒");
      setLastInv(newInv);
      setDone(true);
      setTimeout(() => doPrint(buildOrderTicketHtml(newInv, boutique, currentUser.nom), "Bon de commande"), 200);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d’enregistrer la commande");
    } finally {
      setSubmittingOrder(false);
    }
  }

  // ── If caisse not open ───────────────────────────────────────────────────────
  if (!isSessionOpen) {
    const lastClosed = (boutique.caisseHistory ?? []).slice(-1)[0];
    return (
      <div data-screen-source="relational-pos" className="space-y-5 pb-24 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background:POS_COLOR+"15" }}>
          <Store size={36} style={{ color:POS_COLOR }}/>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black">Ouvrir la caisse</h2>
          <p className="text-sm text-muted-foreground mt-1">Renseignez le fond de caisse pour commencer</p>
        </div>
        {lastClosed && (
          <div className="w-full max-w-sm px-4 py-3 rounded-2xl text-xs text-muted-foreground" style={{ background:"#EEE9D8" }}>
            Dernière session : {new Date(lastClosed.openedAt).toLocaleDateString("fr-FR")} · {lastClosed.openedBy} · fermée {lastClosed.closedAt ? new Date(lastClosed.closedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : "—"}
          </div>
        )}
        <div className="w-full max-w-sm space-y-3 px-4">
          <Field label="FOND DE CAISSE (F CFA)" color={POS_COLOR}>
            <input value={fondCaisse} onChange={e=>setFondCaisse(e.target.value)} type="number" placeholder="0" className={inputCls+" text-center text-xl font-black"} autoFocus onKeyDown={e=>e.key==="Enter"&&openCaisse()}/>
          </Field>
          <button disabled={savingCaisse} onClick={openCaisse} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
            <Store size={20}/> {savingCaisse ? "Ouverture…" : "Ouvrir la caisse"}
          </button>
        </div>
      </div>
    );
  }

  // ── Session open ─────────────────────────────────────────────────────────────
  return (
    <div data-screen-source="relational-pos" className="space-y-3 pb-36">

      {/* Caisse header bar */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:SEM.success.bg, border:"1px solid "+SEM.success.accent+"44" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"/>
          <div className="min-w-0">
            <p className="text-sm font-black truncate" style={{ color:SEM.success.text }}>CAISSE OUVERTE</p>
            <p className="text-xs text-muted-foreground truncate">{session!.openedBy} · {new Date(session!.openedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} · Fond : {fmt(session!.fondDeCaisse)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-base font-black" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalJour)}</span>
          <button onClick={()=>setCloseModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold active:scale-95" style={{ background:"#f3f4f6", color:"#374151" }}>
            <X size={13}/> Fermer
          </button>
        </div>
      </div>

      {/* Mon poste widget — non-admin local config */}
      {(()=>{
        const assign = currentUser.assignments.find(a=>a.boutiqueId===boutique.id);
        const isAdmin = currentUser.isSuperAdmin || assign?.role==="Propriétaire" || assign?.role==="Manager";
        if(isAdmin) return null;
        return (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border border-border bg-card">
            <Smartphone size={14} className="text-muted-foreground flex-shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">Mon poste</p>
              <p className="text-xs text-muted-foreground truncate">
                {boutique.printerName ? `🖨️ ${boutique.printerName}` : "Aucune imprimante configurée"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">Config. dans Admin →</span>
          </div>
        );
      })()}

      {/* Two tabs: Produits / Commandes */}
      <div className="flex bg-card rounded-2xl p-1 border border-border gap-1">
        <button onClick={()=>setPosTab("produits")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all"
          style={{ background:posTab==="produits"?"#1f2937":"transparent", color:posTab==="produits"?"#fff":"#9a9070" }}>
          <ShoppingBag size={18}/> Produits
        </button>
        <button onClick={()=>setPosTab("commandes")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all relative"
          style={{ background:posTab==="commandes"?"#1f2937":"transparent", color:posTab==="commandes"?"#fff":"#9a9070" }}>
          <ClipboardList size={18}/> Commandes
          {pendingOrders.length > 0 && (
            <span className="absolute top-1.5 right-3 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:SEM.danger.accent, border:"2px solid var(--card)" }}>
              {pendingOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Produits ── */}
      {posTab==="produits" && <>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un produit…" className={inputCls+" pl-11"}/>
        </div>
        {/* Category filter + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
            {["all", ...allPosCats].map(cat => (
              <button key={cat} onClick={() => setPosCatFilter(cat)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: posCatFilter === cat ? "#1f2937" : "#f3f4f6", color: posCatFilter === cat ? "#fff" : "#374151" }}>
                {cat === "all" ? "Tous" : cat}
              </button>
            ))}
          </div>
          <select value={posSort} onChange={e => setPosSort(e.target.value as typeof posSort)}
            className="flex-shrink-0 text-xs font-bold rounded-xl px-2.5 py-1.5 border-0 outline-none"
            style={{ background:"#EEE9D8", color:"#7A7055" }}>
            <option value="bestseller">⭐ Best seller</option>
            <option value="nom">A→Z</option>
            <option value="stock_desc">Stock ↓</option>
            <option value="stock_asc">Stock ↑</option>
          </select>
          <button onClick={() => setPosViewMode(v => v === "grid" ? "list" : "grid")}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#EEE9D8" }}>
            {posViewMode === "grid"
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="10" width="6" height="3" rx="1" fill="#7A7055"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="14" height="3" rx="1" fill="#7A7055"/></svg>}
          </button>
        </div>

        {posViewMode === "list" ? (
          <div className="space-y-2">
            {filtered.map(p => {
              const inCart = cart.find(i => i.productId === p.id);
              const stock = productQty(p.id, entries);
              const outOfStock = stock <= 0;
              return (
                <button key={p.id} onClick={() => !outOfStock && openAdd(p)}
                  className="w-full bg-card rounded-2xl border text-left flex items-center gap-3 p-3 transition-transform active:scale-[0.98]"
                  style={{ borderColor: inCart ? POS_COLOR+"66" : "var(--border)", opacity: outOfStock ? 0.5 : 1 }}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <img src={imgSrc(p.img,120,120)} alt={p.nom} className="w-full h-full object-cover"/>
                    {outOfStock && <div className="absolute inset-0 bg-black/55 flex items-center justify-center"><span className="text-white text-xs font-black" style={{fontSize:"8px"}}>RUPTURE</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">Stock : {stock} {p.unit}</p>
                    {p.categorie && <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ background:"#EEE9D8", color:"#7A7055" }}>{p.categorie}</span>}
                  </div>
                  {inCart && (
                    <div className="flex-shrink-0 text-right">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ml-auto" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <p className="text-xs font-black mt-1" style={{ color:POS_COLOR }}>{fmt(lineTotal(inCart))}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const inCart = cart.find(i => i.productId === p.id);
            const stock = productQty(p.id, entries);
            const outOfStock = stock <= 0;
            return (
              <button key={p.id} onClick={() => !outOfStock && openAdd(p)}
                className="bg-card rounded-2xl overflow-hidden border text-left relative transition-transform active:scale-95"
                style={{ borderColor: inCart ? POS_COLOR+"66" : "var(--border)", opacity: outOfStock ? 0.5 : 1 }}>
                <div className="w-full h-36 relative overflow-hidden">
                  <img src={imgSrc(p.img,300,300)} alt={p.nom} className="w-full h-full object-cover"/>
                  {inCart && (
                    <div className="absolute inset-0 flex flex-col justify-between p-2">
                      <div className="self-end w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <div className="w-full rounded-xl py-1 px-2 text-center text-xs font-black text-white" style={{ background:POS_COLOR+"cc" }}>{fmt(inCart.qty * inCart.prixUnit)}</div>
                    </div>
                  )}
                  {outOfStock && (<div className="absolute inset-0 bg-black/55 flex items-center justify-center"><span className="text-white text-xs font-black tracking-wide">RUPTURE</span></div>)}
                </div>
                <div className="p-2.5">
                  <p className="font-black text-base truncate leading-tight">{p.nom}</p>
                  <p className="text-sm font-semibold text-muted-foreground mt-0.5">Stock : {stock} {p.unit}</p>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </>}

      {/* ── Tab: Commandes en attente ── */}
      {posTab==="commandes" && <>
        {pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background:SEM.warning.bg }}>
              <ClipboardList size={30} style={{ color:SEM.warning.accent }}/>
            </div>
            <p className="font-black text-base" style={{ color:SEM.warning.accent }}>Aucune commande en attente</p>
            <p className="text-sm text-muted-foreground text-center px-8">Les commandes créées par le vendeur et non encore encaissées apparaîtront ici.</p>
            <button onClick={()=>setPosTab("produits")} className="mt-2 px-5 py-3 rounded-2xl font-black text-sm active:scale-95" style={{ background:POS_COLOR, color:"#fff" }}>
              + Nouvelle commande
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {[...pendingOrders].reverse().map(inv => (
              <div key={inv.id} className="bg-card rounded-2xl border overflow-hidden" style={{ borderColor:SEM.warning.accent+"33" }}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.warning.bg }}>
                    <ClipboardList size={20} style={{ color:SEM.warning.accent }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-base truncate">{inv.client}</p>
                    <p className="text-sm text-muted-foreground">{inv.id} · {(inv.lines?.length ?? 0)} article(s)</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-lg" style={{ color:SEM.warning.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p>
                    <p className="text-xs text-muted-foreground">{inv.date.split(" · ")[0]}</p>
                  </div>
                </div>
                {inv.lines && inv.lines.length > 0 && (
                  <div className="px-4 pb-3 space-y-1">
                    {inv.lines.map((l,i) => (
                      <div key={i} className="flex justify-between items-center text-sm px-3 py-1.5 rounded-xl" style={{ background:SEM.warning.bg }}>
                        <span className="font-semibold truncate flex-1">{l.nom}</span>
                        <span className="text-muted-foreground ml-2 flex-shrink-0">{l.qty} {l.unit} × {fmt(l.prixUnit)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex border-t" style={{ borderColor:SEM.warning.accent+"22" }}>
                  <button onClick={()=>{ silentPrint(buildOrderTicketHtml(inv, boutique, currentUser.nom, true)); }} className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#6b7280" }}>
                    🖨 Réimprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>}

      {/* Sticky cart bar */}
      {cart.length > 0 && !checkoutOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-20">
          <button onClick={() => setCheckoutOpen(true)}
            className="w-full py-4 rounded-2xl flex items-center justify-between px-5 active:scale-95 transition-transform"
            style={{ background:POS_COLOR, boxShadow:`0 8px 32px ${POS_COLOR}55` }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><ShoppingBag size={16} color="white"/></div>
              <span className="text-white font-black">{cartCount} article{cartCount>1?"s":""} · Valider commande</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-lg" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
              <ChevronRight size={18} color="white"/>
            </div>
          </button>
        </div>
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <Modal title="Nouvelle commande" color={POS_COLOR} onClose={resetCheckout}>
          {!done ? (<>
            <div className="space-y-2">
              {cart.map(item => {
                const dQty = lineDispQty(item);
                const dUnit = lineDispUnit(item);
                const dTotal = lineTotal(item);
                return (
                <div key={item.productId} className="flex items-center gap-3 bg-muted rounded-2xl p-3">
                  <img src={imgSrc(item.img,80,80)} alt={item.nom} className="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-sm truncate">{item.nom}</p>
                      {item.sellUnit && <span className="text-xs font-bold px-1.5 py-0.5 rounded-lg ml-1 flex-shrink-0" style={{ background:POS_COLOR+"18", color:POS_COLOR }}>{item.sellUnit}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button onClick={()=>updateCartQty(item.productId, dQty-1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Minus size={12} style={{ color:POS_COLOR }}/></button>
                      <span className="text-base font-black w-8 text-center">{dQty}</span>
                      <button onClick={()=>updateCartQty(item.productId, dQty+1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Plus size={12} style={{ color:POS_COLOR }}/></button>
                      <span className="text-xs text-muted-foreground ml-0.5">{dUnit} × {fmt(item.prixUnit)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <p className="font-black text-base" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(dTotal)}</p>
                    <button onClick={()=>removeFromCart(item.productId)} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={11} style={{ color:"#ef4444" }}/></button>
                  </div>
                </div>
                );
              })}
            </div>
            {/* Inline product selector (add article to order) */}
            <div className="rounded-2xl border-2 border-dashed overflow-hidden" style={{ borderColor:POS_COLOR+"44" }}>
              <p className="text-xs font-black tracking-wider px-3 py-2" style={{ color:POS_COLOR }}>+ AJOUTER UN ARTICLE</p>
              <div className="grid grid-cols-2 gap-2 px-3 pb-3" style={{ maxHeight:"200px", overflowY:"auto", scrollbarWidth:"none" }}>
                {products.filter(p=>productQty(p.id,entries)>0).map(p=>{
                  const inCart=cart.find(i=>i.productId===p.id);
                  return (
                    <button key={p.id} onClick={()=>openAdd(p)} className="flex items-center gap-2 rounded-xl p-2 text-left transition-colors active:scale-95"
                      style={{ background:inCart?POS_COLOR+"15":"#EEE9D8", border:inCart?`2px solid ${POS_COLOR}44`:"2px solid transparent" }}>
                      <img src={imgSrc(p.img,60,60)} alt={p.nom} className="w-10 h-10 rounded-lg object-cover flex-shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{p.nom}</p>
                        <p className="text-xs text-muted-foreground">{productQty(p.id,entries)} {p.unit}</p>
                        {inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>× {inCart.qty} ✓</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="font-black tracking-wide" style={{ color:POS_COLOR }}>TOTAL</span>
              <span className="text-2xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background:currentUser.color }}>{currentUser.initials}</div>
              <span className="text-xs text-muted-foreground">Opérateur : <span className="font-semibold text-foreground">{currentUser.nom}</span></span>
            </div>
            <Field label="NOM DU CLIENT (optionnel)" color={POS_COLOR}>
              <input value={clientNom} onChange={e=>setClientNom(e.target.value)} placeholder="Client comptoir" className={inputCls} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.closest("div")?.nextElementSibling?.querySelector("input") as HTMLInputElement|null)?.focus();}}}/>
            </Field>
            <Field label="TÉLÉPHONE (optionnel)" color={POS_COLOR}>
              <input value={clientTel} onChange={e=>{ const v=e.target.value; setClientTel(v.startsWith("+221 ")?v:"+221 "); }} placeholder="+221 77 000 0000" className={inputCls} onKeyDown={e=>e.key==="Enter"&&checkout()}/>
            </Field>
            <button disabled={submittingOrder || cart.length===0} onClick={checkout} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              <ClipboardList size={18}/> {submittingOrder ? "Enregistrement…" : "Enregistrer la commande"}
            </button>
          </>) : (<>
            <div className="flex flex-col items-center gap-3 py-5 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={40} style={{ color:SEM.success.accent }}/>
              <div className="text-center">
                <p className="font-black text-lg" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>Commande enregistrée ✓</p>
                <p className="text-sm text-muted-foreground mt-0.5">{lastInv?.id} · {lastInv?.client} · {fmt(lastInv?.montant ?? 0)}</p>
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:"#3b82f611", color:"#3b82f6" }}>
              <span>🖨️</span>
              <span className="text-sm font-semibold">Bon de commande imprimé automatiquement</span>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:SEM.warning.bg, color:SEM.warning.accent }}>
              <AlertCircle size={16}/> <span className="text-sm font-semibold">Le client présente ce bon au caissier pour encaissement</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => lastInv && silentPrint(buildOrderTicketHtml(lastInv, boutique, currentUser.nom, true))}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95 border-2"
                style={{ borderColor:POS_COLOR, color:POS_COLOR, background:"transparent" }}>
                🖨 Réimprimer
              </button>
              <button onClick={()=>{ resetCheckout(); setPosTab("commandes"); }}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95"
                style={{ background:SEM.warning.accent+"22", color:SEM.warning.accent }}>
                <ClipboardList size={15}/> Commandes
              </button>
            </div>
            <button onClick={resetCheckout}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
              style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              + Nouvelle commande
            </button>
          </>)}
        </Modal>
      )}

      {/* Fermer la caisse modal */}
      {closeModal && session && (
        <Modal title="Fermeture de caisse" color={POS_COLOR} onClose={() => setCloseModal(false)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Store size={18} style={{ color:POS_COLOR }}/></div>
              <div>
                <p className="text-sm font-bold">Session</p>
                <p className="text-xs text-muted-foreground">Ouvert par {session.openedBy} à {new Date(session.openedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 border-b border-border bg-muted/50">
                <span className="text-xs font-black text-muted-foreground">Fond de caisse</span>
                <span className="text-sm font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(session.fondDeCaisse)}</span>
              </div>
              {PAYMENT_METHODS.map(m => {
                const b = byMethod.find(x => x.m === m)!;
                return (
                  <div key={m} className="flex justify-between items-center px-4 py-2.5 border-b border-border">
                    <span className="text-sm flex items-center gap-2"><span>{PM_ICON[m]}</span><span style={{ color:PM_COLOR[m] }}>{m}</span><span className="text-xs text-muted-foreground">({b.count})</span></span>
                    <span className="font-black text-sm" style={{ color: b.total > 0 ? PM_COLOR[m] : "#c4b89a", fontFamily:"'Nunito', sans-serif" }}>{fmt(b.total)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between px-4 py-3" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total encaissé</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalJour)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 border-t border-border" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total en caisse (espèces)</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(session.fondDeCaisse + totalEspeces)}</span>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">Un rapport sera imprimé automatiquement à la fermeture</p>
            <button disabled={savingCaisse} onClick={closeCaisse} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              🔒 {savingCaisse ? "Fermeture…" : "Confirmer la fermeture"}
            </button>
          </div>
        </Modal>
      )}
      {/* Quick-add modal — must be LAST so it renders above checkout modal */}
      {addModal && (
        <Modal title={addModal.nom} color={POS_COLOR} onClose={() => setAddModal(null)}>
          <div className="flex gap-4 items-center">
            <img src={imgSrc(addModal.img,160,160)} alt={addModal.nom} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0"/>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Stock disponible</p>
              <p className="text-3xl font-black mt-0.5" style={{ fontFamily:"'Nunito', sans-serif", color:POS_COLOR }}>
                {productQty(addModal.id, entries)}<span className="text-base font-normal ml-1 text-muted-foreground">{addModal.unit}</span>
              </p>
            </div>
          </div>
          {getSellOptions(addModal).length > 1 && (
            <Field label="VENDRE PAR" color={POS_COLOR}>
              <div className="flex gap-2">
                {getSellOptions(addModal).map(u => (
                  <button key={u} onClick={() => { setAddSellUnit(u); setAddQty(""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"
                    style={{ background: addSellUnit === u ? POS_COLOR : POS_COLOR+"22", color: addSellUnit === u ? "#fff" : POS_COLOR }}>
                    {u}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`QUANTITÉ (${addSellUnit})`} color={POS_COLOR}>
              <div className="flex items-center gap-2">
                <button onClick={()=>setAddQty(q=>String(Math.max(1,Number(q)-1)))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Minus size={14} style={{ color:POS_COLOR }}/></button>
                <input value={addQty} onChange={e=>setAddQty(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" className={inputCls+" text-center font-black"} autoFocus/>
                <button onClick={()=>setAddQty(q=>String(Number(q)+1))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Plus size={14} style={{ color:POS_COLOR }}/></button>
              </div>
            </Field>
            <Field label={`PRIX / ${addSellUnit.toUpperCase()}`} color={POS_COLOR}>
              <input value={addPrice} onChange={e=>setAddPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" placeholder="0 F" className={inputCls+" text-center font-black"}/>
            </Field>
          </div>
          {Number(addQty) > 0 && sellConversion(Number(addQty), addSellUnit, addModal) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: POS_COLOR+"12" }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: POS_COLOR }}/>
              <span className="text-xs font-bold" style={{ color: POS_COLOR }}>
                {Number(addQty)} {addSellUnit} = {sellConversion(Number(addQty), addSellUnit, addModal)}
              </span>
            </div>
          )}
          {Number(addQty)>0 && Number(addPrice)>0 && (
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="text-sm font-bold" style={{ color:POS_COLOR }}>Sous-total</span>
              <span className="text-xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(Number(addQty)*Number(addPrice))}</span>
            </div>
          )}
          <SubmitBtn color={POS_COLOR} label={cart.find(i=>i.productId===addModal.id)?"Mettre à jour":"Ajouter au panier"} onClick={confirmAdd} disabled={!addQty||!addPrice||Number(addQty)<=0||Number(addPrice)<=0}/>
        </Modal>
      )}

      {/* ── Print status bar (fixed, above nav) ── */}
      {printJob && (
        <div className="fixed bottom-20 left-3 right-3 z-[200] pointer-events-none">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border pointer-events-auto" style={{
            background: printJob.status==="ok" ? "#f0fdf4" : printJob.status==="fail" ? "#fef2f2" : printJob.status==="fallback" ? "#fffbeb" : "#f8fafc",
            borderColor: printJob.status==="ok" ? "#bbf7d0" : printJob.status==="fail" ? "#fecaca" : printJob.status==="fallback" ? "#fde68a" : "#e2e8f0",
          }}>
            {printJob.status==="printing" && <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin flex-shrink-0"/>}
            {printJob.status==="ok"       && <span className="text-green-600 text-lg flex-shrink-0 leading-none">✓</span>}
            {printJob.status==="fallback" && <span className="text-amber-500 text-lg flex-shrink-0 leading-none">🖨️</span>}
            {printJob.status==="fail"     && <span className="text-red-500 text-lg flex-shrink-0 leading-none">✗</span>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-tight" style={{
                color: printJob.status==="ok" ? "#166534" : printJob.status==="fail" ? "#991b1b" : printJob.status==="fallback" ? "#92400e" : "#334155",
              }}>
                {printJob.status==="printing" && `Impression en cours — ${printJob.label}…`}
                {printJob.status==="ok"       && `${printJob.label} imprimé ✓`}
                {printJob.status==="fallback" && `${printJob.label} envoyé (dialogue système)`}
                {printJob.status==="fail"     && `Échec — ${printJob.label}`}
              </p>
              {printJob.status==="fail" && <p className="text-xs mt-0.5" style={{ color:"#dc2626" }}>Agent déconnecté ou imprimante hors ligne</p>}
              {printJob.status==="fallback" && <p className="text-xs mt-0.5" style={{ color:"#b45309" }}>Connectez QZ Tray dans Admin → Imprimante pour supprimer ce dialogue</p>}
            </div>
            {printJob.status==="fail" && (
              <button onClick={()=>doPrint(printJob.html, printJob.label)}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-white flex-shrink-0 active:scale-95"
                style={{ background:"#ef4444" }}>
                Réessayer
              </button>
            )}
            {printJob.status!=="printing" && printJob.status!=="fail" && (
              <button onClick={()=>setPrintJob(null)} className="text-muted-foreground w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 active:scale-95 text-lg leading-none">×</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
