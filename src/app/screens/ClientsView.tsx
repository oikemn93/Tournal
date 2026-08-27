import React, { useEffect, useState } from "react";
import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2 } from "lucide-react";
import type { Boutique, Client, ClientType, Invoice, PaymentMethod, PlatformUser } from "../types";
import { SEM, inputCls, searchInputCls } from "../constants";
import { fmt, today, ini } from "../utils/formatting";
import { invBadge } from "../utils/inventory";
import { PAYMENT_METHODS, PM_ICON } from "../constants";
import { getSiblings } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, recordClientPayment, updateClientContact, updateClientPaymentTerms, WHOLESALE_MARKER } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";
import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";

function normalizePhone(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function dueLabel(dueDate: string | undefined, remaining: number) {
  if (!dueDate || remaining <= 0) return null;
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);
  const dueAtMidnight = new Date(`${dueDate}T00:00:00`);
  const days = Math.ceil((dueAtMidnight.getTime() - todayAtMidnight.getTime()) / 86_400_000);
  if (days < 0) return { text:`Retard de ${Math.abs(days)} j`, color:SEM.danger.text, bg:SEM.danger.bg };
  if (days <= 3) return { text:days === 0 ? "Échéance aujourd’hui" : `Échéance dans ${days} j`, color:SEM.warning.accent, bg:SEM.warning.bg };
  return { text:`Échéance le ${dueAtMidnight.toLocaleDateString("fr-FR")}`, color:SEM.neutral.accent, bg:"#f1f5f9" };
}

