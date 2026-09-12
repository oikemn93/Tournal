import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { EmployeePerformanceReport, EmployeePerformanceRow } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type SortKey = "rank" | "operator_name" | "invoiced_revenue" | "contribution" | "sales_count" | "average_basket" | "return_rate";
type Direction = "asc" | "desc";

function change(current: number, previous: number) {
  if (Math.abs(previous) < 0.005) return Math.abs(current) < 0.005 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Variation({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  const value = change(current, previous);
  if (value == null) return <span className="text-[10px] font-bold text-muted-foreground">Pas de comparaison</span>;
  const positive = inverse ? value < -0.05 : value > 0.05;
  const negative = inverse ? value > 0.05 : value < -0.05;
  const cls = positive ? "text-emerald-600" : negative ? "text-red-600" : "text-muted-foreground";
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-black ${cls}`}><Icon size={12}/>{Math.abs(value).toFixed(1)}% vs période précédente</span>;
}

function SummaryCard({ label, value, current, previous, inverse = false }: { label: string; value: string; current?: number; previous?: number; inverse?: boolean }) {
  return <div className="rounded-xl border border-border bg-card p-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black tracking-tight">{value}</p>{current != null && previous != null && <div className="mt-1"><Variation current={current} previous={previous} inverse={inverse}/></div>}</div>;
}

function employeeKey(row: EmployeePerformanceRow) { return row.operator_id ?? `name:${row.operator_name}`; }

export function TeamReportSection({ report, previous }: { report: EmployeePerformanceReport | null; previous: EmployeePerformanceReport | null }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [direction, setDirection] = useState<Direction>("asc");

  const ranked = useMemo(() => [...(report?.employees ?? [])].sort((a,b) => b.invoiced_revenue - a.invoiced_revenue), [report]);
  const previousRanked = useMemo(() => [...(previous?.employees ?? [])].sort((a,b) => b.invoiced_revenue - a.invoiced_revenue), [previous]);
  const totalRevenue = Number(report?.invoiced_revenue ?? 0);
  const previousRevenue = Number(previous?.invoiced_revenue ?? 0);
  const salesCount = ranked.reduce((sum,row) => sum + row.sales_count, 0);
  const previousSalesCount = previousRanked.reduce((sum,row) => sum + row.sales_count, 0);
  const returnsCount = ranked.reduce((sum,row) => sum + row.returns_count, 0);
  const previousReturnsCount = previousRanked.reduce((sum,row) => sum + row.returns_count, 0);
  const averageBasket = salesCount > 0 ? totalRevenue / salesCount : 0;
  const previousAverageBasket = previousSalesCount > 0 ? previousRevenue / previousSalesCount : 0;
  const returnRate = salesCount > 0 ? (returnsCount / salesCount) * 100 : 0;
  const previousReturnRate = previousSalesCount > 0 ? (previousReturnsCount / previousSalesCount) * 100 : 0;
  const previousByEmployee = useMemo(() => new Map(previousRanked.map(row => [employeeKey(row), row])), [previousRanked]);

  const rows = useMemo(() => {
    const base = ranked.map((row,index) => ({ row, rank: index + 1, contribution: totalRevenue > 0 ? (row.invoiced_revenue / totalRevenue) * 100 : 0 }));
    if (sortKey === "rank") return direction === "asc" ? base : [...base].reverse();
    return [...base].sort((a,b) => {
      let cmp = 0;
      if (sortKey === "operator_name") cmp = a.row.operator_name.localeCompare(b.row.operator_name);
      else if (sortKey === "contribution") cmp = a.contribution - b.contribution;
      else cmp = Number(a.row[sortKey]) - Number(b.row[sortKey]);
      return direction === "asc" ? cmp : -cmp;
    });
  }, [ranked, totalRevenue, sortKey, direction]);

  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;

  function toggleSort(next: SortKey) {
    if (sortKey === next) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSortKey(next); setDirection(next === "operator_name" || next === "rank" ? "asc" : "desc"); }
  }
  const marker = (key: SortKey) => sortKey === key ? (direction === "asc" ? " ↑" : " ↓") : "";
  const maxRevenue = Math.max(1, ...ranked.slice(0,5).map(row => row.invoiced_revenue));

  return <div className="space-y-4" data-report-ui-team-stage="3">
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <SummaryCard label="CA équipe" value={fmt(totalRevenue)} current={totalRevenue} previous={previousRevenue}/>
      <SummaryCard label="Ventes attribuées" value={`${salesCount}`} current={salesCount} previous={previousSalesCount}/>
      <SummaryCard label="Panier moyen équipe" value={fmt(averageBasket)} current={averageBasket} previous={previousAverageBasket}/>
      <SummaryCard label="Taux de retour" value={`${returnRate.toFixed(1)}%`} current={returnRate} previous={previousReturnRate} inverse/>
    </div>

    <div className="rounded-xl border border-border p-3">
      <div className="mb-3"><p className="text-xs font-black">Contribution au CA</p><p className="text-[11px] text-muted-foreground">Top 5 employés classés par chiffre d’affaires net.</p></div>
      <div className="space-y-3">{ranked.slice(0,5).map((row,index) => {
        const contribution = totalRevenue > 0 ? (row.invoiced_revenue / totalRevenue) * 100 : 0;
        return <div key={employeeKey(row)}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold"><span className="mr-2 text-muted-foreground">#{index+1}</span>{row.operator_name}</span><span className="shrink-0 font-black">{contribution.toFixed(1)}% · {fmt(row.invoiced_revenue)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{width:`${Math.max(2,row.invoiced_revenue/maxRevenue*100)}%`}}/></div>
        </div>;
      })}</div>
    </div>

    <div className="max-h-[440px] overflow-auto rounded-xl border border-border">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="sticky top-0 bg-muted"><tr>
          <th className="px-3 py-2 text-left"><button type="button" onClick={()=>toggleSort("rank")} className="font-black">Rang{marker("rank")}</button></th>
          <th className="px-3 py-2 text-left"><button type="button" onClick={()=>toggleSort("operator_name")} className="font-black">Employé{marker("operator_name")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={()=>toggleSort("invoiced_revenue")} className="font-black">CA{marker("invoiced_revenue")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={()=>toggleSort("contribution")} className="font-black">Contribution{marker("contribution")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={()=>toggleSort("sales_count")} className="font-black">Ventes{marker("sales_count")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={()=>toggleSort("average_basket")} className="font-black">Panier{marker("average_basket")}</button></th>
          <th className="px-3 py-2 text-right"><button type="button" onClick={()=>toggleSort("return_rate")} className="font-black">Retours{marker("return_rate")}</button></th>
        </tr></thead>
        <tbody>{rows.map(({row,rank,contribution},index) => {
          const old = previousByEmployee.get(employeeKey(row));
          return <tr key={employeeKey(row)} className={index%2 ? "bg-muted/20" : ""}>
            <td className="px-3 py-2.5 font-black">#{rank}</td>
            <td className="px-3 py-2.5 font-bold">{row.operator_name}</td>
            <td className="px-3 py-2.5 text-right"><div className="font-black">{fmt(row.invoiced_revenue)}</div>{old&&<Variation current={row.invoiced_revenue} previous={old.invoiced_revenue}/>}</td>
            <td className="px-3 py-2.5 text-right font-bold">{contribution.toFixed(1)}%</td>
            <td className="px-3 py-2.5 text-right">{row.sales_count}</td>
            <td className="px-3 py-2.5 text-right">{fmt(row.average_basket)}</td>
            <td className={`px-3 py-2.5 text-right font-bold ${(row.return_rate ?? 0)>10?"text-amber-600":"text-muted-foreground"}`}>{row.return_rate == null ? "—" : `${row.return_rate.toFixed(1)}%`}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
