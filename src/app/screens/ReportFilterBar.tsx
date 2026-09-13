import React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { ReportFilterOptions, ReportFilters, ReportSearchHit } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

type Props = {
  options: ReportFilterOptions | null;
  filters: ReportFilters;
  query: string;
  hits: ReportSearchHit[];
  searchLoading: boolean;
  canSeeMargin: boolean;
  color: string;
  onFilters: (next: ReportFilters) => void;
  onQuery: (value: string) => void;
  onHit: (hit: ReportSearchHit) => void;
};

const selectCls="min-w-[145px] rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring";

export function ReportFilterBar({options,filters,query,hits,searchLoading,canSeeMargin,color,onFilters,onQuery,onHit}:Props){
  const active=Boolean(filters.entityId||filters.categoryId||filters.operatorId||filters.paymentMethod||filters.clientType);
  const set=<K extends keyof ReportFilters>(key:K,value:string)=>onFilters({...filters,[key]:value||null});
  return <div data-report-global-filters="server" className="border-t border-border bg-background/95 px-3 py-2">
    <div className="flex flex-wrap items-center gap-2 pb-1">
      <div className="relative min-w-[260px] flex-1 lg:min-w-[320px]">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input value={query} onChange={e=>onQuery(e.target.value)} placeholder="Rechercher produit, client ou employé…" aria-label="Recherche transversale du rapport" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"/>
        {(query.trim().length>=2||searchLoading)&&<div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-auto rounded-xl border border-border bg-card p-2 shadow-xl">
          {searchLoading?<p className="px-2 py-4 text-center text-xs font-semibold text-muted-foreground">Recherche…</p>:hits.length?<div className="space-y-1">{hits.map(hit=><button key={`${hit.kind}-${hit.id}`} onClick={()=>onHit(hit)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"><span className="min-w-0"><span className="block truncate text-xs font-black">{hit.label}</span><span className="block truncate text-[10px] text-muted-foreground">{hit.subtitle} · {hit.kind==="product"?"Produit":hit.kind==="employee"?"Employé":"Client"}</span></span><span className="shrink-0 text-right"><span className="block text-xs font-black">{fmt(hit.invoiced_revenue)}</span><span className="block text-[10px] text-muted-foreground">Qté {new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(hit.quantity)}{canSeeMargin&&hit.realized_margin_fifo!=null?` · Marge ${fmt(hit.realized_margin_fifo)}`:""}</span></span></button>)}</div>:<p className="px-2 py-4 text-center text-xs text-muted-foreground">Aucun résultat sur cette période.</p>}
        </div>}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground"><SlidersHorizontal size={13}/> Filtres</span>
      <select aria-label="Filtre catégorie produit" value={filters.categoryId??""} onChange={e=>set("categoryId",e.target.value)} className={selectCls}><option value="">Toutes catégories</option>{(options?.categories??[]).map(x=><option key={x.id} value={x.id||"__uncategorized__"}>{x.name}</option>)}</select>
      <select aria-label="Filtre employé" value={filters.operatorId??""} onChange={e=>set("operatorId",e.target.value)} className={selectCls}><option value="">Tous employés</option>{(options?.employees??[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select aria-label="Filtre mode de paiement" value={filters.paymentMethod??""} onChange={e=>set("paymentMethod",e.target.value)} className={selectCls}><option value="">Tous paiements</option>{(options?.payment_methods??[]).map(x=><option key={x} value={x}>{x}</option>)}</select>
      <select aria-label="Filtre type de client" value={filters.clientType??""} onChange={e=>set("clientType",e.target.value)} className={selectCls}><option value="">Tous clients</option>{(options?.client_types??[]).map(x=><option key={x} value={x}>{x}</option>)}</select>
      {active&&<button type="button" onClick={()=>onFilters({})} className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"><X size={14}/> Effacer</button>}
    </div>
    {filters.entityId&&<button type="button" className="mt-2 rounded-full border px-3 py-1 text-xs" onClick={()=>onFilters({...filters,entityKind:null,entityId:null,entityLabel:null})}>{filters.entityLabel??"Sélection"} ×</button>}
    {active&&<div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{background:color}}/>Filtres appliqués aux détails Ventes, Équipe, Stock et Clients · les KPIs globaux restent la référence canonique de la période.</div>}
  </div>;
}
