import { refreshSessionIfNeeded } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";

export type FinancialMetrics = {
  from: string;
  to: string;
  invoiced_revenue: number;
  collected_cash: number;
  customer_outstanding_global: number;
  period_outstanding: number;
  cash_expenses: number;
  operating_cash_expenses: number;
  sales_count: number;
  average_basket: number;
  clients_count: number;
  low_stock_count: number;
  realized_margin_fifo: number | null;
  margin_rate: number | null;
  fifo_cost: number | null;
  margin_revenue: number | null;
  margin_gross_revenue: number | null;
  margin_coverage_rate: number | null;
  margin_line_count: number | null;
  margin_unmatched_lines: number | null;
  sales_series: Array<{ date: string; sales: number }>;
};

function messageFrom(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const value = body as Record<string, unknown>;
  return [value.message, value.hint, value.details, value.error]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

export async function loadFinancialMetrics(params: {
  boutiqueId: string;
  from: string;
  to: string;
}): Promise<FinancialMetrics> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_financial_metrics`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_boutique_id: params.boutiqueId,
      p_from: params.from,
      p_to: params.to,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(body) || "Indicateurs financiers indisponibles");
  return body as FinancialMetrics;
}
