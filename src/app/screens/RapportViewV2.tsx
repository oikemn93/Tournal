import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Boxes, ChevronDown, Download, ReceiptText, Users, Wallet, WalletCards } from "lucide-react";
import type { Boutique, DashPeriod } from "../types";
import { inputCls } from "../constants";
import { fmt } from "../utils/formatting";
import { loadFinancialMetrics, type FinancialMetrics } from "../../lib/dashboardApi";
import { loadChargeReport, loadClientReport, loadEmployeePerformanceReport, loadSalesProductReport, loadStockInventoryReport, type ChargeReport, type ClientReport, type EmployeePerformanceReport, type SalesProductReport, type StockInventoryReport } from "../../lib/reportApi";
import { ReportKpiBand } from "./ReportKpiBand";
import { FinancialDeepReportSection } from "./FinancialDeepReportSection";
import { SalesReportSection } from "./SalesReportSection";
import { TeamReportSection } from "./TeamReportSection";
import { ChargesReportSection } from "./ChargesReportSection";
import { StockReportSection } from "./StockReportSection";

type Section = "sales" | "team" | "stock" | "clients" | "charges" | "finance";

function periodBounds(period: DashPeriod, customFrom: string, customTo: string) {
  const now = new Date(); let from = new Date(now); let to = new Date(now.getTime() + 1000);
  if (period === "jour") from.setHours(0, 0, 0, 0); else if (period === "semaine") from.setDate(from.getDate() - 7); else if (period === "mois") from = new Date(now.getFullYear(), now.getMonth(), 1); else if (period === "annee") from = new Date(now.getFullYear(), 0, 1); else { from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now); if (customTo) { to = new Date(`${customTo}T00:00:00`); to.setDate(to.getDate() + 1); } }
  return { from: from.toISOString(), to: to.toISOString() };
}
function previousBounds(bounds: { from: string; to: string }) { const a = +new Date(bounds.from), b = +new Date(bounds.to), d = Math.max(1000, b - a); return { from: new Date(a - d).toISOString(), to: new Date(a).toISOString() }; }

