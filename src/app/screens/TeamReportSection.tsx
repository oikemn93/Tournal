import React, { useMemo, useState } from "react";
import type { EmployeePerformanceReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type SortKey = "operator_name" | "invoiced_revenue" | "sales_count" | "average_basket" | "return_rate";
type SortDir = "asc" | "desc";

export function TeamReportSection({ report }: { report: EmployeePerformanceReport | null }) {
  const [sort, setSort] = useState<SortKey>("invoiced_revenue");
  const [dir, setDir] = useState<SortDir>("desc");
  const rows = useMemo(() => {
    const next = [...(report?.employees ?? [])];
    next.sort((a, b) => {
      const av = sort === "operator_name" ? a.operator_name : Number(a[sort] ?? 0);
      const bv = sort === "operator_name" ? b.operator_name : Number(b[sort] ?? 0);
      const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : av - Number(bv);
      return dir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [report, sort, dir]);

  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;

  const ranked = [...report.employees].sort((a, b) => b.invoiced_revenue - a.invoiced_revenue);
  const totalRevenue = ranked.reduce((sum, row) => sum + row.invoiced_revenue, 0);
  const totalSales = ranked.reduce((sum, row) => sum + row.sales_count, 0);
  const totalReturns = ranked.reduce((sum, row) => sum + row.returns_count, 0);
  const leader = ranked[0];
  const maxRevenue = Math.max(1, ...ranked.slice(0, 6).map(row => row.invoiced_revenue));

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(value => value === "desc" ? "asc" : "desc");
    else { setSort(key); setDir(key === "operator_name" ? "asc" : "desc"); }
  }
  const arrow = (key: SortKey) => sort === key ? (dir === "desc" ? "↓" : "↑") : "";

  return <div data-report-team-polish="1" className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Mini label="Équipe active" value={`${ranked.length}`} />
      <Mini label="Ventes attribuées" value={`${totalSales}`} />
      <Mini label="Leader CA" value={leader?.operator_name ?? "—"} />
      <Mini label="Retours" value={`${totalReturns}`} tone={totalReturns > 0 ? "text-amber-600" : ""} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-border p-3">
        <div className="mb-3"><p className="text-xs font-black">Contribution au chiffre d’affaires</p><p className="text-[11px] text-muted-foreground">Part de chaque membre dans le CA attribué</p></div>
        <div className="space-y-3">{ranked.slice(0, 6).map((row, index) => {
          const share = totalRevenue > 0 ? row.invoiced_revenue / totalRevenue * 100 : 0;
          return <div key={row.operator_id ?? `${row.operator_name}-${index}`}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold">#{index + 1} {row.operator_name}</span><span className="font-black">{share.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, row.invoiced_revenue / maxRevenue * 100)}%` }} /></div></div>;
        })}</div>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="mb-3"><p className="text-xs font-black">Qualité des ventes</p><p className="text-[11px] text-muted-foreground">Panier moyen et taux de retour</p></div>
        <div className="space-y-2">{ranked.slice(0, 6).map((row, index) => <div key={row.operator_id ?? `${row.operator_name}-quality-${index}`} className="flex items-center justify-between gap-3 border-t border-border py-2 text-xs first:border-0"><span className="min-w-0 truncate font-bold">{row.operator_name}</span><div className="flex shrink-0 items-center gap-3"><span>{fmt(row.average_basket)}</span><span className={(row.return_rate ?? 0) > 10 ? "font-black text-amber-600" : "font-bold text-muted-foreground"}>{(row.return_rate ?? 0).toFixed(1)}%</span></div></div>)}</div>
      </div>
    </div>

    <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted"><tr>
          <th className="px-3 py-2 text-left">Rang</th>
          <th className="px-3 py-2 text-left"><button type="button" onClick={() => toggleSort("operator_name")}>Employé {arrow("operator_name")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSort("invoiced_revenue")}>CA {arrow("invoiced_revenue")}</button></th>
          <th className="px-3 py-2 text-right">Contribution</th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSort("sales_count")}>Ventes {arrow("sales_count")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSort("average_basket")}>Panier {arrow("average_basket")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSort("return_rate")}>Retours {arrow("return_rate")}</button></th>
        </tr></thead>
        <tbody>{rows.map((row, index) => {
          const rank = ranked.findIndex(candidate => candidate.operator_id === row.operator_id && candidate.operator_name === row.operator_name) + 1;
          const share = totalRevenue > 0 ? row.invoiced_revenue / totalRevenue * 100 : 0;
          return <tr key={row.operator_id ?? `${row.operator_name}-${index}`} className={index % 2 ? "bg-muted/20" : ""}>
            <td className="px-3 py-2.5 font-black">#{rank || "—"}</td>
            <td className="px-3 py-2.5 font-bold">{row.operator_name}</td>
            <td className="px-3 py-2.5 text-right font-black">{fmt(row.invoiced_revenue)}</td>
            <td className="px-3 py-2.5 text-right">{share.toFixed(1)}%</td>
            <td className="px-3 py-2.5 text-right">{row.sales_count}</td>
            <td className="px-3 py-2.5 text-right">{fmt(row.average_basket)}</td>
            <td className={`px-3 py-2.5 text-right ${(row.return_rate ?? 0) > 10 ? "font-black text-amber-600" : ""}`}>{row.returns_count} · {(row.return_rate ?? 0).toFixed(1)}%</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function Mini({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-black ${tone}`}>{value}</p></div>;
}
