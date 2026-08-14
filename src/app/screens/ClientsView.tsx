import React, { useState } from "react";
import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft, FilePlus2, Wallet, CheckCircle } from "lucide-react";
import type { Boutique, Client, ClientType, Invoice, PaymentMethod, PlatformUser } from "../types";
import { SEM, inputCls } from "../constants";
import { fmt, today, ini } from "../utils/formatting";
import { invBadge } from "../utils/inventory";
import { PAYMENT_METHODS, PM_ICON } from "../constants";
import { getSiblings } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createClient, recordClientPayment } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";
import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";

export function ClientsView({ boutique, allBoutiques, platformUsers, currentUser, onUpdate, logAction, initialTab, onOpenInvoice, onCreateInvoice }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[];
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialTab?: ClientType;
  onOpenInvoice: (invoiceId: string) => void;
  onCreateInvoice: (client: Client) => void;
}) {
  const { clients } = boutique;
  const canCreateB2B = currentUser.isSuperAdmin;
  const [tab, setTab] = useState<ClientType>(initialTab ?? "B2C");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [nom,setNom]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState(""); const [ville,setVille]=useState(""); const [type,setType]=useState<ClientType>("B2C");
  const [adresse,setAdresse]=useState(""); const [email,setEmail]=useState(""); const [contact,setContact]=useState("");
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);
  const filtered = clients.filter(c=>c.type===tab&&(c.nom.toLowerCase().includes(search.toLowerCase())||c.tel.includes(search)||c.ville.toLowerCase().includes(search.toLowerCase())));
  const counts = { "B2C":clients.filter(c=>c.type==="B2C").length, "B2B":clients.filter(c=>c.type==="B2B").length, "Grossiste":clients.filter(c=>c.type==="Grossiste").length };
  async function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim() ? dialCode + " " + tel.trim() : "";
    let persisted;
    try { persisted = await createClient({ boutiqueId:boutique.id,name:nom.trim(),type:type === "Grossiste" ? "B2B" : type,phone:fullTel,email:email.trim() || undefined,city:ville.trim() || undefined }); }
    catch (error) { alert(error instanceof Error ? error.message : "Création du client impossible"); return; }
    onUpdate({ clients:[...clients,{ id:persisted.client_id, nom:nom.trim(), type, tel:fullTel, total:0, last:today(), ville:ville.trim(), adresse:adresse.trim()||undefined, email:email.trim()||undefined, contact:contact.trim()||undefined }] });
    logAction("Nouveau client",`${nom.trim()} (${type}) · ${ville.trim()}`,"👥");
    setNom(""); setDialCode("+221"); setTel(""); setVille(""); setAdresse(""); setEmail(""); setContact(""); setModal(false);
  }
  const [detailClient, setDetailClient] = useState<Client|null>(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Espèces");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const tabDefs: Array<{id:ClientType;label:string;color:string}> = [
    {id:"B2C",      label:"👤 Particuliers", color:"#374151"},
    {id:"B2B",      label:"🏢 Entreprises",  color:"#0e7490"},
    {id:"Grossiste",label:"📦 Grossistes",   color:"#6d28d9"},
  ];
  const clientColor = (t: ClientType) => t==="Grossiste"?"#6d28d9":t==="B2B"?"#0e7490":"#374151";

  // Client accounting detail modal
  if (detailClient) {
    const c = detailClient;
    const CC = clientColor(c.type);
    const normalizedPhone = (value?: string) => (value ?? "").replace(/\D/g, "");
    const clientInvoices = boutique.invoices.filter(inv =>
      inv.clientId === c.id
      || (normalizedPhone(c.tel) && normalizedPhone(inv.clientTel) === normalizedPhone(c.tel))
      || inv.client.trim().toLowerCase() === c.nom.trim().toLowerCase()
    ).sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date));
    const totalFacturé  = clientInvoices.reduce((s,i)=>s+i.montant,0);
    const totalEncaissé = clientInvoices.reduce((s,i)=>s+invoicePaidAmount(i),0);
    const totalImpayé   = clientInvoices.reduce((s,i)=>s+invoiceRemainingAmount(i),0);
    const nbVentes = clientInvoices.filter(i=>invoicePaidAmount(i)>0).length;
    const panierMoyen = nbVentes>0?totalEncaissé/nbVentes:0;
    const retours = clientInvoices.filter(i=>i.type==="Retour");
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);

    // Monthly breakdown
    const byMonth: Record<string,{facturé:number;encaissé:number}> = {};
    clientInvoices.forEach(inv=>{
      const m = (inv.dateRaw??"").slice(0,7) || inv.date.slice(-7);
      if (!byMonth[m]) byMonth[m]={facturé:0,encaissé:0};
      byMonth[m].facturé += inv.montant;
      byMonth[m].encaissé += invoicePaidAmount(inv);
    });
    const months = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
    const clientPayments = clientInvoices.flatMap(inv => (inv.payments ?? []).map(payment => ({ ...payment, invoiceId:inv.id })))
      .sort((a,b)=>b.paidAt.localeCompare(a.paidAt));

    async function submitClientPayment() {
      if (submittingPayment || totalImpayé <= 0) return;
      const requested = Number(paymentAmount) || 0;
      if (requested <= 0) return;
      setSubmittingPayment(true);
      try {
        const result = await recordClientPayment({
          boutiqueId:boutique.id,
          clientId:c.id,
          amount:Math.min(requested, totalImpayé),
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
        onUpdate({ invoices:updatedInvoices });
        logAction("Versement client", `${c.nom} · ${fmt(result.applied_amount)} · FIFO sur ${result.allocations.length} facture(s)`, "💳");
        setPaymentDone(true);
        setTimeout(() => {
          setPaymentModal(false); setPaymentAmount(""); setPaymentDone(false); setSubmittingPayment(false);
        }, 1000);
      } catch (error) {
        setSubmittingPayment(false);
        alert(error instanceof Error ? error.message : "Versement impossible");
      }
    }

    return (
      <div className="space-y-4 pb-24">
        <button onClick={()=>setDetailClient(null)} className="flex items-center gap-2 text-muted-foreground active:opacity-70">
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
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={()=>onCreateInvoice(c)} className="py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2" style={{ background:CC, color:"#fff" }}>
              <FilePlus2 size={15}/> Nouvelle facture
            </button>
            <button onClick={()=>{setPaymentAmount(String(totalImpayé));setPaymentModal(true);}} disabled={totalImpayé<=0} className="py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{ background:SEM.success.bg, color:SEM.success.accent }}>
              <Wallet size={15}/> Versement
            </button>
          </div>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {label:"CA Facturé",val:fmt(totalFacturé),color:CC,sub:`${clientInvoices.length} factures`},
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
        {clientPayments.length>0&&<div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">HISTORIQUE DES PAIEMENTS</p>
          <div className="space-y-2">
            {clientPayments.slice(0,20).map(payment=><div key={`${payment.invoiceId}-${payment.id}`} className="flex items-center justify-between gap-3 text-xs">
              <div><p className="font-bold">{payment.invoiceId} · {payment.paymentMethod}</p><p className="text-muted-foreground">{formatPreciseDateTime(payment.paidAt)} · {payment.operatorName}</p></div>
              <p className="font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p>
            </div>)}
          </div>
        </div>}
        {/* All invoices */}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">TOUTES LES TRANSACTIONS</p>
          <div className="space-y-2">
            {clientInvoices.length===0&&<p className="text-sm text-muted-foreground text-center py-6">Aucune transaction</p>}
            {clientInvoices.map(inv=>{
              const [tc,bc]=invBadge(inv.status);
              const isReturn=inv.type==="Retour";
              const paid = invoicePaidAmount(inv);
              const remaining = invoiceRemainingAmount(inv);
              return <button type="button" onClick={()=>onOpenInvoice(inv.id)} key={inv.id} className="w-full bg-card rounded-2xl p-3.5 border border-border flex items-center gap-3 text-left active:scale-[0.99]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-muted-foreground">{inv.id}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold capitalize" style={{ background:bc,color:tc }}>{inv.status}</span>
                    {isReturn&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#ef444415",color:"#ef4444" }}>Retour</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.date} · {inv.type}</p>
                  {inv.paymentMethod&&<p className="text-xs text-muted-foreground">{PM_ICON[inv.paymentMethod]} {inv.paymentMethod}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-sm" style={{ fontFamily:"'Nunito',sans-serif" }}>{fmt(inv.montant)}</p>
                  {paid>0&&<p className="text-xs font-semibold" style={{ color:SEM.success.accent }}>✓ {fmt(paid)}</p>}
                  {remaining>0&&<p className="text-xs font-semibold" style={{ color:SEM.warning.accent }}>⏳ {fmt(remaining)}</p>}
                </div>
                <ChevronRight size={15} className="text-muted-foreground"/>
              </button>;
            })}
          </div>
        </div>
        {paymentModal&&<Modal title="Versement client" color={SEM.success.accent} onClose={()=>{if(!submittingPayment)setPaymentModal(false);}}>
          <div className="rounded-2xl p-3" style={{background:SEM.success.bg}}>
            <p className="text-xs text-muted-foreground">Solde global dû</p>
            <p className="text-2xl font-black" style={{color:SEM.success.accent}}>{fmt(totalImpayé)}</p>
            <p className="text-xs text-muted-foreground mt-1">Le versement sera affecté aux factures les plus anciennes en premier.</p>
          </div>
          <Field label="MONTANT">
            <input value={paymentAmount} onChange={e=>setPaymentAmount(String(Math.min(Number(e.target.value)||0,totalImpayé)))} type="number" min="0" max={totalImpayé} className={inputCls}/>
          </Field>
          <Field label="MODE DE PAIEMENT">
            <div className="grid grid-cols-2 gap-2">{PAYMENT_METHODS.map(method=><button key={method} onClick={()=>setPaymentMethod(method)} className="py-2.5 rounded-xl text-xs font-bold" style={{background:paymentMethod===method?CC:"#EEE9D8",color:paymentMethod===method?"#fff":"#6b7280"}}>{PM_ICON[method]} {method}</button>)}</div>
          </Field>
          <Field label="DATE DU PAIEMENT"><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} className={inputCls}/></Field>
          {paymentDone?<div className="flex items-center justify-center gap-2 py-4 font-black" style={{color:SEM.success.accent}}><CheckCircle size={20}/> Versement enregistré</div>:<SubmitBtn color={SEM.success.accent} label={submittingPayment?"Enregistrement…":`Enregistrer ${fmt(Math.min(Number(paymentAmount)||0,totalImpayé))}`} onClick={submitClientPayment} disabled={submittingPayment||!Number(paymentAmount)||totalImpayé<=0}/>}
        </Modal>}
      </div>
    );
  }

  return (
    <div data-screen-source="relational-clients" className="space-y-4 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un client…" className={inputCls+" pl-11"}/></div>
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
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: owner.color }}>
                      {owner.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{owner.nom}</p>
                      <p className="text-xs" style={{ color }}>{bouts.length} boutique{bouts.length>1?"s":""} · {self?"Mon réseau":"Réseau externe"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-base" style={{ color, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalCA)}</p>
                      {lastInv && <p className="text-xs text-muted-foreground">{lastInv.date}</p>}
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
                            <p className="text-xs text-muted-foreground">{invCount} facture{invCount!==1?"s":""}{lastB ? " · " + lastB.date.split(" · ")[0] : ""}</p>
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
          const invCount = boutique.invoices.filter(i=>i.client===c.nom).length;
          return (
          <button key={c.id} onClick={()=>setDetailClient(c)} className="w-full bg-card rounded-2xl p-3.5 border border-border text-left active:scale-[0.98] transition-transform">
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
                <p className="font-black text-sm" style={{ color:CC,fontFamily:"'Nunito',sans-serif" }}>{fmt(c.total)}</p>
                <p className="text-xs text-muted-foreground">{invCount} fact.</p>
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
