import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Boxes, Building2, ReceiptText, Users, Wallet, WalletCards } from "lucide-react";
import type { Boutique, DashPeriod } from "../types";
import { inputCls } from "../constants";
import { fmt } from "../utils/formatting";
import { loadFinancialMetrics, type FinancialMetrics } from "../../lib/dashboardApi";
import {
  hasReportFilters,
  loadChargeReport,
  loadClientReport,
  loadEmployeePerformanceReport,
  loadFilteredClientReport,
  loadFilteredEmployeePerformanceReport,
  loadFilteredSalesProductReport,
  loadFilteredStockInventoryReport,
  loadReportFilterOptions,
  loadSalesProductReport,
  loadStockInventoryReport,
  searchReportEntities,
  type ChargeReport,
  type ClientReport,
  type EmployeePerformanceReport,
  type ReportFilterOptions,
  type ReportFilters,
  type ReportSearchHit,
  type SalesProductReport,
  type StockInventoryReport,
} from "../../lib/reportApi";
import { ReportKpiBand } from "./ReportKpiBand";
import { FinancialDeepReportSection } from "./FinancialDeepReportSection";
import { SalesReportSection } from "./SalesReportSection";
import { TeamReportSection } from "./TeamReportSection";
import { ChargesReportSection } from "./ChargesReportSection";
import { StockReportSection } from "./StockReportSection";
import { ClientReportSection } from "./ClientReportSection";
import { ReportExportActions } from "./ReportExportActions";
import { MultiBoutiqueReportSection } from "./MultiBoutiqueReportSection";
import { ReportFilterBar } from "./ReportFilterBar";

type Section = "sales" | "team" | "stock" | "clients" | "charges" | "finance" | "group";
type SectionDefinition = { id: Section; label: string; subtitle: string; icon: React.ReactNode };

function periodBounds(period: DashPeriod, customFrom: string, customTo: string) {
  const now=new Date(); let from=new Date(now); let to=new Date(now.getTime()+1000);
  if(period==="jour")from.setHours(0,0,0,0); else if(period==="semaine")from.setDate(from.getDate()-7); else if(period==="mois")from=new Date(now.getFullYear(),now.getMonth(),1); else if(period==="annee")from=new Date(now.getFullYear(),0,1); else {from=customFrom?new Date(`${customFrom}T00:00:00`):new Date(now);if(customTo){to=new Date(`${customTo}T00:00:00`);to.setDate(to.getDate()+1);}}
  return {from:from.toISOString(),to:to.toISOString()};
}
function previousBounds(bounds:{from:string;to:string}){const a=+new Date(bounds.from),b=+new Date(bounds.to),d=Math.max(1000,b-a);return{from:new Date(a-d).toISOString(),to:new Date(a).toISOString()};}

