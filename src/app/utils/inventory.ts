import type { Boutique, Charge, InvoiceLine, InvoiceStatus, CartItem, PlatformUser, StockEntry, Invoice, Product } from "../types";
import { SEM } from "../constants";
import { fmt } from "./formatting";
import type { DashPeriod } from "../types";

export function genInvoiceId(boutique: Boutique, allBoutiques: Boutique[], invoices: Invoice[]): string {
  const bNum = String((allBoutiques.findIndex(b => b.id === boutique.id) + 1) % 10);
  const incr = String(invoices.length + 1).padStart(5, "0");
  return `F${bNum}${incr}`;
}

export function getSiblings(currentId: string, allBoutiques: Boutique[], allUsers: PlatformUser[]): Boutique[] {
  const owner = allUsers.find(u => u.assignments.some(a => a.boutiqueId === currentId && a.role === "Propriétaire"));
  if (!owner) return [];
  const ids = owner.assignments.filter(a => a.boutiqueId !== currentId && a.role === "Propriétaire").map(a => a.boutiqueId);
  return allBoutiques.filter(b => ids.includes(b.id));
}

export function lineDispQty(l: InvoiceLine | CartItem) {
  return l.sellUnit && l.sellQty != null ? l.sellQty : l.qty;
}
export function lineDispUnit(l: InvoiceLine | CartItem) { return l.sellUnit || l.unit; }
export function lineTotal(l: InvoiceLine | CartItem) { return lineDispQty(l) * l.prixUnit; }
export function productQty(pid: number, entries: StockEntry[]) { return entries.filter(e => e.productId === pid).reduce((s, e) => s + e.qty, 0); }
// A customer return restores physical stock at its historical cost, but it is
// not a new supplier purchase and must never increase the amount owed.
const isSupplierDebtEntry = (entry: StockEntry) => entry.qty > 0 && entry.movementType !== "retour";
export function productMontant(pid: number, entries: StockEntry[]) { return entries.filter(e => e.productId === pid && isSupplierDebtEntry(e)).reduce((s, e) => s + e.montantDu, 0); }
export function productMontantNet(pid: number, entries: StockEntry[], charges: Charge[]) {
  const pEntries = entries.filter(e => e.productId === pid && isSupplierDebtEntry(e));
  const sups = [...new Set(pEntries.map(e => e.fournisseur))];
  let net = 0;
  for (const sup of sups) {
    const prodDû = pEntries.filter(e => e.fournisseur === sup).reduce((s, e) => s + e.montantDu, 0);
    const totalDû = entries.filter(e => e.fournisseur === sup && isSupplierDebtEntry(e)).reduce((s, e) => s + e.montantDu, 0);
    const totalPayé = charges.filter(c => c.fournisseur === sup).reduce((s, c) => s + c.montant, 0);
    const ratio = totalDû > 0 ? Math.min(1, totalPayé / totalDû) : 0;
    net += prodDû * (1 - ratio);
  }
  return Math.max(0, Math.round(net));
}
export function supplierBalance(nom: string, entries: StockEntry[], charges?: Charge[]) {
  const linkedCharges = (charges ?? []).filter(c => c.fournisseur === nom);
  const regularPurchases = entries
    .filter(e => e.fournisseur === nom && isSupplierDebtEntry(e))
    .reduce((s, e) => s + e.montantDu, 0);
  const transferPurchases = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + c.montant, 0);
  const regularPayments = linkedCharges
    .filter(c => c.source !== "transfer")
    .reduce((s, c) => s + c.montant, 0);
  const transferPayments = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + Number(c.paidAmount ?? 0), 0);
  return Math.max(0, regularPurchases + transferPurchases - regularPayments - transferPayments);
}
// ─── MARGIN (FIFO cost of stock entries) ────────────────────────────────────
// Unit cost for selling `qty` base units of a product, walking stock receipts
// (positive entries) in FIFO order and skipping quantities already consumed by
// prior sales (negative entries). Falls back to the last receipt cost when the
// stock history is incomplete. Returns cost per single base unit.
export function fifoUnitCost(pid: number, qty: number, entries: StockEntry[]): number {
  if (qty <= 0) return 0;
  const receipts = entries.filter(e => e.productId === pid && e.qty > 0).sort((a, b) => a.id - b.id);
  const alreadyConsumed = entries.filter(e => e.productId === pid && e.qty < 0).reduce((s, e) => s - e.qty, 0);
  let consumed = alreadyConsumed;
  const lots: { qty: number; unitCost: number }[] = [];
  for (const r of receipts) {
    const unitCost = r.qty > 0 ? r.montantDu / r.qty : 0;
    if (consumed >= r.qty) { consumed -= r.qty; continue; }
    lots.push({ qty: r.qty - consumed, unitCost });
    consumed = 0;
  }
  let needed = qty;
  let totalCost = 0;
  for (const lot of lots) {
    if (needed <= 0) break;
    const take = Math.min(needed, lot.qty);
    totalCost += take * lot.unitCost;
    needed -= take;
  }
  if (needed > 0 && receipts.length > 0) {
    const last = receipts[receipts.length - 1];
    if (last.qty > 0) totalCost += needed * (last.montantDu / last.qty);
  }
  return totalCost / qty;
}

