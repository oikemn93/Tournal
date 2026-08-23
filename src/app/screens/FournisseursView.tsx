import React, { useState } from "react";
import { ArrowLeft, CalendarClock, CheckCircle, ChevronRight, Download, Edit2, Mail, MapPin, PackageOpen, Phone, Plus, ReceiptText, Search, StickyNote, UserRound, Wallet } from "lucide-react";
import type { Boutique, Charge, PaymentMethod, StockEntry, Supplier } from "../types";
import { PAYMENT_METHODS, PM_ICON, SEM, SUP_COLORS, inputCls } from "../constants";
import { fmt, today, ini, imgSrc } from "../utils/formatting";
import { stockEntrySupplierOutstanding, supplierBalance } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createSupplier, recordSupplierPayment, updateSupplier } from "../../lib/api";
import { PhoneField } from "../components/PhoneField";

function isSupplierRecord(record: { supplierId?: number; fournisseur?: string }, supplier: Supplier) {
  return record.supplierId === supplier.id || (record.supplierId == null && record.fournisseur === supplier.nom);
}
function isoToday() { return new Date().toISOString().slice(0, 10); }
function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function maturityTone(dueDate?: string, paidAmount = 0, amount = 0) {
  if (!dueDate || paidAmount >= amount) return null;
  const days = Math.ceil((new Date(`${dueDate}T00:00:00`).getTime() - new Date(`${isoToday()}T00:00:00`).getTime()) / 86_400_000);
  if (days < 0) return { text:`En retard depuis ${Math.abs(days)} j`, color:"#dc2626", bg:"#fee2e2" };
  if (days <= 3) return { text:days === 0 ? "Échéance aujourd’hui" : `Échéance dans ${days} j`, color:"#b45309", bg:"#fef3c7" };
  return { text:`Échéance le ${new Date(`${dueDate}T00:00:00`).toLocaleDateString("fr-FR")}`, color:"#475569", bg:"#f1f5f9" };
}
function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
type TimelineFilter = "all" | "receipt" | "payment";
type PeriodFilter = "all" | "30" | "365" | "custom";

