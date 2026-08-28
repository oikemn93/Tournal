import { refreshSessionIfNeeded } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";

export type InventoryScopeType = "all" | "category" | "product";
export type InventoryStatus = "draft" | "completed" | "cancelled";
export type InventoryCountingDetail = { mode?: "direct" | "conditioning"; lots?: number; loosePieces?: number; extraQty?: number };

export type InventoryLine = {
  productId: number; productName: string; categoryName?: string | null; unit: string;
  theoreticalQty: number; finalTheoreticalQty?: number | null; countedQty?: number | null; differenceQty?: number | null;
  purchasePrice: number; salePrice: number; fifoTheoreticalCost: number; fifoCountedCost: number; fifoUnitCost: number;
  piecesPerLot: number; lengthPerPiece: number; countingDetail?: InventoryCountingDetail; stockEntryId?: number | null;
};

export type InventoryReport = {
  theoreticalCost: number; countedCost: number; theoreticalSales: number; countedSales: number;
  potentialMargin: number; varianceCost: number; varianceSales: number;
};

export type InventorySession = {
  id: string; boutiqueId?: string; scopeType: InventoryScopeType; scopeId?: string | null; scopeLabel: string;
  status: InventoryStatus; operatorId?: string; operatorName?: string | null; startedAt: string; asOfAt: string;
  finalizedAt?: string | null; cancelledAt?: string | null; report: InventoryReport; lines: InventoryLine[];
};
export type InventorySessionSummary = Omit<InventorySession, "lines"> & { lineCount: number; countedCount: number };

function normalizeSession(session: any): InventorySession {
  const report = session?.report ?? {};
  return { ...session, asOfAt: String(session?.asOfAt ?? session?.startedAt ?? new Date().toISOString()), report: {
    theoreticalCost: Number(report.theoreticalCost ?? 0), countedCost: Number(report.countedCost ?? 0),
    theoreticalSales: Number(report.theoreticalSales ?? 0), countedSales: Number(report.countedSales ?? 0),
    potentialMargin: Number(report.potentialMargin ?? 0), varianceCost: Number(report.varianceCost ?? 0), varianceSales: Number(report.varianceSales ?? 0),
  }, lines: Array.isArray(session?.lines) ? session.lines.map((line: any) => ({ ...line,
    productId: Number(line.productId), theoreticalQty: Number(line.theoreticalQty ?? 0),
    finalTheoreticalQty: line.finalTheoreticalQty == null ? null : Number(line.finalTheoreticalQty),
    countedQty: line.countedQty == null ? null : Number(line.countedQty), differenceQty: line.differenceQty == null ? null : Number(line.differenceQty),
    purchasePrice: Number(line.purchasePrice ?? 0), salePrice: Number(line.salePrice ?? 0),
    fifoTheoreticalCost: Number(line.fifoTheoreticalCost ?? line.theoreticalQty * line.purchasePrice ?? 0),
    fifoCountedCost: Number(line.fifoCountedCost ?? 0), fifoUnitCost: Number(line.fifoUnitCost ?? 0),
    piecesPerLot: Number(line.piecesPerLot ?? 0), lengthPerPiece: Number(line.lengthPerPiece ?? 0),
    stockEntryId: line.stockEntryId == null ? null : Number(line.stockEntryId), countingDetail: line.countingDetail ?? {},
  })) : [] };
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(payload?.message ?? payload?.hint ?? payload?.details ?? "Opération d'inventaire impossible"));
  return payload as T;
}

export async function listInventorySessions(boutiqueId: string, limit = 20): Promise<InventorySessionSummary[]> {
  const rows = await rpc<any[]>("list_inventory_sessions", { p_boutique_id: boutiqueId, p_limit: limit });
  return (Array.isArray(rows) ? rows : []).map(row => ({ ...row, asOfAt: String(row.asOfAt ?? row.startedAt), report: normalizeSession({ ...row, lines: [] }).report, lineCount: Number(row.lineCount ?? 0), countedCount: Number(row.countedCount ?? 0) }));
}
export async function getInventorySession(sessionId: string) { return normalizeSession(await rpc<any>("get_inventory_session", { p_session_id: sessionId })); }
export async function startInventorySession(params: { boutiqueId: string; scopeType: InventoryScopeType; scopeId?: string | null; asOfAt?: string | null }) {
  return normalizeSession(await rpc<any>("start_inventory_session", { p_boutique_id: params.boutiqueId, p_scope_type: params.scopeType, p_scope_id: params.scopeId ?? null, p_as_of_at: params.asOfAt ?? new Date().toISOString() }));
}
export async function saveInventoryCount(params: { sessionId: string; productId: number; countedQty: number; countingDetail?: InventoryCountingDetail }) { return normalizeSession(await rpc<any>("save_inventory_count", { p_session_id: params.sessionId, p_product_id: params.productId, p_counted_qty: params.countedQty, p_counting_detail: params.countingDetail ?? {} })); }
export async function finalizeInventorySession(sessionId: string) { return normalizeSession(await rpc<any>("finalize_inventory_session", { p_session_id: sessionId })); }
export async function cancelInventorySession(sessionId: string) { return normalizeSession(await rpc<any>("cancel_inventory_session", { p_session_id: sessionId })); }
