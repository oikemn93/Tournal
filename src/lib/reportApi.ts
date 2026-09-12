import { refreshSessionIfNeeded } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";

export type SalesProductReportRow = {
  product_id: number;
  product_name: string;
  category_id: string | null;
  category_name: string;
  quantity: number;
  invoiced_revenue: number;
  realized_margin_fifo: number | null;
  margin_coverage_rate: number | null;
  margin_unmatched_lines: number | null;
};

export type SalesProductReport = {
  from: string;
  to: string;
  invoiced_revenue: number;
  products: SalesProductReportRow[];
  categories: Array<{ id: string; name: string }>;
};

export type EmployeePerformanceRow = {
  operator_id: string | null;
  operator_name: string;
  invoiced_revenue: number;
  sales_count: number;
  average_basket: number;
  returns_count: number;
  return_rate: number | null;
};

export type EmployeePerformanceReport = {
  from: string;
  to: string;
  invoiced_revenue: number;
  employees: EmployeePerformanceRow[];
};

export type StockInventoryProductRow = {
  product_id: number;
  product_name: string;
  category_id: string | null;
  category_name: string;
  current_stock: number;
  net_sold_qty: number;
  rotation_class: "rapide" | "moyenne" | "lente" | "dormant";
  last_sale_at: string | null;
  days_since_last_sale: number | null;
  dormant: boolean;
  fifo_stock_value: number | null;
};

export type InventoryVarianceRow = {
  session_id: string;
  finalized_at: string;
  scope_label: string;
  variance_qty_abs: number;
  variance_cost: number | null;
};

export type StockInventoryReport = {
  from: string;
  to: string;
  dormant_days: number;
  stock_value_fifo: number | null;
  products: StockInventoryProductRow[];
  inventory_variances: InventoryVarianceRow[];
};

function messageFrom(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const value = body as Record<string, unknown>;
  return [value.message, value.hint, value.details, value.error]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

async function postRpc<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(body) || "Rapport indisponible");
  return body as T;
}

export function loadSalesProductReport(params: { boutiqueId: string; from: string; to: string }) {
  return postRpc<SalesProductReport>("get_sales_product_report", {
    p_boutique_id: params.boutiqueId,
    p_from: params.from,
    p_to: params.to,
  });
}

export function loadEmployeePerformanceReport(params: { boutiqueId: string; from: string; to: string }) {
  return postRpc<EmployeePerformanceReport>("get_employee_performance_report", {
    p_boutique_id: params.boutiqueId,
    p_from: params.from,
    p_to: params.to,
  });
}

export function loadStockInventoryReport(params: { boutiqueId: string; from: string; to: string; dormantDays: number }) {
  return postRpc<StockInventoryReport>("get_stock_inventory_report", {
    p_boutique_id: params.boutiqueId,
    p_from: params.from,
    p_to: params.to,
    p_dormant_days: params.dormantDays,
  });
}
