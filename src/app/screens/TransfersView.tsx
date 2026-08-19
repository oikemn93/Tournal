import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import type { Boutique, PlatformUser } from "../types";
import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, type RelationalTransfer } from "../../lib/api";
import { productQty } from "../utils/inventory";
import { getLastSalePrice } from "../utils/sales";
import { fmt } from "../utils/formatting";
import { SEM, inputCls } from "../constants";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";

const TRANSFER_COLOR = "#ea580c";

type DraftLine = { productId: number; nom: string; unit: string; qty: number; unitPrice: number; discountPercent: number };

const STATUS: Record<RelationalTransfer["status"], { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending:   { label:"En attente", color:"#d97706", bg:"#fffbeb", icon:Clock },
  accepted:  { label:"Accepté",    color:"#16a34a", bg:"#f0fdf4", icon:PackageCheck },
  rejected:  { label:"Refusé",     color:"#dc2626", bg:"#fef2f2", icon:PackageX },
  cancelled: { label:"Annulé",     color:"#6b7280", bg:"#f9fafb", icon:X },
};

function ownerOf(boutiqueId: string, users: PlatformUser[]): string | null {
  return users.find(u => u.assignments.some(a => a.boutiqueId === boutiqueId && a.role === "Propriétaire"))?.id ?? null;
}

