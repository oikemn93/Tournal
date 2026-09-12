import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Filter, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { Boutique, DashPeriod, PaymentMethod } from "../types";
import { inputCls, PAYMENT_METHODS, PM_COLOR, PM_ICON, SEM } from "../constants";
import { fmt } from "../utils/formatting";
import { filterByPeriod } from "../utils/inventory";
import { filterPaymentEventsByPeriod } from "../utils/payments";
import { boundedBootstrapCutoffIso, loadBoutiqueHistoryRange, type BoutiqueHistoryPatch } from "../../lib/api";
import { loadFinancialMetrics, type FinancialMetrics } from "../../lib/dashboardApi";
import { loadSalesProductReport, type SalesProductReport } from "../../lib/reportApi";

function periodBounds(period: DashPeriod, customFrom: string, customTo: string) {
  const now = new Date();
  let from = new Date(now);
  let to = new Date(now.getTime() + 1000);
  if (period === "jour") {
    from.setHours(0, 0, 0, 0);
  } else if (period === "semaine") {
    from.setDate(from.getDate() - 7);
  } else if (period === "mois") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "annee") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now);
    if (customTo) {
      to = new Date(`${customTo}T00:00:00`);
      to.setDate(to.getDate() + 1);
    }
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const mergeById = <T extends { id: unknown }>(current: T[], older: T[]) =>
  [...new Map([...current, ...older].map(item => [item.id, item])).values()];

