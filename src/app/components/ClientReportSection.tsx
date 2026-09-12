import React from "react";
import { Clock3, UserPlus, Users } from "lucide-react";
import type { ClientReport, ClientReportRow } from "../../lib/reportApi";
import { fmt } from "../utils/formatting";

export function ClientReportSection({ report, inactiveDays, onInactiveDaysChange, color }: { report: ClientReport | null; inactiveDays: number; onInactiveDaysChange: (days: number) => void; color: string }) {
  const top = report?.top_clients ?? [];
  const debtors = report?.debtors ?? [];
  const inactive = report?.inactive_clients ?? [];

  return <div className="bg-card rounded-2xl border border-border overflow-hidden">
    <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Users size={16} style={{ color }} /><div><p className="font-bold text-sm">Clients</p><p className="text-xs text-muted-foreground">Activité, encours, retards et inactivité des clients enregistrés</p></div></div>
      <div className="flex items-center gap-2"><span className="text-[11px] text-muted-foreground">Inactif après</span><input aria-label="Seuil clients inactifs" type="number" inputMode="numeric" min={1} max={3650} value={inactiveDays} onChange={e => onInactiveDaysChange(Math.max(1, Math.min(3650, Number(e.target.value) || 60)))} className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold" /><span className="text-[11px] text-muted-foreground">jours</span></div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 bg-muted/20">
      <Metric label="Clients actifs" value={`${report?.active_clients ?? 0}`} />
      <Metric label="Nouveaux clients" value={`${report?.new_clients ?? 0}`} />
      <Metric label="Encours clients" value={fmt(report?.registered_outstanding_global ?? 0)} />
      <Metric label="En retard" value={fmt(report?.overdue_global ?? 0)} />
    </div>
    <div className="grid md:grid-cols-3 md:divide-x divide-border">
      <ClientList title="Meilleurs clients" icon={<Users size={14} className="text-emerald-600" />} rows={top} empty="Aucun client actif sur la période" mode="revenue" />
      <ClientList title="Encours prioritaires" icon={<Clock3 size={14} className="text-amber-600" />} rows={debtors} empty="Aucun encours client" mode="debt" />
      <ClientList title="Clients inactifs" icon={<UserPlus size={14} className="text-slate-500" />} rows={inactive} empty="Aucun client inactif" mode="inactive" />
    </div>
    <div className="px-4 py-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <Metric label="CA clients enregistrés" value={fmt(report?.registered_invoiced_revenue ?? 0)} compact />
      <Metric label="Encaissé clients" value={fmt(report?.registered_collected_cash ?? 0)} compact />
      <Metric label="Clients inactifs" value={`${report?.inactive_clients_count ?? 0}`} compact />
      <Metric label="Retours clients" value={`${report?.returns_count ?? 0}`} compact />
    </div>
  </div>;
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div><p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p><p className={compact ? "font-black text-sm mt-0.5" : "font-black text-lg mt-0.5"}>{value}</p></div>;
}

function ClientList({ title, icon, rows, empty, mode }: { title: string; icon: React.ReactNode; rows: ClientReportRow[]; empty: string; mode: "revenue" | "debt" | "inactive" }) {
  return <div><div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2">{icon}<p className="text-xs font-black">{title}</p></div>{rows.length === 0 ? <p className="px-4 py-5 text-xs text-muted-foreground">{empty}</p> : rows.map(row => <div key={row.client_id} className="px-4 py-3 border-t border-border"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold truncate">{row.client_name}</p><p className="text-[10px] text-muted-foreground">{row.client_type || "Client"}{row.last_sale_at ? ` · dernière vente ${new Date(row.last_sale_at).toLocaleDateString("fr-FR")}` : " · aucune vente"}</p></div><div className="text-right shrink-0"><p className="text-xs font-black">{mode === "revenue" ? fmt(row.invoiced_revenue) : mode === "debt" ? fmt(row.outstanding_global) : `${row.sales_count} vente${row.sales_count > 1 ? "s" : ""}`}</p><p className="text-[10px] text-muted-foreground">{mode === "revenue" ? `${row.sales_count} vente${row.sales_count > 1 ? "s" : ""}` : mode === "debt" ? `${fmt(row.overdue_global)} en retard` : `${fmt(row.outstanding_global)} encours`}</p></div></div></div>)}</div>;
}