export function TransfersView({ boutique, allBoutiques, platformUsers, currentUser }: {
  boutique: Boutique;
  allBoutiques: Boutique[];
  platformUsers: PlatformUser[];
  currentUser: PlatformUser;
}) {
  const myOwnerId = ownerOf(boutique.id, platformUsers);

  // Destinations = toutes les autres boutiques accessibles (même propriétaire ou même groupe en priorité)
  const destinations = allBoutiques.filter(b => b.id !== boutique.id);
  const sameOwnerIds = new Set(
    destinations.filter(b => myOwnerId && ownerOf(b.id, platformUsers) === myOwnerId).map(b => b.id)
  );

  const [transfers, setTransfers] = useState<RelationalTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newModal, setNewModal] = useState(false);

  // Draft state
  const [destination, setDestination] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [dLineProductId, setDLineProductId] = useState("");
  const [dLineQty, setDLineQty] = useState("");
  const [dLinePrice, setDLinePrice] = useState("");
  const [dLineDiscount, setDLineDiscount] = useState("0");

  const availableProducts = boutique.products.filter(p => productQty(p.id, boutique.entries) > 0);
  const destinationBoutique = destinations.find(b => b.id === destination);
  const isSameOwner = destination ? sameOwnerIds.has(destination) : null;
  const destinationFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transfer of transfers) {
      const otherId = transfer.from_boutique_id === boutique.id ? transfer.to_boutique_id : transfer.from_boutique_id;
      if (otherId !== boutique.id) counts.set(otherId, (counts.get(otherId) ?? 0) + 1);
    }
    return counts;
  }, [transfers, boutique.id]);
  const filteredDestinations = useMemo(() => {
    const q = destinationSearch.trim().toLowerCase().replace(/\s+/g, "");
    return [...destinations]
      .filter(b => {
        if (!q) return true;
        const haystack = `${b.nom} ${b.ville ?? ""} ${b.tel ?? ""}`.toLowerCase().replace(/\s+/g, "");
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const sameOwnerDelta = Number(sameOwnerIds.has(b.id)) - Number(sameOwnerIds.has(a.id));
        if (sameOwnerDelta) return sameOwnerDelta;
        const freqDelta = (destinationFrequency.get(b.id) ?? 0) - (destinationFrequency.get(a.id) ?? 0);
        return freqDelta || a.nom.localeCompare(b.nom);
      });
  }, [destinations, destinationSearch, destinationFrequency]);

  const draftTotal = useMemo(
    () => draftLines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPercent / 100), 0),
    [draftLines],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try { setTransfers(await getStockTransfers(boutique.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Transferts indisponibles"); }
    finally { setLoading(false); }
  }, [boutique.id]);

  useEffect(() => { void load(); }, [load]);

  function selectProduct(pid: string) {
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

  function resetDraft() {
    setDestination(""); setDestinationSearch(""); setNote(""); setDraftLines([]);
    setDLineProductId(""); setDLineQty(""); setDLinePrice(""); setDLineDiscount("0");
    setNewModal(false);
  }

  async function submitTransfer() {
    if (!destination || !draftLines.length || saving) return;
    setSaving(true);
    try {
      const result = await createStockTransfer({
        fromBoutiqueId: boutique.id, toBoutiqueId: destination,
        lines: draftLines.map(l => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, discountPercent: l.discountPercent })),
        note: note.trim() || undefined,
      });
      toast.success(
        result.relationship_type === "same_owner"
          ? "Transfert interne envoyé — aucun impact CA"
          : `Transfert commercial envoyé — facturation à l'acceptation · ${fmt(result.total_amount)}`,
      );
      resetDraft();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Transfert impossible"); }
    finally { setSaving(false); }
  }

  async function decide(transferId: string, decision: "accept" | "reject") {
    if (saving) return;
    setSaving(true);
    try {
      if (decision === "accept") {
        const r = await acceptStockTransfer(transferId);
        toast.success(
          r.relationship_type === "same_owner"
            ? "Stock reçu — aucune charge ni CA generé"
            : `Stock reçu — charge créée · facture ${r.invoice_id ?? "en cours"}`,
        );
      } else {
        await rejectStockTransfer(transferId);
        toast.success("Transfert refusé — aucun stock modifié");
      }
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Action impossible"); }
    finally { setSaving(false); }
  }

  const outbound = transfers.filter(t => t.from_boutique_id === boutique.id);
  const inbound  = transfers.filter(t => t.to_boutique_id   === boutique.id);
  const pendingIn = inbound.filter(t => t.status === "pending").length;

  function TransferCard({ t }: { t: RelationalTransfer }) {
    const isIn = t.to_boutique_id === boutique.id;
    const other = allBoutiques.find(b => b.id === (isIn ? t.from_boutique_id : t.to_boutique_id));
    const st = STATUS[t.status];
    const Icon = st.icon;
    const isCommercial = t.relationship_type === "commercial";
    return (
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-start gap-3 p-3.5">
          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: isIn ? SEM.success.bg : "#fff7ed" }}>
            {isIn ? <ArrowDownLeft size={18} style={{ color:SEM.success.accent }}/> : <ArrowUpRight size={18} style={{ color:TRANSFER_COLOR }}/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm">{isIn ? "Reçu de" : "Envoyé à"} <span style={{ color: isIn ? SEM.success.accent : TRANSFER_COLOR }}>{other?.nom ?? "Boutique"}</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background:st.bg, color:st.color }}>
                <Icon size={10} className="inline mr-1"/>{st.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: isCommercial ? "#eff6ff" : "#f0fdf4", color: isCommercial ? "#2563eb" : "#16a34a" }}>
                {isCommercial ? "💼 Commercial" : "🏠 Interne"}
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-black text-base" style={{ fontFamily:"'Nunito', sans-serif", color: isCommercial ? TRANSFER_COLOR : "#6b7280" }}>
              {isCommercial ? fmt(Number(t.total_amount)) : "—"}
            </p>
          </div>
        </div>
        {/* Lines */}
        <div className="px-3.5 pb-2 space-y-1">
          {(t.stock_transfer_lines ?? []).map((l, i) => (
            <div key={i} className="flex justify-between text-xs px-2.5 py-1.5 rounded-xl" style={{ background:"#f3f4f6" }}>
              <span className="font-semibold truncate flex-1">{l.product_name}</span>
              <span className="text-muted-foreground ml-2 flex-shrink-0">{l.qty} {l.unit} × {fmt(Number(l.prix_unit))}{l.discount_percent > 0 ? ` −${l.discount_percent}%` : ""}</span>
            </div>
          ))}
        </div>
        {/* Note */}
        {t.note && <p className="px-3.5 pb-2 text-xs italic text-muted-foreground">{t.note}</p>}
        {/* Invoice / charge links */}
        {(t.invoice_id || t.charge_id) && (
          <div className="px-3.5 pb-2 flex gap-2 flex-wrap">
            {t.invoice_id && <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#eff6ff", color:"#2563eb" }}><FileText size={11}/>Facture {t.invoice_id}</span>}
            {t.charge_id  && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#fef2f2", color:"#dc2626" }}>Charge #{t.charge_id}</span>}
          </div>
        )}
        {/* Accept / reject buttons for incoming pending */}
        {isIn && t.status === "pending" && (
          <div className="flex border-t divide-x border-border">
            <button onClick={() => decide(t.id, "accept")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:SEM.success.accent }}>
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Accepter
            </button>
            <button onClick={() => decide(t.id, "reject")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#ef4444" }}>
              <X size={14}/> Refuser
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={20} style={{ color:TRANSFER_COLOR }}/>
          <div>
            <h2 className="font-black text-base">Transferts inter-boutiques</h2>
            <p className="text-xs text-muted-foreground">Interne = mouvement de stock · Commercial = facturation</p>
          </div>
        </div>
        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95"
          style={{ background:TRANSFER_COLOR }}>
          <Plus size={15}/> Nouveau
        </button>
      </div>

      {/* Pending incoming alert */}
      {pendingIn > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:"#fffbeb", border:`1px solid #d9770655` }}>
          <Clock size={16} style={{ color:"#d97706" }}/>
          <p className="text-sm font-black" style={{ color:"#d97706" }}>{pendingIn} transfert{pendingIn>1?"s":""} en attente d'acceptation</p>
        </div>
      )}

      {/* Tabs: Reçus / Envoyés */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Reçus", list: inbound, icon: ArrowDownLeft, color: SEM.success.accent },
          { label: "Envoyés", list: outbound, icon: ArrowUpRight, color: TRANSFER_COLOR },
        ].map(({ label, list, icon: Icon, color }) => (
          <div key={label}>
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <Icon size={14} style={{ color }}/>
              <span className="text-xs font-black tracking-wider" style={{ color }}>{label.toUpperCase()}</span>
              <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background:color+"18", color }}>{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.length === 0
                ? <p className="text-xs text-muted-foreground px-1 py-4 text-center">Aucun transfert</p>
                : list.map(t => <TransferCard key={t.id} t={t}/>)
              }
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground py-4">Chargement…</p>}

      {/* New transfer modal */}
      {newModal && (
        <Modal title="Nouveau transfert" color={TRANSFER_COLOR} onClose={resetDraft}>
          {/* Destination */}
          <Field label="BOUTIQUE DESTINATAIRE">
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={destinationSearch} onChange={e=>setDestinationSearch(e.target.value)} placeholder="Rechercher nom, téléphone ou ville…" className={inputCls+" pl-9"}/>
              </div>
              <select value={destination} onChange={e => setDestination(e.target.value)} className={inputCls}>
                <option value="">Choisir une boutique…</option>
                {filteredDestinations.map(b => {
                  const count = destinationFrequency.get(b.id) ?? 0;
                  const relation = sameOwnerIds.has(b.id) ? "interne" : "commercial";
                  return <option key={b.id} value={b.id}>{b.nom}{b.ville ? ` — ${b.ville}` : ""}{b.tel ? ` · ${b.tel}` : ""} · {relation}{count > 0 ? ` · ${count} transfert${count>1?"s":""}` : ""}</option>;
                })}
              </select>
              {destinationBoutique && (
                <p className="text-xs text-muted-foreground px-1">{destinationBoutique.tel ? `Tél. ${destinationBoutique.tel}` : "Téléphone non renseigné"}{destinationBoutique.ville ? ` · ${destinationBoutique.ville}` : ""}</p>
              )}
            </div>
          </Field>

          {/* Relation indicator */}
          {destination && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: isSameOwner ? "#f0fdf4" : "#eff6ff", color: isSameOwner ? "#16a34a" : "#2563eb" }}>
              {isSameOwner
                ? "🏠 Même propriétaire — mouvement interne, aucun impact CA"
                : "💼 Propriétaires différents — facturation à l'acceptation"}
            </div>
          )}

          {/* Add product line */}
          <Field label="AJOUTER UN ARTICLE">
            <div className="space-y-2">
              <select value={dLineProductId} onChange={e => selectProduct(e.target.value)} className={inputCls}>
                <option value="">Produit…</option>
                {availableProducts.map(p => <option key={p.id} value={p.id}>{p.nom} — stock : {productQty(p.id, boutique.entries)} {p.unit}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min="0.01" step="any" value={dLineQty} onChange={e => setDLineQty(e.target.value)} placeholder="Quantité" className={inputCls}/>
                <div><input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Dernier prix vendu, sinon coût moyen stock</p></div>
                <input type="number" min="0" max="100" step="any" value={dLineDiscount} onChange={e => setDLineDiscount(e.target.value)} placeholder="Remise %" className={inputCls}/>
              </div>
              <button onClick={addDraftLine} className="w-full py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                style={{ background:TRANSFER_COLOR+"18", color:TRANSFER_COLOR }}>
                <Plus size={14}/> Ajouter la ligne
              </button>
            </div>
          </Field>

          {/* Draft lines */}
          {draftLines.length > 0 && (
            <div className="space-y-1.5">
              {draftLines.map(l => {
                const lineAmt = l.qty * l.unitPrice * (1 - l.discountPercent / 100);
                return (
                  <div key={l.productId} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#f3f4f6" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{l.nom}</p>
                      <p className="text-xs text-muted-foreground">{l.qty} {l.unit} × {fmt(l.unitPrice)}{l.discountPercent > 0 ? ` −${l.discountPercent}%` : ""}</p>
                    </div>
                    <p className="font-black text-sm flex-shrink-0" style={{ color:TRANSFER_COLOR }}>{fmt(lineAmt)}</p>
                    <button onClick={() => setDraftLines(prev => prev.filter(x => x.productId !== l.productId))}
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"#ef444415" }}>
                      <Trash2 size={11} style={{ color:"#ef4444" }}/>
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-between items-center px-3 py-2 rounded-xl font-black" style={{ background:TRANSFER_COLOR+"15" }}>
                <span style={{ color:TRANSFER_COLOR }}>TOTAL</span>
                <span style={{ color:TRANSFER_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(draftTotal)}</span>
              </div>
            </div>
          )}

          <Field label="NOTE (optionnelle)">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: stock liquidation boutique nord" className={inputCls}/>
          </Field>

          <SubmitBtn color={TRANSFER_COLOR}
            label={saving ? "Envoi en cours…" : "Envoyer le transfert"}
            onClick={() => void submitTransfer()}
            disabled={saving || !destination || draftLines.length === 0}/>
        </Modal>
      )}
    </div>
  );
}
