import React, { useMemo, useState } from "react";
import { BookOpen, Wallet, FileText, Download } from "lucide-react";
import type { Boutique, DashPeriod, ChargeCategorie } from "../types";
import { SEM, inputCls, PAYMENT_METHODS, PM_ICON, PM_COLOR, CHARGE_CATS, CHARGE_COLORS } from "../constants";
import { fmt } from "../utils/formatting";
import { invBadge, lineDispQty, lineDispUnit, lineTotal, filterByPeriod, invoiceMargin, supplierBalance } from "../utils/inventory";
import { Modal } from "../components/Modal";
import { filterPaymentEventsByPeriod, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";

export function ComptabiliteView({ boutique, canSeeMargin = false }: { boutique: Boutique; canSeeMargin?: boolean }) {
  const RC = boutique.color;
  const { invoices } = boutique;
  const { entries, products } = boutique;
  const charges = boutique.charges ?? [];
  const [period, setPeriod] = useState<DashPeriod>("jour");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exportModal, setExportModal] = useState<"summary"|"full"|null>(null);

  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo);
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);

  const invoiceSign = (invoice: typeof filtInv[number]) => invoice.type === "Retour" || invoice.type === "retour" ? -1 : 1;
  const ca           = filtPayments.reduce((sum,payment)=>sum + payment.signedAmount,0);
  const caTotal      = filtInv.reduce((s,i)=>s + invoiceSign(i) * i.montant,0);
  const nbVentes     = new Set(filtPayments.filter(payment=>payment.signedAmount>0).map(payment=>payment.invoiceId)).size;
  const panierMoyen  = nbVentes > 0 ? ca / nbVentes : 0;
  const impayé       = filtInv.filter(i=>invoiceSign(i)>0).reduce((s,i)=>s+invoiceRemainingAmount(i),0);
  // A supplier receipt is a payable commitment, not money that has already
  // left the cash desk. The later supplier-payment charge is the actual cash
  // outflow, so counting both would double-count supplier spending.
  const chargeCashAmount = (charge: typeof charges[number]) =>
    charge.source === "transfer" ? Number(charge.paidAmount ?? 0)
    : charge.source === "supplier_receipt" ? 0
    : Number(charge.montant);
  const paidCharges = filtCh.filter(charge => charge.source !== "supplier_receipt");
  const supplierReceipts = filtCh.filter(charge => charge.source === "supplier_receipt");
  const supplierReceiptAmount = supplierReceipts.reduce((sum, charge) => sum + Number(charge.montant), 0);
  const supplierReceiptPaid = supplierReceipts.reduce((sum, charge) => sum + Number(charge.paidAmount ?? 0), 0);
  const supplierReceiptDue = Math.max(0, supplierReceiptAmount - supplierReceiptPaid);
  const supplierOutstanding = useMemo(
    () => (boutique.suppliers ?? []).reduce((sum, supplier) => sum + supplierBalance(supplier, entries, charges), 0),
    [boutique.suppliers, entries, charges],
  );
  const totalCharges = paidCharges.reduce((s,c)=>s+chargeCashAmount(c),0);
  const chargesExploitation = paidCharges.filter(c=>c.categorie!=="Achat stock").reduce((s,c)=>s+chargeCashAmount(c),0);

  // Product margin (sale price − FIFO cost of goods), returns counted negatively.
  // Only computed/shown for users with the "Voir les marges" right.
  const margeVentesData = filtInv.reduce((acc,inv)=>{
    const m = invoiceMargin(inv, entries, products);
    if (m.hasData) { acc.marge += m.marge; acc.ca += m.ca; acc.cost += m.cost; acc.has = true; }
    return acc;
  }, { marge:0, ca:0, cost:0, has:false });
  const margeVentes    = margeVentesData.marge;
  const tauxMargeVentes= margeVentesData.ca !== 0 ? Math.round(margeVentes/Math.abs(margeVentesData.ca)*100) : 0;
  const resultatApresCharges = margeVentes - chargesExploitation;

  const byMethode = PAYMENT_METHODS.map(m => ({
    m, total: filtPayments.filter(payment=>payment.paymentMethod===m).reduce((sum,payment)=>sum + payment.signedAmount,0),
    count: filtPayments.filter(payment=>payment.paymentMethod===m).length,
  })).filter(r=>r.count>0);

  const byCategorie = CHARGE_CATS.map(cat=>({
    cat, montant: paidCharges.filter(c=>c.categorie===cat).reduce((s,c)=>s+chargeCashAmount(c),0)
  })).filter(r=>r.montant>0);

  const periodLabel: Record<DashPeriod,string> = { jour:"Aujourd'hui", semaine:"Cette semaine", mois:"Ce mois", annee:"Cette année", custom:"Période personnalisée" };

  function invoicePaymentLabel(inv: typeof invoices[number]): string {
    const rows = inv.payments?.length
      ? inv.payments.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
      : inv.paymentSplit?.length
        ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
        : inv.paymentMethod && invoicePaidAmount(inv) > 0
          ? [{ method:inv.paymentMethod, amount:invoicePaidAmount(inv) }]
          : [];
    return rows.map(payment => `${payment.method} ${fmt(payment.amount)}`).join(" + ");
  }

  function buildSummaryHtml() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport — ${boutique.nom}</title>
