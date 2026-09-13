import React, { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import { loadFinancialMetrics } from "../../lib/dashboardApi";
import { loadChargeReport, loadClientReport, loadEmployeePerformanceReport, loadSalesProductReport, loadStockInventoryReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type Props = { boutiqueId: string; boutiqueName: string; from: string; to: string; canSeeMargin: boolean; color: string };

export function ReportExportActions({ boutiqueId, boutiqueName, from, to, canSeeMargin, color }: Props) {
  const [busy, setBusy] = useState<"pdf"|"csv"|null>(null);
  const [error, setError] = useState("");
  async function loadBundle() {
    const [metrics,sales,stock,clients,charges,team] = await Promise.all([
      loadFinancialMetrics({boutiqueId,from,to}), loadSalesProductReport({boutiqueId,from,to}),
      loadStockInventoryReport({boutiqueId,from,to,dormantDays:60}), loadClientReport({boutiqueId,from,to}), loadChargeReport({boutiqueId,from,to}),
      canSeeMargin ? loadEmployeePerformanceReport({boutiqueId,from,to}) : Promise.resolve(null),
    ]);
    return {metrics,sales,stock,clients,charges,team};
  }
  async function exportCsv() {
    setBusy("csv"); setError("");
    try {
      const b=await loadBundle(); const rows:string[][]=[]; const add=(...cells:unknown[])=>rows.push(cells.map(v=>String(v??"")));
      add("Rapport",boutiqueName); add("Période",from,to); add(); add("KPI","Valeur");
      add("CA facturé",b.metrics.invoiced_revenue); add("CA encaissé",b.metrics.collected_cash); add("Charges exploitation décaissées",b.metrics.operating_cash_expenses); add("Ventes",b.metrics.sales_count); add("Panier moyen",b.metrics.average_basket);
      if(canSeeMargin){add("Marge FIFO réalisée",b.metrics.realized_margin_fifo);add("Coût FIFO net",b.metrics.fifo_cost);add("Couverture FIFO %",b.metrics.margin_coverage_rate);}
      add(); add("Produits","Catégorie","Qté nette","CA net","Marge FIFO"); for(const r of b.sales.products)add(r.product_name,r.category_name,r.quantity,r.invoiced_revenue,r.realized_margin_fifo);
      add(); add("Modes de paiement","Montant","Événements"); for(const r of b.sales.payment_methods??[])add(r.payment_method,r.amount,r.events_count);
      add(); add("Clients","Ventes","CA période","Encaissé période","Encours global","Retard global"); for(const r of b.clients.clients)add(r.client_name,r.sales_count,r.invoiced_revenue,r.collected_cash,r.outstanding_global,r.overdue_global);
      add(); add("Stock","Stock actuel","Vendu net période","Rotation","Valeur FIFO actuelle"); for(const r of b.stock.products)add(r.product_name,r.current_stock,r.net_sold_qty,r.rotation_class,r.fifo_stock_value);
      add(); add("Charges","Catégorie","Date événement","Montant","Mode"); for(const r of b.charges.charges)add(r.label,r.category,r.event_at,r.amount,r.payment_method);
      if(b.team){add();add("Équipe","CA","Ventes","Panier","Retours %");for(const r of b.team.employees)add(r.operator_name,r.invoiced_revenue,r.sales_count,r.average_basket,r.return_rate);}
      const csv=rows.map(row=>row.map(cell=>`"${cell.replace(/"/g,'""')}"`).join(";")).join("\n");
      const blob=new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`rapport-${safeName(boutiqueName)}-${from.slice(0,10)}-${to.slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch(cause){setError(cause instanceof Error?cause.message:"Export CSV impossible");} finally{setBusy(null);}
  }
  async function exportPdf() {
    setBusy("pdf"); setError("");
    try {
      const b=await loadBundle(); const doc=new jsPDF({unit:"mm",format:"a4"}); let y=16; const line=(label:string,value?:string,bold=false)=>{if(y>280){doc.addPage();y=16;}doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(bold?11:9);doc.text(label,14,y);if(value)doc.text(value,196,y,{align:"right"});y+=6;};
      doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text(`Rapport — ${boutiqueName}`,14,y);y+=8;doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text(`${new Date(from).toLocaleDateString("fr-FR")} → ${new Date(to).toLocaleDateString("fr-FR")}`,14,y);y+=10;
      line("Synthèse",undefined,true);line("CA facturé",fmt(b.metrics.invoiced_revenue));line("CA encaissé",fmt(b.metrics.collected_cash));line("Charges exploitation décaissées",fmt(b.metrics.operating_cash_expenses));line("Ventes",String(b.metrics.sales_count));line("Panier moyen",fmt(b.metrics.average_basket));if(canSeeMargin){line("Marge FIFO réalisée",fmt(b.metrics.realized_margin_fifo??0));line("Coût FIFO net",fmt(b.metrics.fifo_cost??0));line("Couverture FIFO",`${Number(b.metrics.margin_coverage_rate??0).toFixed(1)} %`);}y+=3;
      line("Top produits",undefined,true);for(const r of [...b.sales.products].sort((a,c)=>c.invoiced_revenue-a.invoiced_revenue).slice(0,12))line(r.product_name,fmt(r.invoiced_revenue));y+=3;
      line("Modes de paiement",undefined,true);for(const r of b.sales.payment_methods??[])line(`${r.payment_method} (${r.events_count})`,fmt(r.amount));y+=3;
      line("Charges par catégorie",undefined,true);for(const r of b.charges.categories)line(r.category,fmt(r.amount));y+=3;
      line("Clients — top CA période",undefined,true);for(const r of [...b.clients.clients].sort((a,c)=>c.invoiced_revenue-a.invoiced_revenue).slice(0,10))line(r.client_name,fmt(r.invoiced_revenue));
      doc.save(`rapport-${safeName(boutiqueName)}-${from.slice(0,10)}-${to.slice(0,10)}.pdf`);
    } catch(cause){setError(cause instanceof Error?cause.message:"Export PDF impossible");} finally{setBusy(null);}
  }
  return <section data-report-export="real" className="rounded-2xl border border-border bg-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Download size={16} style={{color}}/><div><p className="text-sm font-bold">Exports</p><p className="text-xs text-muted-foreground">PDF de synthèse et CSV détaillé, recalculés sur la période sélectionnée.</p></div></div><div className="flex gap-2"><button type="button" disabled={busy!==null} onClick={()=>void exportPdf()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"><FileText size={14}/>{busy==="pdf"?"Génération…":"PDF"}</button><button type="button" disabled={busy!==null} onClick={()=>void exportCsv()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"><FileSpreadsheet size={14}/>{busy==="csv"?"Génération…":"CSV"}</button></div></div>{error&&<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}</section>;
}
function safeName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase()||"boutique";}
