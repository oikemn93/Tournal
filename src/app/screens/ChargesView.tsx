import React, { useState } from "react";
import { Search, Wallet, RefreshCw, Plus, CheckCircle, CreditCard, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { Boutique, Charge, ChargeCategorie } from "../types";
import { CHARGE_CATS, CHARGE_COLORS, SEM, inputCls } from "../constants";
import { fmt, today } from "../utils/formatting";
import { supplierBalance } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createCharge, recordTransferChargePayment } from "../../lib/api";

export function ChargesView({ boutique, onUpdate, logAction }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const charges = boutique.charges ?? [];
  const suppliers = boutique.suppliers;
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<ChargeCategorie|"all">("all");
  const [label, setLabel] = useState("");
  const [montant, setMontant] = useState("");
  const [cat, setCat] = useState<ChargeCategorie>("Loyer");
  const [recurrence, setRecurrence] = useState<Charge["recurrence"]>("unique");
  const [note, setNote] = useState("");
  const [fourn, setFourn] = useState<string>("");
  const [paymentCharge, setPaymentCharge] = useState<Charge|null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Espèces");
  const [paying, setPaying] = useState(false);

  const filtered = charges.filter(c =>
    (catFilter === "all" || c.categorie === catFilter) &&
    c.label.toLowerCase().includes(search.toLowerCase())
  ).sort((a,b) => b.id - a.id);

  const expenseAmount = (charge:Charge) => charge.source==="transfer" ? Number(charge.paidAmount??0) : charge.montant;
  const totalMois = charges.reduce((s,c) => s + expenseAmount(c), 0);
  const byCategorie = CHARGE_CATS.map(cat => ({
    name: cat, value: charges.filter(c=>c.categorie===cat).reduce((s,c)=>s+expenseAmount(c),0), color: CHARGE_COLORS[cat]
  })).filter(c=>c.value>0);

  async function submit() {
    if (!label.trim() || !montant) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
    const dateRaw = now.toISOString().split("T")[0];
    const linkedFourn = (cat === "Achat stock" && fourn) ? fourn : undefined;
    let persisted;
    try { persisted = await createCharge({ boutiqueId:boutique.id, label:label.trim(), amount:Number(montant), category:cat, note:note.trim() || undefined }); }
    catch (error) { alert(error instanceof Error ? error.message : "Création de charge impossible"); return; }
    const newCharge: Charge = { id: persisted.charge_id, label: label.trim(), montant: Number(montant), date: dateStr, dateRaw, categorie: cat, recurrence, note: note.trim()||undefined, fournisseur: linkedFourn };
    onUpdate({ charges: [...charges, newCharge] });
    logAction("Nouvelle charge", `${label.trim()} · ${fmt(Number(montant))}${linkedFourn?" → "+linkedFourn:""}`, "💸");
    setLabel(""); setMontant(""); setNote(""); setFourn(""); setModal(false);
  }
  async function payTransferCharge() {
    if (!paymentCharge || paying) return;
    const due=Math.max(0,paymentCharge.montant-Number(paymentCharge.paidAmount??0));
    const requested=Number(paymentAmount);
    if (!Number.isFinite(requested)||requested<=0) return;
    setPaying(true);
    try {
      const result=await recordTransferChargePayment({boutiqueId:boutique.id,chargeId:paymentCharge.id,amount:Math.min(requested,due),paymentMethod});
      onUpdate({charges:charges.map((charge)=>charge.id===paymentCharge.id?{...charge,paidAmount:result.paid_amount,status:result.status}:charge)});
      logAction("Règlement transfert B2B",`${paymentCharge.label} · ${fmt(result.applied_amount)} · ${paymentMethod}`,"💳");
      setPaymentCharge(null); setPaymentAmount("");
    } catch (error) { alert(error instanceof Error?error.message:"Paiement impossible"); }
    finally { setPaying(false); }
  }
  return (
    <div data-screen-source="relational-charges" className="space-y-4 pb-24">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2"><Wallet size={18} style={{color:"#ef4444"}}/><span className="text-xs font-bold text-muted-foreground">TOTAL CHARGES</span></div>
          <p className="text-2xl font-black" style={{fontFamily:"'Nunito',sans-serif",color:"#ef4444"}}>{fmt(totalMois)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{charges.length} entrées</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2"><RefreshCw size={18} style={{color:"#6366f1"}}/><span className="text-xs font-bold text-muted-foreground">RÉCURRENTES</span></div>
          <p className="text-2xl font-black" style={{fontFamily:"'Nunito',sans-serif",color:"#6366f1"}}>{fmt(charges.filter(c=>c.recurrence!=="unique").reduce((s,c)=>s+c.montant,0))}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{charges.filter(c=>c.recurrence!=="unique").length} charges fixes</p>
        </div>
      </div>

      {/* Pie chart */}
      {byCategorie.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-sm font-bold mb-3">Répartition des charges</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={byCategorie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                {byCategorie.map((entry,i) => <Cell key={`cell-${i}`} fill={entry.color}/>)}
              </Pie>
              <Tooltip formatter={(v:number) => fmt(v)} contentStyle={{borderRadius:12,border:"1px solid var(--border)",fontSize:12}}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Search + filter */}
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher une charge…" className={inputCls+" pl-11"}/></div>
      <div className="flex gap-2" style={{overflowX:"auto",scrollbarWidth:"none"}}>
        <button onClick={()=>setCatFilter("all")} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{background:catFilter==="all"?"#1f2937":"#f3f4f6",color:catFilter==="all"?"#fff":"#374151"}}>Tout</button>
        {CHARGE_CATS.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{background:catFilter===c?"#1f2937":"#f3f4f6",color:catFilter===c?"#fff":"#374151"}}>{c}</button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">Aucune charge enregistrée</div>}
        {filtered.map(c => (
          <div key={c.id} className="bg-card rounded-2xl border border-border flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:CHARGE_COLORS[c.categorie]+"22"}}>
              <Wallet size={18} style={{color:CHARGE_COLORS[c.categorie]}}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{c.label}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:CHARGE_COLORS[c.categorie]+"22",color:CHARGE_COLORS[c.categorie]}}>{c.categorie}</span>
                {c.recurrence !== "unique" && <span className="text-xs text-muted-foreground">↺ {c.recurrence}</span>}
                {c.fournisseur && <span className="text-xs font-bold" style={{color:SEM.neutral.accent}}>→ {c.fournisseur}</span>}
                <span className="text-xs text-muted-foreground">{c.date}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(c.montant)}</p>
              {c.source==="transfer"&&<><p className="text-xs text-muted-foreground">Réglé : {fmt(Number(c.paidAmount??0))}</p>{c.status!=="paid"&&<button onClick={()=>{const due=Math.max(0,c.montant-Number(c.paidAmount??0));setPaymentCharge(c);setPaymentAmount(String(due));}} className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white"><CreditCard size={12}/>Payer</button>}</>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{background:"#ef4444",boxShadow:"0 0 24px #ef444460"}}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>

      {modal && <Modal title="Nouvelle charge" color="#374151" onClose={()=>setModal(false)}>
        <Field label="LIBELLÉ"><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ex: Loyer boutique" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="MONTANT (F CFA)"><input value={montant} onChange={e=>setMontant(e.target.value)} type="number" placeholder="Ex: 150 000" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="CATÉGORIE">
          <div className="flex flex-wrap gap-2">
            {CHARGE_CATS.map(c=><button key={c} type="button" onClick={()=>setCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{background:cat===c?"#1f2937":"#f3f4f6",color:cat===c?"#fff":"#374151"}}>{c}</button>)}
          </div>
        </Field>
        <Field label="RÉCURRENCE">
          <div className="flex gap-2">
            {(["unique","mensuelle","hebdomadaire"] as Charge["recurrence"][]).map(r=>(
              <button key={r} type="button" onClick={()=>setRecurrence(r)} className="flex-1 py-3 rounded-xl text-xs font-bold capitalize" style={{background:recurrence===r?"#ef4444":"#EEE9D8",color:recurrence===r?"#fff":"#6b7280"}}>{r}</button>
            ))}
          </div>
        </Field>
        {cat === "Achat stock" && suppliers.length > 0 && (
          <Field label="VERSEMENT AU FOURNISSEUR">
            <div className="flex flex-col gap-2">
              <button type="button" onClick={()=>setFourn("")} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium" style={{background:!fourn?"#f3f4f6":"transparent",color:!fourn?"#374151":"#6b7280",fontWeight:!fourn?700:400}}>Aucun lien fournisseur</button>
              {suppliers.map(s => {
                const bal = supplierBalance(s.nom, boutique.entries, boutique.charges);
                return (
                  <button key={s.id} type="button" onClick={()=>setFourn(s.nom)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{background:fourn===s.nom?s.color+"22":"#EEE9D8",border:fourn===s.nom?`2px solid ${s.color}`:"2px solid transparent"}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{background:s.color}}>{s.initials}</div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold">{s.nom}</p>
                      {bal > 0 && <p className="text-xs font-bold" style={{color:"#ef4444"}}>Solde dû : {fmt(bal)}</p>}
                      {bal === 0 && <p className="text-xs text-muted-foreground">Soldé ✓</p>}
                    </div>
                    {fourn===s.nom && <CheckCircle size={16} style={{color:s.color}}/>}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="NOTE (optionnel)"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Remarque…" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <SubmitBtn color={boutique.color} label="Enregistrer la charge" onClick={submit}/>
      </Modal>}
      {paymentCharge&&<Modal title="Régler la charge B2B" color="#111827" onClose={()=>!paying&&setPaymentCharge(null)}>
        <div className="rounded-xl bg-muted/50 p-3 text-sm"><p className="font-bold">{paymentCharge.label}</p><p className="text-muted-foreground">Reste dû : {fmt(Math.max(0,paymentCharge.montant-Number(paymentCharge.paidAmount??0)))}</p></div>
        <Field label="MONTANT"><input type="number" min="1" max={Math.max(0,paymentCharge.montant-Number(paymentCharge.paidAmount??0))} value={paymentAmount} onChange={(event)=>setPaymentAmount(event.target.value)} className={inputCls}/></Field>
        <Field label="MODE DE PAIEMENT"><div className="grid grid-cols-2 gap-2">{["Espèces","Wave","Orange Money","Autre"].map((method)=><button key={method} type="button" onClick={()=>setPaymentMethod(method)} className="rounded-xl p-3 text-xs font-bold" style={{background:paymentMethod===method?"#111827":"#EEE9D8",color:paymentMethod===method?"white":"#374151"}}>{method}</button>)}</div></Field>
        <button onClick={()=>void payTransferCharge()} disabled={paying||Number(paymentAmount)<=0} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 font-black text-white disabled:opacity-50">{paying&&<Loader2 className="animate-spin" size={16}/>}Confirmer le règlement</button>
      </Modal>}
    </div>
  );
}
