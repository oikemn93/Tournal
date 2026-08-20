const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";
const SESSION_STORAGE_KEY = "tournal.supabase.session";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string | null };
};

export const NOTIFICATION_CATEGORIES = [
  { id:"sale", label:"Ventes", icon:"🧾" },
  { id:"payment", label:"Paiements", icon:"💳" },
  { id:"refund", label:"Remboursements", icon:"↩️" },
  { id:"stock", label:"Stock", icon:"📦" },
  { id:"transfer", label:"Transferts", icon:"🔁" },
  { id:"charge", label:"Charges", icon:"💸" },
  { id:"client", label:"Clients", icon:"👤" },
  { id:"supplier", label:"Fournisseurs", icon:"🚚" },
  { id:"caisse", label:"Caisse", icon:"🧮" },
  { id:"security", label:"Sécurité & accès", icon:"🛡️" },
  { id:"general", label:"Général", icon:"🔔" },
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number]["id"];

export type NotificationHistoryItem = {
  id: number;
  user_id: string;
  boutique_id?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  icon: string;
  action_tab?: string | null;
  action_filter?: Record<string,string> | null;
  created_at: string;
  read_at?: string | null;
  dismissed_at?: string | null;
  in_app_enabled: boolean;
  push_enabled: boolean;
};

export type NotificationPreference = {
  boutique_id: string;
  category: NotificationCategory;
  in_app_enabled: boolean;
  push_enabled: boolean;
  updated_at?: string;
};

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    return null;
  }
}

async function dataRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  if (!session?.access_token) throw new Error("Connexion requise");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? body?.hint ?? "Notifications indisponibles");
  return body as T;
}

export async function getNotificationHistory(options: {
  limit?: number;
  offset?: number;
  boutiqueId?: string;
  category?: NotificationCategory | "all";
  unreadOnly?: boolean;
  search?: string;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const params = new URLSearchParams();
  params.set("select", "id,user_id,boutique_id,category,title,body,icon,action_tab,action_filter,created_at,read_at,dismissed_at,in_app_enabled,push_enabled");
  params.set("dismissed_at", "is.null");
  params.set("in_app_enabled", "eq.true");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (options.boutiqueId) params.set("boutique_id", `eq.${options.boutiqueId}`);
  if (options.category && options.category !== "all") params.set("category", `eq.${options.category}`);
  if (options.unreadOnly) params.set("read_at", "is.null");
  const search = options.search?.trim().replace(/[%(),]/g, " ").replace(/\s+/g, " ");
  if (search) params.set("or", `(title.ilike.*${search}*,body.ilike.*${search}*)`);
  return dataRequest<NotificationHistoryItem[]>(`notifications?${params.toString()}`);
}

export async function getNotificationPreferences(boutiqueId: string) {
  const params = new URLSearchParams();
  params.set("select", "boutique_id,category,in_app_enabled,push_enabled,updated_at");
  params.set("boutique_id", `eq.${boutiqueId}`);
  params.set("order", "category.asc");
  return dataRequest<NotificationPreference[]>(`notification_preferences?${params.toString()}`);
}

export async function setNotificationPreference(
  boutiqueId: string,
  category: NotificationCategory,
  inAppEnabled: boolean,
  pushEnabled: boolean,
) {
  return dataRequest<void>("rpc/set_notification_preference", {
    method: "POST",
    body: JSON.stringify({
      p_boutique_id: boutiqueId,
      p_category: category,
      p_in_app_enabled: inAppEnabled,
      p_push_enabled: pushEnabled,
    }),
  });
}
