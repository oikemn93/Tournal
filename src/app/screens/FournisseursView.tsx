import React, { useState } from "react";
import { Search, MapPin, Phone, ChevronRight, Plus } from "lucide-react";
import type { Boutique } from "../types";
import { SEM, SUP_COLORS, inputCls } from "../constants";
import { fmt, today, ini } from "../utils/formatting";
import { supplierBalance } from "../utils/inventory";
import { imgSrc } from "../utils/formatting";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createSupplier } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";

export function FournisseursView({ boutique, onUpdate, logAction }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const { suppliers, products, entries } = boutique;
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<number|null>(null); const [modal,setModal]=useState(false);
  const [nom,setNom]=useState(""); const [ville,setVille]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState("");
  async function submit() {
    if (!nom.trim()) return;
    let persisted;
    try { persisted = await createSupplier({ boutiqueId:boutique.id,name:nom.trim(),phone:tel.trim() || undefined,city:ville.trim() || undefined }); }
    catch (error) { alert(error instanceof Error ? error.message : "Création du fournisseur impossible"); return; }
    onUpdate({ suppliers:[...suppliers,{ id:persisted.supplier_id, nom:nom.trim(), ville:ville.trim(), lastDelivery:today(), tel:tel.trim(), initials:ini(nom.trim()), color:SUP_COLORS[suppliers.length%SUP_COLORS.length] }] });
    logAction("Nouveau fournisseur",`${nom.trim()} · ${ville.trim()}`,"🚛");
    setNom(""); setVille(""); setTel("+221 "); setModal(false);
  }
  const filteredSuppliers = suppliers.filter(s=>s.nom.toLowerCase().includes(search.toLowerCase())||s.ville.toLowerCase().includes(search.toLowerCase()));

  return (
    <div data-screen-source="relational-suppliers" className="space-y-3 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un fournisseur…" className={inputCls+" pl-11"}/></div>
      {filteredSuppliers.map(s=>{
        const isOpen=expanded===s.id;
        const balance=supplierBalance(s.nom,entries,boutique.charges);
        const se=entries.filter(e=>e.fournisseur===s.nom&&e.qty>0).sort((a,b)=>b.id-a.id);
        const transferPurchases=(boutique.charges??[]).filter(c=>c.source==="transfer"&&c.fournisseur===s.nom).sort((a,b)=>b.id-a.id);
        return (
          <div key={s.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <button className="w-full flex items-center gap-3 p-4 text-left" onClick={()=>setExpanded(isOpen?null:s.id)}>
              <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:s.color+"22", color:s.color, fontFamily:"'Nunito', sans-serif" }}>{s.initials}</div>
              <div className="flex-1 min-w-0"><p className="font-bold">{s.nom}</p><div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{s.ville}</span></div></div>
              <div className="text-right mr-1"><p className="text-sm font-black" style={{ color:balance>0?"#ef4444":"#6b7280", fontFamily:"'Nunito', sans-serif" }}>{balance>0?fmt(balance):"—"}</p><p className="text-xs text-muted-foreground">{se.length+transferPurchases.length} achats/livraisons</p></div>
              <ChevronRight size={16} className="text-muted-foreground transition-transform duration-200" style={{ transform:isOpen?"rotate(90deg)":"rotate(0deg)" }}/>
            </button>
            {isOpen&&<div className="border-t border-border">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:s.color+"22" }}><Phone size={14} style={{ color:s.color }}/></div>
                <span className="text-sm font-semibold" style={{ color:s.color }}>{s.tel||"—"}</span>
                {balance>0&&<div className="ml-auto px-3 py-1.5 rounded-xl" style={{ background:"#ef444422" }}><span className="text-xs font-black" style={{ color:"#ef4444" }}>DOIT: {fmt(balance)}</span></div>}
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">LIVRAISONS</p>
                {se.length > 0 ? (
                  <div className="space-y-2">
                    {se.map(e => {
                      const prod = products.find(p => p.id === e.productId);
                      const prodNom = prod ? prod.nom : "Produit";
                      return (
                        <div key={e.id} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                          {prod && (
                            <div className="w-10 h-10 rounded-lg overflow-hidden">
                              <img src={imgSrc(prod.img,80,80)} alt={prod.nom} className="w-full h-full object-cover"/>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{prodNom}</p>
                            <p className="text-xs text-muted-foreground">{e.qty} {e.unit} · {e.date}</p>
                          </div>
                          <p className="text-sm font-black" style={{ color:"#C9A227", fontFamily:"'Nunito', sans-serif" }}>{fmt(e.montantDu)}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune livraison</p>
                )}
              </div>
              {transferPurchases.length>0&&<div className="px-4 pb-3 border-t border-border">
                <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{color:"#ea580c"}}>ACHATS PAR TRANSFERT</p>
                <div className="space-y-2">{transferPurchases.map(c=>{
                  const paid=Number(c.paidAmount??0); const due=Math.max(0,c.montant-paid);
                  return <div key={c.id} className="rounded-xl px-3 py-2.5" style={{background:"#fff7ed"}}>
                    <div className="flex items-center justify-between"><p className="text-sm font-bold">{c.label}</p><p className="text-sm font-black" style={{color:"#ea580c"}}>{fmt(c.montant)}</p></div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground"><span>{c.date}</span><span>Réglé {fmt(paid)} · Reste {fmt(due)}</span></div>
                  </div>;
                })}</div>
              </div>}
              {(() => {
                const manualPays=(boutique.charges??[]).filter(c=>c.fournisseur===s.nom&&c.source!=="transfer");
                const transferPays=transferPurchases.filter(c=>Number(c.paidAmount??0)>0);
                const pays=[...manualPays,...transferPays].sort((a,b)=>b.id-a.id);
                return pays.length>0?(
                <div className="px-4 pb-3 border-t border-border">
                  <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{ color:SEM.success.text }}>PAIEMENTS EFFECTUÉS</p>
                  <div className="space-y-2">
                    {pays.map(c=>{
                      const paid=c.source==="transfer"?Number(c.paidAmount??0):c.montant;
                      return <div key={`${c.id}-${c.source}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background:SEM.success.bg }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:SEM.success.accent }}/>
                        <div className="flex-1 min-w-0"><p className="text-sm font-bold">{c.label}</p><p className="text-xs text-muted-foreground">{c.date}</p></div>
                        <p className="text-sm font-black" style={{ color:SEM.success.text, fontFamily:"'Nunito',sans-serif" }}>−{fmt(paid)}</p>
                      </div>;
                    })}
                  </div>
                </div>
              ):null; })()}
            </div>}
          </div>
        );
      })}
      <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:boutique.color, boxShadow:"0 0 24px "+boutique.color+"60" }}><Plus size={28} color="white" strokeWidth={2.5}/></button>
      {modal&&<Modal title="Nouveau fournisseur" color="#374151" onClose={()=>setModal(false)}>
        <Field label="NOM"><input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Konaté Tissus" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/>
        <SubmitBtn color={boutique.color} label="Enregistrer le fournisseur" onClick={submit}/>
      </Modal>}
    </div>
  );
}