<style>
body{font-family:Arial,sans-serif;padding:30px 36px;max-width:680px;margin:0 auto;font-size:13px;color:#1a1a1a}
h1{font-size:22px;font-weight:900;margin:0 0 2px}
.sub{color:#888;font-size:12px;margin-bottom:24px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.kpi{padding:14px 16px;border-radius:12px;background:#f7f7f7}
.kpi .label{font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.kpi .value{font-size:20px;font-weight:900}
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:18px 0 8px;border-top:1px solid #eee;padding-top:14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0}
.row .label{font-size:12px;display:flex;align-items:center;gap:6px}
.row .value{font-size:13px;font-weight:700}
.green{color:#1E9B1E}.orange{color:#f97316}.red{color:#ef4444}.muted{color:#888}
.total-row{padding:10px 0;border-top:2px solid #1a1a1a;margin-top:4px}
.total-row .label{font-weight:900;font-size:13px}
.total-row .value{font-weight:900;font-size:16px}
@media print{body{padding:20px}}
</style></head><body>
<h1>${boutique.nom}</h1>
<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
<div class="kpis">
  <div class="kpi"><div class="label">CA encaissé (date de paiement)</div><div class="value green">${fmt(ca)}</div></div>
  <div class="kpi"><div class="label">Ventes</div><div class="value">${nbVentes}</div></div>
  <div class="kpi"><div class="label">Panier moyen</div><div class="value">${fmt(panierMoyen)}</div></div>
  <div class="kpi"><div class="label">CA facturé (date de facture)</div><div class="value muted">${fmt(caTotal)}</div></div>
  <div class="kpi"><div class="label">Impayé</div><div class="value orange">${fmt(impayé)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge commerciale (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div><div class="kpi"><div class="label">Résultat après charges</div><div class="value ${resultatApresCharges>=0?"green":"red"}">${fmt(resultatApresCharges)}</div></div>` : ""}
</div>
${byMethode.length>0?`<div class="section-title">Répartition par mode de paiement</div>
${byMethode.map(r=>`<div class="row"><span class="label">${PM_ICON[r.m]} ${r.m} <span class="muted">(${r.count})</span></span><span class="value">${fmt(r.total)}</span></div>`).join("")}
<div class="row total-row"><span class="label">Total encaissé</span><span class="value green">${fmt(ca)}</span></div>`:""}
${paidCharges.length>0?`<div class="section-title">Charges décaissées (${paidCharges.length})</div>
${byCategorie.map(r=>`<div class="row"><span class="label">${r.cat}</span><span class="value red">${fmt(r.montant)}</span></div>`).join("")}
${paidCharges.map(c=>`<div class="row"><span class="label" style="padding-left:12px;color:#888">· ${c.label}</span><span class="value muted">${fmt(chargeCashAmount(c))}</span></div>`).join("")}
<div class="row total-row"><span class="label">Total charges</span><span class="value red">${fmt(totalCharges)}</span></div>
${canSeeMargin && margeVentesData.has ? `<div class="row total-row" style="border-top:2px solid ${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}"><span class="label" style="color:${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}">Résultat après charges</span><span class="value" style="color:${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}">${fmt(resultatApresCharges)}</span></div>` : ""}`:""}
${supplierReceipts.length>0?`<div class="section-title">Réceptions fournisseur — engagement non décaissé</div>
${supplierReceipts.map(c=>`<div class="row"><span class="label">· ${c.label}</span><span class="value muted">Reçu ${fmt(c.montant)} · réglé ${fmt(Number(c.paidAmount ?? 0))} · reste ${fmt(Math.max(0, Number(c.montant)-Number(c.paidAmount ?? 0)))}</span></div>`).join("")}
<div class="row total-row"><span class="label">Reste à payer sur la période</span><span class="value orange">${fmt(supplierReceiptDue)}</span></div>`:""}
<div class="row"><span class="label">Solde fournisseurs actuel</span><span class="value orange">${fmt(supplierOutstanding)}</span></div>
</body></html>`;
  }

  function buildFullHtml() {
    const chargesBlock = paidCharges.length > 0 ? `
<div class="section-title">Charges décaissées (${paidCharges.length})</div>
<table><thead><tr><th>Libellé</th><th>Catégorie</th><th>Date</th><th class="val">Montant</th></tr></thead><tbody>
${paidCharges.map(c=>`<tr><td>${c.label}</td><td>${c.categorie}</td><td>${c.date}</td><td class="val">${fmt(chargeCashAmount(c))}</td></tr>`).join("")}
<tr class="total-row"><td colspan="3"><b>TOTAL CHARGES</b></td><td class="val red"><b>${fmt(totalCharges)}</b></td></tr>
</tbody></table>` : "";
    const supplierReceiptsBlock = supplierReceipts.length > 0 ? `
<div class="section-title">Réceptions fournisseur — engagement non décaissé</div>
<table><thead><tr><th>Libellé</th><th>Date</th><th class="val">Réception</th><th class="val">Réglé</th><th class="val">Reste dû</th></tr></thead><tbody>
${supplierReceipts.map(c=>`<tr><td>${c.label}</td><td>${c.date}</td><td class="val">${fmt(c.montant)}</td><td class="val">${fmt(Number(c.paidAmount ?? 0))}</td><td class="val red">${fmt(Math.max(0, Number(c.montant)-Number(c.paidAmount ?? 0)))}</td></tr>`).join("")}
<tr class="total-row"><td colspan="2"><b>TOTAL RÉCEPTIONS</b></td><td class="val"><b>${fmt(supplierReceiptAmount)}</b></td><td class="val"><b>${fmt(supplierReceiptPaid)}</b></td><td class="val red"><b>${fmt(supplierReceiptDue)}</b></td></tr>
</tbody></table>` : "";
    const invLines = filtInv.map(inv=>{
      const linesHtml = (inv.lines??[]).map(l=>`<tr style="background:#fafafa"><td style="padding-left:24px;color:#888">↳ ${l.nom}</td><td></td><td></td><td class="val muted">${lineDispQty(l)} ${lineDispUnit(l)} × ${fmt(l.prixUnit)}</td><td class="val muted">${fmt(lineTotal(l))}</td><td></td></tr>`).join("");
      const paymentLabel = invoicePaymentLabel(inv);
      const paymentHtml = paymentLabel ? `<tr style="background:#f0fdf4"><td colspan="6" style="padding-left:24px;color:#166534;font-size:10px;font-weight:700">Paiements : ${paymentLabel}</td></tr>` : "";
      const [tc,bc]=invBadge(inv.status);
      return `<tr><td>${inv.id}</td><td>${inv.client}</td><td>${inv.date}</td><td><span style="background:${bc};color:${tc};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">${inv.status}</span></td><td class="val">${fmt(inv.montant)}</td><td class="val green">${fmt(invoicePaidAmount(inv))}</td></tr>${paymentHtml}${linesHtml}`;
    }).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport complet — ${boutique.nom}</title>
<style>
body{font-family:Arial,sans-serif;padding:30px 36px;max-width:900px;margin:0 auto;font-size:12px;color:#1a1a1a}
h1{font-size:20px;font-weight:900;margin:0 0 2px}.sub{color:#888;font-size:12px;margin-bottom:20px}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.kpi{padding:10px 14px;border-radius:10px;background:#f7f7f7;min-width:120px}
.kpi .label{font-size:10px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.kpi .value{font-size:16px;font-weight:900}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:16px 0 6px;border-top:1px solid #eee;padding-top:12px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 10px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:12px}
th{font-weight:700;color:#666;font-size:10px;text-transform:uppercase}
.val{text-align:right;font-weight:700}.green{color:#1E9B1E}.red{color:#ef4444}.muted{color:#888}
.total-row td{border-top:2px solid #1a1a1a;font-weight:900;padding-top:9px}
@media print{body{padding:16px}}
</style></head><body>
<h1>${boutique.nom} — Rapport complet</h1>
<div class="sub">${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
<div class="kpis">
  <div class="kpi"><div class="label">CA encaissé (date de paiement)</div><div class="value green">${fmt(ca)}</div></div>
  <div class="kpi"><div class="label">Ventes</div><div class="value">${nbVentes}</div></div>
  <div class="kpi"><div class="label">Panier moyen</div><div class="value">${fmt(panierMoyen)}</div></div>
  <div class="kpi"><div class="label">CA facturé (date de facture)</div><div class="value">${fmt(caTotal)}</div></div>
  <div class="kpi"><div class="label">Impayé</div><div class="value muted">${fmt(impayé)}</div></div>
  <div class="kpi"><div class="label">Solde fournisseurs actuel</div><div class="value orange">${fmt(supplierOutstanding)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge commerciale (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div><div class="kpi"><div class="label">Résultat après charges</div><div class="value ${resultatApresCharges>=0?"green":"red"}">${fmt(resultatApresCharges)}</div></div>` : ""}
</div>
${chargesBlock}
${supplierReceiptsBlock}
<div id="transactions" class="section-title">Transactions (${filtInv.length})</div>
<table><thead><tr><th>Réf</th><th>Client</th><th>Date</th><th>Statut</th><th class="val">Facturé</th><th class="val">Encaissé</th></tr></thead><tbody>
${invLines}
<tr class="total-row"><td colspan="4"><b>TOTAL</b></td><td class="val"><b>${fmt(caTotal)}</b></td><td class="val green"><b>${fmt(ca)}</b></td></tr>
</tbody></table>
</body></html>`;
  }

  function openPreview(type: "summary"|"full") {
    setExportModal(type);
  }

  function doPrint(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const w = window.open("","_blank","width=860,height=700");
    if (!w) return;
    w.document.write(html + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\/script>`);
    w.document.close();
    setExportModal(null);
  }

  async function downloadRapportPDF(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;background:#fff";
    document.body.appendChild(iframe);
    try {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) throw new Error("Aperçu PDF indisponible");
      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        doc.open(); doc.write(html); doc.close();
        setTimeout(resolve, 300);
      });
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(doc.body, { scale:1.5, useCORS:true, backgroundColor:"#ffffff", windowWidth:900 });
      const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
      const img = canvas.toDataURL("image/jpeg", 0.86);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = canvas.height / canvas.width * pdfW;
      for (let offset=0; offset<imgH; offset+=pdfH) {
        if (offset>0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, -offset, pdfW, imgH);
      }
      const safeName = boutique.nom.replace(/[^a-zA-Z0-9_-]+/g,"-");
      pdf.save(`Rapport-${safeName}-${period}.pdf`);
      setExportModal(null);
    } finally {
      iframe.remove();
    }
  }

  const periodBtns: Array<{id:DashPeriod;label:string}> = [
    {id:"jour",label:"Aujourd'hui"},{id:"semaine",label:"Semaine"},{id:"mois",label:"Mois"},{id:"custom",label:"Personnalisé"},
  ];

  const rows = [
    { label:"CA encaissé · date de paiement", value:ca, color:RC, bold:true },
    { label:"CA facturé · date de facture", value:caTotal, color:"#C9A227" },
    { label:"Nb ventes",     value:-1,            color:"#6b7280", txt:`${nbVentes}`     },
    { label:"Panier moyen",  value:panierMoyen,   color:"#a855f7"                        },
    { label:"Impayé",        value:impayé,        color:SEM.warning.accent                        },
    { label:"Charges décaissées", value:totalCharges, color:"#ef4444"                    },
    { label:"À régler fournisseurs · solde actuel", value:supplierOutstanding, color:SEM.warning.accent },
    ...(canSeeMargin && margeVentesData.has ? [
      { label:"Marge commerciale", value:margeVentes, color:margeVentes>=0?SEM.success.accent:SEM.danger.accent, bold:true },
      { label:"Taux de marge commerciale", value:-1, color:"#a855f7", txt:`${tauxMargeVentes}%` },
      { label:"Résultat après charges", value:resultatApresCharges, color:resultatApresCharges>=0?SEM.success.accent:SEM.danger.accent, bold:true },
    ] : []),
  ];

  return (
    <div data-screen-source="relational-comptabilite" className="space-y-4 pb-24">
      {/* Period selector */}
      <div className="flex gap-1.5 bg-card rounded-2xl p-1.5 border border-border">
        {periodBtns.map(p=>(
          <button key={p.id} onClick={()=>setPeriod(p.id)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{background:period===p.id?RC:"transparent",color:period===p.id?"#fff":"#6b7280"}}>
            {p.label}
          </button>
        ))}
      </div>
      {period==="custom" && (
        <div className="flex gap-2">
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">DU</label><input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className={inputCls}/></div>
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">AU</label><input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className={inputCls}/></div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label:"CA encaissé (paiements)", value:fmt(ca), color:RC },
          { label:"Ventes", value:`${nbVentes}`, color:"#6b7280" },
          { label:"Panier moyen", value:fmt(panierMoyen), color:"#a855f7" },
          { label:"À régler fournisseurs (solde actuel)", value:fmt(supplierOutstanding), color:SEM.warning.accent },
          ...(canSeeMargin && margeVentesData.has ? [
            { label:`Marge commerciale (${tauxMargeVentes}%)`, value:fmt(margeVentes), color:margeVentes>=0?SEM.success.accent:SEM.danger.accent },
            { label:"Résultat après charges", value:fmt(resultatApresCharges), color:resultatApresCharges>=0?SEM.success.accent:SEM.danger.accent },
          ] : []),
        ].map((k,i)=>(
          <div key={i} className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-black mt-1" style={{color:k.color,fontFamily:"'Nunito',sans-serif"}}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Compte de résultat */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2"><BookOpen size={16} style={{color:RC}}/><p className="font-bold text-sm">Compte de résultat</p></div>
        </div>
        {rows.map((r,i)=>(
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${i<rows.length-1?"border-b border-border":""}`} style={{background:r.bold?r.color+"0a":""}}>
            <p className={`text-sm ${r.bold?"font-black":"font-medium"}`}>{r.label}</p>
            <p className={`font-black text-sm ${r.bold?"text-base":""}`} style={{color:r.color,fontFamily:"'Nunito',sans-serif"}}>
              {r.txt ?? fmt(r.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Répartition paiements */}
      {byMethode.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="text-base">💳</span><p className="font-bold text-sm">Modes de paiement</p>
          </div>
          {byMethode.map((r,i)=>(
            <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <span className="text-sm flex items-center gap-2">{PM_ICON[r.m]} <span style={{color:PM_COLOR[r.m]}}>{r.m}</span><span className="text-xs text-muted-foreground">({r.count})</span></span>
              <span className="font-black text-sm" style={{color:PM_COLOR[r.m],fontFamily:"'Nunito',sans-serif"}}>{fmt(r.total)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Charges par catégorie */}
      {byCategorie.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Wallet size={16} style={{color:"#ef4444"}}/><p className="font-bold text-sm">Charges décaissées</p></div>
          {byCategorie.map((r,i)=>(
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:CHARGE_COLORS[r.cat as ChargeCategorie]}}/>
              <p className="flex-1 text-sm font-medium">{r.cat}</p>
              <div className="text-right">
                <p className="font-black text-sm" style={{color:CHARGE_COLORS[r.cat as ChargeCategorie],fontFamily:"'Nunito',sans-serif"}}>{fmt(r.montant)}</p>
                <p className="text-xs text-muted-foreground">{totalCharges>0?Math.round(r.montant/totalCharges*100):0}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(supplierReceipts.length > 0 || supplierOutstanding > 0) && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Wallet size={16} style={{color:SEM.warning.accent}}/><p className="font-bold text-sm">Fournisseurs à régler</p></div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div><p className="text-sm font-medium">Solde actuel</p><p className="text-xs text-muted-foreground">Toutes les réceptions non soldées</p></div>
            <p className="font-black text-sm" style={{color:SEM.warning.accent,fontFamily:"'Nunito',sans-serif"}}>{fmt(supplierOutstanding)}</p>
          </div>
          {supplierReceipts.length > 0 && <div className="flex items-center justify-between px-4 py-3">
            <div><p className="text-sm font-medium">Réceptions de la période</p><p className="text-xs text-muted-foreground">Reçu {fmt(supplierReceiptAmount)} · réglé {fmt(supplierReceiptPaid)}</p></div>
            <p className="font-black text-sm" style={{color:SEM.warning.accent,fontFamily:"'Nunito',sans-serif"}}>{fmt(supplierReceiptDue)} dû</p>
          </div>}
        </div>
      )}

      {/* Export */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Download size={16} style={{color:RC}}/><p className="font-bold text-sm">Exporter</p></div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <button onClick={()=>openPreview("summary")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:RC+"18"}}><FileText size={18} style={{color:RC}}/></div>
            <p className="text-xs font-black" style={{color:RC}}>Entête de rapport</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">CA, ventes, panier moyen, répartition</p>
          </button>
          <button onClick={()=>openPreview("full")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"#a855f718"}}><BookOpen size={18} style={{color:"#a855f7"}}/></div>
            <p className="text-xs font-black" style={{color:"#a855f7"}}>Rapport complet</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">Toutes les transactions + détail lignes</p>
          </button>
        </div>
      </div>

      {/* Factures */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><FileText size={16} style={{color:"#a855f7"}}/><p className="font-bold text-sm">Transactions ({filtInv.length})</p></div>
        {filtInv.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune transaction sur cette période</p>}
        {[...filtInv].reverse().slice(0,30).map(inv=>{
          const [tc,bc]=invBadge(inv.status);
          return (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p>{invoicePaymentLabel(inv)&&<p className="text-xs font-bold mt-0.5 truncate" style={{color:SEM.success.accent}}>💳 {invoicePaymentLabel(inv)}</p>}</div>
              <div className="text-right">
                <p className="text-sm font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(invoicePaidAmount(inv) > 0 ? invoicePaidAmount(inv) : inv.montant)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize" style={{background:bc,color:tc}}>{inv.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Export preview modal */}
      {exportModal && (
        <Modal title={exportModal==="summary"?"Entête de rapport":"Rapport complet"} color={RC} onClose={()=>setExportModal(null)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-border overflow-hidden" style={{height:"320px"}}>
              <iframe
                srcDoc={exportModal==="summary"?buildSummaryHtml():buildFullHtml()}
                className="w-full h-full"
                style={{border:"none",background:"#fff"}}
                onLoad={e => {
                  if (exportModal === "full") {
                    try {
                      const doc = (e.target as HTMLIFrameElement).contentDocument;
                      const el = doc?.getElementById("transactions");
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } catch {}
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>downloadRapportPDF(exportModal)} className="py-3 rounded-2xl font-black text-sm active:scale-95 text-white flex items-center justify-center gap-2" style={{background:RC}}>
                <Download size={15}/> Télécharger PDF
              </button>
              <button onClick={()=>doPrint(exportModal)} className="py-3 rounded-2xl font-black text-sm active:scale-95 border-2 border-border flex items-center justify-center gap-2">
                <FileText size={15}/> Imprimer
              </button>
            </div>
            <button onClick={()=>setExportModal(null)} className="w-full py-2.5 rounded-2xl font-bold text-sm text-muted-foreground active:scale-95">Annuler</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
