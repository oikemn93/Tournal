import fs from "node:fs";

const apiPath = "src/lib/reportApi.ts";
let api = fs.readFileSync(apiPath, "utf8");
api = api.replace(
  'async function postRpc<T>(name: string, payload: Record<string, unknown>): Promise<T> {',
  'async function postRpc<T>(name: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {'
);
api = api.replace('    body: JSON.stringify(payload),\n  });', '    body: JSON.stringify(payload),\n    signal,\n  });');
for (const fn of ["loadSalesProductReport", "loadEmployeePerformanceReport", "loadClientReport", "loadChargeReport"]) {
  api = api.replace(
    `export function ${fn}(params: { boutiqueId: string; from: string; to: string }) {`,
    `export function ${fn}(params: { boutiqueId: string; from: string; to: string; signal?: AbortSignal }) {`
  );
}
api = api.replace(
  'export function loadStockInventoryReport(params: { boutiqueId: string; from: string; to: string; dormantDays: number }) {',
  'export function loadStockInventoryReport(params: { boutiqueId: string; from: string; to: string; dormantDays: number; signal?: AbortSignal }) {'
);
api = api.replace(/\n  \}\);\n\}/g, '\n  }, params.signal);\n}');
fs.writeFileSync(apiPath, api);

const viewPath = "src/app/screens/RapportViewV2.tsx";
let view = fs.readFileSync(viewPath, "utf8");
view = view.replace('import React, { useEffect, useMemo, useState } from "react";', 'import React, { useEffect, useMemo, useRef, useState } from "react";');
view = view.replace(
  '  const [sales, setSales] = useState<SalesProductReport | null>(null); const [team, setTeam] = useState<EmployeePerformanceReport | null>(null); const [stock, setStock] = useState<StockInventoryReport | null>(null); const [clients, setClients] = useState<ClientReport | null>(null); const [charges, setCharges] = useState<ChargeReport | null>(null); const [sectionLoading, setSectionLoading] = useState<Section | null>(null); const [dormantDays, setDormantDays] = useState(60);',
  '  const [sales, setSales] = useState<SalesProductReport | null>(null); const [team, setTeam] = useState<EmployeePerformanceReport | null>(null); const [stock, setStock] = useState<StockInventoryReport | null>(null); const [clients, setClients] = useState<ClientReport | null>(null); const [charges, setCharges] = useState<ChargeReport | null>(null); const [sectionLoading, setSectionLoading] = useState<Section | null>(null); const [dormantDays, setDormantDays] = useState(60);\n  const reportGenerationRef = useRef(0);\n  const sectionControllersRef = useRef<Partial<Record<Section, AbortController>>>({});'
);

const oldEffect = '  useEffect(() => { let cancelled = false; setError(""); setOpen(null); setSales(null); setTeam(null); setStock(null); setClients(null); setCharges(null); Promise.all([loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds }), loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds })]).then(([a,b]) => { if (!cancelled) { setMetrics(a); setPrevious(b); } }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Rapport indisponible"); }); return () => { cancelled = true; }; }, [boutique.id, bounds.from, bounds.to, prevBounds.from, prevBounds.to]);';
const newEffect = '  useEffect(() => { let cancelled = false; reportGenerationRef.current += 1; for (const controller of Object.values(sectionControllersRef.current)) controller?.abort(); sectionControllersRef.current = {}; setSectionLoading(null); setError(""); setOpen(null); setSales(null); setTeam(null); setStock(null); setClients(null); setCharges(null); Promise.all([loadFinancialMetrics({ boutiqueId: boutique.id, ...bounds }), loadFinancialMetrics({ boutiqueId: boutique.id, ...prevBounds })]).then(([a,b]) => { if (!cancelled) { setMetrics(a); setPrevious(b); } }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Rapport indisponible"); }); return () => { cancelled = true; for (const controller of Object.values(sectionControllersRef.current)) controller?.abort(); }; }, [boutique.id, bounds.from, bounds.to, prevBounds.from, prevBounds.to]);';
if (!view.includes(oldEffect)) throw new Error("P0 patch: bootstrap effect anchor not found");
view = view.replace(oldEffect, newEffect);

const start = view.indexOf('  async function toggle(section: Section) {');
const end = view.indexOf('\n\n  const dormant =', start);
if (start < 0 || end < 0) throw new Error("P0 patch: section loader block not found");
const loaderBlock = `  function abortSectionRequests() {
    for (const controller of Object.values(sectionControllersRef.current)) controller?.abort();
    sectionControllersRef.current = {};
  }

  async function toggle(section: Section) {
    if (open === section) { abortSectionRequests(); setOpen(null); setSectionLoading(null); return; }
    abortSectionRequests();
    setOpen(section);
    const generation = reportGenerationRef.current;
    const controller = new AbortController();
    sectionControllersRef.current[section] = controller;
    try {
      setSectionLoading(section); setError("");
      if (section === "sales" && !sales) {
        const result = await loadSalesProductReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setSales(result);
      }
      if (section === "team" && !team) {
        const result = await loadEmployeePerformanceReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setTeam(result);
      }
      if (section === "stock" && !stock) {
        const result = await loadStockInventoryReport({ boutiqueId: boutique.id, ...bounds, dormantDays, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setStock(result);
      }
      if (section === "clients" && !clients) {
        const result = await loadClientReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setClients(result);
      }
      if (section === "charges" && !charges) {
        const result = await loadChargeReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setCharges(result);
      }
      if (section === "finance" && !sales) {
        const result = await loadSalesProductReport({ boutiqueId: boutique.id, ...bounds, signal: controller.signal });
        if (!controller.signal.aborted && generation === reportGenerationRef.current) setSales(result);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setError(e instanceof Error ? e.message : "Détail indisponible");
    } finally {
      if (sectionControllersRef.current[section] === controller) delete sectionControllersRef.current[section];
      if (!controller.signal.aborted && generation === reportGenerationRef.current) setSectionLoading(current => current === section ? null : current);
    }
  }

  async function refreshStock(days: number) {
    setDormantDays(days); if (open !== "stock") return;
    sectionControllersRef.current.stock?.abort();
    const generation = reportGenerationRef.current;
    const controller = new AbortController();
    sectionControllersRef.current.stock = controller;
    setSectionLoading("stock");
    try {
      const result = await loadStockInventoryReport({ boutiqueId: boutique.id, ...bounds, dormantDays: days, signal: controller.signal });
      if (!controller.signal.aborted && generation === reportGenerationRef.current) setStock(result);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError") && !controller.signal.aborted && generation === reportGenerationRef.current) setError(e instanceof Error ? e.message : "Détail stock indisponible");
    } finally {
      if (sectionControllersRef.current.stock === controller) delete sectionControllersRef.current.stock;
      if (!controller.signal.aborted && generation === reportGenerationRef.current) setSectionLoading(current => current === "stock" ? null : current);
    }
  }`;
view = view.slice(0, start) + loaderBlock + view.slice(end);
fs.writeFileSync(viewPath, view);
