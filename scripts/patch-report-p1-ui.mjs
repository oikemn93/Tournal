import fs from "node:fs";
const path = "src/app/screens/RapportViewV2.tsx";
let s = fs.readFileSync(path, "utf8");

s = s.replace('import { ChargesReportSection } from "./ChargesReportSection";', 'import { ChargesReportSection } from "./ChargesReportSection";\nimport { StockReportSection } from "./StockReportSection";');
s = s.replace(
  '  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null); const [previous, setPrevious] = useState<FinancialMetrics | null>(null); const [error, setError] = useState(""); const [open, setOpen] = useState<Section | null>(null);',
  '  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null); const [previous, setPrevious] = useState<FinancialMetrics | null>(null); const [metricsLoading, setMetricsLoading] = useState(true); const [error, setError] = useState(""); const [open, setOpen] = useState<Section | null>(null);'
);
s = s.replace(
  '  const reportGenerationRef = useRef(0);',
  '  const [sectionErrors, setSectionErrors] = useState<Partial<Record<Section, string>>>({});\n  const reportGenerationRef = useRef(0);'
);

const oldEffectStart = '  useEffect(() => { let cancelled = false; reportGenerationRef.current += 1;';
const oldEffectEnd = '}, [boutique.id, bounds.from, bounds.to, prevBounds.from, prevBounds.to]);';
const a = s.indexOf(oldEffectStart);
const b = s.indexOf(oldEffectEnd, a);
if (a < 0 || b < 0) throw new Error("P1 bootstrap effect anchor missing");
const end = b + oldEffectEnd.length;
const effect = `  useEffect(() => {
    let cancelled = false;
    reportGenerationRef.current += 1;
    for (const controller of Object.values(sectionControllersRef.current)) controller?.abort();
    sectionControllersRef.current = {};
    setSectionLoading(null); setSectionErrors({}); setError(""); setOpen(null);
    setSales(null); setTeam(null); setStock(null); setClients(null); setCharges(null);
    setMetrics(null); setPrevious(null); setMetricsLoading(true);
    Promise.all([
      loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds }),
      loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds }),
    ]).then(([currentMetrics, previousMetrics]) => {
      if (!cancelled) { setMetrics(currentMetrics); setPrevious(previousMetrics); }
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Rapport indisponible");
    }).finally(() => { if (!cancelled) setMetricsLoading(false); });
    return () => { cancelled = true; for (const controller of Object.values(sectionControllersRef.current)) controller?.abort(); };
  }, [boutique.id, bounds.from, bounds.to, prevBounds.from, prevBounds.to]);`;
s = s.slice(0,a) + effect + s.slice(end);

s = s.replace('      setSectionLoading(section); setError("");', '      setSectionLoading(section); setSectionErrors(current => ({ ...current, [section]: undefined }));');
s = s.replace(
  '      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setError(e instanceof Error ? e.message : "Détail indisponible");',
  '      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setSectionErrors(current => ({ ...current, [section]: "Impossible de charger ce rapport, réessayer" }));'
);
s = s.replace(
  '      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setError(e instanceof Error ? e.message : "Détail stock indisponible");',
  '      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setSectionErrors(current => ({ ...current, stock: "Impossible de charger ce rapport, réessayer" }));'
);

s = s.replace(
  '  const dormant = (stock?.products ?? []).filter(r => r.dormant && r.current_stock > 0); const lowRotation = (stock?.products ?? []).filter(r => r.rotation_class === "lente" || r.rotation_class === "dormant"); const overdue = (clients?.clients ?? []).filter(r => r.overdue_global > 0);',
  '  const dormant = (stock?.products ?? []).filter(r => r.dormant && r.current_stock > 0); const lowRotation = (stock?.products ?? []).filter(r => r.rotation_class === "lente" || r.rotation_class === "dormant"); const overdue = (clients?.clients ?? []).filter(r => r.overdue_global > 0);\n  const marginCoverageWarning = canSeeMargin && metrics?.realized_margin_fifo != null && ((metrics.margin_coverage_rate ?? 100) < 99.99 || (metrics.margin_unmatched_lines ?? 0) > 0) ? `Couverture FIFO ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(metrics.margin_coverage_rate ?? 0)} % · ${metrics.margin_unmatched_lines ?? 0} ligne(s) sans coût fiable` : null;'
);

