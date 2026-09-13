import React from "react";
import { AlertTriangle, CalendarRange, PackageSearch } from "lucide-react";
import type { StockInventoryReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

export function StockReportSection({ report, days, onDays, canSeeMargin }: {
  report: StockInventoryReport | null;
  days: number;
  onDays: (days: number) => void;
  canSeeMargin: boolean;
}) {
  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;

  const dormant = report.products.filter(row => row.dormant && row.current_stock > 0);
  const lowRotation = report.products.filter(row => row.rotation_class === "lente" || row.rotation_class === "dormant");
  const variances = report.inventory_variances ?? [];

  return <div data-report-stock-temporality="explicit" className="space-y-4">
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="mb-3 flex items-start gap-2">
        <PackageSearch size={16} className="mt-0.5 text-amber-700" />
        <div><p className="text-xs font-black text-amber-900">Stock actuel · aujourd’hui</p><p className="text-[11px] text-amber-800">Les quantités en stock, la valeur FIFO et la dormance reflètent l’état actuel, même si la période du Rapport est historique.</p></div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Mini label="Produits dormants actuels" value={`${dormant.length}`} tone={dormant.length ? "text-amber-700" : ""} />
        <Mini label="Rotation lente / dormante" value={`${lowRotation.length}`} />
        {canSeeMargin && <Mini label="Valeur stock FIFO actuelle" value={fmt(report.stock_value_fifo ?? 0)} />}
        <div className="rounded-xl bg-background/80 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Seuil de dormance actuel</p><input aria-label="Seuil produits dormants" type="number" inputMode="numeric" min={1} max={3650} value={days} onChange={event => onDays(Math.max(1, Math.min(3650, Number(event.target.value) || 60)))} className="mt-1 w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm font-black" /></div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-background/70 p-3"><p className="mb-2 text-xs font-black">Stock dormant à traiter aujourd’hui</p>{dormant.length === 0 ? <p className="text-xs text-muted-foreground">Aucun stock dormant.</p> : dormant.slice(0,8).map(row => <div key={row.product_id} className="flex justify-between border-t border-border py-2 text-xs first:border-0"><span className="font-bold">{row.product_name}</span><span>Stock actuel <b>{row.current_stock}</b></span></div>)}</div>
    </section>

    <section className="rounded-xl border border-border p-3">
      <div className="mb-3 flex items-start gap-2"><CalendarRange size={16} className="mt-0.5 text-muted-foreground"/><div><p className="text-xs font-black">Activité sur la période sélectionnée</p><p className="text-[11px] text-muted-foreground">Ventes nettes et inventaires finalisés uniquement dans la période du Rapport.</p></div></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3"><Mini label="Produits vendus sur période" value={`${report.products.filter(row => row.net_sold_qty > 0).length}`} /><Mini label="Unités nettes vendues" value={`${report.products.reduce((sum,row)=>sum+Number(row.net_sold_qty||0),0)}`} /><Mini label="Inventaires finalisés" value={`${variances.length}`} /></div>
    </section>

    <section className="rounded-xl border border-border p-3">
      <div className="mb-3 flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 text-amber-600"/><div><p className="text-xs font-black">Écarts d’inventaire sur la période</p><p className="text-[11px] text-muted-foreground">Sessions d’inventaire finalisées entre les bornes sélectionnées.</p></div></div>
      {variances.length === 0 ? <p className="text-xs text-muted-foreground">Aucun inventaire finalisé sur la période.</p> : <div className="max-h-72 overflow-auto rounded-lg border border-border"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Périmètre</th><th className="px-3 py-2 text-right">Écart unités</th>{canSeeMargin && <th className="px-3 py-2 text-right">Écart coût</th>}</tr></thead><tbody>{variances.map((row,index)=><tr key={row.session_id} className={index%2?"bg-muted/20":""}><td className="whitespace-nowrap px-3 py-2">{new Date(row.finalized_at).toLocaleDateString("fr-FR")}</td><td className="px-3 py-2 font-bold">{row.scope_label}</td><td className="px-3 py-2 text-right tabular-nums">{row.variance_qty_abs}</td>{canSeeMargin && <td className="px-3 py-2 text-right tabular-nums">{row.variance_cost == null ? "—" : fmt(row.variance_cost)}</td>}</tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function Mini({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-black ${tone}`}>{value}</p></div>;
}
