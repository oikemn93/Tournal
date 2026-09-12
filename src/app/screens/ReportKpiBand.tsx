import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { FinancialMetrics } from "../../lib/dashboardApi";
import { fmt } from "../utils/formatting";

type Props = {
  metrics: FinancialMetrics | null;
  previous: FinancialMetrics | null;
  canSeeMargin: boolean;
};

type Kpi = {
  label: string;
  value: string;
  current: number;
  previous: number | null;
  hint: string;
};

function variation(current: number, previous: number | null) {
  if (previous == null) return null;
  if (Math.abs(previous) < 0.005) return Math.abs(current) < 0.005 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function VariationBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[11px] font-semibold text-muted-foreground">Pas de comparaison</span>;
  const flat = Math.abs(value) < 0.05;
  const positive = value > 0;
  const tone = flat ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-red-600";
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-black ${tone}`}><Icon size={13} />{Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</span>;
}

export function ReportKpiBand({ metrics, previous, canSeeMargin }: Props) {
  const items: Kpi[] = [
    {
      label: "CA encaissé",
      value: fmt(metrics?.collected_cash ?? 0),
      current: Number(metrics?.collected_cash ?? 0),
      previous: previous ? Number(previous.collected_cash ?? 0) : null,
      hint: "Trésorerie réellement reçue",
    },
    {
      label: "CA facturé",
      value: fmt(metrics?.invoiced_revenue ?? 0),
      current: Number(metrics?.invoiced_revenue ?? 0),
      previous: previous ? Number(previous.invoiced_revenue ?? 0) : null,
      hint: "Factures nettes des retours",
    },
    ...(canSeeMargin && metrics?.realized_margin_fifo != null ? [{
      label: "Marge nette",
      value: fmt(Number(metrics.realized_margin_fifo ?? 0) - Number(metrics.operating_cash_expenses ?? 0)),
      current: Number(metrics.realized_margin_fifo ?? 0) - Number(metrics.operating_cash_expenses ?? 0),
      previous: previous?.realized_margin_fifo != null ? Number(previous.realized_margin_fifo ?? 0) - Number(previous.operating_cash_expenses ?? 0) : null,
      hint: "Marge FIFO moins charges d'exploitation",
    }] : []),
    {
      label: "Nombre de ventes",
      value: `${metrics?.sales_count ?? 0}`,
      current: Number(metrics?.sales_count ?? 0),
      previous: previous ? Number(previous.sales_count ?? 0) : null,
      hint: "Factures de vente sur la période",
    },
    {
      label: "Panier moyen",
      value: fmt(metrics?.average_basket ?? 0),
      current: Number(metrics?.average_basket ?? 0),
      previous: previous ? Number(previous.average_basket ?? 0) : null,
      hint: "Montant moyen par vente",
    },
  ];

  return <section aria-label="Indicateurs principaux" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
    {items.map(item => <article key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">{item.label}</p>
        <VariationBadge value={variation(item.current, item.previous)} />
      </div>
      <p className="mt-2 text-2xl font-black leading-none tracking-tight text-foreground" style={{ fontFamily: "'Nunito',sans-serif" }}>{item.value}</p>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{item.hint}</p>
    </article>)}
  </section>;
}