s = s.replace(
  '    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}\n    <ReportKpiBand metrics={metrics} previous={previous} canSeeMargin={canSeeMargin}/>\n    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-muted-foreground">Impayé sur la période</p><p className="text-[11px] text-muted-foreground">Créances des factures sélectionnées</p></div><p className={`text-base font-black ${(metrics?.period_outstanding ?? 0)>0.005?"text-red-600":"text-muted-foreground"}`}>{fmt(metrics?.period_outstanding ?? 0)}</p></div>',
  '    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}\n    {marginCoverageWarning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{marginCoverageWarning}</div>}\n    {metricsLoading && !metrics ? <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm font-semibold text-muted-foreground">Chargement des indicateurs de la période…</div> : metrics && <>\n      <ReportKpiBand metrics={metrics} previous={previous} canSeeMargin={canSeeMargin}/>\n      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"><div><p className="text-xs font-bold text-muted-foreground">Impayé sur la période</p><p className="text-[11px] text-muted-foreground">Créances des factures sélectionnées</p></div><p className={`text-base font-black ${(metrics.period_outstanding ?? 0)>0.005?"text-red-600":"text-muted-foreground"}`}>{fmt(metrics.period_outstanding ?? 0)}</p></div>\n    </>}'
);

const replacements = [
  ['{sectionLoading==="sales"?<Loading/>:<SalesReportSection report={sales} metrics={metrics} canSeeMargin={canSeeMargin}/>}','{sectionLoading==="sales"?<Loading/>:sectionErrors.sales?<SectionError message={sectionErrors.sales}/>:<SalesReportSection report={sales} metrics={metrics} canSeeMargin={canSeeMargin}/>}'],
  ['{sectionLoading==="team"?<Loading/>:<TeamReportSection report={team}/>}','{sectionLoading==="team"?<Loading/>:sectionErrors.team?<SectionError message={sectionErrors.team}/>:<TeamReportSection report={team}/>}'],
  ['{sectionLoading==="stock"?<Loading/>:<StockSection report={stock} dormant={dormant} lowRotation={lowRotation} days={dormantDays} onDays={d=>void refreshStock(d)} canSeeMargin={canSeeMargin}/>}','{sectionLoading==="stock"?<Loading/>:sectionErrors.stock?<SectionError message={sectionErrors.stock}/>:<StockReportSection report={stock} days={dormantDays} onDays={d=>void refreshStock(d)} canSeeMargin={canSeeMargin}/>}'],
  ['{sectionLoading==="clients"?<Loading/>:<ClientSection report={clients} overdue={overdue}/>}','{sectionLoading==="clients"?<Loading/>:sectionErrors.clients?<SectionError message={sectionErrors.clients}/>:<ClientSection report={clients} overdue={overdue}/>}'],
  ['{sectionLoading==="charges"?<Loading/>:<ChargesReportSection report={charges} metrics={metrics}/>}','{sectionLoading==="charges"?<Loading/>:sectionErrors.charges?<SectionError message={sectionErrors.charges}/>:<ChargesReportSection report={charges} metrics={metrics}/>}'],
  ['{sectionLoading==="finance"?<Loading/>:<FinancialDeepReportSection metrics={metrics} salesReport={sales} canSeeMargin={canSeeMargin} color={RC}/>}','{sectionLoading==="finance"?<Loading/>:sectionErrors.finance?<SectionError message={sectionErrors.finance}/>:<FinancialDeepReportSection metrics={metrics} salesReport={sales} canSeeMargin={canSeeMargin} color={RC}/>}'],
];
for (const [from,to] of replacements) { if (!s.includes(from)) throw new Error(`P1 accordion anchor missing: ${from.slice(0,40)}`); s=s.replace(from,to); }

s = s.replace('function Loading(){return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>}', 'function Loading(){return <div className="py-8 text-center text-xs font-semibold text-muted-foreground">Chargement du détail…</div>}\nfunction SectionError({message}:{message:string}){return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-4 text-center text-xs font-semibold text-red-700">{message}</div>}');

s = s.replace('<Mini label="Clients en retard" value={`${report.clients_overdue}`}', '<Mini label="Clients en retard · global" value={`${report.clients_overdue}`}');
s = s.replace('<Mini label="Retard total" value={fmt(report.overdue_global)}', '<Mini label="Retard total · global" value={fmt(report.overdue_global)}');
s = s.replace('</div><Bars max={max} items={rows.slice(0,5).map(r=>({name:r.client_name,value:r.invoiced_revenue}))}/>', '</div><p className="rounded-xl border border-border bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">Les encours et retards sont globaux. Le total peut dépasser la somme des clients listés car les factures sans client enregistré sont incluses dans le total global mais ne peuvent pas apparaître dans la liste détaillée.</p><Bars max={max} items={rows.slice(0,5).map(r=>({name:r.client_name,value:r.invoiced_revenue}))}/>');

fs.writeFileSync(path, s);
