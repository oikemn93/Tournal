import React, { useState } from "react";
import { Search, MapPin, Phone, ChevronRight, Plus, Edit2, Wallet, CheckCircle, Mail, UserRound } from "lucide-react";
import type { Boutique, Charge, PaymentMethod, Supplier } from "../types";
import { PAYMENT_METHODS, PM_ICON, SEM, SUP_COLORS, inputCls } from "../constants";
import { fmt, today, ini, imgSrc } from "../utils/formatting";
import { supplierBalance } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createSupplier, recordSupplierPayment, updateSupplier } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";

function isSupplierRecord(record: { supplierId?: number; fournisseur?: string }, supplier: Supplier) {
  return record.supplierId === supplier.id || (record.supplierId == null && record.fournisseur === supplier.nom);
}

export function FournisseursView({ boutique, onUpdate, logAction, canPaySupplier }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  canPaySupplier: boolean;
}) {
  const { suppliers, products, entries } = boutique;
  const charges = boutique.charges ?? [];
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<number|null>(null);
  const [modal,setModal]=useState(false);
  const [nom,setNom]=useState(""); const [ville,setVille]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState("");
  const [editSupplier,setEditSupplier]=useState<Supplier|null>(null);
  const [editName,setEditName]=useState(""); const [editCity,setEditCity]=useState(""); const [editPhone,setEditPhone]=useState(""); const [editEmail,setEditEmail]=useState(""); const [editContact,setEditContact]=useState(""); const [savingEdit,setSavingEdit]=useState(false);
  const [paymentSupplier,setPaymentSupplier]=useState<Supplier|null>(null);
  const [paymentAmount,setPaymentAmount]=useState(""); const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>("Espèces"); const [paymentNote,setPaymentNote]=useState(""); const [paying,setPaying]=useState(false); const [paymentDone,setPaymentDone]=useState(false);

  async function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim() ? `${dialCode} ${tel.trim()}` : "";
    let persisted;
    try { persisted = await createSupplier({ boutiqueId:boutique.id,name:nom.trim(),phone:fullTel || undefined,city:ville.trim() || undefined }); }
    catch (error) { alert(error instanceof Error ? error.message : "Création du fournisseur impossible"); return; }
    onUpdate({ suppliers:[...suppliers,{ id:persisted.supplier_id, nom:nom.trim(), ville:ville.trim(), lastDelivery:today(), tel:fullTel, initials:ini(nom.trim()), color:SUP_COLORS[suppliers.length%SUP_COLORS.length] }] });
    logAction("Nouveau fournisseur",`${nom.trim()} · ${ville.trim()}`,"🚛");
    setNom(""); setVille(""); setDialCode("+221"); setTel(""); setModal(false);
  }

  function openEdit(supplier: Supplier) {
    setEditSupplier(supplier); setEditName(supplier.nom); setEditCity(supplier.ville); setEditPhone(supplier.tel); setEditEmail(supplier.email ?? ""); setEditContact(supplier.contact ?? "");
  }

  async function saveSupplierEdit() {
    const supplier = editSupplier;
    if (!supplier || !editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateSupplier({ boutiqueId:boutique.id, supplierId:supplier.id, name:editName.trim(), city:editCity.trim() || undefined, phone:editPhone.trim() || undefined, email:editEmail.trim() || undefined, contact:editContact.trim() || undefined });
      const updated: Supplier = { ...supplier, nom:editName.trim(), ville:editCity.trim(), tel:editPhone.trim(), email:editEmail.trim() || undefined, contact:editContact.trim() || undefined, initials:ini(editName.trim()) };
      onUpdate({
        suppliers:suppliers.map(s=>s.id===supplier.id?updated:s),
        products:products.map(product=>product.fournisseur===supplier.nom?{...product,fournisseur:updated.nom}:product),
        entries:entries.map(entry=>isSupplierRecord(entry,supplier)?{...entry,fournisseur:updated.nom,supplierId:supplier.id}:entry),
        charges:charges.map(charge=>isSupplierRecord(charge,supplier)?{...charge,fournisseur:updated.nom,supplierId:supplier.id}:charge),
      });
      logAction("Fournisseur modifié", updated.nom, "✏️");
      setEditSupplier(null);
    } catch (error) { alert(error instanceof Error ? error.message : "Modification du fournisseur impossible"); }
    finally { setSavingEdit(false); }
  }

  async function paySupplier() {
    const supplier = paymentSupplier;
    const due = supplier ? supplierBalance(supplier, entries, charges) : 0;
    const requested = Number(paymentAmount);
    if (!supplier || paying || !Number.isFinite(requested) || requested <= 0 || due <= 0) return;
    setPaying(true);
    try {
      const result = await recordSupplierPayment({ boutiqueId:boutique.id, supplierId:supplier.id, amount:Math.min(requested,due), paymentMethod, note:paymentNote.trim() || undefined });
      const newCharge: Charge = {
        id:result.charge_id, label:`Versement fournisseur · ${supplier.nom}`, montant:result.applied_amount,
        date:new Date(result.paid_at).toLocaleDateString("fr-FR"), dateRaw:result.paid_at,
        categorie:"Achat stock", recurrence:"unique", fournisseur:supplier.nom, supplierId:supplier.id,
        paymentMethod:result.payment_method as PaymentMethod, status:"paid", paidAmount:result.applied_amount, source:"supplier_payment", note:paymentNote.trim() || undefined,
      };
      onUpdate({ charges:[...charges,newCharge] });
      logAction("Versement fournisseur", `${supplier.nom} · ${fmt(result.applied_amount)} · ${result.payment_method}`, "💳");
      setPaymentDone(true);
      setTimeout(()=>{ setPaymentSupplier(null); setPaymentAmount(""); setPaymentNote(""); setPaymentDone(false); }, 900);
    } catch (error) { alert(error instanceof Error ? error.message : "Versement fournisseur impossible"); }
    finally { setPaying(false); }
  }

  const filteredSuppliers = suppliers.filter(s=>s.nom.toLowerCase().includes(search.toLowerCase())||s.ville.toLowerCase().includes(search.toLowerCase()));

  return (
    <div data-screen-source="relational-suppliers" className="space-y-3 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un fournisseur…" className={inputCls+" pl-11"}/></div>
      {filteredSuppliers.map(s=>{
        const isOpen=expanded===s.id;
        const balance=supplierBalance(s,entries,charges);
        const receipts=entries.filter(e=>isSupplierRecord(e,s)&&e.qty>0&&e.movementType!=="retour").sort((a,b)=>b.id-a.id);
        const transferPurchases=charges.filter(c=>c.source==="transfer"&&isSupplierRecord(c,s)).sort((a,b)=>b.id-a.id);
        const manualPayments=charges.filter(c=>c.source!=="transfer"&&isSupplierRecord(c,s)).sort((a,b)=>b.id-a.id);
        const transferPayments=transferPurchases.filter(c=>Number(c.paidAmount??0)>0);
        const payments=[...manualPayments,...transferPayments].sort((a,b)=>b.id-a.id);
        return <div key={s.id} className="bg-card rounded-2xl border border-border overflow-hidden">
          <button className="w-full flex items-center gap-3 p-4 text-left" onClick={()=>setExpanded(isOpen?null:s.id)}>
            <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:s.color+"22", color:s.color, fontFamily:"'Nunito', sans-serif" }}>{s.initials}</div>
            <div className="flex-1 min-w-0"><p className="font-bold">{s.nom}</p><div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{s.ville || "—"}</span></div></div>
            <div className="text-right mr-1"><p className="text-sm font-black" style={{ color:balance>0?"#ef4444":"#16a34a", fontFamily:"'Nunito', sans-serif" }}>{balance>0?fmt(balance):"Soldé"}</p><p className="text-xs text-muted-foreground">{receipts.length} réception{receipts.length!==1?"s":""}</p></div>
            <ChevronRight size={16} className="text-muted-foreground transition-transform duration-200" style={{ transform:isOpen?"rotate(90deg)":"rotate(0deg)" }}/>
          </button>
          {isOpen&&<div className="border-t border-border">
            <div className="px-4 py-3 border-b border-border space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {s.tel&&<span className="flex items-center gap-1.5 font-semibold" style={{color:s.color}}><Phone size={14}/>{s.tel}</span>}
                {s.email&&<span className="flex items-center gap-1.5 text-muted-foreground"><Mail size={14}/>{s.email}</span>}
                {s.contact&&<span className="flex items-center gap-1.5 text-muted-foreground"><UserRound size={14}/>{s.contact}</span>}
                {balance>0&&<span className="ml-auto px-3 py-1.5 rounded-xl text-xs font-black" style={{ background:"#ef444422", color:"#ef4444" }}>DOIT : {fmt(balance)}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>openEdit(s)} className="rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-2" style={{background:s.color+"18",color:s.color}}><Edit2 size={14}/> Modifier</button>
                <button onClick={()=>{setPaymentSupplier(s);setPaymentAmount(String(balance));setPaymentNote("");}} disabled={!canPaySupplier||balance<=0} className="rounded-xl py-2.5 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:SEM.success.bg,color:SEM.success.text}}><Wallet size={14}/> Payer</button>
              </div>
              {!canPaySupplier&&balance>0&&<p className="text-xs text-muted-foreground">Le droit « Charges » est nécessaire pour enregistrer un versement.</p>}
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">RÉCEPTIONS DE STOCK</p>
              {receipts.length>0?<div className="space-y-2">{receipts.map(e=>{const product=products.find(p=>p.id===e.productId);return <div key={e.id} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">{product&&<div className="w-10 h-10 rounded-lg overflow-hidden"><img src={imgSrc(product.img,80,80)} alt={product.nom} className="w-full h-full object-cover"/></div>}<div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{product?.nom ?? "Produit"}</p><p className="text-xs text-muted-foreground">{e.qty} {e.unit} · {e.date}</p></div><p className="text-sm font-black" style={{color:"#C9A227",fontFamily:"'Nunito',sans-serif"}}>{fmt(e.montantDu)}</p></div>;})}</div>:<p className="text-sm text-muted-foreground">Aucune réception liée à cette fiche</p>}
            </div>
            {transferPurchases.length>0&&<div className="px-4 pb-3 border-t border-border"><p className="text-xs font-black tracking-wider mb-3 mt-3" style={{color:"#ea580c"}}>ACHATS PAR TRANSFERT</p><div className="space-y-2">{transferPurchases.map(c=>{const paid=Number(c.paidAmount??0); const due=Math.max(0,c.montant-paid);return <div key={c.id} className="rounded-xl px-3 py-2.5" style={{background:"#fff7ed"}}><div className="flex items-center justify-between"><p className="text-sm font-bold">{c.label}</p><p className="text-sm font-black" style={{color:"#ea580c"}}>{fmt(c.montant)}</p></div><div className="flex items-center justify-between mt-1 text-xs text-muted-foreground"><span>{c.date}</span><span>Réglé {fmt(paid)} · Reste {fmt(due)}</span></div></div>;})}</div></div>}
            {payments.length>0&&<div className="px-4 pb-3 border-t border-border"><p className="text-xs font-black tracking-wider mb-3 mt-3" style={{color:SEM.success.text}}>PAIEMENTS EFFECTUÉS</p><div className="space-y-2">{payments.map(c=>{const paid=c.source==="transfer"?Number(c.paidAmount??0):c.montant;return <div key={`${c.id}-${c.source}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{background:SEM.success.bg}}><div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:SEM.success.accent}}/><div className="flex-1 min-w-0"><p className="text-sm font-bold">{c.label}</p><p className="text-xs text-muted-foreground">{c.date}{c.paymentMethod?` · ${PM_ICON[c.paymentMethod] ?? "💳"} ${c.paymentMethod}`:""}</p></div><p className="text-sm font-black" style={{color:SEM.success.text,fontFamily:"'Nunito',sans-serif"}}>−{fmt(paid)}</p></div>;})}</div></div>}
          </div>}
        </div>;
      })}
      <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{background:boutique.color,boxShadow:"0 0 24px "+boutique.color+"60"}}><Plus size={28} color="white" strokeWidth={2.5}/></button>
      {modal&&<Modal title="Nouveau fournisseur" color="#374151" onClose={()=>setModal(false)}><Field label="NOM"><input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Konaté Tissus" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field><Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls}/></Field><PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/><SubmitBtn color={boutique.color} label="Enregistrer le fournisseur" onClick={submit}/></Modal>}
      {editSupplier&&<Modal title="Modifier le fournisseur" color={editSupplier.color} onClose={()=>!savingEdit&&setEditSupplier(null)}><Field label="NOM"><input value={editName} onChange={e=>setEditName(e.target.value)} className={inputCls} autoFocus/></Field><Field label="VILLE"><input value={editCity} onChange={e=>setEditCity(e.target.value)} className={inputCls}/></Field><Field label="TÉLÉPHONE"><input value={editPhone} onChange={e=>setEditPhone(e.target.value)} type="tel" className={inputCls}/></Field><Field label="E-MAIL (optionnel)"><input value={editEmail} onChange={e=>setEditEmail(e.target.value)} type="email" className={inputCls}/></Field><Field label="PERSONNE DE CONTACT (optionnel)"><input value={editContact} onChange={e=>setEditContact(e.target.value)} className={inputCls}/></Field><SubmitBtn color={editSupplier.color} label={savingEdit?"Enregistrement…":"Enregistrer les modifications"} onClick={saveSupplierEdit} disabled={savingEdit||!editName.trim()}/></Modal>}
      {paymentSupplier&&<Modal title="Versement fournisseur" color={SEM.success.accent} onClose={()=>!paying&&setPaymentSupplier(null)}>{(() => { const due=supplierBalance(paymentSupplier,entries,charges); return <><div className="rounded-2xl p-3" style={{background:SEM.success.bg}}><p className="font-black">{paymentSupplier.nom}</p><p className="text-xs text-muted-foreground mt-1">Solde dû : {fmt(due)}</p><p className="text-xs text-muted-foreground mt-1">Une charge sera créée automatiquement dans le suivi financier.</p></div><Field label="MONTANT"><input value={paymentAmount} onChange={e=>setPaymentAmount(String(Math.min(Number(e.target.value)||0,due)))} type="number" min="0" max={due} className={inputCls}/></Field><Field label="MODE DE PAIEMENT"><div className="grid grid-cols-2 gap-2">{PAYMENT_METHODS.map(method=><button key={method} type="button" onClick={()=>setPaymentMethod(method)} className="py-2.5 rounded-xl text-xs font-bold" style={{background:paymentMethod===method?SEM.success.accent:"#EEE9D8",color:paymentMethod===method?"#fff":"#6b7280"}}>{PM_ICON[method]} {method}</button>)}</div></Field><Field label="NOTE (optionnel)"><input value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} className={inputCls} placeholder="Référence de paiement…"/></Field>{paymentDone?<div className="flex items-center justify-center gap-2 py-4 font-black" style={{color:SEM.success.accent}}><CheckCircle size={20}/> Versement enregistré</div>:<SubmitBtn color={SEM.success.accent} label={paying?"Enregistrement…":`Payer ${fmt(Math.min(Number(paymentAmount)||0,due))}`} onClick={paySupplier} disabled={paying||!Number(paymentAmount)||due<=0}/>}</>; })()}</Modal>}
    </div>
  );
}
