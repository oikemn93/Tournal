import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BadgeEuro, Layers3, PackageCheck, Trophy } from "lucide-react";
import { fmt } from "../utils/formatting";
import type { FinancialMetrics } from "../../lib/dashboardApi";
import type { SalesProductReport, SalesProductReportRow } from "../../lib/reportApi";

type SortKey = "invoiced_revenue" | "quantity" | "product_name" | "realized_margin_fifo";
type SortDirection = "asc" | "desc";

export function SalesReportSection({ report, metrics, canSeeMargin }: { report: SalesProductReport | null; metrics: FinancialMetrics | null; canSeeMargin: boolean }) {
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("invoiced_revenue");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const rows = useMemo(() => {
    const filtered = (report?.products ?? []).filter(row => category === "all" || (row.category_id || "") === category);
    return [...filtered].sort((a, b) => {
      const sign = direction === "asc" ? 1 : -1;
      if (sort === "product_name") return sign * a.product_name.localeCompare(b.product_name, "fr");
      return sign * (Number(a[sort] ?? 0) - Number(b[sort] ?? 0));
    });
  }, [report, category, sort, direction]);

  if (!report) return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>;

  const byRevenue = [...rows].sort((a,b)=>b.invoiced_revenue-a.invoiced_revenue);
  const top = byRevenue.slice(0,5);
  const bottom = [...byRevenue].filter(r=>Math.abs(r.invoiced_revenue)>0.005).slice(-3).reverse();
  const maxRevenue = Math.max(1, ...top.map(r => Math.abs(r.invoiced_revenue)));
  const productQty = rows.reduce((sum,row)=>sum+row.quantity,0);
  const categoryTotals = report.categories.map(c=>({ name:c.name, value:(report.products ?? []).filter(r=>r.category_id===c.id).reduce((sum,r)=>sum+r.invoiced_revenue,0) })).filter(x=>Math.abs(x.value)>0.005).sort((a,b)=>b.value-a.value).slice(0,5);
  const maxCategory = Math.max(1, ...categoryTotals.map(x=>Math.abs(x.value)));
  const gap = metrics ? Math.abs(report.invoiced_revenue - metrics.invoiced_revenue) : 0;
  const marginRows = rows.filter(r=>r.realized_margin_fifo != null);
  const realizedMargin = marginRows.reduce((sum,r)=>sum+(r.realized_margin_fifo ?? 0),0);

  function chooseSort(key: SortKey) {
    if (sort === key) setDirection(v => v === "desc" ? "asc" : "desc");
    else { setSort(key); setDirection(key === "product_name" ? "asc" : "desc"); }
  }

  return <div data-report-ui-stage="3-sales" className="space-y-4">
    {gap > 0.5 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Écart de rapprochement produit : {fmt(gap)}. Le KPI principal reste issu du calcul financier canonique.</div>}

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Mini icon={<BadgeEuro size={14}/>} label="CA produits" value={fmt(report.invoiced_revenue)} />
      <Mini icon={<PackageCheck size={14}/>} label="Unités nettes" value={`${productQty}`} />
      <Mini icon={<Layers3 size={14}/>} label="Produits actifs" value={`${rows.length}`} />
      <Mini icon={<Trophy size={14}/>} label="Top produit" value={top[0]?.product_name ?? "—"} />
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      <VisualBlock title="Produits qui portent le CA" subtitle="Top 5 sur la sélection">
        <Bars items={top.map(r=>({name:r.product_name,value:r.invoiced_revenue}))} max={maxRevenue}/>
      </VisualBlock>
      <VisualBlock title="Répartition par catégorie" subtitle="Top 5 catégories par CA">
        {categoryTotals.length ? <Bars items={categoryTotals} max={maxCategory}/> : <Empty />}
      </VisualBlock>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <VisualBlock title="Meilleurs vendeurs" subtitle="Produits classés par CA net">
        <CompactList rows={top.slice(0,3)} />
      </VisualBlock>
      <VisualBlock title="Plus faibles vendeurs" subtitle="À surveiller sur la période">
        {bottom.length ? <CompactList rows={bottom} /> : <Empty />}
      </VisualBlock>
    </div>

    {canSeeMargin && <div className="rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black">Marge FIFO couverte par le détail produit</p><p className="text-[11px] text-muted-foreground">Somme des lignes dont la marge est disponible</p></div><p className="text-base font-black">{fmt(realizedMargin)}</p></div></div>}

    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black">Détail produits</p><p className="text-[11px] text-muted-foreground">Tri cliquable · valeurs numériques alignées</p></div><select aria-label="Filtrer par catégorie" value={category} onChange={e=>setCategory(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold"><option value="all">Toutes catégories</option>{report.categories.map(c=><option key={c.id||"none"} value={c.id}>{c.name}</option>)}</select></div>

    <div className="max-h-[420px] overflow-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="sticky top-0 z-10 bg-muted"><tr><SortHead label="Produit" active={sort==="product_name"} direction={direction} onClick={()=>chooseSort("product_name")} align="left"/><SortHead label="Qté" active={sort==="quantity"} direction={direction} onClick={()=>chooseSort("quantity")}/><SortHead label="CA" active={sort==="invoiced_revenue"} direction={direction} onClick={()=>chooseSort("invoiced_revenue")}/>{canSeeMargin&&<SortHead label="Marge" active={sort==="realized_margin_fifo"} direction={direction} onClick={()=>chooseSort("realized_margin_fifo")}/>}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.product_id} className={i%2?"bg-muted/20":""}><td className="px-3 py-2.5 font-bold">{r.product_name}<div className="text-[10px] font-normal text-muted-foreground">{r.category_name}</div></td><td className="px-3 py-2.5 text-right tabular-nums">{r.quantity}</td><td className="px-3 py-2.5 text-right font-black tabular-nums">{fmt(r.invoiced_revenue)}</td>{canSeeMargin&&<td className="px-3 py-2.5 text-right tabular-nums">{r.realized_margin_fifo==null?"—":fmt(r.realized_margin_fifo)}</td>}</tr>)}</tbody></table></div>
  </div>;
}

