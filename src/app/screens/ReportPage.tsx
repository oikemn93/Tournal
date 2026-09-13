import React from "react";
import { fmt } from "../utils/formatting";

export type ReportPageRequest = { offset: number; sort: string; direction: "asc" | "desc" };
type Cell = string | number | boolean | null;
export type ReportPageData = {
  rows: Record<string, Cell>[]; total: number; offset: number; limit: number;
  sort: string; direction: "asc" | "desc";
  columns: { key: string; label: string; format: "text" | "number" | "money" }[];
  summary: { label: string; value: number | null; format: "number" | "money" }[];
  chart: { label: string; value: number }[];
  scope: string;
  payment_methods?: {payment_method:string;amount:number;events_count:number}[];
  inventory_variances?: {session_id:string;scope_label:string;finalized_at:string;variance_qty_abs:number;variance_cost:number|null}[];
};
export type ReportPageProps = { page: ReportPageData; onPage: (request: ReportPageRequest) => void };
const display = (value: Cell, format: string) => value == null ? "—" : format === "money" ? fmt(Number(value)) : format === "number" ? Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : String(value);

export function ReportPage({ page, onPage }: ReportPageProps) {
  const max = Math.max(1, ...page.chart.map(item => Math.abs(item.value)));
  const change = (offset: number, sort = page.sort, direction = page.direction) => onPage({ offset, sort, direction });
  return <div className="space-y-4" data-report-page="server">
    <p className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">{page.scope}</p>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{page.summary.map(item => <div key={item.label} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-lg font-black">{display(item.value, item.format)}</p></div>)}</div>
    <section className="rounded-xl border border-border p-4"><h3 className="mb-3 text-sm font-bold">Premiers résultats sur toute la sélection</h3><div className="space-y-3">{page.chart.map((item, index) => <div key={`${item.label}-${index}`}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{item.label}</span><strong>{item.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</strong></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-foreground/70" style={{ width: `${Math.abs(item.value) / max * 100}%` }}/></div></div>)}</div>{page.chart.length === 0 && <p className="text-xs text-muted-foreground">Aucune donnée sur cette sélection.</p>}</section>
    {Boolean(page.payment_methods?.length)&&<section className="rounded-xl border p-3"><h3 className="text-sm font-bold">Paiements sur la sélection de factures</h3>{page.payment_methods?.map(item=><div className="flex justify-between py-1 text-xs" key={item.payment_method}><span>{item.payment_method} · {item.events_count} opérations</span><strong>{fmt(item.amount)}</strong></div>)}</section>}
    {Boolean(page.inventory_variances?.length)&&<section className="rounded-xl border p-3"><h3 className="text-sm font-bold">Écarts d’inventaire · période globale</h3><p className="text-xs text-muted-foreground">50 dernières sessions au maximum, indépendantes des filtres commerciaux.</p>{page.inventory_variances?.map(item=><div key={item.session_id} className="flex justify-between gap-3 py-1 text-xs"><span>{new Date(item.finalized_at).toLocaleDateString("fr-FR")} · {item.scope_label}</span><strong>{item.variance_qty_abs} unités{item.variance_cost!=null?` · ${fmt(item.variance_cost)}`:""}</strong></div>)}</section>}
    <div className="overflow-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted"><tr>{page.columns.map(column => <th key={column.key} aria-sort={page.sort === column.key ? page.direction === "asc" ? "ascending" : "descending" : "none"} className={`whitespace-nowrap p-3 ${column.format === "text" ? "text-left" : "text-right"}`}><button type="button" onClick={() => change(0, column.key, page.sort === column.key && page.direction === "desc" ? "asc" : "desc")}>{column.label}{page.sort === column.key ? page.direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}</tr></thead><tbody>{page.rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t border-border">{page.columns.map(column => <td key={column.key} className={`p-3 ${column.format === "text" ? "text-left" : "text-right tabular-nums"}`}>{display(row[column.key], column.format)}</td>)}</tr>)}</tbody></table></div>
    <nav aria-label="Pagination du rapport" className="flex items-center justify-between gap-2 text-xs"><button type="button" disabled={page.offset === 0} className="rounded-lg border p-2 disabled:opacity-40" onClick={() => change(Math.max(0, page.offset - page.limit))}>Précédent</button><span role="status">{page.total ? page.offset + 1 : 0}–{Math.min(page.total, page.offset + page.rows.length)} sur {page.total}</span><button type="button" disabled={page.offset + page.limit >= page.total} className="rounded-lg border p-2 disabled:opacity-40" onClick={() => change(page.offset + page.limit)}>Suivant</button></nav>
  </div>;
}
