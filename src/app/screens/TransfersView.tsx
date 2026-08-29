import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock, Search, Building2, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import type { Boutique, PlatformUser } from "../types";
import { acceptStockTransfer, cancelStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, subscribeToStockTransfers, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";
import { productQty } from "../utils/inventory";
import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitLabel, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";
import { fmt } from "../utils/formatting";
import { SEM, inputCls, searchInputCls } from "../constants";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { formatPreciseDateTime } from "../utils/payments";

const TRANSFER_COLOR = "#ea580c";

type DraftLine = { productId: number; nom: string; unit: string; qty: number; sellUnit: string; sellQty: number; unitPrice: number };

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

  const accountDestinations = allBoutiques.filter(b => b.id !== boutique.id);
  const sameOwnerIds = new Set(
    accountDestinations.filter(b => myOwnerId && ownerOf(b.id, platformUsers) === myOwnerId).map(b => b.id)
  );

  const [transfers, setTransfers] = useState<RelationalTransfer[]>([]);
  const [partners, setPartners] = useState<BoutiqueDirectoryEntry[]>([]);
  const [directoryResults, setDirectoryResults] = useState<BoutiqueDirectoryEntry[]>([]);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newModal, setNewModal] = useState(false);
  const [receiving, setReceiving] = useState<RelationalTransfer | null>(null);
  const [receiveMappings, setReceiveMappings] = useState<Record<number,string>>({});
  const [invoicePreview, setInvoicePreview] = useState<RelationalTransfer | null>(null);

  const destinations = useMemo(() => {
    const map = new Map<string,{id:string;nom:string;ville?:string;tel?:string;isPartner:boolean}>();
    for (const b of accountDestinations) map.set(b.id, { id:b.id, nom:b.nom, ville:b.ville, tel:b.tel, isPartner:false });
    for (const partner of partners) {
      if (!map.has(partner.boutique_id)) map.set(partner.boutique_id, {
        id:partner.boutique_id, nom:partner.nom, ville:partner.ville, tel:partner.tel, isPartner:true,
      });
      else map.get(partner.boutique_id)!.isPartner = true;
    }
    return [...map.values()];
  }, [accountDestinations, partners]);

  // Draft state
  const [destination, setDestination] = useState("");
  const [destinationSearch, setDestinationSearch] = useState("");
  const [note, setNote] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [dLineProductId, setDLineProductId] = useState("");
  const [dLineQty, setDLineQty] = useState("");
  const [dLineSellUnit, setDLineSellUnit] = useState("");
  const [dLinePrice, setDLinePrice] = useState("");

  const availableProducts = boutique.products.filter(p => p.actif !== false && productQty(p.id, boutique.entries) > 0);
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
    () => draftLines.reduce((s, l) => s + l.sellQty * l.unitPrice, 0),
    [draftLines],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedTransfers, loadedPartners] = await Promise.all([
        getStockTransfers(boutique.id),
        getBoutiquePartners(boutique.id),
      ]);
      setTransfers(loadedTransfers);
      setPartners(loadedPartners);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Transferts indisponibles"); }
    finally { setLoading(false); }
  }, [boutique.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeToStockTransfers(boutique.id, () => { void load(); }), [boutique.id, load]);

  async function runDirectorySearch(query = directoryQuery) {
    const digits = query.replace(/\D/g, "");
    if (digits.length < 9) {
      setDirectoryResults([]);
      toast.error("Saisissez au moins les 9 derniers chiffres du téléphone de la boutique");
      return;
    }
    setDirectoryLoading(true);
    try { setDirectoryResults(await searchBoutiqueDirectory(boutique.id, digits)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Annuaire indisponible"); }
    finally { setDirectoryLoading(false); }
  }

  async function addPartner(entry:BoutiqueDirectoryEntry) {
    if (saving) return;
    setSaving(true);
    try {
      await addBoutiquePartner(boutique.id, entry.boutique_id);
      const loaded = await getBoutiquePartners(boutique.id);
      setPartners(loaded);
      setDirectoryResults(prev => prev.map(row => row.boutique_id===entry.boutique_id ? {...row,is_partner:true} : row));
      toast.success(`${entry.nom} ajouté aux partenaires`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ajout du partenaire impossible"); }
    finally { setSaving(false); }
  }

  async function removePartner(entry:BoutiqueDirectoryEntry) {
    if (saving) return;
    setSaving(true);
    try {
      await removeBoutiquePartner(boutique.id, entry.boutique_id);
      setPartners(prev => prev.filter(row => row.boutique_id!==entry.boutique_id));
      setDirectoryResults(prev => prev.map(row => row.boutique_id===entry.boutique_id ? {...row,is_partner:false} : row));
      if (destination===entry.boutique_id && !sameOwnerIds.has(entry.boutique_id)) setDestination("");
      toast.success(`${entry.nom} retiré des partenaires`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Suppression du partenaire impossible"); }
    finally { setSaving(false); }
  }

  function transferSuggestedPrice(p: (typeof availableProducts)[number], sellUnit: string) {
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
    const sellQty = Number(dLineQty), price = Number(dLinePrice);
    const sellUnit = dLineSellUnit || getDefaultSaleUnit(p, boutique);
    const baseQty = toBaseSaleQty(sellQty, sellUnit, p, boutique);
    const stock = productQty(p.id, boutique.entries);
    if (!sellQty || sellQty <= 0 || baseQty > stock) return toast.error(`Quantité invalide (stock : ${stock} ${p.unit})`);
    if (price < 0) return toast.error("Prix invalide");
    setDraftLines(prev => [...prev.filter(l => l.productId !== p.id), { productId: p.id, nom: p.nom, unit: p.unit, qty: baseQty, sellUnit, sellQty, unitPrice: price }]);
    setDLineProductId(""); setDLineQty(""); setDLineSellUnit(""); setDLinePrice("");
  }

  function resetDraft() {
    setDestination(""); setDestinationSearch(""); setNote(""); setDraftLines([]);
    setDLineProductId(""); setDLineQty(""); setDLineSellUnit(""); setDLinePrice("");
    setNewModal(false);
  }

  async function submitTransfer() {
    if (!destination || !draftLines.length || saving) return;
    setSaving(true);
    try {
      const result = await createStockTransfer({
        fromBoutiqueId: boutique.id, toBoutiqueId: destination,
        lines: draftLines.map(l => ({ productId: l.productId, qty: l.qty, sellUnit:l.sellUnit, sellQty:l.sellQty, unitPrice: l.unitPrice })),
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

  async function cancelPendingTransfer(transferId: string) {
    if (saving) return;
    setSaving(true);
    try {
      await cancelStockTransfer(transferId);
      toast.success("Transfert annulé — aucun stock modifié");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Annulation impossible"); }
    finally { setSaving(false); }
  }

  function openReceive(transfer: RelationalTransfer) {
    const mappings: Record<number,string> = {};
    for (const line of transfer.stock_transfer_lines ?? []) {
      const exact = boutique.products.find(p => p.actif !== false && p.unit === line.unit && p.nom.trim().toLowerCase() === line.product_name.trim().toLowerCase());
      mappings[line.id] = exact ? String(exact.id) : "new";
    }
    setReceiveMappings(mappings);
    setReceiving(transfer);
  }

  async function confirmReceive() {
    if (!receiving || saving) return;
    const mappings = (receiving.stock_transfer_lines ?? []).map(line => {
      const selected = receiveMappings[line.id] ?? "new";
      return selected === "new"
        ? { transferLineId:line.id, createNew:true }
        : { transferLineId:line.id, destinationProductId:Number(selected) };
    });
    setSaving(true);
    try {
      const r = await acceptStockTransfer(receiving.id, mappings);
      toast.success(r.relationship_type === "same_owner" ? "Stock reçu — produits affectés" : `Stock reçu — facture fournisseur ${r.invoice_id ?? "créée"}`);
      setReceiving(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Réception impossible"); }
    finally { setSaving(false); }
  }

  async function decide(transferId: string, decision: "reject") {
    if (saving) return;
    setSaving(true);
    try {
      await rejectStockTransfer(transferId);
      toast.success("Transfert refusé — aucun stock modifié");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Action impossible"); }
    finally { setSaving(false); }
  }

  const outbound = transfers.filter(t => t.from_boutique_id === boutique.id);
  const inbound  = transfers.filter(t => t.to_boutique_id   === boutique.id);
  const pendingIn = inbound.filter(t => t.status === "pending").length;

  function TransferCard({ t }: { t: RelationalTransfer }) {
    const isIn = t.to_boutique_id === boutique.id;
    const otherId = isIn ? t.from_boutique_id : t.to_boutique_id;
    const other = destinations.find(b => b.id === otherId) ?? allBoutiques.find(b => b.id === otherId);
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
            <p className="text-xs text-muted-foreground mt-0.5">{formatPreciseDateTime(t.created_at)}</p>
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
              <span className="text-muted-foreground ml-2 flex-shrink-0">{Number(l.sell_qty ?? l.qty)} {l.sell_unit ?? l.unit} × {fmt(Number(l.prix_unit))}{l.sell_unit ? ` · ${l.qty} ${l.unit} stock` : ""}</span>
            </div>
          ))}
        </div>
        {/* Note */}
        {t.note && <p className="px-3.5 pb-2 text-xs italic text-muted-foreground">{t.note}</p>}
        {/* Invoice / charge links */}
        {(t.invoice_id || t.charge_id) && (
          <div className="px-3.5 pb-2 flex gap-2 flex-wrap">
            {t.invoice_id && <button type="button" onClick={()=>setInvoicePreview(t)} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#eff6ff", color:"#2563eb" }}><FileText size={11}/>Voir facture fournisseur {t.invoice_id}</button>}
            {t.charge_id  && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#fef2f2", color:"#dc2626" }}>Charge #{t.charge_id}</span>}
          </div>
        )}
        {/* Accept / reject buttons for incoming pending */}
        {isIn && t.status === "pending" && (
          <div className="flex border-t divide-x border-border">
            <button onClick={() => openReceive(t)} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:SEM.success.accent }}>
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Accepter
            </button>
            <button onClick={() => decide(t.id, "reject")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#ef4444" }}>
              <X size={14}/> Refuser
            </button>
          </div>
        )}
        {!isIn && t.status === "pending" && (
          <div className="border-t border-border">
            <button onClick={() => void cancelPendingTransfer(t.id)} disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95 disabled:opacity-50" style={{ color:"#dc2626" }}>
              {saving ? <Loader2 size={14} className="animate-spin"/> : <X size={14}/>} Annuler le transfert
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
        <div className="flex gap-2">
          <button onClick={() => { setDirectoryQuery(""); setDirectoryResults([]); setDirectoryOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl font-black text-sm active:scale-95 border border-border bg-card"
            style={{ color:TRANSFER_COLOR }}>
            <Building2 size={15}/> Annuaire
          </button>
          <button onClick={() => setNewModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95"
            style={{ background:TRANSFER_COLOR }}>
            <Plus size={15}/> Nouveau
          </button>
        </div>
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

      {directoryOpen && (
        <Modal title="Annuaire des boutiques" color={TRANSFER_COLOR} onClose={()=>setDirectoryOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-2xl px-4 py-3 text-xs leading-relaxed" style={{background:"#fff7ed",color:"#9a3412"}}>
              Pour retrouver une boutique d'une autre entité, saisissez son numéro de téléphone. Tournal compare uniquement les 9 derniers chiffres afin d'éviter les erreurs liées aux indicatifs, espaces ou tirets. Aucune autre boutique n'est affichée sans recherche.
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input type="tel" inputMode="tel" value={directoryQuery} onChange={e=>{setDirectoryQuery(e.target.value);setDirectoryResults([]);}} onKeyDown={e=>e.key==="Enter"&&void runDirectorySearch()} placeholder="Téléphone de la boutique…" className={searchInputCls+" pl-9"}/>
              </div>
              <button onClick={()=>void runDirectorySearch()} disabled={directoryLoading || directoryQuery.replace(/\D/g, "").length < 9} className="px-4 rounded-xl font-black text-sm text-white disabled:opacity-40" style={{background:TRANSFER_COLOR}}>
                {directoryLoading ? <Loader2 size={16} className="animate-spin"/> : "Rechercher"}
              </button>
            </div>

            {partners.length > 0 && (
              <div>
                <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">MES PARTENAIRES ({partners.length})</p>
                <div className="space-y-2">
                  {partners.map(entry=>(
                    <div key={entry.boutique_id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:"#fff7ed"}}><Building2 size={16} style={{color:TRANSFER_COLOR}}/></div>
                      <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{entry.nom}</p><p className="text-xs text-muted-foreground truncate">{entry.ville || "Ville non renseignée"}{entry.tel ? ` · ${entry.tel}` : ""}{entry.transfer_count ? ` · ${entry.transfer_count} transfert${entry.transfer_count>1?"s":""}` : ""}</p></div>
                      <button onClick={()=>{setDestination(entry.boutique_id);setDirectoryOpen(false);setNewModal(true);}} className="px-2.5 py-2 rounded-xl text-xs font-black" style={{background:TRANSFER_COLOR+"18",color:TRANSFER_COLOR}}>Choisir</button>
                      <button onClick={()=>void removePartner(entry)} disabled={saving} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40" style={{background:"#fef2f2",color:"#dc2626"}}><UserMinus size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">ANNUAIRE</p>
              {directoryLoading && <p className="text-sm text-muted-foreground text-center py-4">Recherche…</p>}
              {!directoryLoading && directoryResults.length===0 && directoryQuery.replace(/\D/g, "").length < 9 && <p className="text-sm text-muted-foreground text-center py-4">Saisissez au moins les 9 derniers chiffres du numéro de téléphone.</p>}
              {!directoryLoading && directoryResults.length===0 && directoryQuery.replace(/\D/g, "").length >= 9 && <p className="text-sm text-muted-foreground text-center py-4">Aucune boutique ne correspond à ce numéro.</p>}
              <div className="space-y-2">
                {directoryResults.map(entry=>(
                  <div key={entry.boutique_id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"><Building2 size={16}/></div>
                    <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{entry.nom}</p><p className="text-xs text-muted-foreground truncate">{entry.ville || "Ville non renseignée"}{entry.tel ? ` · ${entry.tel}` : ""}</p></div>
                    {entry.is_partner || partners.some(p=>p.boutique_id===entry.boutique_id)
                      ? <span className="text-xs font-black px-2.5 py-2 rounded-xl" style={{background:SEM.success.bg,color:SEM.success.accent}}>Partenaire</span>
                      : <button onClick={()=>void addPartner(entry)} disabled={saving} className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-black disabled:opacity-40" style={{background:TRANSFER_COLOR+"18",color:TRANSFER_COLOR}}><UserPlus size={13}/> Ajouter</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {receiving && (
        <Modal title="Réception du transfert" color={SEM.success.accent} onClose={()=>!saving&&setReceiving(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl px-4 py-3 text-xs leading-relaxed" style={{background:SEM.success.bg,color:SEM.success.text}}>
              Affectez chaque article reçu à un produit existant de même unité, ou créez un nouveau produit. Un nouveau produit reprend automatiquement le conditionnement de l’émetteur.
            </div>
            {(receiving.stock_transfer_lines ?? []).map(line => (
              <div key={line.id} className="rounded-2xl border border-border p-3 space-y-2">
                <div><p className="font-black text-sm">{line.product_name}</p><p className="text-xs text-muted-foreground">{Number(line.sell_qty ?? line.qty)} {line.sell_unit ?? line.unit} · {line.qty} {line.unit} à entrer en stock</p></div>
                <select value={receiveMappings[line.id] ?? "new"} onChange={e=>setReceiveMappings(prev=>({...prev,[line.id]:e.target.value}))} className={inputCls}>
                  <option value="new">＋ Créer un nouveau produit</option>
                  {boutique.products.filter(p=>p.unit===line.unit).sort((a,b)=>a.nom.localeCompare(b.nom)).map(p=><option key={p.id} value={p.id}>Affecter à {p.nom} · stock {productQty(p.id,boutique.entries)} {p.unit}</option>)}
                </select>
                {(receiveMappings[line.id] ?? "new") === "new" && <p className="text-[11px] font-semibold" style={{color:TRANSFER_COLOR}}>Nouveau produit · nom, unité et conditionnement repris depuis la boutique émettrice.</p>}
              </div>
            ))}
            <SubmitBtn color={SEM.success.accent} label={saving?"Réception en cours…":"Confirmer la réception"} onClick={()=>void confirmReceive()} disabled={saving}/>
          </div>
        </Modal>
      )}

      {invoicePreview && (
        <Modal title="Facture fournisseur" color="#2563eb" onClose={()=>setInvoicePreview(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs text-muted-foreground">FOURNISSEUR</p>
              <p className="font-black text-lg">{(allBoutiques.find(b=>b.id===invoicePreview.from_boutique_id)?.nom) ?? "Boutique émettrice"}</p>
              <p className="text-sm text-muted-foreground">Facture {invoicePreview.invoice_id} · {formatPreciseDateTime(invoicePreview.created_at)}</p>
            </div>
            <div className="space-y-2">
              {(invoicePreview.stock_transfer_lines ?? []).map(line=><div key={line.id} className="flex justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm"><span className="font-bold">{line.product_name}<br/><span className="text-xs font-normal text-muted-foreground">{Number(line.sell_qty ?? line.qty)} {line.sell_unit ?? line.unit}</span></span><span className="font-black">{fmt(Number(line.sell_qty ?? line.qty)*Number(line.prix_unit))}</span></div>)}
            </div>
            <div className="flex justify-between rounded-2xl px-4 py-3 font-black" style={{background:"#eff6ff",color:"#2563eb"}}><span>TOTAL FOURNISSEUR</span><span>{fmt(Number(invoicePreview.total_amount))}</span></div>
          </div>
        </Modal>
      )}

      {/* New transfer modal */}
      {newModal && (
        <Modal title="Nouveau transfert" color={TRANSFER_COLOR} onClose={resetDraft}>
          {/* Destination */}
          <Field label="BOUTIQUE DESTINATAIRE">
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={destinationSearch} onChange={e=>setDestinationSearch(e.target.value)} placeholder="Rechercher nom, téléphone ou ville…" className={searchInputCls+" pl-9"}/>
              </div>
              <select value={destination} onChange={e => setDestination(e.target.value)} className={inputCls}>
                <option value="">Choisir une boutique…</option>
                {filteredDestinations.map(b => {
                  const count = destinationFrequency.get(b.id) ?? 0;
                  const relation = sameOwnerIds.has(b.id) ? "interne" : b.isPartner ? "partenaire commercial" : "commercial";
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
              {dLineProductId && (() => {
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
              <div className="grid grid-cols-2 gap-2">
                <div><input type="number" min="0.01" step="any" value={dLineQty} onChange={e => setDLineQty(e.target.value)} placeholder={dLineSellUnit === "Lot" ? "Nombre de lots" : dLineSellUnit === "Pièce" ? "Nombre de pièces" : dLineSellUnit ? `Quantité ${dLineSellUnit}` : "Quantité"} className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Saisie dans le conditionnement sélectionné</p></div>
                <div><input type="number" min="0" step="any" value={dLinePrice} onChange={e => setDLinePrice(e.target.value)} placeholder="Prix cession" className={inputCls}/><p className="text-[10px] text-muted-foreground mt-1 px-1">Prix par {dLineSellUnit || "unité"}</p></div>
              </div>
              {dLineProductId && Number(dLineQty)>0 && (() => {
                const product = availableProducts.find(p => p.id === Number(dLineProductId));
                if (!product || !dLineSellUnit) return null;
                const base = toBaseSaleQty(Number(dLineQty),dLineSellUnit,product,boutique);
                return base === Number(dLineQty) && dLineSellUnit === product.unit ? null : <p className="text-xs font-bold px-2" style={{color:TRANSFER_COLOR}}>{Number(dLineQty)} {dLineSellUnit} = {base} {product.unit} prélevés du stock</p>;
              })()}
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
                const lineAmt = l.sellQty * l.unitPrice;
                return (
                  <div key={l.productId} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#f3f4f6" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{l.nom}</p>
                      <p className="text-xs text-muted-foreground">{l.sellQty} {l.sellUnit} × {fmt(l.unitPrice)} · {l.qty} {l.unit} stock</p>
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