// Cost per base unit for an invoice line: FIFO cost from stock entries, falling
// back to the product's recorded purchase price. Returns null when no cost is
// known (so the UI can hide margin instead of showing a misleading 100%).
export function lineUnitCost(line: InvoiceLine, entries: StockEntry[], products: Product[]): number | null {
  // Once the first payment freezes the FIFO unit cost on the invoice line,
  // historical margins must never be recomputed from future stock movements.
  if (line.prixAchat != null && line.prixAchat > 0) return line.prixAchat;
  if (line.productId > 0) {
    const fifo = fifoUnitCost(line.productId, line.qty, entries);
    if (fifo > 0) return fifo;
    const p = products.find(pr => pr.id === line.productId);
    if (p?.prixAchat && p.prixAchat > 0) return p.prixAchat;
  }
  return null;
}

export type InvoiceMargin = { ca: number; cost: number; marge: number; pct: number; hasData: boolean };

// Realised margin for an invoice. Returns are treated as negative margin.
export function invoiceMargin(inv: Invoice, entries: StockEntry[], products: Product[]): InvoiceMargin {
  let ca = 0, cost = 0, hasData = false;
  for (const l of (inv.lines ?? [])) {
    ca += lineTotal(l);
    const uc = lineUnitCost(l, entries, products);
    if (uc != null) { cost += uc * l.qty; hasData = true; }
  }
  const sign = inv.type === "Retour" ? -1 : 1;
  const marge = ca - cost;
  const pct = cost > 0 ? Math.round(marge / cost * 100) : 0;
  return { ca: ca * sign, cost: cost * sign, marge: marge * sign, pct, hasData };
}

export function stockStatus(qty: number) { return qty > 20 ? "ok" : qty > 5 ? "low" : "critical"; }
export function stockDot(s: string) { return s==="ok"?SEM.success.accent:s==="low"?SEM.warning.accent:SEM.danger.accent; }
export function invBadge(s: InvoiceStatus): [string,string] {
  return ({
    "payé":       [SEM.success.text, SEM.success.bg],
    "acompte":    [SEM.warning.text, SEM.warning.bg],
    "en attente": [SEM.neutral.text, SEM.neutral.bg],
    "en retard":  [SEM.danger.text,  SEM.danger.bg],
  } as Record<InvoiceStatus,[string,string]>)[s] ?? [SEM.neutral.text, SEM.neutral.bg];
}

export function filterByPeriod<T extends { dateRaw?: string; date?: string }>(items: T[], period: DashPeriod, customFrom: string, customTo: string): T[] {
  const now = new Date();
  const toDate = (d: string) => new Date(d);
  return items.filter(item => {
    const raw = (item as any).dateRaw ?? (item as any).date ?? "";
    if (!raw) return true;
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) { d = toDate(raw); }
    else {
      const months: Record<string,number> = {jan:0,fév:1,fev:1,mar:2,avr:3,mai:4,jun:5,jui:6,jul:6,aoû:7,aou:7,sep:8,oct:9,nov:10,déc:11,dec:11};
      const parts = raw.toLowerCase().replace(" · ", " ").split(" ");
      const day = parseInt(parts[0]); const mon = months[parts[1]?.slice(0,3)] ?? now.getMonth();
      d = new Date(now.getFullYear(), mon, day);
    }
    if (isNaN(d.getTime())) return true;
    if (period === "jour") { return d.toDateString() === now.toDateString(); }
    if (period === "semaine") { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
    if (period === "mois") { return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); }
    if (period === "annee") { return d.getFullYear()===now.getFullYear(); }
    if (period === "custom" && customFrom && customTo) { return d >= toDate(customFrom) && d <= toDate(customTo); }
    return true;
  });
}
