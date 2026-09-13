import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, Users } from "lucide-react";
import type { ClientReport, ClientReportRow } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type SortKey = "client_name" | "invoiced_revenue" | "sales_count" | "collected_cash" | "outstanding_global" | "overdue_global";
type SortDir = "asc" | "desc";

export function ClientReportSection({ report, color }: { report: ClientReport | null; color: string }) {
  const [sort, setSort] = useState<SortKey>("invoiced_revenue");
  const [dir, setDir] = useState<SortDir>("desc");
  const rows = useMemo(() => {
    const next = [...(report?.clients ?? [])];
    next.sort((a,b) => {
      const av = sort === "client_name" ? a.client_name : Number(a[sort] ?? 0);
      const bv = sort === "client_name" ? b.client_name : Number(b[sort] ?? 0);
      const cmp = typeof av === "string" ? av.localeCompare(String(bv), "fr") : av - Number(bv);
      return dir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [report, sort, dir]);
  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;
  const top = [...report.clients].sort((a,b)=>b.invoiced_revenue-a.invoiced_revenue).slice(0,5);
  const max = Math.max(1, ...top.map(row => Math.abs(row.invoiced_revenue)));
  const overdue = [...report.clients].filter(row => row.overdue_global > 0.005).sort((a,b)=>b.overdue_global-a.overdue_global).slice(0,8);
  function chooseSort(key: SortKey) { if (sort === key) setDir(value => value === "desc" ? "asc" : "desc"); else { setSort(key); setDir(key === "client_name" ? "asc" : "desc"); } }
  return <div data-report-clients-full="1" className="space-y-4">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Mini label="Clients actifs · période" value={`${report.active_clients_period}`} /><Mini label="CA clients enregistrés · période" value={fmt(report.registered_invoiced_revenue)} /><Mini label="Clients en retard · global" value={`${report.clients_overdue}`} tone={report.clients_overdue>0?"text-red-600":""} /><Mini label="Retard total · global" value={fmt(report.overdue_global)} tone={report.overdue_global>0?"text-red-600":""} /></div>
    <div className="rounded-xl border border-border bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">L’activité et le CA suivent la période sélectionnée. Les encours, retards et avoirs sont des positions globales actuelles. Le retard global peut dépasser la somme des clients listés : les factures sans client enregistré sont incluses dans le total global mais ne peuvent pas apparaître dans le détail client.</div>
    <div className="grid gap-3 xl:grid-cols-2"><section className="rounded-xl border border-border p-3"><p className="text-xs font-black">Meilleurs clients sur la période</p><p className="mb-3 text-[11px] text-muted-foreground">CA net, retours inclus</p>{top.length===0?<Empty/>:<div className="space-y-3">{top.map(row=><div key={row.client_id}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-bold">{row.client_name}</span><span className="font-black tabular-nums">{fmt(row.invoiced_revenue)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{width:`${Math.max(2,Math.abs(row.invoiced_revenue)/max*100)}%`}}/></div></div>)}</div>}</section><section className="rounded-xl border border-border p-3"><div className="flex items-center gap-2"><AlertTriangle size={15} className="text-red-600"/><p className="text-xs font-black">Créances globales en retard</p></div><p className="mb-3 text-[11px] text-muted-foreground">Situation actuelle, indépendamment de la période</p>{overdue.length===0?<Empty/>:<div>{overdue.map(row=><div key={row.client_id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-xs first:border-0"><span className="truncate font-bold">{row.client_name}</span><span className="font-black text-red-600 tabular-nums">{fmt(row.overdue_global)}</span></div>)}</div>}</section></div>
    <div><div className="mb-2 flex items-center gap-2"><Users size={15} style={{color}}/><div><p className="text-xs font-black">Détail clients</p><p className="text-[11px] text-muted-foreground">Tri cliquable · panier calculé sur le CA net de la période</p></div></div><div className="max-h-[440px] overflow-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="sticky top-0 z-10 bg-muted"><tr><Head label="Client" active={sort==="client_name"} dir={dir} onClick={()=>chooseSort("client_name")} left/><Head label="CA période" active={sort==="invoiced_revenue"} dir={dir} onClick={()=>chooseSort("invoiced_revenue")}/><Head label="Ventes" active={sort==="sales_count"} dir={dir} onClick={()=>chooseSort("sales_count")}/><th className="px-3 py-2 text-right">Panier</th><Head label="Encaissé période" active={sort==="collected_cash"} dir={dir} onClick={()=>chooseSort("collected_cash")}/><Head label="Encours global" active={sort==="outstanding_global"} dir={dir} onClick={()=>chooseSort("outstanding_global")}/><Head label="Retard global" active={sort==="overdue_global"} dir={dir} onClick={()=>chooseSort("overdue_global")}/></tr></thead><tbody>{rows.map((row,index)=><ClientRow key={row.client_id} row={row} index={index}/>)}</tbody></table></div></div>
  </div>;
}
function ClientRow({row,index}:{row:ClientReportRow;index:number}) { const basket = row.sales_count > 0 ? row.invoiced_revenue / row.sales_count : 0; return <tr className={index%2?"bg-muted/20":""}><td className="px-3 py-2.5"><p className="font-bold">{row.client_name}</p><p className="text-[10px] text-muted-foreground">{row.client_type || "Client"}{row.returns_count?` · ${row.returns_count} retour(s)`:""}</p></td><td className="px-3 py-2.5 text-right font-black tabular-nums">{fmt(row.invoiced_revenue)}</td><td className="px-3 py-2.5 text-right tabular-nums">{row.sales_count}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(basket)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(row.collected_cash)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(row.outstanding_global)}</td><td className={`px-3 py-2.5 text-right font-bold tabular-nums ${row.overdue_global>0.005?"text-red-600":""}`}>{fmt(row.overdue_global)}</td></tr>; }
function Head({label,active,dir,onClick,left=false}:{label:string;active:boolean;dir:SortDir;onClick:()=>void;left?:boolean}){return <th className={`px-3 py-2 ${left?"text-left":"text-right"}`}><button type="button" onClick={onClick} className={`inline-flex items-center gap-1 font-bold ${left?"":"ml-auto"}`}>{label}{active&&(dir==="desc"?<ArrowDown size={12}/>:<ArrowUp size={12}/>)}</button></th>}
function Mini({label,value,tone=""}:{label:string;value:string;tone?:string}){return <div className="rounded-xl bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-black ${tone}`}>{value}</p></div>}
function Empty(){return <p className="py-5 text-center text-xs text-muted-foreground">Aucune donnée.</p>}
