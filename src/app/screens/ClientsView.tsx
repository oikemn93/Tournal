import React, { useState } from "react";
import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft } from "lucide-react";
import type { Boutique, Client, ClientType, PlatformUser } from "../types";
import { SEM, inputCls } from "../constants";
import { fmt, today, ini } from "../utils/formatting";
import { invBadge } from "../utils/inventory";
import { PAYMENT_METHODS, PM_ICON } from "../constants";
import { getSiblings } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createClient } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";

export function ClientsView({ boutique, allBoutiques, platformUsers, currentUser, onUpdate, logAction, initialTab }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[];
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialTab?: ClientType;
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
    const clientInvoices = boutique.invoices.filter(inv => inv.client === c.nom).sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date));
    const totalFacturé  = clientInvoices.reduce((s,i)=>s+i.montant,0);
    const totalEncaissé = clientInvoices.reduce((s,i)=>s+i.acompte,0);
    const totalImpayé   = totalFacturé - totalEncaissé;
    const nbVentes = clientInvoices.filter(i=>i.acompte>0).length;
    const panierMoyen = nbVentes>0?totalEncaissé/nbVentes:0;
    const retours = clientInvoices.filter(i=>i.type==="Retour");
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);

    // Monthly breakdown
    const byMonth: Record<string,{facturé:number;encaissé:number}> = {};
    clientInvoices.forEach(inv=>{
      const m = (inv.dateRaw??"").slice(0,7) || inv.date.slice(-7);
      if (!byMonth[m]) byMonth[m]={facturé:0,encaissé:0};
      byMonth[m].facturé += inv.montant;
      byMonth[m].encaissé += inv.acompte;
    });
    const months = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);

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
        {/* All invoices */}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">TOUTES LES TRANSACTIONS</p>
          <div className="space-y-2">
            {clientInvoices.length===0&&<p className="text-sm text-muted-foreground text-center py-6">Aucune transaction</p>}
            {clientInvoices.map(inv=>{
              const [tc,bc]=invBadge(inv.status);
              const isReturn=inv.type==="Retour";
              return <div key={inv.id} className="bg-card rounded-2xl p-3.5 border border-border flex items-center gap-3">
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
                  {inv.acompte>0&&<p className="text-xs font-semibold" style={{ color:SEM.success.accent }}>✓ {fmt(inv.acompte)}</p>}
                  {inv.montant-inv.acompte>0&&<p className="text-xs font-semibold" style={{ color:SEM.warning.accent }}>⏳ {fmt(inv.montant-inv.acompte)}</p>}
                </div>
              </div>;
            })}
          </div>
        </div>
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