export function ComptabiliteView({ boutique, canSeeMargin = false }: { boutique: Boutique; canSeeMargin?: boolean }) {
  const RC = boutique.color; const [period, setPeriod] = useState<DashPeriod>("jour"); const [customFrom, setCustomFrom] = useState(""); const [customTo, setCustomTo] = useState("");
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null); const [previous, setPrevious] = useState<FinancialMetrics | null>(null); const [metricsLoading, setMetricsLoading] = useState(true); const [error, setError] = useState(""); const [open, setOpen] = useState<Section | null>(null);
  const [sales, setSales] = useState<SalesProductReport | null>(null); const [team, setTeam] = useState<EmployeePerformanceReport | null>(null); const [stock, setStock] = useState<StockInventoryReport | null>(null); const [clients, setClients] = useState<ClientReport | null>(null); const [charges, setCharges] = useState<ChargeReport | null>(null); const [sectionLoading, setSectionLoading] = useState<Section | null>(null); const [dormantDays, setDormantDays] = useState(60);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<Section, string>>>({});
  const reportGenerationRef = useRef(0);
  const sectionControllersRef = useRef<Partial<Record<Section, AbortController>>>({});
  const bounds = useMemo(() => periodBounds(period, customFrom, customTo), [period, customFrom, customTo]); const prevBounds = useMemo(() => previousBounds(bounds), [bounds.from, bounds.to]);

  useEffect(() => {
    let cancelled = false;
    reportGenerationRef.current += 1;
    for (const controller of Object.values(sectionControllersRef.current)) controller?.abort();
    sectionControllersRef.current = {};
    setSectionLoading(null); setSectionErrors({}); setError(""); setOpen(null);
    setSales(null); setTeam(null); setStock(null); setClients(null); setCharges(null);
    setMetrics(null); setPrevious(null); setMetricsLoading(true);
    Promise.all([loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds }), loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds })]).then(([currentMetrics, previousMetrics]) => {
      if (!cancelled) { setMetrics(currentMetrics); setPrevious(previousMetrics); }
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Rapport indisponible"); }).finally(() => { if (!cancelled) setMetricsLoading(false); });
    return () => { cancelled = true; for (const controller of Object.values(sectionControllersRef.current)) controller?.abort(); };
  }, [boutique.id, bounds.from, bounds.to, prevBounds.from, prevBounds.to]);

  function abortSectionRequests() { for (const controller of Object.values(sectionControllersRef.current)) controller?.abort(); sectionControllersRef.current = {}; }
  async function toggle(section: Section) {
    if (open === section) { abortSectionRequests(); setOpen(null); setSectionLoading(null); return; }
    abortSectionRequests(); setOpen(section);
    const generation = reportGenerationRef.current; const controller = new AbortController(); sectionControllersRef.current[section] = controller;
    try {
      setSectionLoading(section); setSectionErrors(current => ({ ...current, [section]: undefined }));
      if (section === "sales" && !sales) { const result = await loadSalesProductReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setSales(result); }
      if (section === "team" && !team) { const result = await loadEmployeePerformanceReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setTeam(result); }
      if (section === "stock" && !stock) { const result = await loadStockInventoryReport({ boutiqueId: boutique.id, ...bounds, dormantDays, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setStock(result); }
      if (section === "clients" && !clients) { const result = await loadClientReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setClients(result); }
      if (section === "charges" && !charges) { const result = await loadChargeReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setCharges(result); }
      if (section === "finance" && !sales) { const result = await loadSalesProductReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setSales(result); }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setSectionErrors(current => ({ ...current, [section]: "Impossible de charger ce rapport, réessayer" }));
    } finally {
      if (sectionControllersRef.current[section] === controller) delete sectionControllersRef.current[section];
      if (!controller.signal.aborted && generation === reportGenerationRef.current) setSectionLoading(current => current === section ? null : current);
    }
  }
  async function refreshStock(days: number) {
    setDormantDays(days); if (open !== "stock") return; sectionControllersRef.current.stock?.abort();
    const generation = reportGenerationRef.current; const controller = new AbortController(); sectionControllersRef.current.stock = controller; setSectionLoading("stock");
    try { const result = await loadStockInventoryReport({ boutiqueId: boutique.id, ...bounds, dormantDays: days, signal: controller.signal }); if (!controller.signal.aborted && generation === reportGenerationRef.current) setStock(result); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setSectionErrors(current => ({ ...current, stock: "Impossible de charger ce rapport, réessayer" })); }
    finally { if (sectionControllersRef.current.stock === controller) delete sectionControllersRef.current.stock; if (!controller.signal.aborted && generation === reportGenerationRef.current) setSectionLoading(current => current === "stock" ? null : current); }
  }

  const overdue = (clients?.clients ?? []).filter(row => row.overdue_global > 0);
  const marginCoverageWarning = canSeeMargin && metrics?.realized_margin_fifo != null && ((metrics.margin_coverage_rate ?? 100) < 99.99 || (metrics.margin_unmatched_lines ?? 0) > 0) ? `Couverture FIFO ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(metrics.margin_coverage_rate ?? 0)} % · ${metrics.margin_unmatched_lines ?? 0} ligne(s) sans coût fiable` : null;
  const periodBtns: Array<{id: DashPeriod; label: string}> = [{id:"jour",label:"Aujourd'hui"},{id:"semaine",label:"7 jours"},{id:"mois",label:"Mois"},{id:"custom",label:"Personnalisé"}];

  return <div data-screen-source="canonical-report-v7-ui" className="space-y-4 pb-24">
    <header className="sticky top-2 z-20 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><h1 className="text-xl font-black tracking-tight">Rapport</h1><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{boutique.nom}</span></div><p className="mt-1 text-xs text-muted-foreground">Résumé d'abord · détails chargés à la demande</p></div><div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1">{periodBtns.map(item => <button key={item.id} onClick={() => setPeriod(item.id)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold" style={{background:period===item.id?RC:"transparent",color:period===item.id?"#fff":"#6b7280"}}>{item.label}</button>)}</div></div>{period === "custom" && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3"><input aria-label="Date de début" type="date" value={customFrom} onChange={event=>setCustomFrom(event.target.value)} className={inputCls}/><input aria-label="Date de fin" type="date" value={customTo} onChange={event=>setCustomTo(event.target.value)} className={inputCls}/></div>}</header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
    {marginCoverageWarning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{marginCoverageWarning}</div>}
    {metricsLoading && !metrics ? <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm font-semibold text-muted-foreground">Chargement des indicateurs de la période…</div> : metrics && <><ReportKpiBand metrics={metrics} previous={previous} canSeeMargin={canSeeMargin}/><div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-muted-foreground">Impayé sur la période</p><p className="text-[11px] text-muted-foreground">Créances des factures sélectionnées</p></div><p className={`text-base font-black ${(metrics.period_outstanding ?? 0)>0.005?"text-red-600":"text-muted-foreground"}`}>{fmt(metrics.period_outstanding ?? 0)}</p></div></>}
    <div className="space-y-2">
      <Accordion title="Ventes" subtitle="Quels produits portent mon chiffre d’affaires ?" icon={<ReceiptText size={17}/>} active={open==="sales"} onClick={()=>void toggle("sales")} color={RC}>{sectionLoading==="sales"?<Loading/>:sectionErrors.sales?<SectionError message={sectionErrors.sales}/>:<SalesReportSection report={sales} metrics={metrics} canSeeMargin={canSeeMargin}/>}</Accordion>
      {canSeeMargin && <Accordion title="Équipe" subtitle="Qui contribue le plus aux ventes ?" icon={<Users size={17}/>} active={open==="team"} onClick={()=>void toggle("team")} color={RC}>{sectionLoading==="team"?<Loading/>:sectionErrors.team?<SectionError message={sectionErrors.team}/>:<TeamReportSection report={team}/>}</Accordion>}
      <Accordion title="Stock" subtitle="Où mon capital est-il immobilisé ?" icon={<Boxes size={17}/>} active={open==="stock"} onClick={()=>void toggle("stock")} color={RC}>{sectionLoading==="stock"?<Loading/>:sectionErrors.stock?<SectionError message={sectionErrors.stock}/>:<StockReportSection report={stock} days={dormantDays} onDays={days=>void refreshStock(days)} canSeeMargin={canSeeMargin}/>}</Accordion>
      <Accordion title="Clients" subtitle="Qui achète le plus et qui me doit de l’argent ?" icon={<WalletCards size={17}/>} active={open==="clients"} onClick={()=>void toggle("clients")} color={RC}>{sectionLoading==="clients"?<Loading/>:sectionErrors.clients?<SectionError message={sectionErrors.clients}/>:<ClientSection report={clients} overdue={overdue}/>}</Accordion>
      <Accordion title="Charges" subtitle="Où partent mes décaissements d’exploitation ?" icon={<Wallet size={17}/>} active={open==="charges"} onClick={()=>void toggle("charges")} color={RC}>{sectionLoading==="charges"?<Loading/>:sectionErrors.charges?<SectionError message={sectionErrors.charges}/>:<ChargesReportSection report={charges} metrics={metrics}/>}</Accordion>
      <Accordion title="Financier" subtitle="La période crée-t-elle de la marge et de la trésorerie ?" icon={<BarChart3 size={17}/>} active={open==="finance"} onClick={()=>void toggle("finance")} color={RC}>{sectionLoading==="finance"?<Loading/>:sectionErrors.finance?<SectionError message={sectionErrors.finance}/>:<FinancialDeepReportSection metrics={metrics} salesReport={sales} canSeeMargin={canSeeMargin} color={RC}/>}</Accordion>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2"><Download size={16} style={{color:RC}}/><div><p className="text-sm font-bold">Exports</p><p className="text-xs text-muted-foreground">Les exports PDF/CSV seront regroupés ici au jalon Export, séparés de l’analyse.</p></div></div></div>
  </div>;
}

function Accordion({title,subtitle,icon,active,onClick,color,children}:{title:string;subtitle:string;icon:React.ReactNode;active:boolean;onClick:()=>void;color:string;children:React.ReactNode}) { return <section className="overflow-hidden rounded-2xl border border-border bg-card"><button type="button" aria-expanded={active} onClick={onClick} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div className="flex items-center gap-3"><span style={{color}}>{icon}</span><div><p className="text-sm font-black">{title}</p><p className="text-xs text-muted-foreground">{subtitle}</p></div></div><ChevronDown size={17} className={`text-muted-foreground transition-transform ${active?"rotate-180":""}`}/></button>{active&&<div className="border-t border-border p-4">{children}</div>}</section>; }
function Loading(){return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>}
function SectionError({message}:{message:string}){return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-xs font-semibold text-red-700">{message}</div>}
function Mini({label,value,tone=""}:{label:string;value:string;tone?:string}){return <div className="rounded-xl bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-black ${tone}`}>{value}</p></div>}
function Bars({items,max}:{items:Array<{name:string;value:number}>;max:number}){return <div className="space-y-3 rounded-xl border border-border p-3">{items.map(item=><div key={item.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-bold">{item.name}</span><span className="font-black">{fmt(item.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/70" style={{width:`${Math.max(2,Math.abs(item.value)/max*100)}%`}}/></div></div>)}</div>}
function ClientSection({report,overdue}:{report:ClientReport|null;overdue:ClientReport["clients"]}){if(!report)return <Loading/>; const rows=[...report.clients].sort((a,b)=>b.invoiced_revenue-a.invoiced_revenue); const max=Math.max(1,...rows.slice(0,5).map(row=>Math.abs(row.invoiced_revenue)));return <div className="space-y-4"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Mini label="Clients actifs" value={`${report.active_clients_period}`}/><Mini label="Encours global" value={fmt(report.customer_outstanding_global)} tone={report.customer_outstanding_global>0?"text-red-600":""}/><Mini label="Clients en retard · global" value={`${report.clients_overdue}`} tone={report.clients_overdue>0?"text-red-600":""}/><Mini label="Retard total · global" value={fmt(report.overdue_global)} tone={report.overdue_global>0?"text-red-600":""}/></div><p className="rounded-xl border border-border bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">Les encours et retards sont globaux. Le total peut dépasser la somme des clients listés car les factures sans client enregistré sont incluses dans le total global mais ne peuvent pas apparaître dans la liste détaillée.</p><Bars max={max} items={rows.slice(0,5).map(row=>({name:row.client_name,value:row.invoiced_revenue}))}/>{overdue.length>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="mb-2 text-xs font-black text-red-700">Créances en retard</p>{overdue.slice(0,8).map(row=><div key={row.client_id} className="flex justify-between border-t border-red-100 py-2 text-xs first:border-0"><span className="font-bold">{row.client_name}</span><span className="font-black text-red-700">{fmt(row.overdue_global)}</span></div>)}</div>}</div>}
