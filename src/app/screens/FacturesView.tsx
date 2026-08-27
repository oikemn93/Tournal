import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus, Send, FileText, Eye, Mail, MessageCircle, Smartphone, Phone, Wallet, CreditCard, RotateCcw, ShoppingCart, Receipt, AlertCircle, Trash2, CheckCircle, Minus, Store, X, ChevronLeft, ChevronRight, CalendarDays, PlusCircle } from "lucide-react";
import type { Boutique, Invoice, InvoiceStatus, InvoiceLine, StockEntry, PaymentMethod, Client, PlatformUser, CaisseSession, PaymentEntry } from "../types";
import { SEM, inputCls, searchInputCls, PAYMENT_METHODS, PM_ICON, PM_COLOR, PLACEHOLDER_IMGS } from "../constants";
import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare } from "../../lib/api";
import { fmt, today, imgSrc } from "../utils/formatting";
import { invBadge, lineTotal, lineDispQty, lineDispUnit, genInvoiceId, productQty, getSiblings, invoiceMargin, lineUnitCost } from "../utils/inventory";
import { buildReceiptHtml, openInvoicePDF, buildInvoiceMessage, generateInvoicePDFBlob, agentPrint, printReceipt, printCaisseReport } from "../utils/invoice";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount, invoicePaymentEvents, moneyExceeds, roundMoney } from "../utils/payments";
import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, toBaseSaleQty } from "../utils/sales";

// ─── SHARE INVOICE MODAL ──────────────────────────────────────────────────────

function ShareInvoiceModal({ inv, boutique, clients, onClose }: { inv: Invoice; boutique: Boutique; clients: Client[]; onClose: () => void }) {
  const phone = inv.clientTel ? inv.clientTel.replace(/[\s\-().]/g, "").replace("+", "") : "";
  const clientRecord = inv.clientId != null ? clients.find(c=>c.id===inv.clientId) : clients.find(c=>c.nom===inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const [channel, setChannel] = useState<"apercu"|"email"|"whatsapp"|"sms">("apercu");
  const [emailAddr, setEmailAddr] = useState(clientRecord?.email ?? "");
  const [waPhone, setWaPhone] = useState(inv.clientTel ?? "");
  const [smsPhone, setSmsPhone] = useState(inv.clientTel ?? "");
  const [generating, setGenerating] = useState(false);
  const [shareError, setShareError] = useState("");

  const inputCls2 = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring";
  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

  function doPreview() {
    openInvoicePDF(inv, boutique, clients);
  }

  async function createTemporaryLink() {
    setShareError("");
    setGenerating(true);
    try {
      const pdf = await generateInvoicePDFBlob(inv, boutique, clients);
      return await createInvoiceShare({ boutiqueId:boutique.id, invoiceId:inv.id, pdf });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Création du lien impossible");
      return null;
    } finally {
      setGenerating(false);
    }
  }

  function shareText(url:string) {
    const statusLine = reste<=0 ? "Statut : Payé"
      : inv.acompte>0 ? `Encaissé : ${fmtN(inv.acompte)} F — reste dû : ${fmtN(reste)} F`
      : "Statut : Impayé";
    return `Bonjour ${inv.client}\n\nVoici votre facture ${inv.id} de ${boutique.nom}.\nTotal : ${fmtN(inv.montant)} F\n${statusLine}\n\nConsulter / télécharger la facture :\n${url}\n\nLien valable 48 h. Après expiration, la facture peut être régénérée sur demande.\n\nMerci pour votre confiance.`;
  }

  async function doEmail() {
    if (!emailAddr.trim() || generating) return;
    const share = await createTemporaryLink();
    if (!share) return;
    const subject = encodeURIComponent(`Facture ${inv.id} — ${boutique.nom}`);
    const body = encodeURIComponent(shareText(share.url));
    window.location.href = `mailto:${emailAddr.trim()}?subject=${subject}&body=${body}`;
  }

  async function doWhatsApp() {
    const rawPhone = (waPhone || phone).replace(/[\s\-().+]/g, "");
    if (!rawPhone || generating) return;
    const popup = window.open("about:blank", "_blank");
    const share = await createTemporaryLink();
    if (!share) { popup?.close(); return; }
    const target = `https://wa.me/${rawPhone}?text=${encodeURIComponent(shareText(share.url))}`;
    if (popup) popup.location.href = target;
    else window.location.href = target;
  }

  async function doSMS() {
    const rawPhone = (smsPhone || phone).replace(/[\s\-()]/g, "");
    if (!rawPhone || generating) return;
    const share = await createTemporaryLink();
    if (!share) return;
    const text = `Facture ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F. ${reste > 0 ? `Reste ${fmtN(reste)} F. ` : "Payée. "}Lien valable 48 h : ${share.url}`;
    window.location.href = `sms:${rawPhone}?body=${encodeURIComponent(text)}`;
  }

  const CHANNELS: Array<{id:"apercu"|"email"|"whatsapp"|"sms"; label:string; color:string}> = [
    { id:"apercu", label:"Aperçu PDF", color:"#374151" },
    { id:"email", label:"E-mail", color:"#0ea5e9" },
    { id:"whatsapp", label:"WhatsApp", color:"#16a34a" },
    { id:"sms", label:"SMS", color:"#7c3aed" },
  ];

  return (
    <Modal title="Partager la facture" color="#374151" onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:"#f3f4f6", border:"1px solid #e5e7eb" }}>
        <FileText size={18} className="text-muted-foreground flex-shrink-0"/>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">{inv.id} · {inv.client}</p>
          <p className="text-xs text-muted-foreground">{fmtN(inv.montant)} F · {formatPreciseDateTime(inv.dateRaw) === "—" ? inv.date : formatPreciseDateTime(inv.dateRaw)}</p>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:reste<=0?"#f0fdf4":inv.acompte>0?"#fffbeb":"#fef2f2", color:reste<=0?"#16a34a":inv.acompte>0?"#d97706":"#dc2626" }}>
          {reste<=0?"Payé":inv.acompte>0?"Acompte":"Impayé"}
        </span>
      </div>

      <div className="px-4 py-3 rounded-2xl text-xs leading-relaxed" style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe"}}>
        Aucun PDF n'est stocké tant que le client ne demande pas sa facture. Pour E-mail, WhatsApp ou SMS, Tournal génère un PDF temporaire et un lien privé valable 48 h. Le fichier est ensuite supprimé automatiquement. La facture reste toujours régénérable depuis les données Tournal.
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CHANNELS.map(ch=>(
          <button key={ch.id} onClick={()=>{setChannel(ch.id);setShareError("");}} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all" style={{ background:channel===ch.id?ch.color+"18":"#f9f9f7", border:channel===ch.id?`2px solid ${ch.color}55`:"2px solid transparent" }}>
            {ch.id==="apercu"&&<Eye size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="email"&&<Mail size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="whatsapp"&&<MessageCircle size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="sms"&&<Smartphone size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            <span className="text-xs font-bold" style={{ color:channel===ch.id?ch.color:"#6b7280" }}>{ch.label}</span>
          </button>
        ))}
      </div>

      {shareError && <div className="px-4 py-3 rounded-xl text-xs font-bold" style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca"}}>{shareError}</div>}

      {channel==="apercu"&&(
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">L'aperçu est généré localement pour consultation ou impression. Aucun fichier n'est envoyé dans le stockage.</p>
          <button onClick={doPreview} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95" style={{background:"#374151",color:"#fff"}}><Eye size={16}/> Ouvrir l'aperçu PDF</button>
        </div>
      )}

      {channel==="email"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">E-MAIL DU CLIENT</label><input value={emailAddr} onChange={e=>setEmailAddr(e.target.value)} placeholder="client@exemple.com" type="email" className={inputCls2}/></div>
          <button onClick={()=>void doEmail()} disabled={!emailAddr.trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#0ea5e9",color:"#fff"}}><Mail size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir l'e-mail"}</button>
        </div>
      )}

      {channel==="whatsapp"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">WHATSAPP DU CLIENT</label><input value={waPhone} onChange={e=>setWaPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/></div>
          <button onClick={()=>void doWhatsApp()} disabled={!(waPhone||phone).trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#16a34a",color:"#fff"}}><MessageCircle size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir WhatsApp"}</button>
        </div>
      )}

      {channel==="sms"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">TÉLÉPHONE DU CLIENT</label><input value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/></div>
          <button onClick={()=>void doSMS()} disabled={!(smsPhone||phone).trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#7c3aed",color:"#fff"}}><Smartphone size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir SMS"}</button>
        </div>
      )}
    </Modal>
  );
}

// ─── FACTURES VIEW ────────────────────────────────────────────────────────────