export function ComptabiliteView({ boutique, canSeeMargin = false }: { boutique: Boutique; canSeeMargin?: boolean }) {
  const RC = boutique.color;
  const [period, setPeriod] = useState<DashPeriod>("jour");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [historicalPatch, setHistoricalPatch] = useState<BoutiqueHistoryPatch | null>(null);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [salesReport, setSalesReport] = useState<SalesProductReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [exporting, setExporting] = useState(false);

  const bounds = useMemo(() => periodBounds(period, customFrom, customTo), [period, customFrom, customTo]);
  const invoices = useMemo(
    () => mergeById(boutique.invoices, historicalPatch?.invoices ?? []) as typeof boutique.invoices,
    [boutique.invoices, historicalPatch?.invoices],
  );
  const creditRefunds = useMemo(
    () => mergeById(boutique.clientCreditRefunds ?? [], historicalPatch?.clientCreditRefunds ?? []) as NonNullable<typeof boutique.clientCreditRefunds>,
    [boutique.clientCreditRefunds, historicalPatch?.clientCreditRefunds],
  );

  useEffect(() => {
    if (new Date(bounds.from).getTime() >= new Date(boundedBootstrapCutoffIso()).getTime()) {
      setHistoricalPatch(null);
      return;
    }
    let cancelled = false;
    void loadBoutiqueHistoryRange(boutique.id, bounds.from, bounds.to)
      .then(patch => { if (!cancelled) setHistoricalPatch(patch); })
      .catch(() => { if (!cancelled) setHistoricalPatch(null); });
    return () => { cancelled = true; };
  }, [boutique.id, bounds.from, bounds.to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([
      loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds }),
      loadSalesProductReport({ boutiqueId: boutique.id, ...bounds }),
    ]).then(([financial, products]) => {
      if (cancelled) return;
      setMetrics(financial);
      setSalesReport(products);
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Rapport indisponible");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [boutique.id, bounds.from, bounds.to]);

  const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo);
  const filtCreditRefunds = filterByPeriod(creditRefunds, period, customFrom, customTo);
  const reportPaymentMethods: PaymentMethod[] = [...PAYMENT_METHODS, "Avoir client"];
  const byMethode = reportPaymentMethods.map(m => {
    const payments = filtPayments.filter(payment => payment.paymentMethod === m);
    const refunds = filtCreditRefunds.filter(refund => refund.paymentMethod === m);
    return {
      m,
      total: payments.reduce((sum, payment) => sum + payment.signedAmount, 0) - refunds.reduce((sum, refund) => sum + refund.amount, 0),
      count: payments.length + refunds.length,
    };
  }).filter(row => row.count > 0);

  const filteredProducts = useMemo(() => {
    const rows = salesReport?.products ?? [];
    return category === "all" ? rows : rows.filter(row => (row.category_id || "") === category);
  }, [salesReport?.products, category]);
  const best = useMemo(() => [...filteredProducts].sort((a, b) => b.invoiced_revenue - a.invoiced_revenue).slice(0, 8), [filteredProducts]);
  const worst = useMemo(() => [...filteredProducts].sort((a, b) => a.invoiced_revenue - b.invoiced_revenue).slice(0, 8), [filteredProducts]);

  const periodBtns: Array<{ id: DashPeriod; label: string }> = [
    { id: "jour", label: "Aujourd'hui" },
    { id: "semaine", label: "Semaine" },
    { id: "mois", label: "Mois" },
    { id: "custom", label: "Personnalisé" },
  ];
  const periodLabel: Record<DashPeriod, string> = {
    jour: "Aujourd'hui",
    semaine: "7 jours",
    mois: "Ce mois",
    annee: "Cette année",
    custom: "Période personnalisée",
  };

  const reconciliationGap = metrics && salesReport ? Math.abs(Number(metrics.invoiced_revenue) - Number(salesReport.invoiced_revenue)) : 0;
  const marginWarning = canSeeMargin && metrics?.realized_margin_fifo != null && ((metrics.margin_coverage_rate ?? 100) < 99.99 || (metrics.margin_unmatched_lines ?? 0) > 0)
    ? `Couverture FIFO ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(metrics.margin_coverage_rate ?? 0)} % · ${metrics.margin_unmatched_lines ?? 0} ligne(s) sans coût fiable`
    : null;

  function buildPdfHtml() {
    const productRows = best.map(row => `<tr><td>${row.product_name}</td><td>${row.category_name}</td><td class="num">${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(row.quantity)}</td><td class="num">${fmt(row.invoiced_revenue)}</td>${canSeeMargin ? `<td class="num">${row.realized_margin_fifo == null ? "—" : fmt(row.realized_margin_fifo)}</td>` : ""}</tr>`).join("");
    const paymentRows = byMethode.map(row => `<tr><td>${row.m}</td><td class="num">${row.count}</td><td class="num">${fmt(row.total)}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:28px;color:#18181b}h1{font-size:22px}h2{font-size:14px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:6px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.k{background:#f7f7f7;padding:12px;border-radius:10px}.l{font-size:9px;color:#777;text-transform:uppercase}.v{font-size:16px;font-weight:800;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border-bottom:1px solid #eee;text-align:left}.num{text-align:right}</style></head><body><h1>${boutique.nom} — Rapport ventes</h1><p>${periodLabel[period]} · ${new Date().toLocaleString("fr-FR")}</p><div class="grid"><div class="k"><div class="l">CA facturé</div><div class="v">${fmt(metrics?.invoiced_revenue ?? 0)}</div></div><div class="k"><div class="l">CA encaissé</div><div class="v">${fmt(metrics?.collected_cash ?? 0)}</div></div><div class="k"><div class="l">Transactions</div><div class="v">${metrics?.sales_count ?? 0}</div></div><div class="k"><div class="l">Panier moyen</div><div class="v">${fmt(metrics?.average_basket ?? 0)}</div></div></div><h2>Meilleurs produits</h2><table><thead><tr><th>Produit</th><th>Catégorie</th><th class="num">Qté</th><th class="num">CA</th>${canSeeMargin ? '<th class="num">Marge FIFO</th>' : ''}</tr></thead><tbody>${productRows}</tbody></table><h2>Modes de paiement</h2><table><thead><tr><th>Mode</th><th class="num">Opérations</th><th class="num">Montant</th></tr></thead><tbody>${paymentRows}</tbody></table></body></html>`;
  }

  async function downloadPdf() {
    if (exporting) return;
    setExporting(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;background:#fff";
    document.body.appendChild(iframe);
    try {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) throw new Error("Aperçu PDF indisponible");
      doc.open(); doc.write(buildPdfHtml()); doc.close();
      await new Promise(resolve => setTimeout(resolve, 250));
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(doc.body, { scale: 1.4, useCORS: true, backgroundColor: "#ffffff", windowWidth: 900 });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = canvas.height / canvas.width * pdfW;
      const img = canvas.toDataURL("image/jpeg", 0.88);
      for (let offset = 0; offset < imgH; offset += pdfH) {
        if (offset > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, -offset, pdfW, imgH);
      }
      pdf.save(`Rapport-ventes-${boutique.nom.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${period}.pdf`);
    } finally {
      iframe.remove();
      setExporting(false);
    }
  }

  return <div data-screen-source="canonical-report-v2" className="space-y-4 pb-24">
    <div className="flex gap-1.5 bg-card rounded-2xl p-1.5 border border-border">
      {periodBtns.map(item => <button key={item.id} onClick={() => setPeriod(item.id)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: period === item.id ? RC : "transparent", color: period === item.id ? "#fff" : "#6b7280" }}>{item.label}</button>)}
    </div>
    {period === "custom" && <div className="flex gap-2"><div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">DU</label><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={inputCls} /></div><div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">AU</label><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={inputCls} /></div></div>}

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
    {loading && metrics && <div className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">Actualisation du rapport…</div>}
    {marginWarning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{marginWarning}</div>}
    {reconciliationGap > 0.5 && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Écart de réconciliation produits / CA facturé : {fmt(reconciliationGap)}</div>}

    <div className="grid grid-cols-2 gap-2">
      {[
        { label: "CA facturé", value: fmt(metrics?.invoiced_revenue ?? 0), color: "#C9A227" },
        { label: "CA encaissé", value: fmt(metrics?.collected_cash ?? 0), color: RC },
        { label: "Transactions", value: `${metrics?.sales_count ?? 0}`, color: "#6b7280" },
        { label: "Panier moyen", value: fmt(metrics?.average_basket ?? 0), color: "#a855f7" },
        { label: "Impayé sur la période", value: fmt(metrics?.period_outstanding ?? 0), color: SEM.warning.accent },
        ...(canSeeMargin && metrics?.realized_margin_fifo != null ? [{ label: "Marge commerciale FIFO", value: fmt(metrics.realized_margin_fifo), color: metrics.realized_margin_fifo >= 0 ? SEM.success.accent : SEM.danger.accent }] : []),
      ].map(card => <div key={card.label} className="bg-card rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{card.label}</p><p className="text-2xl font-black mt-1" style={{ color: card.color, fontFamily: "'Nunito',sans-serif" }}>{card.value}</p></div>)}
    </div>

    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BookOpen size={16} style={{ color: RC }} /><div><p className="font-bold text-sm">Classement produits</p><p className="text-xs text-muted-foreground">Quantité nette, CA facturé net et marge FIFO canonique</p></div></div><div className="flex items-center gap-1.5"><Filter size={14} className="text-muted-foreground" /><select value={category} onChange={e => setCategory(e.target.value)} className="max-w-[150px] rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold"><option value="all">Toutes catégories</option>{(salesReport?.categories ?? []).map(item => <option key={item.id || "uncategorized"} value={item.id}>{item.name}</option>)}</select></div></div>
      <div className="grid md:grid-cols-2 md:divide-x divide-border">
        <div><div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-600" /><p className="text-xs font-black">Meilleurs vendeurs</p></div>{best.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Aucune vente sur la période</p> : best.map((row, index) => <ProductRow key={row.product_id} row={row} rank={index + 1} canSeeMargin={canSeeMargin} />)}</div>
        <div><div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2"><TrendingDown size={15} className="text-amber-600" /><p className="text-xs font-black">Plus faibles vendeurs</p></div>{worst.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Aucune vente sur la période</p> : worst.map((row, index) => <ProductRow key={row.product_id} row={row} rank={index + 1} canSeeMargin={canSeeMargin} />)}</div>
      </div>
    </div>

    {byMethode.length > 0 && <div className="bg-card rounded-2xl border border-border overflow-hidden"><div className="px-4 py-3 border-b border-border flex items-center gap-2"><Wallet size={16} style={{ color: RC }} /><p className="font-bold text-sm">Modes de paiement</p></div>{byMethode.map(row => <div key={row.m} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0"><span className="text-sm flex items-center gap-2">{PM_ICON[row.m]} <span style={{ color: PM_COLOR[row.m] }}>{row.m}</span><span className="text-xs text-muted-foreground">({row.count})</span>{row.m === "Avoir client" && <span className="text-[10px] text-muted-foreground">crédit déjà reçu</span>}</span><span className="font-black text-sm" style={{ color: PM_COLOR[row.m], fontFamily: "'Nunito',sans-serif" }}>{fmt(row.total)}</span></div>)}</div>}

    <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3"><div><p className="font-bold text-sm">Export PDF</p><p className="text-xs text-muted-foreground">KPIs, meilleurs produits et modes de paiement</p></div><button type="button" onClick={() => void downloadPdf()} disabled={exporting || !metrics} className="rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-50 flex items-center gap-2" style={{ background: RC }}><Download size={15} />{exporting ? "Génération…" : "Télécharger"}</button></div>
  </div>;
}

function ProductRow({ row, rank, canSeeMargin }: { row: SalesProductReport["products"][number]; rank: number; canSeeMargin: boolean }) {
  return <div className="px-4 py-3 border-b border-border last:border-0"><div className="flex items-start gap-3"><span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-black">{rank}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-sm font-bold truncate">{row.product_name}</p><p className="text-[11px] text-muted-foreground truncate">{row.category_name}</p></div><p className="text-sm font-black whitespace-nowrap">{fmt(row.invoiced_revenue)}</p></div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>Qté nette <b className="text-foreground">{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(row.quantity)}</b></span>{canSeeMargin && row.realized_margin_fifo != null && <span>Marge <b className="text-foreground">{fmt(row.realized_margin_fifo)}</b></span>}{canSeeMargin && (row.margin_unmatched_lines ?? 0) > 0 && <span className="text-amber-700">FIFO incomplet</span>}</div></div></div></div>;
}
