import React, { useMemo, useState } from "react";
import type { FinancialMetrics } from "../../lib/dashboardApi";
import type { ChargeReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type SortKey = "event_at" | "label" | "category" | "amount";
type SortDir = "asc" | "desc";

export function ChargesReportSection({ report, metrics }: { report: ChargeReport | null; metrics: FinancialMetrics | null }) {
  const [sort, setSort] = useState<SortKey>("event_at");
  const [dir, setDir] = useState<SortDir>("desc");
  const rows = useMemo(() => {
    const next = [...(report?.charges ?? [])];
    next.sort((a, b) => {
      const av = sort === "amount" ? Number(a.amount) : String(a[sort] ?? "");
      const bv = sort === "amount" ? Number(b.amount) : String(b[sort] ?? "");
      const cmp = typeof av === "number" ? av - Number(bv) : av.localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [report, sort, dir]);

  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;

  const canonicalTotal = Number(metrics?.operating_cash_expenses ?? 0);
  const detailTotal = Number(report.operating_total ?? 0);
  const reconciliationGap = Math.abs(canonicalTotal - detailTotal);
  const maxCategory = Math.max(1, ...report.categories.map(row => Number(row.amount)));

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(value => value === "desc" ? "asc" : "desc");
    else { setSort(key); setDir(key === "label" || key === "category" ? "asc" : "desc"); }
  }
  const arrow = (key: SortKey) => sort === key ? (dir === "desc" ? "↓" : "↑") : "";

  return <div data-report-charges-restored="1" className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      <Mini label="Charges d’exploitation" value={fmt(canonicalTotal)} tone={canonicalTotal > 0 ? "text-red-600" : ""} />
      <Mini label="Écritures sur la période" value={`${report.entries_count}`} />
      <Mini label="Catégories actives" value={`${report.categories.length}`} />
    </div>

    <div className="rounded-xl border border-border p-3">
      <div className="mb-3">
        <p className="text-xs font-black">Répartition par catégorie</p>
        <p className="text-[11px] text-muted-foreground">Décaissements d’exploitation, hors achats de stock</p>
      </div>
      {report.categories.length === 0 ? <p className="text-xs text-muted-foreground">Aucune charge d’exploitation sur la période.</p> : <div className="space-y-3">{report.categories.map(row => <div key={row.category}>
        <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold">{row.category}</span><span className="font-black text-red-600">{fmt(row.amount)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, Number(row.amount) / maxCategory * 100)}%` }} /></div>
      </div>)}</div>}
    </div>

    {reconciliationGap > 0.5 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Écart de rapprochement détail / source canonique : {fmt(reconciliationGap)}. Le total affiché reste celui de get_financial_metrics.</div>}

    <div>
      <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-xs font-black">Détail des charges</p><p className="text-[11px] text-muted-foreground">Jusqu’à 500 écritures, triables</p></div></div>
      <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted"><tr>
            <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("event_at")}>Date {arrow("event_at")}</button></th>
            <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("label")}>Libellé {arrow("label")}</button></th>
            <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("category")}>Catégorie {arrow("category")}</button></th>
            <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSort("amount")}>Montant {arrow("amount")}</button></th>
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.id} className={index % 2 ? "bg-muted/20" : ""}>
            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{new Date(row.event_at).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}</td>
            <td className="px-3 py-2.5 font-bold">{row.label}{row.payment_method && <div className="text-[10px] font-normal text-muted-foreground">{row.payment_method}</div>}</td>
            <td className="px-3 py-2.5">{row.category}</td>
            <td className="px-3 py-2.5 text-right font-black tabular-nums text-red-600">{fmt(row.amount)}</td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">Aucune charge d’exploitation sur la période.</div>}
      </div>
    </div>
  </div>;
}

function Mini({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-black ${tone}`}>{value}</p></div>;
}