export function FacturesView({ boutique, allBoutiques, platformUsers, currentUser, canReturn, canCollectPayment = false, canSeeMargin = false, caisseDefaults, onUpdate, onUpdateOtherBoutique, logAction, initialStatus, initialInvoiceId, initialClientId, onPaymentRecorded }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[]; currentUser: PlatformUser;
  canReturn: boolean;
  canCollectPayment?: boolean;
  canSeeMargin?: boolean;
  caisseDefaults?: { enabled: boolean; openingFloat: number; openingReminderTime?: string | null; closingReminderTime?: string | null };
  onUpdate: (u: Partial<Boutique>) => void;
  onUpdateOtherBoutique: (boutiqueId: string, u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialStatus?: InvoiceStatus | "all" | "impayé";
  initialInvoiceId?: string;
  initialClientId?: number;
  onPaymentRecorded?: (clientId: number, invoiceId: string) => void;
}) {
  const { invoices, clients, products, entries } = boutique;
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);
  // Every registered customer, including wholesalers, keeps their complete
  // history on their own record. The general invoice desk is reserved for
  // counter sales and inter-boutique documents.
  const registeredClientTypes = useMemo(
    () => new Map(clients.map(client => [client.id, client.type])),
    [clients],
  );
  const isClientRecordOnlyInvoice = (invoice: Invoice) => {
    if (invoice.clientId == null) return false;
    const clientType = registeredClientTypes.get(invoice.clientId) ?? invoice.clientType ?? invoice.clientTypeSnapshot;
    return clientType === "B2C" || clientType === "B2B" || clientType === "Grossiste";
  };

  // Quantities already returned, per source invoice and product. Every return
  // restores stock via an entry tagged "Retour <sourceInvoiceId>", mirroring the
  // return_sale RPC, so summing those entries tells us how much of each line has
  // already been sent back. This prevents returning the same invoice repeatedly.
  const returnedByInvoiceProduct = useMemo(() => {
    const map = new Map<string, number>();
    const prefix = "Retour ";
    for (const e of entries) {
      const note = e.fournisseur ?? "";
      if (!note.startsWith(prefix)) continue;
      const sourceId = note.slice(prefix.length);
      const key = `${sourceId}::${e.productId}`;
      map.set(key, (map.get(key) ?? 0) + Number(e.qty || 0));
    }
    return map;
  }, [entries]);
  const remainingReturnable = (inv: Invoice, line: InvoiceLine) =>
    Math.max(0, line.qty - (returnedByInvoiceProduct.get(`${inv.id}::${line.productId}`) ?? 0));
  const invoiceHasReturnable = (inv: Invoice) =>
    !!inv.lines && inv.lines.some(l => remainingReturnable(inv, l) > 0);
  const [statusFilter,setStatusFilter] = useState<InvoiceStatus|"all"|"impayé">(initialStatus ?? "all");
  const [invSearch, setInvSearch] = useState("");
  const [modal,setModal]   = useState(false);
  const [shareInv,setShareInv]   = useState<Invoice|null>(null);
  const [detailInv,setDetailInv] = useState<Invoice|null>(null);
  const [encaissInv,setEncaissInv] = useState<Invoice|null>(null);
  const [encaissSplit,setEncaissSplit] = useState<PaymentEntry[]>([{ method:"Espèces", amount:0 }]);
  const [encaissDone,setEncaissDone] = useState(false);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  // Return state
  const [returnInv, setReturnInv] = useState<Invoice|null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>("Espèces");
  const [returnDone, setReturnDone] = useState(false);
  const [clientRef,setClientRef] = useState(clients[0] ? `client:${clients[0].id}` : siblings[0] ? `boutique:${siblings[0].id}` : "");
  const [lines, setLines]  = useState<InvoiceLine[]>([]);
  const [acompte,setAcompte]=useState("");
  const [initialPaymentMethod,setInitialPaymentMethod] = useState<PaymentMethod>("Espèces");
  const [status,setStatus] = useState<InvoiceStatus>("en attente");
  // Line form
  const [lPid,setLPid]=useState<number>(products[0]?.id??0);
  const [lQty,setLQty]=useState("");
  const [lPrix,setLPrix]=useState("");
  const [lSellUnit,setLSellUnit]=useState(""); // mirrors POS: "Lot" | "Pièce" | baseUnit

  const FCT_COLOR = boutique.color;

  // An advance is cash already received.  It can settle a later invoice, but
  // must never be treated as a second cash entry in the caisse.
  function availableClientAdvance(clientId?: number): number {
    if (clientId == null) return 0;
    return (boutique.clientAdvances ?? [])
      .filter(advance => advance.clientId === clientId)
      .reduce((sum, advance) => sum + Math.max(0, advance.amount - (advance.allocatedAmount ?? 0)), 0);
  }

  function paymentMethodsForInvoice(invoice: Invoice): PaymentMethod[] {
    return invoice.clientId != null && availableClientAdvance(invoice.clientId) > 0
      ? [...PAYMENT_METHODS, "Avoir client"]
      : [...PAYMENT_METHODS];
  }

  function applyAdvanceAllocations(allocations: Array<{ advance_id:number; amount:number }> | undefined) {
    if (!allocations?.length) return undefined;
    const allocatedByAdvance = new Map<number, number>();
    allocations.forEach(allocation => allocatedByAdvance.set(
      allocation.advance_id,
      (allocatedByAdvance.get(allocation.advance_id) ?? 0) + allocation.amount,
    ));
    return (boutique.clientAdvances ?? []).map(advance => ({
      ...advance,
      allocatedAmount: (advance.allocatedAmount ?? 0) + (allocatedByAdvance.get(advance.id) ?? 0),
    }));
  }

  // ── Caisse (déplacée depuis Vente) : le caissier ouvre/ferme et encaisse ici ──
  const caisseSession = boutique.caisseSession;
  const isCaisseOpen = !!(caisseSession && !caisseSession.closedAt);
  const [fondCaisse, setFondCaisse] = useState(String(caisseDefaults?.openingFloat ?? 0));
  const [caisseCloseModal, setCaisseCloseModal] = useState(false);
  const [savingCaisse, setSavingCaisse] = useState(false);
  useEffect(() => {
    if (!isCaisseOpen) setFondCaisse(String(caisseDefaults?.openingFloat ?? 0));
  }, [caisseDefaults?.openingFloat, isCaisseOpen]);

  const hasReachedReminder = (time?: string | null) => {
    if (!time) return false;
    const [hours, minutes] = time.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
  };
  const openingReminderDue = !!caisseDefaults?.enabled && !isCaisseOpen && hasReachedReminder(caisseDefaults.openingReminderTime);
  const closingReminderDue = !!caisseDefaults?.enabled && isCaisseOpen && hasReachedReminder(caisseDefaults.closingReminderTime);

  // The session total is the sum of payments recorded since the caisse was opened,
  // so each encaissement below increments it correctly (the bug fixed by the move).
  const sessionEvents = isCaisseOpen && caisseSession
    ? invoicePaymentEvents(invoices).filter(ev => ev.paidAt >= caisseSession.openedAt && ev.source !== "client_advance")
    : [];
  // A client credit represents money received now, while an invoice payment
  // sourced from that credit represents money received earlier.  Count only
  // the first event so the caisse total is exact, including a surplus that was
  // converted to an avoir during a client payment.
  const sessionAdvanceEvents = isCaisseOpen && caisseSession
    ? (boutique.clientAdvances ?? [])
      .filter(advance => advance.paidAt >= caisseSession.openedAt)
      .map(advance => ({ paidAt:advance.paidAt, paymentMethod:advance.paymentMethod, signedAmount:advance.amount }))
    : [];
  const caissePaymentEvents = [...sessionEvents, ...sessionAdvanceEvents];
  const sessionTotal = caissePaymentEvents.reduce((s, ev) => s + ev.signedAmount, 0);
  const sessionByMethod = PAYMENT_METHODS.map(m => ({
    m,
    total: caissePaymentEvents.filter(ev => ev.paymentMethod === m).reduce((s, ev) => s + ev.signedAmount, 0),
    count: caissePaymentEvents.filter(ev => ev.paymentMethod === m).length,
  }));
  const sessionEspeces = sessionByMethod.find(b => b.m === "Espèces")?.total ?? 0;

  async function openCaisse() {
    if (!canCollectPayment || savingCaisse) return;
    setSavingCaisse(true);
    try {
      const saved = await openCaisseSession({ boutiqueId:boutique.id, fondOuverture:Number(fondCaisse) || 0 });
      const s: CaisseSession = { id:saved.session_id, openedAt:saved.opened_at, openedBy:currentUser.nom, fondDeCaisse:saved.fond_ouverture };
      onUpdate({ caisseSession:s });
      logAction("Ouverture caisse", `Fond : ${fmt(s.fondDeCaisse)}`, "🏪");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'ouvrir la caisse");
    } finally { setSavingCaisse(false); }
  }
  async function closeCaisse() {
    if (!canCollectPayment || !caisseSession || savingCaisse) return;
    setSavingCaisse(true);
    try {
      const saved = await closeCaisseSession({ boutiqueId:boutique.id, sessionId:String(caisseSession.id), totalVentes:sessionTotal });
      const closed: CaisseSession = { ...caisseSession, closedAt:saved.closed_at, closedBy:currentUser.nom };
      const history = [...(boutique.caisseHistory ?? []), closed];
      printCaisseReport(closed, boutique, invoices);
      onUpdate({ caisseSession:closed, caisseHistory:history });
      logAction("Fermeture caisse", `Total encaissé : ${fmt(sessionTotal)}`, "🔒");
      setCaisseCloseModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de fermer la caisse");
    } finally { setSavingCaisse(false); }
  }

  // ── Filtre par jour (point 4) : par défaut le jour en cours, avec navigation ──
  const todayKey = new Date().toISOString().slice(0,10);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [dayFilterActive, setDayFilterActive] = useState(initialStatus !== "impayé" && initialStatus !== "en retard");
  function shiftDay(delta: number) {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDay(d.toISOString().slice(0,10));
    setDayFilterActive(true);
  }
  const dayLabel = selectedDay === todayKey ? "Aujourd'hui"
    : new Date(selectedDay + "T12:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long" });

  useEffect(() => {
    if (initialInvoiceId) {
      const invoice = invoices.find(item => item.id === initialInvoiceId);
      if (invoice) setDetailInv(invoice);
      return;
    }
    if (initialClientId != null) {
      const selectedClient = clients.find(item => item.id === initialClientId);
      if (selectedClient) {
        setClientRef(`client:${selectedClient.id}`);
        setLines([]);
        setAcompte("");
        setInitialPaymentMethod("Espèces");
        const firstProduct = products[0];
        if (firstProduct) {
          const unit = getDefaultSaleUnit(firstProduct, boutique);
          setLPid(firstProduct.id);
          setLSellUnit(unit);
          setLQty("");
          const last = getLastSalePrice(firstProduct.id, invoices, unit);
          setLPrix(last != null ? String(last) : "");
        }
        setModal(true);
      }
    }
  }, [initialClientId, initialInvoiceId]);

  // Sale defaults are shared with POS so quantity/unit/price behave identically everywhere.
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

  const montant = lines.reduce((s,l)=>s+lineTotal(l),0);
  const selectedClient = clientRef.startsWith("client:")
    ? clients.find(c => c.id === Number(clientRef.slice("client:".length)))
    : undefined;
  const siblingClient = clientRef.startsWith("boutique:")
    ? siblings.find(s => s.id === clientRef.slice("boutique:".length))
    : undefined;
  const selectedClientAdvance = availableClientAdvance(selectedClient?.id);
  const rawAcompte = Number(acompte) || 0;
  const aNum = canCollectPayment
    ? Math.min(rawAcompte, montant || rawAcompte, initialPaymentMethod === "Avoir client" ? selectedClientAdvance : rawAcompte)
    : 0;
  const pct  = montant>0?Math.min(100,Math.round(aNum/montant*100)):0;
  const selectedClientName = siblingClient?.nom ?? selectedClient?.nom ?? "";

  function addLine() {
    const prod = products.find(p=>p.id===lPid); if (!prod||!lQty) return;
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    const baseUnit = cat?.unitVente ?? prod.unit;
    const opts = getInvSellOptions(lPid);
    const effectiveUnit = lSellUnit || invDefaultUnit(lPid) || opts[0] || prod.unit;
    const sellQtyN = Number(lQty);
    const baseQty = invToBaseQty(sellQtyN, effectiveUnit, lPid);
    const isSell = opts.length > 1 && effectiveUnit !== baseUnit;
    const line: InvoiceLine = {
      productId: lPid, nom: prod.nom, qty: baseQty, unit: baseUnit, prixUnit: Number(lPrix)||0,
      ...(isSell ? { sellUnit: effectiveUnit, sellQty: sellQtyN } : {}),
    };
    setLines(prev=>[...prev, line]);
    setLQty(""); setLPrix("");
  }
  function removeLine(i: number) { setLines(prev=>prev.filter((_,j)=>j!==i)); }

  async function submitEncaiss() {
    if (!canCollectPayment || !encaissInv || submittingPayment) return;
    const validSplit = encaissSplit.filter(s => s.amount > 0);
    const totalSplit = roundMoney(validSplit.reduce((s, e) => s + e.amount, 0));
    if (validSplit.length === 0 || totalSplit <= 0) return;
    if (moneyExceeds(totalSplit, invoiceRemainingAmount(encaissInv))) {
      alert("Le total des paiements dépasse le reste à encaisser.");
      return;
    }
    const requestedAdvance = validSplit
      .filter(entry => entry.method === "Avoir client")
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (moneyExceeds(requestedAdvance, availableClientAdvance(encaissInv.clientId))) {
      alert("L'avoir disponible a changé. Actualisez puis réessayez.");
      return;
    }
    setSubmittingPayment(true);
    let updatedInv: Invoice = { ...encaissInv };
    let saleEntries: StockEntry[] = [];
    let persisted: Awaited<ReturnType<typeof recordMultiPayment>>;
    try {
      persisted = await recordMultiPayment({
        boutiqueId:boutique.id,
        invoiceId:encaissInv.id,
        payments:validSplit.map(entry => ({ amount:entry.amount, paymentMethod:entry.method })),
      });
      const newPayments = persisted.payments.map(payment => ({
        id:payment.id,
        amount:payment.amount,
        paymentMethod:payment.payment_method as PaymentMethod,
        paidAt:payment.paid_at,
        operatorId:payment.operator_id,
        operatorName:payment.operator_name,
        batchId:payment.batch_id,
        source:payment.source,
      }));
      updatedInv = {
        ...updatedInv,
        acompte:persisted.acompte,
        status:persisted.status === "payée" ? "payé" : "acompte",
        paymentMethod:validSplit[validSplit.length - 1].method,
        paymentSplit:validSplit,
        payments:[...(updatedInv.payments ?? []), ...newPayments],
      };
      if (persisted.stock_deducted) {
        saleEntries = (encaissInv.lines ?? []).map((line, index) => ({
          id: Date.now() + index,
          productId: line.productId,
          qty: -line.qty,
          unit: line.unit,
          montantDu: 0,
          date: today(),
          fournisseur: `Vente ${encaissInv.id}`,
          invoiceId: encaissInv.id,
        }));
      }
    } catch (error) {
      setSubmittingPayment(false);
      alert(error instanceof Error ? error.message : "Encaissement impossible");
      return;
    }
    const updatedClientAdvances = applyAdvanceAllocations(persisted.advance_allocations);
    onUpdate({
      invoices: invoices.map(i => i.id === encaissInv.id ? updatedInv : i),
      ...(saleEntries.length ? { entries: [...entries, ...saleEntries] } : {}),
      ...(updatedClientAdvances ? { clientAdvances: updatedClientAdvances } : {}),
    });
    const methodLabel = validSplit.length > 1
      ? validSplit.map(s => `${PM_ICON[s.method]} ${fmt(s.amount)}`).join(" + ")
      : `${validSplit[0].method}`;
    logAction("Encaissement", `${encaissInv.id} · +${fmt(totalSplit)} · ${methodLabel}`, "💵");
    setTimeout(() => agentPrint(buildReceiptHtml(updatedInv, boutique, currentUser.nom)), 200);
    // Registered clients, including wholesale clients, return to their own
    // transaction history. The canonical client ID keeps this scoped to the
    // exact record instead of relying on a potentially duplicated name.
    if (updatedInv.clientId != null && onPaymentRecorded) {
      onPaymentRecorded(updatedInv.clientId, updatedInv.id);
      return;
    }
    setEncaissDone(true);
    setTimeout(() => { setEncaissInv(null); setEncaissSplit([{ method:"Espèces", amount:0 }]); setEncaissDone(false); setSubmittingPayment(false); }, 1400);
  }

  function openReturn(inv: Invoice) {
    if (!inv.lines || inv.lines.length === 0) return;
    if (!invoiceHasReturnable(inv)) {
      alert("Cette facture a déjà été entièrement retournée.");
      return;
    }
    const initQtys: Record<number,number> = {};
    inv.lines.forEach((l,i) => { initQtys[i] = remainingReturnable(inv, l); });
    setReturnQtys(initQtys);
    setReturnMethod("Espèces");
    setReturnDone(false);
    setReturnInv(inv);
    setDetailInv(null);
  }

  async function submitReturn() {
    if (!returnInv || !returnInv.lines) return;
    const lines = returnInv.lines;
    const returnLines = lines.map((l,i) => {
      const qty = returnQtys[i] ?? 0;
      const proportionalSellQty = l.sellUnit && l.sellQty != null && l.qty > 0
        ? l.sellQty * qty / l.qty
        : undefined;
      return {
        ...l,
        qty,
        ...(proportionalSellQty != null ? { sellQty: proportionalSellQty } : {}),
      };
    }).filter(l => l.qty > 0);
    if (returnLines.length === 0) return;
    // Never let a line send back more than what is still returnable.
    const overLine = lines.find((l,i) => (returnQtys[i] ?? 0) > remainingReturnable(returnInv, l));
    if (overLine) {
      alert("La quantité retournée dépasse ce qui reste à retourner pour cette facture.");
      return;
    }
    let persisted;
    try {
      persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, refundMethod:returnMethod, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Retour impossible");
      return;
    }
    const refundTotal = Number(persisted.total);
    const retId = persisted.return_invoice_id;
    const retInv: Invoice = {
      id: retId, clientId:returnInv.clientId, client: returnInv.client, clientTel: returnInv.clientTel,
      clientType:returnInv.clientType,
      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,
      operatorNom: currentUser.nom, operatorColor: currentUser.color,
      paymentMethod: persisted.refund_method as PaymentMethod,
      payments: persisted.payment ? [{
        id:persisted.payment.id,
        amount:persisted.payment.amount,
        paymentMethod:persisted.payment.payment_method as PaymentMethod,
        paidAt:persisted.payment.paid_at,
        operatorId:persisted.payment.operator_id,
        operatorName:persisted.payment.operator_name,
        batchId:persisted.payment.batch_id,
        source:persisted.payment.source,
      }] : [],
    };
    // Restore stock
    const restoreEntries: StockEntry[] = returnLines.map((l,i) => ({
      id: Date.now() + i, productId: l.productId, qty: l.qty, unit: l.unit,
      montantDu: 0, movementType:"retour", date: today(), fournisseur: `Retour ${returnInv.id}`,
    }));
    onUpdate({ invoices: [...invoices, retInv], entries: [...entries, ...restoreEntries] });
    logAction("Retour articles", `${retId} ← ${returnInv.id} · ${returnLines.length} article(s) · ${fmt(refundTotal)}`, "↩️");
    setReturnDone(true);
    setTimeout(() => { setReturnInv(null); setReturnDone(false); }, 1600);
  }

  async function submit() {
    if (!clientRef || !selectedClientName || lines.length===0 || submittingInvoice) return;
    setSubmittingInvoice(true);
    const isSiblingTransfer = !!siblingClient;
    const ct  = isSiblingTransfer ? "Inter-tenant" : (selectedClient?.type??"B2C");
    const cTel = selectedClient?.tel;
    let persisted;
    try {
      persisted = await createSale({ boutiqueId:boutique.id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, lines });
    } catch (error) {
      setSubmittingInvoice(false);
      alert(error instanceof Error ? error.message : "Création de facture impossible");
      return;
    }
    const id = persisted.invoice_id;
    let initialPayment: {
      acompte:number;
      stock_deducted:boolean;
      payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice"|"client_advance" };
      advanceAllocations?: Array<{advance_id:number;amount:number}>;
    } | null = null;
    if (aNum > 0) {
      try {
        if (initialPaymentMethod === "Avoir client") {
          const payment = await recordMultiPayment({
            boutiqueId:boutique.id,
            invoiceId:id,
            payments:[{ amount:Math.min(aNum,montant), paymentMethod:"Avoir client" }],
          });
          initialPayment = {
            acompte:payment.acompte,
            stock_deducted:payment.stock_deducted,
            payment:payment.payments[0],
            advanceAllocations:payment.advance_allocations,
          };
        } else {
          initialPayment = await recordPayment({ boutiqueId:boutique.id, invoiceId:id, amount:Math.min(aNum,montant), paymentMethod:initialPaymentMethod });
        }
      } catch (error) {
        setSubmittingInvoice(false);
        alert(`La facture ${id} a été créée, mais l'acompte n'a pas pu être enregistré : ${error instanceof Error ? error.message : "erreur inconnue"}`);
        return;
      }
    }
    const paidAtCreation = initialPayment?.acompte ?? 0;
    const s: InvoiceStatus = paidAtCreation>=montant&&montant>0?"payé":paidAtCreation>0?"acompte":canCollectPayment?status:"en attente";
    const saleEntries: StockEntry[] = initialPayment?.stock_deducted
      ? lines.map((line,index)=>({
          id:Date.now()+index,
          productId:line.productId,
          qty:-line.qty,
          unit:line.unit,
          montantDu:0,
          date:today(),
          fournisseur:`Vente ${id}`,
          invoiceId:id,
        }))
      : [];
    const newInv: Invoice = {
      id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, clientType:selectedClient?.type,
      lines, montant, acompte:paidAtCreation, date:today(), dateRaw:new Date().toISOString(), status:s, type:ct,
      operatorNom:currentUser.nom, operatorColor:currentUser.color,
      paymentMethod:initialPayment ? initialPayment.payment.payment_method as PaymentMethod : undefined,
      payments:initialPayment ? [{
        id:initialPayment.payment.id, amount:initialPayment.payment.amount, paymentMethod:initialPayment.payment.payment_method as PaymentMethod,
        paidAt:initialPayment.payment.paid_at, operatorId:initialPayment.payment.operator_id, operatorName:initialPayment.payment.operator_name,
        batchId:initialPayment.payment.batch_id, source:initialPayment.payment.source,
      }] : [],
    };
    const updatedClientAdvances = applyAdvanceAllocations(initialPayment?.advanceAllocations);
    onUpdate({
      invoices:[...invoices, newInv],
      ...(saleEntries.length ? { entries:[...entries,...saleEntries] } : {}),
      ...(updatedClientAdvances ? { clientAdvances: updatedClientAdvances } : {}),
    });
    // Inter-tenant: add incoming stock entries to sibling boutique
    if (isSiblingTransfer && siblingClient) {
      const sbProducts = [...siblingClient.products];
      const sbEntries  = [...siblingClient.entries];
      lines.forEach((l, i) => {
        let pid = sbProducts.find(p => p.nom === l.nom)?.id;
        if (!pid) {
          // create product in sibling if it doesn't exist
          const srcProd = products.find(p => p.id === l.productId);
          pid = Date.now() + 1000 + i;
          sbProducts.push({ id:pid, nom:l.nom, img:srcProd?.img??PLACEHOLDER_IMGS[0], unit:l.unit, fournisseur:boutique.nom, categorie:srcProd?.categorie, couleur:srcProd?.couleur });
        }
        sbEntries.push({ id:Date.now()+500+i, productId:pid, qty:l.qty, unit:l.unit, montantDu:l.qty*l.prixUnit, date:today(), fournisseur:boutique.nom });
      });
      onUpdateOtherBoutique(siblingClient.id, { products:sbProducts, entries:sbEntries });
    }
    logAction(isSiblingTransfer?"Transfert inter-tenant":"Nouvelle facture", `${id} · ${selectedClientName} · ${fmt(montant)}`, isSiblingTransfer?"🔄":"🧾");
    setLines([]); setAcompte(""); setInitialPaymentMethod("Espèces"); setModal(false); setSubmittingInvoice(false);
  }

  const invoiceIsOverdue = (invoice: Invoice) => {
    if (invoiceRemainingAmount(invoice) <= 0 || !invoice.dueDate) return false;
    const dueAt = new Date(`${invoice.dueDate.slice(0, 10)}T23:59:59`);
    return Number.isFinite(dueAt.getTime()) && dueAt.getTime() < Date.now();
  };
  const effectiveStatus = (invoice: Invoice): InvoiceStatus => invoice.status === "annulée" ? "annulée" : invoiceIsOverdue(invoice) ? "en retard" : invoice.status;
  const UNPAID: InvoiceStatus[] = ["en attente","acompte","en retard"];
  // The day filter is bypassed while searching so the search reaches every day.
  const dayActive = dayFilterActive && !invSearch.trim();
  const filtered = [...invoices]
    .sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date))
    .filter(i => !isClientRecordOnlyInvoice(i))
    .filter(i => (statusFilter==="all"||statusFilter==="impayé"?statusFilter==="impayé"?UNPAID.includes(effectiveStatus(i)):true:effectiveStatus(i)===statusFilter)
      && (i.client.toLowerCase().includes(invSearch.toLowerCase())||i.id.toLowerCase().includes(invSearch.toLowerCase()))
      && (!dayActive||(i.dateRaw??"").slice(0,10)===selectedDay));
  const pills: Array<{id:InvoiceStatus|"all"|"impayé";label:string;color:string}> = [
    {id:"all",      label:"Tout",     color:SEM.neutral.accent},
    {id:"impayé",   label:"Impayés",  color:SEM.danger.accent},
    {id:"acompte",  label:"Acompte",  color:SEM.warning.accent},
    {id:"payé",     label:"Payé ✓",   color:SEM.success.accent},
    {id:"en attente",label:"Attente", color:SEM.neutral.accent},
    {id:"en retard",label:"Retard",   color:SEM.danger.accent},
    {id:"annulée", label:"Annulées", color:SEM.danger.accent},
  ];

  return (
    <div data-screen-source="relational-factures" className="space-y-4 pb-24">

      {/* Caisse — réservée aux utilisateurs autorisés à encaisser */}
      {canCollectPayment && (isCaisseOpen && caisseSession ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:closingReminderDue ? "#fff7ed" : SEM.success.bg, border:"1px solid "+(closingReminderDue ? "#ea580c" : SEM.success.accent)+"44" }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"/>
            <div className="min-w-0">
              <p className="text-sm font-black truncate" style={{ color:closingReminderDue ? "#9a3412" : SEM.success.text }}>{closingReminderDue ? "CLÔTURE À EFFECTUER" : "CAISSE OUVERTE"}</p>
              <p className="text-xs text-muted-foreground truncate">{caisseSession.openedBy} · {formatPreciseDateTime(caisseSession.openedAt)} · Fond : {fmt(caisseSession.fondDeCaisse)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-base font-black" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(sessionTotal)}</span>
            <button onClick={()=>setCaisseCloseModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black active:scale-95" style={{ background:closingReminderDue ? "#ea580c" : "#f3f4f6", color:closingReminderDue ? "#fff" : "#374151" }}>
              <X size={13}/> Clôturer
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:openingReminderDue ? "#fef2f2" : "#EEE9D8", border:openingReminderDue ? "1px solid #ef444455" : undefined }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Store size={20} style={{ color:openingReminderDue ? "#dc2626" : FCT_COLOR }}/>
            <div className="min-w-0">
              <p className="text-sm font-black truncate" style={{color:openingReminderDue ? "#991b1b" : undefined}}>{openingReminderDue ? "CAISSE À OUVRIR" : "Caisse fermée"}</p>
              <p className="text-xs text-muted-foreground truncate">Ouvrez la caisse pour encaisser{caisseDefaults?.openingFloat ? ` · fond par défaut : ${fmt(caisseDefaults.openingFloat)}` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input value={fondCaisse} onChange={e=>setFondCaisse(e.target.value)} type="number" placeholder="Fond" aria-label="Fond de caisse à l'ouverture" className="w-24 px-3 py-2.5 rounded-xl text-sm font-bold text-center border border-border bg-card" onKeyDown={e=>e.key==="Enter"&&openCaisse()}/>
            <button disabled={savingCaisse} onClick={openCaisse} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-black active:scale-95 disabled:opacity-60" style={{ background:openingReminderDue ? "#dc2626" : FCT_COLOR, color:"#fff" }}>
              <Store size={15}/> {savingCaisse?"…":"Ouvrir la caisse"}
            </button>
          </div>
        </div>
      ))}

      {!canCollectPayment && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold" style={{ background:"#fffbeb", color:"#92400e" }}>
          <AlertCircle size={16}/> Consultation des factures — encaissement réservé aux utilisateurs autorisés.
        </div>
      )}

      <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={invSearch} onChange={e=>setInvSearch(e.target.value)} placeholder="Chercher une facture ou un client…" className={searchInputCls+" pl-9"}/></div>

      {/* Navigation par jour (point 4) */}
      <div className="flex items-center gap-2">
        <button onClick={()=>shiftDay(-1)} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-border bg-card active:scale-90" title="Jour précédent"><ChevronLeft size={16}/></button>
        <button onClick={()=>{ setDayFilterActive(a=>!a); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-black capitalize active:scale-95" style={{ background: dayFilterActive?FCT_COLOR:FCT_COLOR+"22", color: dayFilterActive?"#fff":FCT_COLOR }}>
          <CalendarDays size={13}/> {dayFilterActive ? dayLabel : "Toutes les factures"}
        </button>
        <button onClick={()=>shiftDay(1)} disabled={selectedDay>=todayKey} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-border bg-card active:scale-90 disabled:opacity-40" title="Jour suivant"><ChevronRight size={16}/></button>
        {selectedDay!==todayKey && <button onClick={()=>{ setSelectedDay(todayKey); setDayFilterActive(true); }} className="px-2 h-7 rounded-lg text-[10px] font-black flex-shrink-0" style={{ background:FCT_COLOR+"22", color:FCT_COLOR }}>Auj.</button>}
      </div>

      <div className="flex gap-2" style={{ overflowX:"auto", scrollbarWidth:"none" }}>
        {pills.map(s=><button key={s.id} onClick={()=>{setStatusFilter(s.id as InvoiceStatus|"all"|"impayé"); if (s.id==="impayé" || s.id==="en retard") setDayFilterActive(false);}} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{ background:statusFilter===s.id?s.color:s.color+"22", color:statusFilter===s.id?"#fff":s.color }}>{s.label}</button>)}
      </div>
      <p className="text-xs text-muted-foreground px-1">Les factures des clients B2C et B2B enregistrés sont consultables depuis leur fiche client.</p>
      <div className="space-y-3">
        {filtered.map(inv=>{
          const [tc,bc]=invBadge(effectiveStatus(inv));
          const isReturn = inv.type === "Retour";
          const isCancelled = inv.status === "annulée";
          const canCollectThisInvoice = canCollectPayment && !isReturn && !isCancelled && invoiceRemainingAmount(inv) > 0;
          return (
            <div key={inv.id} className="bg-card rounded-2xl p-4 border border-border" style={isReturn?{borderColor:"#ef444433"}:{}}>
              <div className="w-full text-left cursor-pointer" onClick={()=>{ if (canCollectThisInvoice) { setEncaissInv(inv); setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]); } else { setDetailInv(inv); } }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{inv.client}</p>
                      {isReturn && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background:SEM.danger.bg, color:SEM.danger.text }}><RotateCcw size={9}/> Retour</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{inv.id} · {formatPreciseDateTime(inv.dateRaw)} · {inv.type}</p>
                    {inv.lines&&inv.lines.length>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lines.length} produit{inv.lines.length>1?"s":""}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <div className="text-right"><p className="text-base font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p><span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize inline-block mt-0.5" style={{ background:bc,color:tc }}>{effectiveStatus(inv)}</span></div>
                    {canCollectThisInvoice && (
                      <button onClick={e=>{e.stopPropagation();setEncaissInv(inv);setEncaissSplit([{ method:"Espèces", amount:invoiceRemainingAmount(inv) }]);}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.success.bg }} title="Encaisser">
                        <Wallet size={15} style={{ color:SEM.success.text }}/>
                      </button>
                    )}
                    <button onClick={e=>{e.stopPropagation();setShareInv(inv);}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.neutral.bg }}>
                      <Send size={15} style={{ color:SEM.neutral.accent }}/>
                    </button>
                  </div>
                </div>
                {invoicePaidAmount(inv)>0&&invoiceRemainingAmount(inv)>0&&<p className="text-xs text-muted-foreground mt-2">Acompte versé : <span className="font-semibold text-foreground">{fmt(invoicePaidAmount(inv))}</span></p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoice detail modal */}
      {detailInv&&<Modal title={detailInv.id} color="#374151" onClose={()=>setDetailInv(null)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold">{detailInv.client}</p>
            {detailInv.clientTel&&<div className="flex items-center gap-1.5 mt-1"><Phone size={12} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{detailInv.clientTel}</span></div>}
            {detailInv.operatorNom&&<div className="flex items-center gap-1.5 mt-1">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background:detailInv.operatorColor??"#C9A227", fontSize:"8px", fontWeight:900 }}>
                {detailInv.operatorNom.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground">Opérateur : <span className="font-semibold text-foreground">{detailInv.operatorNom}</span></span>
            </div>}
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-bold capitalize" style={{ background:invBadge(detailInv.status)[1], color:invBadge(detailInv.status)[0] }}>{detailInv.status}</span>
        </div>
        {detailInv.lines&&detailInv.lines.length>0&&(
          <div>
            <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">PRODUITS FACTURÉS</p>
            <div className="space-y-2">
              {detailInv.lines.map((l,i)=>{
                const prod=products.find(p=>p.id===l.productId);
                return <div key={i} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                  {prod&&<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,80,80)} alt={l.nom} className="w-full h-full object-cover"/></div>}
                  <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{l.nom}</p><p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)}</p></div>
                  <p className="text-sm font-black flex-shrink-0" style={{ color:"#a855f7", fontFamily:"'Nunito', sans-serif" }}>{fmt(lineTotal(l))}</p>
                </div>;
              })}
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(detailInv.montant)}</p>
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">PAIEMENT</p>
          <div className="space-y-2">
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Acompte versé</span>
              <span className="text-sm font-bold" style={{ color:"#C9A227" }}>{fmt(invoicePaidAmount(detailInv))}</span>
            </div>
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Reste à payer</span>
              <span className="text-sm font-bold" style={{ color:invoiceRemainingAmount(detailInv)>0?SEM.danger.accent:SEM.success.accent }}>{fmt(invoiceRemainingAmount(detailInv))}</span>
            </div>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width:`${detailInv.montant>0?Math.round(invoicePaidAmount(detailInv)/detailInv.montant*100):0}%`, background:invBadge(detailInv.status)[0] }}/>
          </div>
        </div>

        {(detailInv.payments?.length ?? 0)>0&&<div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">HISTORIQUE DES ENCAISSEMENTS</p>
          <div className="space-y-2">{detailInv.payments!.map(payment=><div key={payment.id} className="bg-muted rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-bold">{payment.paymentMethod} · {formatPreciseDateTime(payment.paidAt)}</p><p className="text-xs text-muted-foreground truncate">Caissier : {payment.operatorName}</p></div>
            <p className="text-sm font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p>
          </div>)}</div>
        </div>}

        {/* Margin — only after cashing in, only for users with the "Voir les marges" right. */}
        {canSeeMargin && detailInv.acompte > 0 && (() => {
          const m = invoiceMargin(detailInv, entries, products);
          if (!m.hasData) return null;
          const isReturn = detailInv.type === "Retour";
          const accent = m.marge >= 0 ? SEM.success.accent : "#ef4444";
          const bg = m.marge >= 0 ? SEM.success.bg : "#ef444415";
          return (
            <div className="rounded-2xl p-4" style={{ background:bg }}>
              <p className="text-xs font-black tracking-wider mb-2" style={{ color:accent }}>
                {isReturn ? "MARGE ANNULÉE (RETOUR)" : "MARGE RÉALISÉE"}
              </p>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-black" style={{ color:accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(m.marge)}</p>
                  <p className="text-xs font-semibold text-muted-foreground mt-0.5">Soit {m.pct}% du chiffre d'affaires</p>
                </div>
                <div className="text-right text-xs font-semibold text-muted-foreground">
                  <p>Vente : {fmt(m.ca)}</p>
                  <p>Coût (FIFO) : {fmt(m.cost)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* All payments use the same transactional RPC and cashier trace. */}
        {canCollectPayment && detailInv.status !== "payé" && detailInv.status !== "annulée" && detailInv.type !== "Retour" && invoiceRemainingAmount(detailInv) > 0 && (
          <button onClick={()=>{setEncaissInv(detailInv);setEncaissSplit([{method:"Espèces",amount:invoiceRemainingAmount(detailInv)}]);setDetailInv(null);}}
            className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
            style={{ background:SEM.success.accent, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
            <CreditCard size={18}/> Enregistrer un paiement
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={()=>{setDetailInv(null);setShareInv(detailInv);}} className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#a855f722", color:"#a855f7" }}>
            <Send size={16}/> Envoyer
          </button>
          <button onClick={()=>{ if(detailInv) openInvoicePDF(detailInv, boutique, clients); }} className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 active:scale-95" style={{ background:"#37415115", color:"#374151" }} title="Aperçu PDF">
            <FileText size={16}/>
          </button>
          {detailInv.acompte > 0 ? (
            <button onClick={()=>printReceipt(detailInv, boutique, currentUser.nom, true)} className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#0f172a", color:"#fff" }}>
              <Receipt size={16}/> Duplicata ticket
            </button>
          ) : (
            <button disabled title="Encaissez la commande avant d'imprimer le ticket de caisse" className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed" style={{ background:"#e2ddca", color:"#a39b7f" }}>
              <Receipt size={16}/> Ticket caisse
            </button>
          )}
        </div>
        {detailInv.acompte <= 0 && (
          <div className="px-3 py-2 rounded-xl text-xs flex items-center gap-2" style={{ background:SEM.warning.bg, color:SEM.warning.accent }}>
            <AlertCircle size={13}/> Ticket de caisse disponible après encaissement de la commande
          </div>
        )}
        {canReturn && detailInv.acompte > 0 && detailInv.type !== "Retour" && detailInv.lines && detailInv.lines.length > 0 && invoiceHasReturnable(detailInv) && (
          <button onClick={()=>openReturn(detailInv)} className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#ef444415", color:"#ef4444" }}>
            <RotateCcw size={16}/> Retour articles
          </button>
        )}
        {canReturn && detailInv.acompte > 0 && detailInv.type !== "Retour" && detailInv.lines && detailInv.lines.length > 0 && !invoiceHasReturnable(detailInv) && (
          <div className="w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2" style={{ background:SEM.neutral.bg, color:SEM.neutral.accent }}>
            <RotateCcw size={14}/> Facture entièrement retournée
          </div>
        )}
      </Modal>}

      <button onClick={()=>{ setLines([]); setAcompte(""); setInitialPaymentMethod("Espèces"); const first=products[0]; if(first){ const unit=getDefaultSaleUnit(first,boutique); setLPid(first.id); setLSellUnit(unit); setLQty(""); const last=getLastSalePrice(first.id,invoices,unit); setLPrix(last!=null?String(last):""); } setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:"#a855f7", boxShadow:"0 0 24px #a855f760" }}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>

      {modal&&<Modal title="Nouvelle facture" color="#374151" onClose={()=>setModal(false)}>
        <Field label="CLIENT">
          <select value={clientRef} onChange={e=>{setClientRef(e.target.value);setInitialPaymentMethod("Espèces");setAcompte("");}} className={inputCls} style={{ appearance:"none" }}>
            {siblings.length>0&&<optgroup label="🏪 Mes autres boutiques">{siblings.map(sb=><option key={sb.id} value={`boutique:${sb.id}`}>{sb.nom} — {sb.ville} (inter-tenant)</option>)}</optgroup>}
            <optgroup label="Clients">{clients.map(c=><option key={c.id} value={`client:${c.id}`}>{c.nom} ({c.type})</option>)}</optgroup>
          </select>
          {siblingClient&&<div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#a855f715" }}>
            <Store size={14} style={{ color:"#a855f7" }}/>
            <p className="text-xs font-bold" style={{ color:"#a855f7" }}>Transfert inter-tenant · le stock sera mis à jour dans les 2 boutiques</p>
          </div>}
        </Field>

        {/* Product lines */}
        <div>
          <p className="text-xs font-black mb-2 tracking-wider" style={{ color:"#a855f7" }}>PRODUITS FACTURÉS</p>
          {lines.length>0&&<div className="space-y-2 mb-3">{lines.map((l,i)=>(
            <div key={i} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{l.nom}</p><p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)} = <span className="font-semibold text-foreground">{fmt(lineTotal(l))}</span></p></div>
              <button onClick={()=>removeLine(i)} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"#ef444420" }}><Trash2 size={13} style={{ color:"#ef4444" }}/></button>
            </div>
          ))}</div>}
          <div className="bg-muted rounded-2xl p-3 space-y-3">
            <select value={lPid} onChange={e=>{ const newPid=Number(e.target.value); const prod=products.find(p=>p.id===newPid); setLPid(newPid); setLQty(""); if(prod){ const unit=getDefaultSaleUnit(prod,boutique); setLSellUnit(unit); const last=getLastSalePrice(prod.id,invoices,unit); setLPrix(last!=null?String(last):""); } else { setLSellUnit(""); setLPrix(""); } }} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ appearance:"none" }}>
              {products.map(p=><option key={p.id} value={p.id}>{p.nom} (stock: {productQty(p.id,entries)} {p.unit})</option>)}
            </select>
            {getInvSellOptions(lPid).length>1&&(()=>{
              const cat2=(boutique.categories??[]).find(c=>c.nom===products.find(p=>p.id===lPid)?.categorie);
              const effUnit=lSellUnit||invDefaultUnit(lPid);
              return(<div className="flex gap-2 flex-wrap">{getInvSellOptions(lPid).map(u=>{
                const lbl=u==="Lot"?(cat2?'Lot ('+cat2.nbPiecesParLot+'p)':'Lot'):u==="Pièce"?"Pièce":u;
                return(<button key={u} onClick={()=>{ setLSellUnit(u); setLQty(""); const last=getLastSalePrice(lPid,invoices,u); setLPrix(last!=null?String(last):""); }} className="flex-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                  style={{ background:effUnit===u?"#1f2937":"#EEE9D8", color:effUnit===u?"#fff":"#374151" }}>{lbl}</button>);
              })}</div>);
            })()}
            <div className="flex gap-2">
              <input value={lQty} onChange={e=>setLQty(e.target.value)} placeholder={(lSellUnit||invDefaultUnit(lPid))==="Lot"?"Nb lots":(lSellUnit||invDefaultUnit(lPid))==="Pièce"?"Nb pièces":"Qté"} type="number" className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.nextElementSibling as HTMLInputElement|null)?.focus();}}}/>
              <input value={lPrix} onChange={e=>setLPrix(e.target.value)} placeholder={(lSellUnit||invDefaultUnit(lPid))==="Lot"?"Prix/lot":"Prix unitaire"} type="number" className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" onKeyDown={e=>e.key==="Enter"&&addLine()}/>
            </div>
            <button onClick={addLine} disabled={!lQty} className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background:lQty?"#a855f7":"#EEE9D8", color:lQty?"#fff":"#6b7280" }}>
              <Plus size={14}/> Ajouter la ligne
            </button>
          </div>
        </div>

        {/* Total from lines */}
        {montant>0&&<div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background:"#a855f715" }}>
          <span className="text-sm font-bold" style={{ color:"#a855f7" }}>Total facture</span>
          <span className="text-lg font-black" style={{ color:"#a855f7", fontFamily:"'Nunito', sans-serif" }}>{fmt(montant)}</span>
        </div>}

        {canCollectPayment ? (<>
          <Field label="ACOMPTE VERSÉ (F CFA)" color="#C9A227">
            <input value={acompte} onChange={e=>{const entered=Number(e.target.value)||0;setAcompte(e.target.value===""?"":String(initialPaymentMethod==="Avoir client"?Math.min(entered,selectedClientAdvance,montant||entered):entered));}} placeholder="Ex: 75 000" type="number" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/>
            {aNum>0&&montant>0&&<div className="mt-2"><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width:`${pct}%`, background:"#C9A227" }}/></div><div className="flex justify-between mt-1 text-xs"><span className="text-muted-foreground">Reste: {fmt(Math.max(0,montant-aNum))}</span><span style={{ color:"#C9A227",fontWeight:700 }}>{pct}%</span></div></div>}
          </Field>
          {selectedClient && selectedClientAdvance>0&&montant>0&&<div className="rounded-2xl border p-3" style={{background:initialPaymentMethod==="Avoir client"?"#f0fdfa":"#f8fafc",borderColor:"#0f766e44"}}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black" style={{color:"#0f766e"}}>🎟️ AVOIR DISPONIBLE</p><p className="text-xs text-muted-foreground mt-1">{fmt(selectedClientAdvance)} peut régler cette facture.</p></div>
              {initialPaymentMethod === "Avoir client" ? (
                <button type="button" onClick={()=>{setInitialPaymentMethod("Espèces");setAcompte("");}} className="rounded-xl px-3 py-2 text-xs font-black" style={{background:"#e5e7eb",color:"#374151"}}>Ne pas utiliser</button>
              ) : (
                <button type="button" onClick={()=>{setInitialPaymentMethod("Avoir client");setAcompte(String(Math.min(montant,selectedClientAdvance)));}} className="rounded-xl px-3 py-2 text-xs font-black" style={{background:"#0f766e",color:"#fff"}}>Utiliser l'avoir</button>
              )}
            </div>
            {initialPaymentMethod === "Avoir client"&&<p className="mt-2 text-xs font-semibold" style={{color:"#0f766e"}}>L'avoir sera déduit et tracé lors de la création de la facture.</p>}
          </div>}
          {aNum===0&&<Field label="STATUT"><div className="grid grid-cols-2 gap-2">{(["en attente","acompte","payé","en retard"] as InvoiceStatus[]).map(s=>{const [tc]=invBadge(s);return<button key={s} onClick={()=>setStatus(s)} className="py-3 rounded-xl text-xs font-bold capitalize" style={{ background:status===s?tc:tc+"22", color:status===s?"#fff":tc }}>{s}</button>;})}</div></Field>}
        </>) : (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold" style={{ background:"#fffbeb", color:"#92400e" }}>
            <AlertCircle size={16}/> La facture sera créée en attente d'encaissement.
          </div>
        )}
        <SubmitBtn color={boutique.color} label={submittingInvoice ? "Création…" : "Créer la facture"} onClick={submit} disabled={submittingInvoice || !clientRef||lines.length===0}/>
      </Modal>}

      {shareInv&&<ShareInvoiceModal inv={shareInv} boutique={boutique} clients={clients} onClose={()=>setShareInv(null)}/>}

      {/* Return modal */}
      {returnInv && returnInv.lines && (
        <Modal title={`Retour · ${returnInv.id}`} color={SEM.danger.accent} onClose={()=>{ setReturnInv(null); setReturnDone(false); }}>
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"#ef444415" }}>
            <AlertCircle size={15} style={{ color:"#ef4444" }}/>
            <p className="text-xs" style={{ color:"#ef4444" }}>Les articles retournés seront remis en stock automatiquement.</p>
          </div>
          <div className="space-y-2">
            {returnInv.lines.map((l, i) => {
              const rem = remainingReturnable(returnInv, l);
              const alreadyReturned = l.qty - rem;
              return (
              <div key={i} className="flex items-center gap-3 bg-muted rounded-2xl p-3" style={rem<=0?{opacity:0.55}:{}}>
                {(() => { const prod = products.find(p=>p.id===l.productId); return prod ? <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,96,96)} alt={l.nom} className="w-full h-full object-cover"/></div> : null; })()}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} vendus · {fmt(l.prixUnit)} / {lineDispUnit(l)}</p>
                  {alreadyReturned > 0 && <p className="text-xs font-semibold" style={{ color:"#ef4444" }}>{rem > 0 ? `Reste à retourner : ${rem}` : "Déjà retourné en totalité"}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button disabled={rem<=0} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.max(0,(q[i]??0)-1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Minus size={12} style={{ color:"#ef4444" }}/></button>
                  <span className="w-8 text-center font-black text-sm" style={{ color:"#ef4444" }}>{returnQtys[i] ?? 0}</span>
                  <button disabled={(returnQtys[i] ?? 0) >= rem} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.min(rem,(q[i]??0)+1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Plus size={12} style={{ color:"#ef4444" }}/></button>
                </div>
              </div>
              );
            })}
          </div>
          {(() => {
            const total = returnInv.lines.reduce((s,l,i)=>s+(returnQtys[i]??0)*l.prixUnit,0);
            return total > 0 ? (
              <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:"#ef444415" }}>
                <span className="font-bold text-sm" style={{ color:"#ef4444" }}>Montant remboursé</span>
                <span className="text-xl font-black" style={{ color:"#ef4444", fontFamily:"'Nunito', sans-serif" }}>{fmt(total)}</span>
              </div>
            ) : null;
          })()}
          {!returnDone && (
            <div className="space-y-2">
              <p className="text-xs font-black tracking-wider text-muted-foreground">MODE DE REMBOURSEMENT</p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(method => (
                  <button key={method} type="button" onClick={()=>setReturnMethod(method)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-bold" style={{ background:returnMethod===method?(PM_COLOR[method]??"#6b7280")+"18":"#f9fafb", border:returnMethod===method?`2px solid ${(PM_COLOR[method]??"#6b7280")}55`:"2px solid transparent", color:returnMethod===method?(PM_COLOR[method]??"#374151"):"#6b7280" }}>
                    <span>{PM_ICON[method]}</span><span>{method}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Le mode choisi sera enregistré sur l'avoir et dans l'écriture de remboursement.</p>
            </div>
          )}
          {returnDone ? (
            <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={22} style={{ color:SEM.success.accent }}/>
              <p className="font-black text-sm" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>Retour enregistré ✓</p>
            </div>
          ) : (
            <SubmitBtn
              color={SEM.danger.accent}
              label="Confirmer le retour"
              onClick={submitReturn}
              disabled={!Object.values(returnQtys).some(q=>q>0)}
            />
          )}
        </Modal>
      )}

      {/* Quick encaissement modal — multi-mode */}
      {canCollectPayment && encaissInv && (
        <Modal title={`Encaisser · ${encaissInv.id}`} color={SEM.success.accent} onClose={()=>{setEncaissInv(null);setEncaissSplit([{method:"Espèces",amount:0}]);setEncaissDone(false);}}>
          {/* Invoice detail */}
          <div className="bg-muted rounded-2xl p-4">
            <p className="font-bold text-sm">{encaissInv.client}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatPreciseDateTime(encaissInv.dateRaw) === "—" ? encaissInv.date : formatPreciseDateTime(encaissInv.dateRaw)} · {encaissInv.type}</p>
            {encaissInv.lines && encaissInv.lines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {encaissInv.lines.map((l, i) => {
                  const uc = canSeeMargin ? lineUnitCost(l, entries, products) : null;
                  const mLigne = uc != null ? lineTotal(l) - uc * l.qty : null;
                  return (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-foreground font-medium flex-1 truncate">{l.nom}</span>
                        <span className="text-muted-foreground ml-2">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)}</span>
                        <span className="font-bold ml-3" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(lineTotal(l))}</span>
                      </div>
                      {canSeeMargin && mLigne != null && (
                        <p className="text-right mt-0.5" style={{ color: mLigne >= 0 ? SEM.success.accent : "#ef4444" }}>
                          marge {mLigne >= 0 ? "+" : ""}{fmt(mLigne)} ({uc != null && uc * l.qty > 0 ? Math.round(mLigne / (uc * l.qty) * 100) : 0}%)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between items-baseline mt-3 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Total facturé</span>
              <span className="font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(encaissInv.montant)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xs text-muted-foreground">Déjà encaissé</span>
              <span className="font-bold text-sm" style={{color:SEM.success.accent}}>{fmt(invoicePaidAmount(encaissInv))}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1 pt-2 border-t border-border">
              <span className="text-xs font-bold">Reste dû</span>
              <span className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(invoiceRemainingAmount(encaissInv))}</span>
            </div>
          </div>

          {/* Multi-mode payment split */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black tracking-wider text-muted-foreground">MODES DE PAIEMENT</span>
              <button type="button"
                disabled={encaissSplit.reduce((sum,item)=>sum+item.amount,0) >= invoiceRemainingAmount(encaissInv)}
                onClick={()=>setEncaissSplit(prev=>{
                  const allocated = prev.reduce((sum,item)=>sum+item.amount,0);
                  const remaining = Math.max(0, invoiceRemainingAmount(encaissInv) - allocated);
                  if (remaining <= 0) return prev;
                  const method = paymentMethodsForInvoice(encaissInv).find(m=>!prev.some(item=>item.method===m)) ?? "Espèces";
                  return [...prev, {method, amount:remaining}];
                })}
                className="flex items-center gap-1.5 text-sm font-black px-3.5 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                style={{background:SEM.success.bg, color:SEM.success.accent}}>
                <PlusCircle size={15}/> Ajouter un paiement
              </button>
            </div>
            {encaissSplit.map((entry, idx) => (
              <div key={idx} className="space-y-1.5">
                {/* Mode chips — horizontal row, always visible */}
                <div className="flex gap-1.5 flex-wrap">
                  {paymentMethodsForInvoice(encaissInv).map(m => {
                    const active = entry.method === m;
                    return (
                      <button key={m} type="button"
                        onClick={()=>setEncaissSplit(prev=>prev.map((e,i)=>{
                          if (i !== idx) return e;
                          const otherTotal = prev.reduce((sum, current, currentIndex)=>currentIndex===idx?sum:sum+current.amount, 0);
                          const maxForMethod = m === "Avoir client"
                            ? Math.min(availableClientAdvance(encaissInv.clientId), Math.max(0, invoiceRemainingAmount(encaissInv) - otherTotal))
                            : invoiceRemainingAmount(encaissInv);
                          return {...e, method:m, amount:Math.min(e.amount, maxForMethod)};
                        }))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                        style={{
                          background: active ? PM_COLOR[m] : "#EEE9D8",
                          color: active ? "#fff" : "#6b7280",
                          boxShadow: active ? `0 2px 8px ${PM_COLOR[m]}55` : "none",
                        }}>
                        <span>{PM_ICON[m]}</span><span>{m}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Amount + remove */}
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Montant" value={entry.amount || ""}
                    onChange={e=>setEncaissSplit(prev=>prev.map((en,i)=>i===idx?{...en,amount:Number(e.target.value)||0}:en))}
                    className={inputCls+" flex-1 text-center font-black text-sm"} autoFocus={idx===0}/>
                  {encaissSplit.length > 1 && (
                    <button type="button" onClick={()=>setEncaissSplit(prev=>prev.filter((_,i)=>i!==idx))}
                      className="text-xs text-red-500 font-bold px-2 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0">✕ Retirer</button>
                  )}
                </div>
                {idx < encaissSplit.length - 1 && <div className="border-t border-dashed" style={{borderColor:"#C9A22733"}}/>}
              </div>
            ))}
            {encaissInv.clientId != null && availableClientAdvance(encaissInv.clientId)>0&&(
              <button type="button" onClick={()=>setEncaissSplit(prev=>{
                const due = invoiceRemainingAmount(encaissInv);
                const advanceAmount = Math.min(availableClientAdvance(encaissInv.clientId), due);
                const externalMethod = prev.find(entry=>entry.method!=="Avoir client")?.method ?? "Espèces";
                const remainingCash = due - advanceAmount;
                return [
                  ...(remainingCash>0 ? [{method:externalMethod,amount:remainingCash}] : []),
                  {method:"Avoir client" as PaymentMethod,amount:advanceAmount},
                ];
              })} className="w-full py-2.5 rounded-xl text-xs font-black" style={{background:"#ccfbf1",color:"#0f766e"}}>🎟️ Proposer l'avoir disponible · {fmt(Math.min(availableClientAdvance(encaissInv.clientId), invoiceRemainingAmount(encaissInv)))}</button>
            )}
            {/* Quick-fill */}
            <button type="button" onClick={()=>{const method=encaissSplit[0]?.method??"Espèces";setEncaissSplit([{method,amount:method==="Avoir client"?Math.min(availableClientAdvance(encaissInv.clientId),invoiceRemainingAmount(encaissInv)):invoiceRemainingAmount(encaissInv)}]);}}
              className="w-full py-2 rounded-xl text-xs font-bold" style={{background:SEM.success.bg,color:SEM.success.accent}}>Solde total</button>
            {/* Total indicator */}
            {(() => {
              const tot = encaissSplit.reduce((s,e)=>s+e.amount,0);
              const rem = invoiceRemainingAmount(encaissInv);
              const diff = tot - rem;
              if (diff === 0 || tot === 0) return null;
              return (
                <p className="text-xs font-bold text-center" style={{color:diff>0?"#ef4444":SEM.warning.accent}}>
                  {diff > 0 ? `⚠ Excédent : +${fmt(diff)}` : `Manque : ${fmt(-diff)}`}
                </p>
              );
            })()}
          </div>

          {encaissDone ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:SEM.success.bg}}>
                <CheckCircle size={22} style={{color:SEM.success.accent}}/>
                <p className="font-black text-sm" style={{color:SEM.success.accent,fontFamily:"'Nunito', sans-serif"}}>Encaissement enregistré ✓</p>
              </div>
              {canSeeMargin && (() => {
                const m = invoiceMargin(encaissInv, entries, products);
                if (!m.hasData) return null;
                const accent = m.marge >= 0 ? SEM.success.accent : "#ef4444";
                return (
                  <div className="rounded-2xl p-3 flex items-center justify-between gap-3" style={{ background:SEM.neutral.bg }}>
                    <div>
                      <p className="text-xs font-black tracking-wider" style={{ color:accent }}>MARGE TOTALE RÉALISÉE</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-0.5">{m.pct}% du CA · coût FIFO {fmt(m.cost)}</p>
                    </div>
                    <p className="text-xl font-black" style={{ color:accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(m.marge)}</p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <SubmitBtn color={boutique.color} label={submittingPayment ? "Encaissement…" : "Confirmer l'encaissement"} onClick={submitEncaiss}
              disabled={submittingPayment || encaissSplit.reduce((s,e)=>s+e.amount,0)<=0}/>
          )}
        </Modal>
      )}

      {/* Fermeture de caisse */}
      {caisseCloseModal && caisseSession && (
        <Modal title="Fermeture de caisse" color={FCT_COLOR} onClose={() => setCaisseCloseModal(false)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:FCT_COLOR+"22" }}><Store size={18} style={{ color:FCT_COLOR }}/></div>
              <div>
                <p className="text-sm font-bold">Session</p>
                <p className="text-xs text-muted-foreground">Ouvert par {caisseSession.openedBy} · {formatPreciseDateTime(caisseSession.openedAt)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 border-b border-border bg-muted/50">
                <span className="text-xs font-black text-muted-foreground">Fond de caisse</span>
                <span className="text-sm font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(caisseSession.fondDeCaisse)}</span>
              </div>
              {PAYMENT_METHODS.map(m => {
                const b = sessionByMethod.find(x => x.m === m)!;
                return (
                  <div key={m} className="flex justify-between items-center px-4 py-2.5 border-b border-border">
                    <span className="text-sm flex items-center gap-2"><span>{PM_ICON[m]}</span><span style={{ color:PM_COLOR[m] }}>{m}</span><span className="text-xs text-muted-foreground">({b.count})</span></span>
                    <span className="font-black text-sm" style={{ color: b.total > 0 ? PM_COLOR[m] : "#c4b89a", fontFamily:"'Nunito', sans-serif" }}>{fmt(b.total)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between px-4 py-3" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total encaissé</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(sessionTotal)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 border-t border-border" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total en caisse (espèces)</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(caisseSession.fondDeCaisse + sessionEspeces)}</span>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">Un rapport sera imprimé automatiquement à la fermeture</p>
            <button disabled={savingCaisse} onClick={closeCaisse} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60" style={{ background:FCT_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              🔒 {savingCaisse ? "Fermeture…" : "Confirmer la fermeture"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
