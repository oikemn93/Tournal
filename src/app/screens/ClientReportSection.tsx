import React, { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Users } from "lucide-react";
import { loadFinancialMetrics, type FinancialMetrics } from "../../lib/dashboardApi";
import { loadSalesProductReport, type ClientReport, type SalesProductReport } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";
import { FinancialDeepReportSection } from "./FinancialDeepReportSection";

export function ClientReportSection({ report, color }: { report: ClientReport | null; color: string }) {
  const clients = report?.clients ?? [];
  const topClients = [...clients].sort((a, b) => b.invoiced_revenue - a.invoiced_revenue).slice(0, 10);
  const debtors = [...clients].filter(row => row.outstanding_global > 0.005).sort((a, b) => b.outstanding_global - a.outstanding_global).slice(0, 10);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [salesReport, setSalesReport] = useState<SalesProductReport | null>(null);

  useEffect(() => {
    if (!report?.boutique_id || !report.from || !report.to) { setMetrics(null); setSalesReport(null); return; }
    let cancelled = false;
    void Promise.all([
      loadFinancialMetrics({ boutiqueId: report.boutique_id, from: report.from, to: report.to }),
      loadSalesProductReport({ boutiqueId: report.boutique_id, from: report.from, to: report.to }),
    ]).then(([financial, products]) => {
      if (cancelled) return;
      setMetrics(financial);
      setSalesReport(products);
    }).catch(() => {
      if (!cancelled) { setMetrics(null); setSalesReport(null); }
    });
    return () => { cancelled = true; };
  }, [report?.boutique_id, report?.from, report?.to]);

  return <div className="space-y-4">
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Users size={16} style={{ color }} />
        <div>
          <p className="font-bold text-sm">Clients</p>
          <p className="text-xs text-muted-foreground">Activité sur la période, encours global, retards et avoirs disponibles</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 bg-muted/20">
        <Kpi label="Clients actifs" value={`${report?.active_clients_period ?? 0}`} />
        <Kpi label="Encours clients" value={fmt(report?.customer_outstanding_global ?? 0)} />
        <Kpi label="En retard" value={fmt(report?.overdue_global ?? 0)} warning={(report?.overdue_global ?? 0) > 0} />
        <Kpi label="Avoirs disponibles" value={fmt(report?.credit_available_global ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 md:divide-x divide-border">
        <div>
          <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2"><Users size={15} style={{ color }} /><p className="text-xs font-black">Meilleurs clients sur la période</p></div>
          {topClients.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">Aucune activité client sur la période</p> : topClients.map((row, index) => <div key={row.client_id} className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-bold truncate">{index + 1}. {row.client_name}</p><p className="text-[10px] text-muted-foreground">{row.client_type || "Client"} · {row.sales_count} vente(s){row.returns_count ? ` · ${row.returns_count} retour(s)` : ""}</p></div>
            <div className="text-right"><p className="text-xs font-black">{fmt(row.invoiced_revenue)}</p><p className="text-[10px] text-muted-foreground">encaissé {fmt(row.collected_cash)}</p></div>
          </div>)}
        </div>

        <div>
          <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2"><CreditCard size={15} className="text-amber-600" /><p className="text-xs font-black">Encours à surveiller</p></div>
          {debtors.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">Aucun encours client</p> : debtors.map(row => <div key={row.client_id} className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-bold truncate">{row.client_name}</p><p className="text-[10px] text-muted-foreground">{row.overdue_global > 0.005 ? <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={10} />Retard {fmt(row.overdue_global)}</span> : "Non échu"}{row.credit_available > 0.005 ? ` · Avoir ${fmt(row.credit_available)}` : ""}</p></div>
            <div className="text-right"><p className="text-xs font-black">{fmt(row.outstanding_global)}</p><p className="text-[10px] text-muted-foreground">encours global</p></div>
          </div>)}
        </div>
      </div>
    </div>

    <FinancialDeepReportSection metrics={metrics} salesReport={salesReport} canSeeMargin={metrics?.realized_margin_fifo != null} color={color} />
  </div>;
}

function Kpi({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div><p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p><p className={`font-black text-lg ${warning ? "text-amber-700" : ""}`}>{value}</p></div>;
}