export function ClientsView({ boutique, allBoutiques, platformUsers, currentUser, onUpdate, logAction, initialTab, initialClientId, initialInvoiceId, initialInvoiceNotice = "order", onInitialClientOpened, canCreateOrder = false, canCollectPayment = false, canCancelPendingOrder = false, canOpenInvoice = false, defaultPaymentTermsDays = 30, onOpenInvoice, onCreateOrder }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[];
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialTab?: ClientType;
  initialClientId?: number;
  initialInvoiceId?: string;
  initialInvoiceNotice?: "order" | "payment";
  onInitialClientOpened?: () => void;
  canCreateOrder?: boolean;
  canCollectPayment?: boolean;
  canCancelPendingOrder?: boolean;
  canOpenInvoice?: boolean;
  defaultPaymentTermsDays?: number;
  onOpenInvoice: (invoiceId: string) => void;
  onCreateOrder: (client: Client) => void;
}) {
  const { clients, entries } = boutique;
  const canCreateB2B = currentUser.isSuperAdmin;
  const [tab, setTab] = useState<ClientType>(initialTab ?? "B2C");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [detailClient, setDetailClient] = useState<Client|null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string|null>(null);
  const [highlightedInvoiceNotice, setHighlightedInvoiceNotice] = useState<"order" | "payment">("order");
  const [nom,setNom]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState(""); const [ville,setVille]=useState(""); const [type,setType]=useState<ClientType>("B2C");
  const [adresse,setAdresse]=useState(""); const [email,setEmail]=useState(""); const [contact,setContact]=useState("");
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);
  const filtered = clients.filter(c=>c.type===tab&&(c.nom.toLowerCase().includes(search.toLowerCase())||c.tel.includes(search)||c.ville.toLowerCase().includes(search.toLowerCase())));
  const counts = { "B2C":clients.filter(c=>c.type==="B2C").length, "B2B":clients.filter(c=>c.type==="B2B").length, "Grossiste":clients.filter(c=>c.type==="Grossiste").length };

  // Commands created from a client card come back here, not to the general
  // invoice screen. The newest transaction is then already at the top.
  useEffect(() => {
    if (initialClientId == null) return;
    const client = clients.find(item => item.id === initialClientId);
    if (client) {
      setTab(client.type);
      setSearch("");
      setDetailClient(client);
      // The invoice list is always visible. Only unfold payment details when
      // returning immediately after an encashment.
      setShowPaymentHistory(initialInvoiceNotice === "payment");
      setShowAllInvoices(true);
      setHighlightedInvoiceId(initialInvoiceId ?? null);
      setHighlightedInvoiceNotice(initialInvoiceNotice);
    }
    onInitialClientOpened?.();
  }, [initialClientId, initialInvoiceId, initialInvoiceNotice, clients, onInitialClientOpened]);

  function openClientDetail(client: Client) {
    setDetailClient(client);
    setShowPaymentHistory(false);
    setShowAllInvoices(false);
    setHighlightedInvoiceId(null);
    setHighlightedInvoiceNotice("order");
  }

  async function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim() ? dialCode + " " + tel.trim() : "";
    const phoneNorm = normalizePhone(fullTel);
    if (phoneNorm.length >= 8) {
      const existing = clients.find(c => normalizePhone(c.tel) === phoneNorm);
      if (existing) {
        setModal(false);
        openClientDetail(existing);
        alert(`Ce numéro appartient déjà à ${existing.nom}. La fiche existante a été ouverte.`);
        return;
      }
    }

    const isWholesale = type === "Grossiste";
    let persisted;
    try {
      persisted = await createClient({ boutiqueId:boutique.id,name:nom.trim(),type:isWholesale ? "B2B" : type,phone:fullTel,email:email.trim() || undefined,city:ville.trim() || undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Création du client impossible";
      if (message.includes("client_phone_exists") && phoneNorm.length >= 8) {
        const existing = clients.find(c => normalizePhone(c.tel) === phoneNorm);
        if (existing) {
          setModal(false);
          openClientDetail(existing);
          alert(`Ce numéro appartient déjà à ${existing.nom}. La fiche existante a été ouverte.`);
          return;
        }
      }
      alert(message);
      return;
    }
    // Wholesale clients: tag the persisted row so the type survives a reload.
    if (isWholesale) {
      const markedContact = `${contact.trim()} ${WHOLESALE_MARKER}`.trim();
      try { await updateClientContact(persisted.client_id, markedContact); }
      catch { /* non-blocking: client is created, tag is best-effort */ }
    }
    onUpdate({ clients:[...clients,{ id:persisted.client_id, nom:nom.trim(), type, tel:fullTel, total:0, last:today(), ville:ville.trim(), adresse:adresse.trim()||undefined, email:email.trim()||undefined, contact:contact.trim()||undefined }] });
    logAction("Nouveau client",`${nom.trim()} (${type}) · ${ville.trim()}`,"👥");
    setNom(""); setDialCode("+221"); setTel(""); setVille(""); setAdresse(""); setEmail(""); setContact(""); setModal(false);
  }

  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Espèces");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<{ applied:number; advance:number }|null>(null);
  const [applyingAdvanceInvoiceId, setApplyingAdvanceInvoiceId] = useState<string|null>(null);
  const [advanceAppliedNotice, setAdvanceAppliedNotice] = useState<{ invoiceId:string; amount:number }|null>(null);
  const [termsModalClient, setTermsModalClient] = useState<Client|null>(null);
  const [termsDraft, setTermsDraft] = useState("");
  const [savingTerms, setSavingTerms] = useState(false);
  const [cancelInvoice, setCancelInvoice] = useState<Invoice|null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingInvoice, setCancellingInvoice] = useState(false);
  const tabDefs: Array<{id:ClientType;label:string;color:string}> = [
    {id:"B2C",      label:"👤 Particuliers", color:"#374151"},
    {id:"B2B",      label:"🏢 Entreprises",  color:"#0e7490"},
    {id:"Grossiste",label:"📦 Grossistes",   color:"#6d28d9"},
  ];
  const clientColor = (t: ClientType) => t==="Grossiste"?"#6d28d9":t==="B2B"?"#0e7490":"#374151";

  // Client accounting detail modal: invoices are linked only by their canonical client_id.
  if (detailClient) {
    const c = detailClient;
    const CC = clientColor(c.type);
    const activeAssignment = currentUser.assignments.find(assignment => assignment.boutiqueId === boutique.id);
    const canManageAnyPendingOrder = currentUser.isSuperAdmin || activeAssignment?.role === "Propriétaire";
    const clientInvoices = boutique.invoices.filter(inv => inv.clientId === c.id)
      .sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date));
    const isReturn = (invoice: Invoice) => invoice.type.toLowerCase() === "retour";
    const ventes = clientInvoices.filter(i=>!isReturn(i) && i.status !== "annulée");
    const retours = clientInvoices.filter(i=>isReturn(i));
    const totalVentesFacturées = ventes.reduce((s,i)=>s+i.montant,0);
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);
    const totalFacturé  = totalVentesFacturées-totalRetours;
    const totalEncaissé = ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)-retours.reduce((s,i)=>s+invoicePaidAmount(i),0);
    const totalImpayé   = ventes.reduce((s,i)=>s+invoiceRemainingAmount(i),0);
    const clientAdvances = (boutique.clientAdvances ?? []).filter(advance => advance.clientId === c.id)
      .sort((a,b)=>b.paidAt.localeCompare(a.paidAt));
    const advanceRemaining = (advance: typeof clientAdvances[number]) => Math.max(0, advance.amount - (advance.allocatedAmount ?? 0));
    const totalAvoir = clientAdvances.reduce((sum, advance) => sum + advanceRemaining(advance), 0);
    const clientTermsDays = c.paymentTermsDays ?? defaultPaymentTermsDays;
    const nbVentes = ventes.filter(i=>invoicePaidAmount(i)>0).length;
    const panierMoyen = nbVentes>0?ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)/nbVentes:0;

    // Monthly breakdown
    const byMonth: Record<string,{facturé:number;encaissé:number}> = {};
    clientInvoices.filter(inv => inv.status !== "annulée").forEach(inv=>{
      const m = (inv.dateRaw??"").slice(0,7) || inv.date.slice(-7);
      if (!byMonth[m]) byMonth[m]={facturé:0,encaissé:0};
      const sign = isReturn(inv) ? -1 : 1;
      byMonth[m].facturé += sign * inv.montant;
      byMonth[m].encaissé += sign * invoicePaidAmount(inv);
    });
    const months = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
    const clientPayments = clientInvoices.flatMap(inv => (inv.payments ?? []).map(payment => ({ ...payment, invoiceId:inv.id })))
      .sort((a,b)=>b.paidAt.localeCompare(a.paidAt));
    const paymentHistoryCount = clientPayments.length + clientAdvances.length;
    const visibleInvoices = showAllInvoices ? clientInvoices : clientInvoices.slice(0, 5);

    async function submitClientPayment() {
      if (submittingPayment) return;
      const requested = Number(paymentAmount) || 0;
      if (requested <= 0) return;
      setSubmittingPayment(true);
      try {
        const result = await recordClientPayment({
          boutiqueId:boutique.id,
          clientId:c.id,
          amount:requested,
          paymentMethod,
          paymentDate,
        });
        const allocationByInvoice = new Map(result.allocations.map(allocation => [allocation.invoice_id, allocation.amount]));
        const updatedInvoices = boutique.invoices.map((invoice): Invoice => {
          const applied = allocationByInvoice.get(invoice.id) ?? 0;
          if (applied <= 0) return invoice;
          const paid = invoicePaidAmount(invoice) + applied;
          return {
            ...invoice,
            clientId:c.id,
            acompte:paid,
            status:paid >= invoice.montant ? "payé" : "acompte",
            paymentMethod,
            payments:[...(invoice.payments ?? []), {
              id:-Date.now(), amount:applied, paymentMethod, paidAt:result.paid_at,
              operatorId:result.operator_id, operatorName:result.operator_name,
              batchId:`fifo:${result.paid_at}`, source:"client_fifo",
            }],
          };
        });
        const recordedAdvance = result.advance;
        onUpdate({
          invoices:updatedInvoices,
          ...(recordedAdvance ? { clientAdvances:[...(boutique.clientAdvances ?? []), {
            id:recordedAdvance.advance_id,
            clientId:recordedAdvance.client_id,
            amount:recordedAdvance.amount,
            allocatedAmount:0,
            paymentMethod:recordedAdvance.payment_method as PaymentMethod,
            paidAt:recordedAdvance.paid_at,
            recordedAt:recordedAdvance.recorded_at,
            operatorId:recordedAdvance.operator_id,
            operatorName:recordedAdvance.operator_name,
            note:recordedAdvance.note ?? undefined,
          }] } : {}),
        });
        const details = [
          result.applied_amount > 0 ? `${fmt(result.applied_amount)} sur ${result.allocations.length} facture(s)` : null,
          result.advance_amount > 0 ? `${fmt(result.advance_amount)} en avoir` : null,
        ].filter(Boolean).join(" · ");
        logAction("Versement client", `${c.nom} · ${details} · ${paymentMethod}`, "💳");
        setPaymentSummary({ applied:result.applied_amount, advance:result.advance_amount });
        setPaymentDone(true);
        setTimeout(() => {
          setPaymentModal(false); setPaymentAmount(""); setPaymentDone(false); setPaymentSummary(null); setSubmittingPayment(false);
        }, 1000);
      } catch (error) {
        setSubmittingPayment(false);
        alert(error instanceof Error ? error.message : "Versement impossible");
      }
    }

    async function applyAdvanceToInvoice(invoice: Invoice) {
      const amount = Math.min(totalAvoir, invoiceRemainingAmount(invoice));
      if (amount <= 0 || applyingAdvanceInvoiceId) return;
      setApplyingAdvanceInvoiceId(invoice.id);
      try {
        const result = await applyClientAdvanceToInvoice({
          boutiqueId:boutique.id,
          invoiceId:invoice.id,
          amount,
        });
        const allocatedByAdvance = new Map<number, number>();
        result.allocations.forEach(allocation => allocatedByAdvance.set(
          allocation.advance_id,
          (allocatedByAdvance.get(allocation.advance_id) ?? 0) + allocation.amount,
        ));
        const updatedInvoice: Invoice = {
          ...invoice,
          acompte:result.acompte,
          status:result.status === "payée" ? "payé" : "acompte",
          paymentMethod:"Avoir client",
          payments:[...(invoice.payments ?? []), {
            id:result.payment.id,
            amount:result.payment.amount,
            paymentMethod:"Avoir client",
            paidAt:result.payment.paid_at,
            operatorId:result.payment.operator_id,
            operatorName:result.payment.operator_name,
            batchId:result.payment.batch_id,
            source:"client_advance",
          }],
        };
        const stockEntries = result.stock_deducted
          ? (invoice.lines ?? []).map((line, index) => ({
              id:Date.now() + index,
              productId:line.productId,
              qty:-line.qty,
              unit:line.unit,
              montantDu:0,
              date:today(),
              fournisseur:`Vente ${invoice.id}`,
              invoiceId:invoice.id,
            }))
          : [];
        onUpdate({
          invoices:boutique.invoices.map(item => item.id === invoice.id ? updatedInvoice : item),
          clientAdvances:(boutique.clientAdvances ?? []).map(advance => ({
            ...advance,
            allocatedAmount:(advance.allocatedAmount ?? 0) + (allocatedByAdvance.get(advance.id) ?? 0),
          })),
          ...(stockEntries.length ? { entries:[...entries, ...stockEntries] } : {}),
        });
        setHighlightedInvoiceId(invoice.id);
        setHighlightedInvoiceNotice("payment");
        setAdvanceAppliedNotice({ invoiceId:invoice.id, amount:result.applied_amount });
        logAction("Avoir utilisé", `${invoice.id} · ${fmt(result.applied_amount)} · ${c.nom}`, "🎟️");
      } catch (error) {
        alert(error instanceof Error ? error.message : "Utilisation de l'avoir impossible");
      } finally {
        setApplyingAdvanceInvoiceId(null);
      }
    }

    async function saveClientTerms() {
      const days = termsDraft.trim() === "" ? null : Number(termsDraft);
      if (savingTerms || (days != null && (!Number.isInteger(days) || days < 0 || days > 3650))) return;
      setSavingTerms(true);
      try {
        const result = await updateClientPaymentTerms({ boutiqueId:boutique.id, clientId:c.id, paymentTermsDays:days });
        const updated = { ...c, paymentTermsDays:result.payment_terms_days ?? undefined };
        onUpdate({ clients:clients.map(client => client.id === c.id ? updated : client) });
        setDetailClient(updated);
        setTermsModalClient(null);
        logAction("Délai client modifié", `${c.nom} · ${result.payment_terms_days ?? defaultPaymentTermsDays} jours`, "📅");
      } catch (error) {
        alert(error instanceof Error ? error.message : "Modification du délai impossible");
      } finally {
        setSavingTerms(false);
      }
    }

    async function confirmClientCancellation() {
      if (!cancelInvoice || cancellingInvoice) return;
      setCancellingInvoice(true);
      try {
        const result = await cancelPendingInvoice({
          boutiqueId:boutique.id,
          invoiceId:cancelInvoice.id,
          reason:cancelReason,
          originContext:"client_profile",
        });
        onUpdate({ invoices:boutique.invoices.map(invoice => invoice.id === cancelInvoice.id ? {
          ...invoice,
          status:"annulée",
          cancelReason:result.cancel_reason ?? undefined,
          cancelledAt:result.cancelled_at,
          cancelledBy:result.cancelled_by ?? undefined,
        } : invoice) });
        setCancelInvoice(null);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Annulation impossible");
      } finally {
        setCancellingInvoice(false);
      }
    }

    return (
      <div className="space-y-4 pb-24">
        <button onClick={()=>{setDetailClient(null);setHighlightedInvoiceId(null);}} className="flex items-center gap-2 text-muted-foreground active:opacity-70">
          <ArrowLeft size={18}/><span className="text-sm font-bold">Retour</span>
        </button>
        {/* Header card */}
        <div className="rounded-2xl p-4 border" style={{ borderColor:CC+"33", background:CC+"08" }}>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg font-black" style={{ background:CC+"22",color:CC,fontFamily:"'Nunito',sans-serif" }}>{ini(c.nom)}</div>
            <div className="flex-1">
              <p className="font-black text-lg leading-tight" style={{ fontFamily:"'Nunito',sans-serif" }}>{c.nom}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {c.tel&&<div className="flex items-center gap-1"><Phone size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.tel}</span></div>}
                {c.ville&&<div className="flex items-center gap-1"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.ville}</span></div>}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1 inline-block" style={{ background:CC+"22",color:CC }}>{c.type}</span>
            </div>
          </div>
          {(canCreateOrder || canCollectPayment) && <div className={`grid gap-2 mt-4 ${canCreateOrder && canCollectPayment ? "grid-cols-2" : "grid-cols-1"}`}>
            {canCreateOrder && <button onClick={()=>onCreateOrder(c)} className="py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2" style={{ background:CC, color:"#fff" }}>
              <FilePlus size={15}/> Nouvelle commande
            </button>}
            {canCollectPayment && <button onClick={()=>{setPaymentAmount(totalImpayé>0?String(totalImpayé):"");setPaymentSummary(null);setPaymentModal(true);}} className="py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2" style={{ background:SEM.success.bg, color:SEM.success.accent }}>
              <Wallet size={15}/> Versement
            </button>}
          </div>}
        </div>
        {c.type !== "B2C" && <section className="rounded-2xl border p-3.5" style={{borderColor:"#f59e0b33",background:"#fffbeb"}}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{background:"#fef3c7",color:SEM.warning.accent}}><CalendarClock size={17}/></div>
            <div className="flex-1"><p className="text-xs font-black tracking-wider" style={{color:SEM.warning.accent}}>DÉLAI DE PAIEMENT</p><p className="mt-0.5 text-xs text-muted-foreground">{c.paymentTermsDays == null ? `Délai boutique : ${clientTermsDays} jours` : `${clientTermsDays} jours pour ce client`}</p></div>
            <button type="button" onClick={()=>{setTermsModalClient(c);setTermsDraft(c.paymentTermsDays == null ? "" : String(c.paymentTermsDays));}} className="rounded-lg px-2.5 py-2 text-xs font-black" style={{background:"#fff",color:SEM.warning.accent}}><Edit2 size={13} className="mr-1 inline"/>Modifier</button>
          </div>
        </section>}
        <section className="bg-card rounded-2xl p-3.5 border border-border" aria-label="Factures et commandes du client">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div><p className="text-xs font-black tracking-wider text-muted-foreground">FACTURES & COMMANDES</p><p className="text-xs text-muted-foreground mt-0.5">Les plus récentes sont affichées en premier.</p></div>
            <span className="rounded-lg px-2 py-1 text-xs font-black" style={{background:CC+"18",color:CC}}>{clientInvoices.length}</span>
          </div>
          {highlightedInvoiceId && <div className="mb-3 rounded-xl px-3 py-2 text-xs font-bold" style={{background:SEM.success.bg,color:SEM.success.accent}}>{highlightedInvoiceNotice === "payment" ? `✓ Encaissement enregistré : ${highlightedInvoiceId}` : `✓ Nouvelle commande enregistrée : ${highlightedInvoiceId}`}</div>}
          <div className="space-y-2">
            {clientInvoices.length===0&&<p className="text-sm text-muted-foreground text-center py-5">Aucune transaction</p>}
            {visibleInvoices.map(inv=>{
              const [tc,bc]=invBadge(inv.status);
              const isReturn=inv.type==="Retour";
              const paid = invoicePaidAmount(inv);
              const remaining = invoiceRemainingAmount(inv);
              const maturity = dueLabel(inv.dueDate, remaining);
              const isHighlighted = inv.id === highlightedInvoiceId;
              const canUseAdvance = canCollectPayment && !isReturn && remaining>0 && totalAvoir>0;
              const canCancel = canCancelPendingOrder && (canManageAnyPendingOrder || inv.operatorId === currentUser.id) && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;
              const paymentNotice = isHighlighted && advanceAppliedNotice?.invoiceId === inv.id
                ? `✓ Avoir déduit : ${fmt(advanceAppliedNotice.amount)}`
                : null;
              const content = <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="text-xs font-black text-muted-foreground">{inv.id}</p><span className="text-xs px-1.5 py-0.5 rounded font-bold capitalize" style={{ background:bc,color:tc }}>{inv.status}</span>{isReturn&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#ef444415",color:"#ef4444" }}>Retour</span>}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatPreciseDateTime(inv.dateRaw) === "—" ? inv.date : formatPreciseDateTime(inv.dateRaw)} · {inv.type}</p>
                  {inv.paymentMethod&&<p className="text-xs text-muted-foreground">{PM_ICON[inv.paymentMethod]} {inv.paymentMethod}</p>}
                  {maturity&&<p className="mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-bold" style={{background:maturity.bg,color:maturity.color}}>{maturity.text}</p>}
                </div>
                <div className="text-right flex-shrink-0"><p className="font-black text-sm" style={{ fontFamily:"'Nunito',sans-serif" }}>{fmt(inv.montant)}</p>{paid>0&&<p className="text-xs font-semibold" style={{ color:SEM.success.accent }}>✓ {fmt(paid)}</p>}{remaining>0&&<p className="text-xs font-semibold" style={{ color:SEM.warning.accent }}>⏳ {fmt(remaining)}</p>}</div>
                {canOpenInvoice&&<ChevronRight size={15} className="text-muted-foreground"/>}
              </>;
              const className="w-full rounded-xl p-3 border text-left" + (isHighlighted ? " ring-2" : " bg-background");
              const style = isHighlighted ? {borderColor:SEM.success.accent,background:SEM.success.bg,boxShadow:`0 0 0 2px ${SEM.success.accent}`} : undefined;
              return <div key={inv.id} className={className} style={style}>
                <div className="flex items-center gap-3">
                  {canOpenInvoice
                    ? <button type="button" onClick={()=>onOpenInvoice(inv.id)} className="flex flex-1 min-w-0 items-center gap-3 text-left active:scale-[0.99]">{content}</button>
                    : <div className="flex flex-1 min-w-0 items-center gap-3">{content}</div>}
                  {canUseAdvance&&<button type="button" onClick={()=>applyAdvanceToInvoice(inv)} disabled={!!applyingAdvanceInvoiceId} className="rounded-lg px-2 py-2 text-[11px] font-black disabled:opacity-50" style={{background:"#ccfbf1",color:"#0f766e"}}>{applyingAdvanceInvoiceId===inv.id?"Application…":"🎟️ Utiliser"}</button>}
                  {canCancel&&<button type="button" onClick={()=>{setCancelReason("");setCancelInvoice(inv);}} className="rounded-lg px-2 py-2 text-[11px] font-black" style={{background:"#fef2f2",color:"#dc2626"}} title="Annuler cette commande">Annuler</button>}
                </div>
                {paymentNotice&&<p className="mt-2 rounded-lg px-2 py-1.5 text-xs font-black" style={{background:"#dcfce7",color:SEM.success.accent}}>{paymentNotice}</p>}
              </div>;
            })}
          </div>
          {clientInvoices.length>5&&<button type="button" onClick={()=>setShowAllInvoices(value=>!value)} className="mt-3 w-full rounded-xl bg-muted py-2.5 text-xs font-black text-foreground">{showAllInvoices ? "Réduire la liste" : `Voir les ${clientInvoices.length} factures`}</button>}
        </section>
        {paymentHistoryCount>0&&<section className="bg-card rounded-2xl p-3.5 border border-border" aria-label="Historique des paiements du client">
          <button type="button" onClick={()=>setShowPaymentHistory(value=>!value)} aria-expanded={showPaymentHistory} className="flex w-full items-center justify-between gap-3 text-left">
            <div><p className="text-xs font-black tracking-wider text-muted-foreground">HISTORIQUE DES PAIEMENTS</p><p className="text-xs text-muted-foreground mt-0.5">{showPaymentHistory ? "Règlements et versements d’avance" : "Appuyez pour consulter le détail"}</p></div>
            <span className="flex items-center gap-2"><span className="rounded-lg px-2 py-1 text-xs font-black" style={{background:SEM.success.bg,color:SEM.success.accent}}>{paymentHistoryCount}</span><ChevronRight size={16} className={`text-muted-foreground transition-transform ${showPaymentHistory ? "rotate-90" : ""}`}/></span>
          </button>
          {showPaymentHistory&&<>
          {clientPayments.length>0&&<div className="mt-4 border-t border-border pt-4">
            <div className="space-y-2">
              {clientPayments.slice(0,20).map(payment=><div key={`${payment.invoiceId}-${payment.id}`} className="flex items-center justify-between gap-3 text-xs">
                <div><p className="font-bold">{payment.invoiceId} · {payment.paymentMethod}</p><p className="text-muted-foreground">{formatPreciseDateTime(payment.paidAt)} · {payment.operatorName}</p></div>
                <p className="font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p>
              </div>)}
            </div>
          </div>}
          {clientAdvances.length>0&&<div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-black tracking-wider text-muted-foreground">VERSEMENTS D'AVANCE</p>
            <div className="space-y-2">
              {clientAdvances.slice(0,20).map(advance=><div key={advance.id} className="flex items-center justify-between gap-3 text-xs">
                <div><p className="font-bold">{PM_ICON[advance.paymentMethod]} {advance.paymentMethod} · Avoir</p><p className="text-muted-foreground">{formatPreciseDateTime(advance.paidAt)} · {advance.operatorName}</p></div>
                <div className="text-right"><p className="font-black" style={{color:advanceRemaining(advance)>0?SEM.success.accent:SEM.neutral.accent}}>{fmt(advanceRemaining(advance))}</p><p className="text-[10px] text-muted-foreground">reçu {fmt(advance.amount)}</p></div>
              </div>)}
            </div>
          </div>}
          </>}
        </section>}
        {totalAvoir>0&&<section className="rounded-2xl p-3.5 border" style={{borderColor:SEM.success.accent+"44",background:SEM.success.bg}}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black tracking-wider" style={{color:SEM.success.accent}}>AVOIR CLIENT DISPONIBLE</p><p className="text-xs text-muted-foreground mt-1">À proposer pour régler une prochaine facture.</p></div>
            <p className="text-xl font-black" style={{color:SEM.success.accent,fontFamily:"'Nunito',sans-serif"}}>{fmt(totalAvoir)}</p>
          </div>
        </section>}
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {label:"CA facturé net",val:fmt(totalFacturé),color:CC,sub:`${clientInvoices.length} factures`},
            {label:"Encaissé",val:fmt(totalEncaissé),color:SEM.success.accent,sub:`${nbVentes} ventes`},
            {label:"Impayé",val:fmt(totalImpayé),color:totalImpayé>0?SEM.warning.accent:SEM.neutral.accent,sub:totalImpayé>0?"⚠ En attente":"✓ Soldé"},
            {label:"Panier moyen",val:fmt(panierMoyen),color:"#a855f7",sub:"par vente"},
          ].map(k=>(
            <div key={k.label} className="bg-card rounded-2xl p-3.5 border border-border">
              <p className="text-xs font-bold text-muted-foreground">{k.label}</p>
              <p className="text-xl font-black mt-0.5" style={{ color:k.color,fontFamily:"'Nunito',sans-serif" }}>{k.val}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
        {/* Monthly chart */}
        {months.length>0&&<div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">HISTORIQUE MENSUEL</p>
          <div className="space-y-2">
            {months.map(([m,v])=>{
              const pct = totalFacturé>0?v.encaissé/totalFacturé*100:0;
              return <div key={m}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold">{m}</span>
                  <span className="text-muted-foreground">{fmt(v.encaissé)} / {fmt(v.facturé)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width:`${Math.min(100,pct)}%`,background:CC }}/>
                </div>
              </div>;
            })}
          </div>
        </div>}
        {/* Returns */}
        {retours.length>0&&<div className="rounded-2xl p-3.5 border" style={{ borderColor:"#ef444425",background:"#ef444408" }}>
          <p className="text-xs font-black tracking-wider mb-2" style={{ color:"#ef4444" }}>RETOURS ({retours.length})</p>
          <p className="text-xl font-black" style={{ color:"#ef4444",fontFamily:"'Nunito',sans-serif" }}>{fmt(totalRetours)}</p>
        </div>}
        {paymentModal&&<Modal title="Versement client" color={SEM.success.accent} onClose={()=>{if(!submittingPayment)setPaymentModal(false);}}>
          <div className="rounded-2xl p-3" style={{background:SEM.success.bg}}>
            <p className="text-xs text-muted-foreground">Solde global dû</p>
            <p className="text-2xl font-black" style={{color:SEM.success.accent}}>{fmt(totalImpayé)}</p>
            <p className="text-xs text-muted-foreground mt-1">Le versement règle d'abord les factures les plus anciennes. Tout dépassement est automatiquement enregistré comme avoir client.</p>
          </div>
          <Field label="MONTANT">
            <input value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} type="number" min="0" className={inputCls}/>
          </Field>
          <Field label="MODE DE PAIEMENT">
            <div className="grid grid-cols-2 gap-2">{PAYMENT_METHODS.map(method=><button key={method} onClick={()=>setPaymentMethod(method)} className="py-2.5 rounded-xl text-xs font-bold" style={{background:paymentMethod===method?CC:"#EEE9D8",color:paymentMethod===method?"#fff":"#6b7280"}}>{PM_ICON[method]} {method}</button>)}</div>
          </Field>
          <Field label="DATE DU PAIEMENT"><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} className={inputCls}/></Field>
          {paymentDone ? <div className="rounded-2xl p-4 text-center" style={{background:SEM.success.bg,color:SEM.success.accent}}><div className="flex items-center justify-center gap-2 font-black"><CheckCircle size={20}/> Versement enregistré</div>{paymentSummary&&<p className="mt-1 text-xs font-semibold">{paymentSummary.applied>0&&`${fmt(paymentSummary.applied)} réglé`}{paymentSummary.applied>0&&paymentSummary.advance>0&&" · "}{paymentSummary.advance>0&&`${fmt(paymentSummary.advance)} ajouté à l'avoir`}</p>}</div> : <SubmitBtn color={SEM.success.accent} label={submittingPayment?"Enregistrement…":`Enregistrer ${fmt(Number(paymentAmount)||0)}`} onClick={submitClientPayment} disabled={submittingPayment||!Number(paymentAmount)}/>}
        </Modal>}
        {termsModalClient&&<Modal title="Délai de paiement client" color={CC} onClose={()=>!savingTerms&&setTermsModalClient(null)}>
          <p className="mb-3 text-xs text-muted-foreground">Laissez vide pour reprendre le délai par défaut de la boutique ({defaultPaymentTermsDays} jours). Ce réglage s’applique aux prochaines factures B2B ou grossistes.</p>
          <Field label="DÉLAI EN JOURS"><input type="number" min="0" max="3650" value={termsDraft} onChange={event=>setTermsDraft(event.target.value)} placeholder={String(defaultPaymentTermsDays)} className={inputCls}/></Field>
          <SubmitBtn color={CC} label={savingTerms?"Enregistrement…":"Enregistrer le délai"} onClick={saveClientTerms} disabled={savingTerms}/>
        </Modal>}
        {cancelInvoice&&<Modal title="Annuler la commande" color="#ef4444" onClose={()=>!cancellingInvoice&&setCancelInvoice(null)}>
          <p className="text-sm text-muted-foreground">Es-tu sûr de vouloir annuler cette commande&nbsp;? Elle sera conservée avec le statut <strong>Annulée</strong>.</p>
          <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm font-bold">{cancelInvoice.id} · {fmt(cancelInvoice.montant)}</div>
          <Field label="MOTIF D’ANNULATION (optionnel)" color="#ef4444"><input value={cancelReason} onChange={event=>setCancelReason(event.target.value)} placeholder="Erreur de saisie, doublon, client a annulé…" className={inputCls}/></Field>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setCancelInvoice(null)} disabled={cancellingInvoice} className="rounded-xl bg-muted py-3 text-sm font-black disabled:opacity-50">Conserver</button><button type="button" onClick={()=>void confirmClientCancellation()} disabled={cancellingInvoice} className="rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50">{cancellingInvoice?"Annulation…":"Oui, annuler"}</button></div>
        </Modal>}
      </div>
    );
  }

  return (
    <div data-screen-source="relational-clients" className="space-y-4 pb-24">
      <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un client…" className={searchInputCls+" pl-9"}/></div>
      <div className="flex bg-card rounded-2xl p-1 border border-border gap-1">
        {tabDefs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="flex-1 py-2.5 rounded-xl text-xs font-bold relative" style={{ background:tab===t.id?t.color:"transparent", color:tab===t.id?"#fff":"#6b7280" }}>
            {t.label.split(" ").slice(1).join(" ")}
            <span className="ml-1 text-xs opacity-70">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {/* B2B: boutiques grouped by owner — only same-owner siblings */}
      {tab==="B2B" && (() => {
        // Only show boutiques that share the same Propriétaire (siblings), never other tenants
        const visibleBoutiques = siblings; // getSiblings already excludes current boutique
        const ownerMap = new Map<string, { owner: PlatformUser; boutiques: Boutique[] }>();
        visibleBoutiques.forEach(b => {
          const owner = platformUsers.find(u => u.assignments.some(a => a.boutiqueId === b.id && a.role === "Propriétaire"));
          if (!owner) return;
          if (!ownerMap.has(owner.id)) ownerMap.set(owner.id, { owner, boutiques: [] });
          ownerMap.get(owner.id)!.boutiques.push(b);
        });
        const groups = Array.from(ownerMap.values());
        const isSelf = (ownerId: string) => platformUsers.find(u => u.id === ownerId)?.assignments.some(a => a.boutiqueId === boutique.id && a.role === "Propriétaire");
        if (groups.length === 0) return null;
        return (
          <div className="space-y-4">
            {groups.map(({ owner, boutiques: bouts }) => {
              const self = isSelf(owner.id);
              const color = self ? "#a855f7" : "#3b82f6";
              const totalCA = bouts.reduce((s, b) => s + boutique.invoices.filter(inv => inv.client === b.nom).reduce((ss, inv) => ss + inv.montant, 0), 0);
              const lastInv = boutique.invoices.filter(inv => bouts.some(b => b.nom === inv.client)).sort((a,b) => b.date.localeCompare(a.date))[0];
              return (
                <div key={owner.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: color+"33" }}>
                  {/* Owner header */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: color+"0f" }}>
                    <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: owner.color }}>
                      {owner.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{owner.nom}</p>
                      <p className="text-xs" style={{ color }}>{bouts.length} boutique{bouts.length>1?"s":""} · {self?"Mon réseau":"Réseau externe"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-base" style={{ color, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalCA)}</p>
                      {lastInv && <p className="text-xs text-muted-foreground">{formatPreciseDateTime(lastInv.dateRaw) === "—" ? lastInv.date : formatPreciseDateTime(lastInv.dateRaw)}</p>}
                    </div>
                  </div>
                  {/* Each boutique row */}
                  <div className="divide-y" style={{ borderColor: color+"1a" }}>
                    {bouts.map(b => {
                      const ca = boutique.invoices.filter(inv=>inv.client===b.nom).reduce((s,inv)=>s+inv.montant,0);
                      const invCount = boutique.invoices.filter(inv=>inv.client===b.nom).length;
                      const lastB = boutique.invoices.filter(inv=>inv.client===b.nom).sort((a,x)=>x.date.localeCompare(a.date))[0];
                      return (
                        <div key={b.id} className="flex items-center gap-3 px-4 py-3 bg-card">
                          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{b.nom}</p>
                            <div className="flex items-center gap-1.5"><MapPin size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-sm" style={{ color, fontFamily:"'Nunito', sans-serif" }}>{fmt(ca)}</p>
                            <p className="text-xs text-muted-foreground">{invCount} facture{invCount!==1?"s":""}{lastB ? " · " + (formatPreciseDateTime(lastB.dateRaw) === "—" ? lastB.date : formatPreciseDateTime(lastB.dateRaw)) : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {self && (
                    <div className="flex items-center gap-1.5 px-4 py-2" style={{ background:color+"0a" }}>
                      <Store size={11} style={{ color }}/>
                      <span className="text-xs" style={{ color }}>Transferts inter-tenant disponibles via Factures</span>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1" style={{ background:"rgba(0,0,0,0.08)" }}/>
                <p className="text-xs font-black tracking-wider text-muted-foreground">CLIENTS EXTERNES</p>
                <div className="h-px flex-1" style={{ background:"rgba(0,0,0,0.08)" }}/>
              </div>
            )}
          </div>
        );
      })()}

      <div className="space-y-2">
        {filtered.map(c=>{
          const CC = clientColor(c.type);
          const clientInvoices = boutique.invoices.filter(inv => inv.clientId === c.id);
          const invCount = clientInvoices.length;
          const montantDu = clientInvoices.reduce((s,inv)=>s+invoiceRemainingAmount(inv),0);
          return (
          <button key={c.id} onClick={()=>openClientDetail(c)} className="w-full bg-card rounded-2xl p-3.5 border border-border text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:CC+"22",color:CC,fontFamily:"'Nunito',sans-serif" }}>{ini(c.nom)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{c.nom}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {c.tel&&<div className="flex items-center gap-1"><Phone size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.tel}</span></div>}
                  {c.ville&&<div className="flex items-center gap-1"><MapPin size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.ville}</span></div>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-sm" style={{ color: montantDu>0?SEM.warning.accent:SEM.neutral.accent, fontFamily:"'Nunito',sans-serif" }}>{fmt(montantDu)}</p>
                <p className="text-xs text-muted-foreground">{montantDu>0?"dû · ":""}{invCount} fact.</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground flex-shrink-0"/>
            </div>
          </button>
          );
        })}
      </div>
      {(tab !== "B2B" || canCreateB2B) && (
        <button onClick={()=>{ setType(tab); setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:boutique.color, boxShadow:"0 0 24px "+boutique.color+"60" }}><Plus size={28} color="white" strokeWidth={2.5}/></button>
      )}
      {tab === "B2B" && !canCreateB2B && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted text-xs text-muted-foreground">
          <Lock size={13}/> Seul le Super Admin peut créer des entreprises B2B.
        </div>
      )}
      {modal&&<Modal title="Nouveau client" color="#374151" onClose={()=>setModal(false)}>
        <Field label="TYPE">
          <div className="grid grid-cols-3 gap-2">{tabDefs.filter(t => t.id !== "B2B" || canCreateB2B).map(t=><button key={t.id} onClick={()=>setType(t.id)} className="py-3 rounded-xl text-xs font-bold" style={{ background:type===t.id?t.color:"#EEE9D8", color:type===t.id?"#fff":"#6b7280" }}>{t.label}</button>)}</div>
        </Field>
        <Field label="NOM"><input value={nom} onChange={e=>setNom(e.target.value)} placeholder={type==="B2C"?"Ex: Aminata Koné":type==="Grossiste"?"Ex: Diallo Distribution":"Ex: Boutique SARL"} className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/>
        <Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls}/></Field>
        <Field label="ADRESSE (optionnel)"><input value={adresse} onChange={e=>setAdresse(e.target.value)} placeholder="Ex: 12 Rue Vincens" className={inputCls}/></Field>
        <Field label="E-MAIL (optionnel)"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="exemple@email.com" type="email" className={inputCls}/></Field>
        {type==="Grossiste"&&<Field label="PERSONNE DE CONTACT (optionnel)"><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Nom du contact chez le grossiste" className={inputCls}/></Field>}
        <SubmitBtn color={boutique.color} label="Enregistrer le client" onClick={submit}/>
      </Modal>}
    </div>
  );
}