export function ComptabiliteView({ boutique, canSeeMargin=false, comparisonBoutiques=[] }: { boutique:Boutique; canSeeMargin?:boolean; comparisonBoutiques?:Boutique[] }) {
  const RC=boutique.color;
  const [period,setPeriod]=useState<DashPeriod>("jour"); const [customFrom,setCustomFrom]=useState(""); const [customTo,setCustomTo]=useState("");
  const [metrics,setMetrics]=useState<FinancialMetrics|null>(null); const [previous,setPrevious]=useState<FinancialMetrics|null>(null); const [metricsLoading,setMetricsLoading]=useState(true); const [error,setError]=useState(""); const [open,setOpen]=useState<Section>("sales");
  const [sales,setSales]=useState<SalesProductReport|null>(null); const [team,setTeam]=useState<EmployeePerformanceReport|null>(null); const [stock,setStock]=useState<StockInventoryReport|null>(null); const [clients,setClients]=useState<ClientReport|null>(null); const [charges,setCharges]=useState<ChargeReport|null>(null); const [sectionLoading,setSectionLoading]=useState<Section|null>(null); const [sectionErrors,setSectionErrors]=useState<Partial<Record<Section,string>>>({}); const [dormantDays,setDormantDays]=useState(60);
  const [filters,setFilters]=useState<ReportFilters>({}); const [filterOptions,setFilterOptions]=useState<ReportFilterOptions|null>(null); const [searchQuery,setSearchQuery]=useState(""); const [searchHits,setSearchHits]=useState<ReportSearchHit[]>([]); const [searchLoading,setSearchLoading]=useState(false);
  const reportGenerationRef=useRef(0); const sectionControllersRef=useRef<Partial<Record<Section,AbortController>>>({});
  const bounds=useMemo(()=>periodBounds(period,customFrom,customTo),[period,customFrom,customTo]); const prevBounds=useMemo(()=>previousBounds(bounds),[bounds.from,bounds.to]);
  const filterKey=useMemo(()=>JSON.stringify([filters.categoryId??null,filters.operatorId??null,filters.paymentMethod??null,filters.clientType??null]),[filters.categoryId,filters.operatorId,filters.paymentMethod,filters.clientType]);
  const groupBoutiques=useMemo(()=>{const map=new Map<string,Boutique>();for(const b of comparisonBoutiques)map.set(b.id,b);if(comparisonBoutiques.length)map.set(boutique.id,boutique);return[...map.values()];},[comparisonBoutiques,boutique]);

  const sections=useMemo<SectionDefinition[]>(()=>[
    {id:"sales",label:"Ventes",subtitle:"Produits, catégories et paiements",icon:<ReceiptText size={17}/>},
    ...(canSeeMargin?[{id:"team" as const,label:"Équipe",subtitle:"Contribution et qualité des ventes",icon:<Users size={17}/>}]:[]),
    {id:"stock",label:"Stock",subtitle:"Rotation, dormants et écarts",icon:<Boxes size={17}/>},
    {id:"clients",label:"Clients",subtitle:"Valeur, fréquence et créances",icon:<WalletCards size={17}/>},
    {id:"charges",label:"Charges",subtitle:"Décaissements et catégories",icon:<Wallet size={17}/>},
    {id:"finance",label:"Financier",subtitle:"Marge, trésorerie et résultat",icon:<BarChart3 size={17}/>},
    ...(groupBoutiques.length>1?[{id:"group" as const,label:"Multi-boutiques",subtitle:"Comparaison du groupe",icon:<Building2 size={17}/>}]:[]),
  ],[canSeeMargin,groupBoutiques.length]);

  useEffect(()=>{let cancelled=false;reportGenerationRef.current+=1;for(const controller of Object.values(sectionControllersRef.current))controller?.abort();sectionControllersRef.current={};setSectionLoading(null);setSectionErrors({});setError("");setOpen("sales");setSales(null);setTeam(null);setStock(null);setClients(null);setCharges(null);setMetrics(null);setPrevious(null);setMetricsLoading(true);Promise.all([loadFinancialMetrics({boutiqueId:boutique.id,...bounds}),loadFinancialMetrics({boutiqueId:boutique.id,...prevBounds})]).then(([a,b])=>{if(!cancelled){setMetrics(a);setPrevious(b);}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Rapport indisponible");}).finally(()=>{if(!cancelled)setMetricsLoading(false);});return()=>{cancelled=true;for(const controller of Object.values(sectionControllersRef.current))controller?.abort();};},[boutique.id,bounds.from,bounds.to,prevBounds.from,prevBounds.to]);

  useEffect(()=>{const controller=new AbortController();setFilterOptions(null);loadReportFilterOptions({boutiqueId:boutique.id,...bounds,signal:controller.signal}).then(setFilterOptions).catch(cause=>{if(!(cause instanceof DOMException&&cause.name==="AbortError"))setError("Filtres du rapport indisponibles");});return()=>controller.abort();},[boutique.id,bounds.from,bounds.to]);

  useEffect(()=>{reportGenerationRef.current+=1;for(const controller of Object.values(sectionControllersRef.current))controller?.abort();sectionControllersRef.current={};setSectionLoading(null);setSectionErrors({});setSales(null);setTeam(null);setStock(null);setClients(null);},[filterKey]);

  useEffect(()=>{const q=searchQuery.trim();if(q.length<2){setSearchHits([]);setSearchLoading(false);return;}const controller=new AbortController();const timer=window.setTimeout(()=>{setSearchLoading(true);searchReportEntities({boutiqueId:boutique.id,...bounds,query:q,filters,signal:controller.signal}).then(result=>setSearchHits(result.hits??[])).catch(cause=>{if(!(cause instanceof DOMException&&cause.name==="AbortError"))setSearchHits([]);}).finally(()=>{if(!controller.signal.aborted)setSearchLoading(false);});},250);return()=>{window.clearTimeout(timer);controller.abort();};},[boutique.id,bounds.from,bounds.to,searchQuery,filterKey]);

  function abortSectionRequests(){for(const controller of Object.values(sectionControllersRef.current))controller?.abort();sectionControllersRef.current={};}
  function sectionReady(section:Section){if(section==="sales"||section==="finance")return Boolean(sales);if(section==="team")return Boolean(team);if(section==="stock")return Boolean(stock);if(section==="clients")return Boolean(clients);if(section==="charges")return Boolean(charges);return true;}
  async function toggle(section:Section){if(!sections.some(item=>item.id===section))return;abortSectionRequests();setSectionLoading(null);setOpen(section);if(section==="group"||sectionReady(section))return;const generation=reportGenerationRef.current;const controller=new AbortController();sectionControllersRef.current[section]=controller;try{setSectionLoading(section);setSectionErrors(current=>({...current,[section]:undefined}));const filtered=hasReportFilters(filters);if(section==="sales"){const result=filtered?await loadFilteredSalesProductReport({boutiqueId:boutique.id,...bounds,filters,signal:controller.signal}):await loadSalesProductReport({boutiqueId:boutique.id,...bounds,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setSales(result);}if(section==="team"){const result=filtered?await loadFilteredEmployeePerformanceReport({boutiqueId:boutique.id,...bounds,filters,signal:controller.signal}):await loadEmployeePerformanceReport({boutiqueId:boutique.id,...bounds,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setTeam(result);}if(section==="stock"){const result=filtered?await loadFilteredStockInventoryReport({boutiqueId:boutique.id,...bounds,dormantDays,filters,signal:controller.signal}):await loadStockInventoryReport({boutiqueId:boutique.id,...bounds,dormantDays,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setStock(result);}if(section==="clients"){const result=filtered?await loadFilteredClientReport({boutiqueId:boutique.id,...bounds,filters,signal:controller.signal}):await loadClientReport({boutiqueId:boutique.id,...bounds,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setClients(result);}if(section==="charges"){const result=await loadChargeReport({boutiqueId:boutique.id,...bounds,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setCharges(result);}if(section==="finance"){const result=filtered?await loadFilteredSalesProductReport({boutiqueId:boutique.id,...bounds,filters,signal:controller.signal}):await loadSalesProductReport({boutiqueId:boutique.id,...bounds,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setSales(result);}}catch(cause){if(!(cause instanceof DOMException&&cause.name==="AbortError")&&!controller.signal.aborted&&generation===reportGenerationRef.current)setSectionErrors(current=>({...current,[section]:"Impossible de charger ce rapport, réessayer"}));}finally{if(sectionControllersRef.current[section]===controller)delete sectionControllersRef.current[section];if(!controller.signal.aborted&&generation===reportGenerationRef.current)setSectionLoading(current=>current===section?null:current);}}
  async function refreshStock(days:number){setDormantDays(days);if(open!=="stock")return;sectionControllersRef.current.stock?.abort();const generation=reportGenerationRef.current;const controller=new AbortController();sectionControllersRef.current.stock=controller;setSectionLoading("stock");setSectionErrors(current=>({...current,stock:undefined}));try{const result=hasReportFilters(filters)?await loadFilteredStockInventoryReport({boutiqueId:boutique.id,...bounds,dormantDays:days,filters,signal:controller.signal}):await loadStockInventoryReport({boutiqueId:boutique.id,...bounds,dormantDays:days,signal:controller.signal});if(!controller.signal.aborted&&generation===reportGenerationRef.current)setStock(result);}catch(cause){if(!(cause instanceof DOMException&&cause.name==="AbortError")&&!controller.signal.aborted&&generation===reportGenerationRef.current)setSectionErrors(current=>({...current,stock:"Impossible de charger ce rapport, réessayer"}));}finally{if(sectionControllersRef.current.stock===controller)delete sectionControllersRef.current.stock;if(!controller.signal.aborted&&generation===reportGenerationRef.current)setSectionLoading(current=>current==="stock"?null:current);}}

  useEffect(()=>{if(!metrics||sectionLoading||sectionErrors[open]||sectionReady(open)||open==="group")return;void toggle(open);},[metrics,open,sales,team,stock,clients,charges,sectionLoading,sectionErrors,filterKey]);

  useEffect(()=>{if(!sections.some(section=>section.id===open)){abortSectionRequests();setSectionLoading(null);setOpen("sales");}},[sections,open]);

  function openSearchHit(hit:ReportSearchHit){setSearchQuery("");setSearchHits([]);void toggle(hit.section);}
  const marginCoverageWarning=canSeeMargin&&metrics?.realized_margin_fifo!=null&&((metrics.margin_coverage_rate??100)<99.99||(metrics.margin_unmatched_lines??0)>0)?`Couverture FIFO ${new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1}).format(metrics.margin_coverage_rate??0)} % · ${metrics.margin_unmatched_lines??0} ligne(s) sans coût fiable`:null;
  const periodBtns:Array<{id:DashPeriod;label:string}>=[{id:"jour",label:"Aujourd'hui"},{id:"semaine",label:"7 jours"},{id:"mois",label:"Mois"},{id:"annee",label:"Année"},{id:"custom",label:"Personnalisé"}];
  const body=(section:Section,node:React.ReactNode)=>sectionLoading===section?<Loading/>:sectionErrors[section]?<SectionError message={sectionErrors[section]!}/>:node;
  const activeSection=sections.find(section=>section.id===open)??sections[0];

  return <div data-screen-source="canonical-report-v10-filters" className="space-y-4 pb-24">
    <header className="sticky top-2 z-30 overflow-visible rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur">
      <div className="overflow-hidden rounded-t-2xl p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><h1 className="text-xl font-black tracking-tight">Rapport</h1><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{boutique.nom}</span></div><p className="mt-1 text-xs text-muted-foreground">Vos indicateurs et rapports sur la période sélectionnée</p></div><div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1">{periodBtns.map(item=><button key={item.id} onClick={()=>setPeriod(item.id)} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold" style={{background:period===item.id?RC:"transparent",color:period===item.id?"#fff":"#6b7280"}}>{item.label}</button>)}</div></div>{period==="custom"&&<div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3"><input aria-label="Date de début" type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className={inputCls}/><input aria-label="Date de fin" type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className={inputCls}/></div>}</div>
      <ReportFilterBar options={filterOptions} filters={filters} query={searchQuery} hits={searchHits} searchLoading={searchLoading} canSeeMargin={canSeeMargin} color={RC} onFilters={setFilters} onQuery={setSearchQuery} onHit={openSearchHit}/>
      <nav aria-label="Catégories du rapport" className="border-t border-border bg-card/90 px-2 py-2"><div role="tablist" aria-label="Sections du rapport" className="flex gap-1 overflow-x-auto">{sections.map(section=><button key={section.id} id={`report-tab-${section.id}`} type="button" role="tab" tabIndex={open===section.id?0:-1} onKeyDown={event=>{const index=sections.findIndex(item=>item.id===section.id);const next=event.key==="ArrowRight"?(index+1)%sections.length:event.key==="ArrowLeft"?(index+sections.length-1)%sections.length:event.key==="Home"?0:event.key==="End"?sections.length-1:null;if(next!==null){event.preventDefault();void toggle(sections[next].id);document.getElementById(`report-tab-${sections[next].id}`)?.focus();}}} aria-selected={open===section.id} aria-controls={`report-panel-${section.id}`} onClick={()=>void toggle(section.id)} className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-left transition ${open===section.id?"bg-muted shadow-sm":"hover:bg-muted/60"}`} style={{color:open===section.id?RC:undefined}}><span className="shrink-0">{section.icon}</span><span><span className="block text-xs font-black">{section.label}</span><span className="hidden text-[10px] font-medium text-muted-foreground xl:block">{section.subtitle}</span></span></button>)}</div></nav>
      <div className="border-t border-border p-2">{metricsLoading||!metrics?<p role="status" className="py-3 text-center text-xs text-muted-foreground">Chargement des indicateurs de la période…</p>:<ReportKpiBand metrics={metrics} previous={previous} canSeeMargin={canSeeMargin}/>}</div>
    </header>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}{marginCoverageWarning&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{marginCoverageWarning}</div>}
    {metricsLoading&&!metrics?<div className="rounded-2xl border border-border bg-card py-12 text-center text-sm font-semibold text-muted-foreground">Chargement des indicateurs de la période…</div>:metrics&&<><div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-muted-foreground">Impayé sur la période</p><p className="text-[11px] text-muted-foreground">Créances des factures sélectionnées</p></div><p className={`text-base font-black ${(metrics.period_outstanding??0)>0.005?"text-red-600":"text-muted-foreground"}`}>{fmt(metrics.period_outstanding??0)}</p></div></>}
    {activeSection&&<section id={`report-panel-${activeSection.id}`} role="tabpanel" aria-labelledby={`report-tab-${activeSection.id}`} data-report-active-section={activeSection.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center gap-3 border-b border-border px-4 py-4"><span style={{color:RC}}>{activeSection.icon}</span><div><h2 className="text-base font-black">{activeSection.label}</h2><p className="text-xs text-muted-foreground">{activeSection.subtitle}</p></div></div><div className="p-4">{open==="sales"&&body("sales",<SalesReportSection report={sales} metrics={metrics} canSeeMargin={canSeeMargin}/>)}{open==="team"&&canSeeMargin&&body("team",<TeamReportSection report={team}/>)}{open==="stock"&&body("stock",<StockReportSection report={stock} days={dormantDays} onDays={days=>void refreshStock(days)} canSeeMargin={canSeeMargin}/>)}{open==="clients"&&body("clients",<ClientReportSection report={clients} color={RC}/>)}{open==="charges"&&body("charges",<ChargesReportSection report={charges} metrics={metrics}/>)}{open==="finance"&&body("finance",<FinancialDeepReportSection metrics={metrics} salesReport={sales} canSeeMargin={canSeeMargin} color={RC}/>)}{open==="group"&&groupBoutiques.length>1&&<MultiBoutiqueReportSection boutiques={groupBoutiques} from={bounds.from} to={bounds.to}/>}</div></section>}
    <ReportExportActions boutiqueId={boutique.id} boutiqueName={boutique.nom} from={bounds.from} to={bounds.to} canSeeMargin={canSeeMargin} color={RC}/>
  </div>;
}

function Loading(){return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>}
function SectionError({message}:{message:string}){return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-xs font-semibold text-red-700">{message}</div>}
