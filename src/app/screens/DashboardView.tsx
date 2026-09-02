import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CircleDollarSign, PackageSearch, ReceiptText, TrendingUp, Users } from "lucide-react";
import { loadDashboardSummary, type DashboardSummary } from "../../lib/dashboardApi";
import type { Tab } from "../types";

const fmt = (value: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(value || 0))} F`;

type Period = "7d" | "30d" | "month";

function periodBounds(period: Period) {
  const now = new Date();
  const to = new Date(now.getTime() + 1000);
  if (period === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: to.toISOString() };
  }
  const days = period === "30d" ? 29 : 6;
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function DashboardView({ boutiqueId, canSeeMargin, onNavigate }: {
  boutiqueId: string;
  canSeeMargin: boolean;
  onNavigate: (tab: Tab, filter?: Record<string, string>) => void;
}) {
  const [period, setPeriod] = useState<Period>("7d");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const bounds = periodBounds(period);
    setLoading(true);
    setError("");
    void loadDashboardSummary({ boutiqueId, ...bounds })
      .then((result) => { if (!cancelled) setSummary(result); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Dashboard indisponible"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [boutiqueId, period]);

  const maxSeries = useMemo(() => Math.max(1, ...(summary?.series ?? []).map(point => Number(point.sales) || 0)), [summary?.series]);

  if (loading && !summary) {
    return <div className="py-16 text-center text-sm font-semibold text-muted-foreground">Chargement du tableau de bord…</div>;
  }
  if (error && !summary) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>;
  }
  if (!summary) return null;

  const cards = [
    { label: "Chiffre d’affaires", value: fmt(summary.sales), icon: TrendingUp },
    { label: "Encaissé", value: fmt(summary.collected), icon: CircleDollarSign },
    { label: "Impayé", value: fmt(summary.outstanding), icon: ReceiptText },
    { label: "Charges payées", value: fmt(summary.charges), icon: BarChart3 },
  ];

  return <div className="space-y-4 pb-24">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black">Tableau de bord</h1>
        <p className="text-xs text-muted-foreground mt-1">Agrégats sécurisés, sans téléchargement des tables métier.</p>
      </div>
      <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="rounded-xl bg-muted px-3 py-2 text-sm font-bold outline-none">
        <option value="7d">7 jours</option>
        <option value="30d">30 jours</option>
        <option value="month">Ce mois</option>
      </select>
    </div>

    {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Données précédentes conservées · {error}</div>}

    <div className="grid grid-cols-2 gap-3">
      {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4">
        <Icon size={17} className="text-muted-foreground" />
        <p className="mt-3 text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-black">{value}</p>
      </div>)}
    </div>

    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-black">Activité commerciale</p><p className="text-xs text-muted-foreground">Ventes nettes par jour</p></div>
        <span className="text-xs font-bold text-muted-foreground">{summary.sales_count} vente{summary.sales_count !== 1 ? "s" : ""}</span>
      </div>
      <div className="mt-4 flex h-28 items-end gap-2">
        {(summary.series ?? []).length === 0 ? <div className="m-auto text-xs text-muted-foreground">Aucune vente sur la période</div> : summary.series.map(point => {
          const height = Math.max(4, Math.round((Number(point.sales) || 0) / maxSeries * 100));
          return <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 h-full">
            <div className="w-full rounded-t-lg bg-foreground/15" style={{ height: `${height}%` }} title={`${point.date} · ${fmt(Number(point.sales))}`} />
            <span className="text-[9px] text-muted-foreground">{new Date(point.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
          </div>;
        })}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => onNavigate("clients")} className="rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99]">
        <Users size={18} /><p className="mt-2 text-2xl font-black">{summary.clients_count}</p><p className="text-xs text-muted-foreground">Clients actifs sur la période</p><ArrowRight size={14} className="mt-3" />
      </button>
      <button type="button" onClick={() => onNavigate("stock", { stockFilter: "low" })} className="rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99]">
        {summary.low_stock_count > 0 ? <AlertTriangle size={18} /> : <PackageSearch size={18} />}
        <p className="mt-2 text-2xl font-black">{summary.low_stock_count}</p><p className="text-xs text-muted-foreground">Articles en stock bas</p><ArrowRight size={14} className="mt-3" />
      </button>
    </div>

    {canSeeMargin && summary.margin != null && <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between"><p className="text-sm font-black">Marge réalisée</p><span className="text-lg font-black">{fmt(summary.margin)}</span></div>
      {summary.stock_value != null && <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>Valeur d’achat du stock</span><span className="font-bold text-foreground">{fmt(summary.stock_value)}</span></div>}
    </div>}

    <div className="flex gap-2">
      <button onClick={() => onNavigate("factures")} className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-bold">Factures</button>
      <button onClick={() => onNavigate("charges")} className="flex-1 rounded-xl border border-border px-3 py-2 text-xs font-bold">Charges</button>
    </div>
  </div>;
}