function Mini({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-xl border border-border bg-muted/25 p-3"><div className="flex items-center gap-1.5 text-muted-foreground">{icon}<p className="text-[10px] font-bold uppercase">{label}</p></div><p className="mt-1 truncate text-lg font-black">{value}</p></div>}
function VisualBlock({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <div className="rounded-xl border border-border p-3"><div className="mb-3"><p className="text-xs font-black">{title}</p><p className="text-[11px] text-muted-foreground">{subtitle}</p></div>{children}</div>}
function Bars({items,max}:{items:Array<{name:string;value:number}>;max:number}){return <div className="space-y-3">{items.map(x=><div key={x.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-bold">{x.name}</span><span className="font-black tabular-nums">{fmt(x.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{width:`${Math.max(2,Math.abs(x.value)/max*100)}%`}}/></div></div>)}</div>}
function CompactList({rows}:{rows:SalesProductReportRow[]}){return <div>{rows.map((r,i)=><div key={r.product_id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-xs first:border-0 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate font-bold">{i+1}. {r.product_name}</p><p className="truncate text-[10px] text-muted-foreground">{r.category_name}</p></div><span className="shrink-0 font-black tabular-nums">{fmt(r.invoiced_revenue)}</span></div>)}</div>}
function Empty(){return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée sur la période.</p>}
function SortHead({label,active,direction,onClick,align="right"}:{label:string;active:boolean;direction:SortDirection;onClick:()=>void;align?:"left"|"right"}){return <th className={`px-3 py-2 ${align==="left"?"text-left":"text-right"}`}><button type="button" onClick={onClick} className={`inline-flex items-center gap-1 font-bold ${align==="left"?"":"ml-auto"}`}>{label}{active&&(direction==="desc"?<ArrowDown size={12}/>:<ArrowUp size={12}/>)}</button></th>}
