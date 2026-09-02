import { refreshSessionIfNeeded } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";

export type DashboardSummary = {
  from: string;
  to: string;
  sales: number;
  collected: number;
  outstanding: number;
  charges: number;
  sales_count: number;
  clients_count: number;
  low_stock_count: number;
  margin: number | null;
  stock_value: number | null;
  series: Array<{ date: string; sales: number }>;
};

function messageFrom(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const value = body as Record<string, unknown>;
  return [value.message, value.hint, value.details, value.error]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

export async function loadDashboardSummary(params: {
  boutiqueId: string;
  from?: string | null;
  to?: string | null;
}): Promise<DashboardSummary> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_dashboard_summary`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_boutique_id: params.boutiqueId,
      p_from: params.from ?? null,
      p_to: params.to ?? null,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(body) || "Dashboard indisponible");
  return body as DashboardSummary;
}