export function FournisseursView({ boutique, onUpdate, logAction, canPaySupplier, canManageReceipts, onStartReceipt, onCorrectReceipt, defaultPaymentTermsDays = 30 }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  canPaySupplier: boolean; canManageReceipts: boolean;
  onStartReceipt: (supplierId: number) => void;
  onCorrectReceipt: (entry: StockEntry, supplierId: number) => void;
  defaultPaymentTermsDays?: number;
}) {
  const { suppliers, products, entries } = boutique;
  const charges = boutique.charges ?? [];
  const [search,setSearch] = useState("");
  const [selectedSupplierId,setSelectedSupplierId] = useState<number|null>(null);
  const [modal,setModal] = useState(false);
  const [nom,setNom] = useState(""); const [ville,setVille] = useState(""); const [dialCode,setDialCode] = useState("+221"); const [tel,setTel] = useState("");
  const [editSupplier,setEditSupplier] = useState<Supplier|null>(null);
  const [editName,setEditName] = useState(""); const [editCity,setEditCity] = useState(""); const [editPhone,setEditPhone] = useState(""); const [editEmail,setEditEmail] = useState(""); const [editContact,setEditContact] = useState(""); const [editNotes,setEditNotes] = useState(""); const [editTerms,setEditTerms] = useState(""); const [savingEdit,setSavingEdit] = useState(false);
  const [paymentSupplier,setPaymentSupplier] = useState<Supplier|null>(null);
  const [paymentAmount,setPaymentAmount] = useState(""); const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>("Espèces"); const [paymentNote,setPaymentNote] = useState(""); const [paymentDate,setPaymentDate] = useState(isoToday()); const [paying,setPaying] = useState(false); const [paymentDone,setPaymentDone] = useState(false);
  const [timelineFilter,setTimelineFilter] = useState<TimelineFilter>("all");
  const [periodFilter,setPeriodFilter] = useState<PeriodFilter>("all");
  const [periodFrom,setPeriodFrom] = useState(""); const [periodTo,setPeriodTo] = useState("");

  const selectedSupplier = suppliers.find(supplier => supplier.id === selectedSupplierId) ?? null;
  const suppliersBySearch = suppliers.filter(supplier => supplier.nom.toLowerCase().includes(search.toLowerCase()) || supplier.ville.toLowerCase().includes(search.toLowerCase()));
  const paymentMethods: readonly Exclude<PaymentMethod,"Avoir client">[] = PAYMENT_METHODS;

  function exportSupplierHistory(supplier: Supplier) {
    const receiptRows = entries.filter(entry => isSupplierRecord(entry, supplier) && entry.qty > 0 && entry.movementType === "achat").map(entry => {
      const product = products.find(item => item.id === entry.productId);
      return ["Réception", entry.recordedAt ?? entry.date, product?.nom ?? "Produit", entry.qty, entry.unit, entry.qty ? entry.montantDu / entry.qty : 0, entry.montantDu, entry.reference ?? "", stockEntrySupplierOutstanding(entry, charges), entry.operatorName ?? ""];
    });
    const paymentRows = charges.filter(charge => charge.source === "supplier_payment" && isSupplierRecord(charge, supplier)).map(charge => ["Paiement", charge.dateRaw, "", "", "", "", charge.montant, charge.note ?? "", "", `${charge.paymentMethod ?? "Autre"}${charge.operatorName ? ` · ${charge.operatorName}` : ""}`]);
    const csv = [["Type","Date","Produit","Quantité","Unité","Prix unitaire","Montant","Référence / note","Reste dû","Opérateur / mode"], ...[...receiptRows, ...paymentRows].sort((a,b) => String(b[1]).localeCompare(String(a[1])))].map(row => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type:"text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `tournal-fournisseur-${supplier.nom.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase() || supplier.id}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  async function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim() ? `${dialCode} ${tel.trim()}` : "";
    try {
      const persisted = await createSupplier({ boutiqueId:boutique.id, name:nom.trim(), phone:fullTel || undefined, city:ville.trim() || undefined });
      onUpdate({ suppliers:[...suppliers,{ id:persisted.supplier_id, nom:nom.trim(), ville:ville.trim(), lastDelivery:today(), tel:fullTel, initials:ini(nom.trim()), color:SUP_COLORS[suppliers.length%SUP_COLORS.length] }] });
      logAction("Nouveau fournisseur",`${nom.trim()} · ${ville.trim()}`,"🚛");
      setNom(""); setVille(""); setDialCode("+221"); setTel(""); setModal(false);
    } catch (error) { alert(error instanceof Error ? error.message : "Création du fournisseur impossible"); }
  }
  function openEdit(supplier: Supplier) {
    setEditSupplier(supplier); setEditName(supplier.nom); setEditCity(supplier.ville); setEditPhone(supplier.tel);
    setEditEmail(supplier.email ?? ""); setEditContact(supplier.contact ?? ""); setEditNotes(supplier.notes ?? ""); setEditTerms(supplier.paymentTermsDays == null ? "" : String(supplier.paymentTermsDays));
  }
  async function saveSupplierEdit() {
    const supplier = editSupplier;
    const terms = editTerms.trim() === "" ? null : Number(editTerms);
    if (!supplier || !editName.trim() || savingEdit || (terms != null && (!Number.isInteger(terms) || terms < 0 || terms > 3650))) return;
    setSavingEdit(true);
    try {
      await updateSupplier({ boutiqueId:boutique.id, supplierId:supplier.id, name:editName.trim(), city:editCity.trim() || undefined, phone:editPhone.trim() || undefined, email:editEmail.trim() || undefined, contact:editContact.trim() || undefined, notes:editNotes.trim() || undefined, paymentTermsDays:terms });
      const updated: Supplier = { ...supplier, nom:editName.trim(), ville:editCity.trim(), tel:editPhone.trim(), email:editEmail.trim() || undefined, contact:editContact.trim() || undefined, notes:editNotes.trim() || undefined, paymentTermsDays:terms ?? undefined, initials:ini(editName.trim()) };
      onUpdate({ suppliers:suppliers.map(item=>item.id===supplier.id?updated:item), products:products.map(product=>product.fournisseur===supplier.nom?{...product,fournisseur:updated.nom}:product), entries:entries.map(entry=>isSupplierRecord(entry,supplier)?{...entry,fournisseur:updated.nom,supplierId:supplier.id}:entry), charges:charges.map(charge=>isSupplierRecord(charge,supplier)?{...charge,fournisseur:updated.nom,supplierId:supplier.id}:charge) });
      logAction("Fournisseur modifié", updated.nom, "✏️"); setEditSupplier(null);
    } catch (error) { alert(error instanceof Error ? error.message : "Modification du fournisseur impossible"); }
    finally { setSavingEdit(false); }
  }
  async function paySupplier() {
    const supplier = paymentSupplier; const due = supplier ? supplierBalance(supplier, entries, charges) : 0; const requested = Number(paymentAmount);
    if (!supplier || paying || !Number.isFinite(requested) || requested <= 0 || due <= 0) return;
    setPaying(true);
    try {
      const result = await recordSupplierPayment({ boutiqueId:boutique.id, supplierId:supplier.id, amount:Math.min(requested,due), paymentMethod, note:paymentNote.trim() || undefined, paymentDate });
      const allocations = new Map(result.allocations.map(item => [item.charge_id, item.amount]));
      const newCharge: Charge = { id:result.charge_id, label:`Versement fournisseur · ${supplier.nom}`, montant:result.applied_amount, date:new Date(result.paid_at).toLocaleDateString("fr-FR"), dateRaw:result.paid_at, categorie:"Achat stock", recurrence:"unique", fournisseur:supplier.nom, supplierId:supplier.id, paymentMethod:result.payment_method as PaymentMethod, operatorName:result.operator_name, status:"paid", paidAmount:result.applied_amount, source:"supplier_payment", note:paymentNote.trim() || undefined };
      onUpdate({ charges:[...charges.map(charge => { const allocated = allocations.get(charge.id) ?? 0; if (!allocated) return charge; const paidAmount = Number(charge.paidAmount ?? 0) + allocated; return { ...charge, paidAmount, status:(paidAmount >= charge.montant ? "paid" : "partial") as Charge["status"] }; }), newCharge] });
      logAction("Versement fournisseur", `${supplier.nom} · ${fmt(result.applied_amount)} · ${result.payment_method}`, "💳"); setPaymentDone(true);
      window.setTimeout(()=>{ setPaymentSupplier(null); setPaymentAmount(""); setPaymentNote(""); setPaymentDone(false); }, 900);
    } catch (error) { alert(error instanceof Error ? error.message : "Versement fournisseur impossible"); }
    finally { setPaying(false); }
  }

  const detail = selectedSupplier && (() => {
    const supplier = selectedSupplier; const balance = supplierBalance(supplier,entries,charges);
    const receipts = entries.filter(entry=>isSupplierRecord(entry,supplier)&&entry.qty>0&&entry.movementType==="achat");
    const receiptChargeByEntry = new Map(charges.filter(charge=>charge.source==="supplier_receipt"&&isSupplierRecord(charge,supplier)).map(charge=>[charge.stockEntryId,charge]));
    const paymentCharges = charges.filter(charge=>charge.source==="supplier_payment"&&isSupplierRecord(charge,supplier));
    const paidReceipts = receipts.filter(entry=>Number(receiptChargeByEntry.get(entry.id)?.paidAmount ?? 0)>0).length;
    const totalPurchased = receipts.filter(entry=>new Date(entry.recordedAt ?? entry.date).getTime() >= Date.now()-365*86_400_000).reduce((sum,entry)=>sum+entry.montantDu,0);
    const averageReceipt = receipts.length ? receipts.reduce((sum,entry)=>sum+entry.montantDu,0)/receipts.length : 0;
    const dueCharges = [...receiptChargeByEntry.values()].filter(charge=>Number(charge.paidAmount ?? 0)<charge.montant).sort((a,b)=>(a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    const maturity = dueCharges.length ? maturityTone(dueCharges[0].dueDate,Number(dueCharges[0].paidAmount ?? 0),dueCharges[0].montant) : null;
    const productRows = [...new Map(receipts.map(entry=>[entry.productId,{ product:products.find(product=>product.id===entry.productId), qty:0 }])).entries()].map(([productId,row])=>({ productId, product:row.product, qty:receipts.filter(entry=>entry.productId===productId).reduce((sum,entry)=>sum+entry.qty,0) }));
    const timeline = [...receipts.map(entry=>({ kind:"receipt" as const, id:`r-${entry.id}`, at:entry.recordedAt ?? entry.date, entry, charge:receiptChargeByEntry.get(entry.id) })), ...paymentCharges.map(charge=>({ kind:"payment" as const, id:`p-${charge.id}`, at:charge.dateRaw, charge }))]
      .filter(item=>timelineFilter === "all" || item.kind === timelineFilter)
      .filter(item=>{ if (periodFilter === "all") return true; const eventAt = new Date(item.at).getTime(); if (periodFilter === "custom") { const from = periodFrom ? new Date(`${periodFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY; const to = periodTo ? new Date(`${periodTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY; return eventAt >= from && eventAt <= to; } return eventAt >= Date.now()-Number(periodFilter)*86_400_000; })
      .sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime());
    const lastTransaction = timeline[0];
    return <div className="space-y-4 pb-24" data-screen-source="relational-supplier-detail">
      <header className="flex items-center gap-3"><button type="button" onClick={()=>setSelectedSupplierId(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground"><ArrowLeft size={18}/></button><div className="min-w-0 flex-1"><p className="text-xs font-bold text-muted-foreground">FOURNISSEURS</p><h2 className="truncate text-lg font-black">{supplier.nom}</h2></div><button type="button" onClick={()=>exportSupplierHistory(supplier)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Download size={17}/></button></header>
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-black" style={{background:supplier.color+"22",color:supplier.color}}>{supplier.initials}</div><div className="min-w-0 flex-1"><p className="font-black">{supplier.nom}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11}/>{supplier.ville || "Ville non renseignée"}</p></div><span className="rounded-full px-2 py-1 text-[10px] font-black" style={supplier.linkedBoutiqueId?{background:"#dbeafe",color:"#1d4ed8"}:{background:"#f3f4f6",color:"#64748b"}}>{supplier.linkedBoutiqueId?"Inter-boutique":"Externe"}</span></div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">{supplier.tel&&<span className="flex items-center gap-1.5 font-semibold" style={{color:supplier.color}}><Phone size={14}/>{supplier.tel}</span>}{supplier.email&&<span className="flex items-center gap-1.5 text-muted-foreground"><Mail size={14}/>{supplier.email}</span>}{supplier.contact&&<span className="flex items-center gap-1.5 text-muted-foreground"><UserRound size={14}/>{supplier.contact}</span>}</div>
        <div className="grid grid-cols-2 gap-2"><Metric label="SOLDE DÛ" value={fmt(balance)} color={balance>0?"#dc2626":SEM.success.accent}/><Metric label="ACHATS · 12 MOIS" value={fmt(totalPurchased)} color={supplier.color}/><Metric label="RÉCEPTIONS" value={String(receipts.length)}/><Metric label="RÉGLÉES / PART." value={`${paidReceipts} / ${receipts.length}`} color={SEM.success.accent}/><Metric label="MOYENNE / LIVRAISON" value={fmt(averageReceipt)} color={supplier.color}/><Metric label="DERNIÈRE OPÉRATION" value={lastTransaction ? formatDateTime(lastTransaction.at) : "—"} small/></div>
        {maturity&&<div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black" style={{background:maturity.bg,color:maturity.color}}><CalendarClock size={14}/>{maturity.text}</div>}
        <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>onStartReceipt(supplier.id)} disabled={!canManageReceipts} className="rounded-xl py-2.5 text-xs font-black disabled:opacity-40" style={{background:"#3b82f6",color:"#fff"}}><PackageOpen size={14} className="mr-1 inline"/>Nouvelle réception</button><button type="button" onClick={()=>openEdit(supplier)} className="rounded-xl py-2.5 text-xs font-black" style={{background:supplier.color+"18",color:supplier.color}}><Edit2 size={14} className="mr-1 inline"/>Modifier</button><button type="button" onClick={()=>{setPaymentSupplier(supplier);setPaymentAmount(String(balance));setPaymentNote("");setPaymentDate(isoToday());}} disabled={!canPaySupplier||balance<=0} className="col-span-2 rounded-xl py-2.5 text-xs font-black disabled:opacity-40" style={{background:SEM.success.bg,color:SEM.success.text}}><Wallet size={14} className="mr-1 inline"/>Enregistrer un versement</button></div>
        {!canManageReceipts&&<p className="text-xs text-muted-foreground">Le droit « Stock » est nécessaire pour créer ou corriger une réception.</p>}{!canPaySupplier&&balance>0&&<p className="text-xs text-muted-foreground">Les droits « Fournisseurs » et « Charges » sont nécessaires pour enregistrer un versement.</p>}{supplier.notes&&<div className="rounded-xl p-3 text-xs text-muted-foreground" style={{background:"#fffbeb"}}><p className="mb-1 flex items-center gap-1 font-black text-foreground"><StickyNote size={13}/>Notes</p>{supplier.notes}</div>}<p className="text-xs text-muted-foreground">Délai fournisseur : <span className="font-black text-foreground">{supplier.paymentTermsDays == null ? `règle de la boutique · ${defaultPaymentTermsDays} jours` : `${supplier.paymentTermsDays} jours`}</span></p>
      </section>
      <section className="rounded-2xl border border-border bg-card overflow-hidden"><div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border"><p className="text-xs font-black tracking-wider text-muted-foreground">HISTORIQUE UNIFIÉ</p><span className="text-[10px] text-muted-foreground">Plus récent d’abord</span></div><div className="px-4 py-3"><div className="flex flex-wrap gap-1.5 mb-3">{(["all","receipt","payment"] as TimelineFilter[]).map(filter=><button key={filter} onClick={()=>setTimelineFilter(filter)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-black" style={{background:timelineFilter===filter?supplier.color:"#f1f5f9",color:timelineFilter===filter?"#fff":"#64748b"}}>{filter==="all"?"Tout":filter==="receipt"?"Réceptions":"Paiements"}</button>)}{(["all","30","365","custom"] as PeriodFilter[]).map(period=><button key={period} onClick={()=>setPeriodFilter(period)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-black" style={{background:periodFilter===period?"#334155":"#f1f5f9",color:periodFilter===period?"#fff":"#64748b"}}>{period==="all"?"Tout":period==="30"?"30 j":period==="365"?"12 mois":"Dates"}</button>)}</div>{periodFilter==="custom"&&<div className="mb-3 grid grid-cols-2 gap-2"><input aria-label="Date de début" type="date" value={periodFrom} onChange={event=>setPeriodFrom(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"/><input aria-label="Date de fin" type="date" value={periodTo} onChange={event=>setPeriodTo(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"/></div>}<div className="space-y-2">{timeline.length===0&&<p className="py-4 text-center text-sm text-muted-foreground">Aucune opération pour ce filtre</p>}{timeline.map(item=>item.kind === "receipt" ? <ReceiptTimelineItem key={item.id} entry={item.entry} charge={item.charge} product={products.find(product=>product.id===item.entry.productId)} canManage={canManageReceipts} onCorrect={()=>onCorrectReceipt(item.entry,supplier.id)}/> : <PaymentTimelineItem key={item.id} charge={item.charge}/>)}</div></div></section>
      <section className="rounded-2xl border border-border bg-card px-4 py-3"><p className="mb-2 text-xs font-black tracking-wider text-muted-foreground">PRODUITS FOURNIS</p><div className="flex flex-wrap gap-2">{productRows.length===0?<p className="text-sm text-muted-foreground">Aucun produit réceptionné</p>:productRows.map(row=><div key={row.productId} className="flex items-center gap-2 rounded-xl bg-muted px-2.5 py-2"><div className="h-7 w-7 overflow-hidden rounded-lg bg-background">{row.product&&<img src={imgSrc(row.product.img,56,56)} alt="" className="h-full w-full object-cover"/>}</div><span className="text-xs font-bold">{row.product?.nom ?? "Produit"}</span><span className="text-xs text-muted-foreground">{row.qty} {row.product?.unit ?? ""}</span></div>)}</div></section>
    </div>;
  })();

  return <div data-screen-source="relational-suppliers" className="space-y-3 pb-24">{detail ?? <><div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Chercher un fournisseur…" className={inputCls+" pl-11"}/></div>{suppliersBySearch.map(supplier=>{const balance=supplierBalance(supplier,entries,charges);const receiptCount=entries.filter(entry=>isSupplierRecord(entry,supplier)&&entry.qty>0&&entry.movementType==="achat").length;return <button key={supplier.id} type="button" onClick={()=>setSelectedSupplierId(supplier.id)} className="w-full rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.98]"><div className="flex items-center gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-black" style={{background:supplier.color+"22",color:supplier.color}}>{supplier.initials}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{supplier.nom}</p><div className="mt-0.5 flex items-center gap-1.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{supplier.ville || "—"}</span><span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black" style={supplier.linkedBoutiqueId?{background:"#dbeafe",color:"#1d4ed8"}:{background:"#f3f4f6",color:"#64748b"}}>{supplier.linkedBoutiqueId?"Inter-boutique":"Externe"}</span></div></div><div className="mr-1 text-right"><p className="text-sm font-black" style={{color:balance>0?"#ef4444":"#16a34a"}}>{balance>0?fmt(balance):"Soldé"}</p><p className="text-xs text-muted-foreground">{receiptCount} réception{receiptCount!==1?"s":""}</p></div><ChevronRight size={16} className="text-muted-foreground"/></div></button>})}<button type="button" onClick={()=>setModal(true)} className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl active:scale-95" style={{background:boutique.color,boxShadow:"0 0 24px "+boutique.color+"60"}}><Plus size={28} color="white" strokeWidth={2.5}/></button></>}
    {modal&&<Modal title="Nouveau fournisseur" color="#374151" onClose={()=>setModal(false)}><Field label="NOM"><input value={nom} onChange={event=>setNom(event.target.value)} placeholder="Ex: Konaté Tissus" className={inputCls} autoFocus onKeyDown={event=>event.key==="Enter"&&submit()}/></Field><Field label="VILLE"><input value={ville} onChange={event=>setVille(event.target.value)} placeholder="Ex: Dakar" className={inputCls}/></Field><PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/><SubmitBtn color={boutique.color} label="Enregistrer le fournisseur" onClick={submit}/></Modal>}
    {editSupplier&&<Modal title="Modifier le fournisseur" color={editSupplier.color} onClose={()=>!savingEdit&&setEditSupplier(null)}><Field label="NOM"><input value={editName} onChange={event=>setEditName(event.target.value)} className={inputCls} autoFocus/></Field><Field label="VILLE"><input value={editCity} onChange={event=>setEditCity(event.target.value)} className={inputCls}/></Field><Field label="TÉLÉPHONE"><input value={editPhone} onChange={event=>setEditPhone(event.target.value)} type="tel" className={inputCls}/></Field><Field label="E-MAIL"><input value={editEmail} onChange={event=>setEditEmail(event.target.value)} type="email" className={inputCls}/></Field><Field label="PERSONNE DE CONTACT"><input value={editContact} onChange={event=>setEditContact(event.target.value)} className={inputCls}/></Field><Field label="DÉLAI DE PAIEMENT (JOURS)"><input value={editTerms} onChange={event=>setEditTerms(event.target.value)} type="number" min="0" max="3650" placeholder={`Règle de la boutique (${defaultPaymentTermsDays} jours)`} className={inputCls}/></Field><Field label="NOTES"><textarea value={editNotes} onChange={event=>setEditNotes(event.target.value)} className={inputCls+" min-h-20"} placeholder="Conditions, contact, remarques…"/></Field><SubmitBtn color={editSupplier.color} label={savingEdit?"Enregistrement…":"Enregistrer les modifications"} onClick={saveSupplierEdit} disabled={savingEdit||!editName.trim()}/></Modal>}
    {paymentSupplier&&<Modal title="Versement fournisseur" color={SEM.success.accent} onClose={()=>!paying&&setPaymentSupplier(null)}>{(()=>{const due=supplierBalance(paymentSupplier,entries,charges);return <><div className="rounded-2xl p-3" style={{background:SEM.success.bg}}><p className="font-black">{paymentSupplier.nom}</p><p className="mt-1 text-xs text-muted-foreground">Solde global dû : {fmt(due)}</p><p className="mt-1 text-xs text-muted-foreground">Les réceptions les plus anciennes sont réglées en premier.</p></div><Field label="MONTANT"><input value={paymentAmount} onChange={event=>setPaymentAmount(event.target.value)} type="number" min="0" max={due} className={inputCls}/></Field><Field label="MODE DE PAIEMENT"><div className="grid grid-cols-2 gap-2">{paymentMethods.map(method=><button key={method} type="button" onClick={()=>setPaymentMethod(method)} className="rounded-xl py-2.5 text-xs font-bold" style={{background:paymentMethod===method?SEM.success.accent:"#EEE9D8",color:paymentMethod===method?"#fff":"#6b7280"}}>{PM_ICON[method]} {method}</button>)}</div></Field><Field label="DATE DU PAIEMENT"><input type="date" value={paymentDate} onChange={event=>setPaymentDate(event.target.value)} className={inputCls}/></Field><Field label="NOTE"><input value={paymentNote} onChange={event=>setPaymentNote(event.target.value)} className={inputCls} placeholder="Référence de paiement…"/></Field>{paymentDone?<div className="flex items-center justify-center gap-2 py-4 font-black" style={{color:SEM.success.accent}}><CheckCircle size={20}/>Versement enregistré</div>:<SubmitBtn color={SEM.success.accent} label={paying?"Enregistrement…":`Payer ${fmt(Math.min(Number(paymentAmount)||0,due))}`} onClick={paySupplier} disabled={paying||!Number(paymentAmount)||due<=0}/>}</>;})()}</Modal>}
  </div>;
}
function Metric({ label, value, color, small = false }: { label:string; value:string; color?:string; small?:boolean }) { return <div className="rounded-xl bg-muted p-2.5"><p className="text-[10px] font-black tracking-wider text-muted-foreground">{label}</p><p className={small ? "mt-1 text-xs font-black" : "mt-1 text-lg font-black"} style={color?{color}:undefined}>{value}</p></div>; }
function ReceiptTimelineItem({ entry, charge, product, canManage, onCorrect }: { entry: StockEntry; charge?: Charge; product?: { nom:string }; canManage:boolean; onCorrect:()=>void }) {
  const remaining = stockEntrySupplierOutstanding(entry, charge ? [charge] : []); const tone = maturityTone(charge?.dueDate,Number(charge?.paidAmount ?? 0),charge?.montant ?? entry.montantDu);
  return <div className="rounded-xl p-3" style={{background:"#fffaf0"}}><div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{background:"#fef3c7",color:"#b45309"}}><PackageOpen size={15}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">Réception de stock</p><p className="text-xs text-muted-foreground">{formatDateTime(entry.recordedAt)}{entry.operatorName?` · ${entry.operatorName}`:""}</p></div><p className="text-sm font-black" style={{color:"#b45309"}}>{fmt(entry.montantDu)}</p></div><p className="mt-1 text-xs font-semibold">{product?.nom ?? "Produit"} · +{entry.qty} {entry.unit} · {fmt(entry.qty ? entry.montantDu/entry.qty : 0)}/{entry.unit}</p>{entry.reference&&<p className="mt-1 text-xs text-muted-foreground">Référence : {entry.reference}</p>}<div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{background:remaining>0?"#fee2e2":"#dcfce7",color:remaining>0?"#b91c1c":"#15803d"}}>{remaining>0?`Reste ${fmt(remaining)}`:"Soldée"}</span>{tone&&<span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{background:tone.bg,color:tone.color}}>{tone.text}</span>}<button type="button" disabled={!canManage} onClick={onCorrect} className="ml-auto rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 disabled:opacity-40"><Edit2 size={11} className="mr-1 inline"/>Corriger</button></div>{!canManage&&<p className="mt-2 text-[10px] text-muted-foreground">Droit Stock requis pour corriger cette réception.</p>}</div></div></div>;
}
function PaymentTimelineItem({ charge }: { charge: Charge }) { return <div className="flex items-start gap-3 rounded-xl p-3" style={{background:SEM.success.bg}}><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{background:"#dcfce7",color:SEM.success.accent}}><ReceiptText size={15}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">Versement fournisseur</p><p className="text-xs text-muted-foreground">{formatDateTime(charge.dateRaw)} · {PM_ICON[charge.paymentMethod ?? "Autre"]} {charge.paymentMethod ?? "Autre"}{charge.operatorName ? ` · ${charge.operatorName}` : ""}</p></div><p className="text-sm font-black" style={{color:SEM.success.accent}}>−{fmt(charge.montant)}</p></div>{charge.note&&<p className="mt-1 text-xs text-muted-foreground">{charge.note}</p>}<p className="mt-2 text-[10px] text-muted-foreground">Paiement conservé comme écriture comptable : une correction se fait par écriture d’ajustement, pas par modification rétroactive.</p></div></div>; }
