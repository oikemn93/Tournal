import React, { useMemo } from "react";
import type { FinancialMetrics } from "../../lib/dashboardApi";
import type { SalesProductReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type Props = {
  metrics: FinancialMetrics | null;
  salesReport: SalesProductReport | null;
  canSeeMargin: boolean;
  color: string;
};

export function FinancialDeepReportSection({ metrics, salesReport, canSeeMargin, color }: Props) {
  const categories = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; revenue: number; margin: number | null; unmatched: number }>();
    for (const row of salesReport?.products ?? []) {
      const id = row.category_id || "";
      const current = grouped.get(id) ?? { id, name: row.category_name || "Sans catégorie", revenue: 0, margin: canSeeMargin ? 0 : null, unmatched: 0 };
      current.revenue += Number(row.invoiced_revenue || 0);
      if (canSeeMargin && row.realized_margin_fifo != null) current.margin = Number(current.margin || 0) + Number(row.realized_margin_fifo || 0);
      current.unmatched += Number(row.margin_unmatched_lines || 0);
      grouped.set(id, current);
    }
    return [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
  }, [salesReport?.products, canSeeMargin]);

  const products = useMemo(() => [...(salesReport?.products ?? [])].sort((a, b) => b.invoiced_revenue - a.invoiced_revenue).slice(0, 12), [salesReport?.products]);
  const operating = Number(metrics?.operating_cash_expenses ?? 0);
  const totalOut = Number(metrics?.cash_expenses ?? 0);
  const supplierAndStock = Math.max(0, totalOut - operating);
  const cashIn = Number(metrics?.collected_cash ?? 0);
  const netCash = cashIn - totalOut;
  const grossMargin = canSeeMargin && metrics?.realized_margin_fifo != null ? Number(metrics.realized_margin_fifo) : null;
  const purchases = grossMargin != null ? Math.max(0, Number(metrics?.margin_revenue ?? metrics?.invoiced_revenue ?? 0) - grossMargin) : null;
  const netResult = grossMargin != null ? grossMargin - operating : null;

  return <div data-report-phase="6" className="space-y-4">
    {canSeeMargin && <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Compte de résultat simplifié</p><p className="text-xs text-muted-foreground">P&amp;L sur la période, basé sur le CA et la marge FIFO canoniques. Visible uniquement avec la permission Marge.</p></div>
      <div className="divide-y divide-border">
        <PnlRow label="Chiffre d’affaires" value={Number(metrics?.invoiced_revenue ?? 0)} />
        <PnlRow label="Achats / coût des marchandises vendues (FIFO)" value={-(purchases ?? 0)} muted />
        <PnlRow label="Marge brute" value={grossMargin ?? 0} strong color={color} />
        <PnlRow label="Charges d’exploitation décaissées" value={-operating} muted />
        <PnlRow label="Résultat net simplifié" value={netResult ?? 0} strong color={(netResult ?? 0) >= 0 ? color : undefined} />
      </div>
      {(metrics?.margin_unmatched_lines ?? 0) > 0 && <div className="px-4 py-3 border-t border-border text-[11px] text-amber-700">Couverture FIFO incomplète : {metrics?.margin_unmatched_lines} ligne(s) non rapprochée(s). Le résultat reprend exactement la marge canonique disponible.</div>}
    </div>}

    {canSeeMargin && <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Marge par produit et catégorie</p><p className="text-xs text-muted-foreground">Ventilation issue du même moteur FIFO canonique que le total du Rapport</p></div>
      <div className="grid md:grid-cols-2 md:divide-x divide-border">
        <div><div className="px-4 py-2.5 bg-muted/40"><p className="text-xs font-black">Par catégorie</p></div>{categories.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">Aucune vente sur la période</p> : categories.map(row => <div key={row.id || "uncategorized"} className="px-4 py-3 border-t border-border"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold">{row.name}</span><span className="text-xs font-black">{fmt(row.margin ?? 0)}</span></div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>CA {fmt(row.revenue)}</span><span>{row.unmatched > 0 ? `${row.unmatched} ligne(s) FIFO incomplète(s)` : "FIFO couvert"}</span></div></div>)}</div>
        <div><div className="px-4 py-2.5 bg-muted/40"><p className="text-xs font-black">Par produit</p></div>{products.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">Aucune vente sur la période</p> : products.map(row => <div key={row.product_id} className="px-4 py-3 border-t border-border"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold truncate">{row.product_name}</span><span className="text-xs font-black">{row.realized_margin_fifo == null ? "—" : fmt(row.realized_margin_fifo)}</span></div><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{row.category_name}</span><span>CA {fmt(row.invoiced_revenue)}</span></div></div>)}</div>
      </div>
    </div>}

    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Flux de trésorerie</p><p className="text-xs text-muted-foreground">Entrées et sorties réelles sur la période, basées sur les métriques financières canoniques</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4">
        <div className="rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase font-bold text-muted-foreground">Entrées · CA encaissé</p><p className="font-black mt-1">{fmt(cashIn)}</p></div>
        <div className="rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase font-bold text-muted-foreground">Charges d'exploitation payées</p><p className="font-black mt-1">{fmt(operating)}</p></div>
        <div className="rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase font-bold text-muted-foreground">Fournisseurs / achats stock payés</p><p className="font-black mt-1">{fmt(supplierAndStock)}</p></div>
        <div className="rounded-xl bg-muted/30 p-3"><p className="text-[10px] uppercase font-bold text-muted-foreground">Flux net de trésorerie</p><p className="font-black mt-1" style={{ color: netCash >= 0 ? color : undefined }}>{fmt(netCash)}</p></div>
      </div>
      <div className="px-4 pb-4 text-[11px] text-muted-foreground">Sorties totales payées : <b className="text-foreground">{fmt(totalOut)}</b>. Les paiements fournisseurs/stock correspondent à la composante « Achat stock » déjà incluse dans les sorties canoniques.</div>
    </div>
  </div>;
}

function PnlRow({ label, value, strong = false, muted = false, color }: { label: string; value: number; strong?: boolean; muted?: boolean; color?: string }) {
  return <div className={`px-4 py-3 flex items-center justify-between gap-4 ${strong ? "bg-muted/20" : ""}`}><span className={`text-xs ${strong ? "font-black" : "font-bold"} ${muted ? "text-muted-foreground" : ""}`}>{label}</span><span className={`${strong ? "text-base font-black" : "text-sm font-bold"}`} style={{ color }}>{fmt(value)}</span></div>;
}
