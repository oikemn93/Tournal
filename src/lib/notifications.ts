import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";
const SESSION_STORAGE_KEY = "tournal.supabase.session";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string | null };
};

export type ServerNotification = {
  id: number;
  user_id: string;
  boutique_id?: string | null;
  category: "sale"|"payment"|"refund"|"stock"|"transfer"|"charge"|"client"|"supplier"|"security"|"caisse"|"general";
  title: string;
  body: string;
  icon: string;
  action_tab?: string | null;
  action_filter?: Record<string,string> | null;
  created_at: string;
  read_at?: string | null;
  dismissed_at?: string | null;
};

export type PushState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  iosNeedsInstall: boolean;
};

const globalScope = globalThis as unknown as Record<string, unknown>;
if (!globalScope.__tournal_notifications_client__) {
  globalScope.__tournal_notifications_client__ = createSupabaseClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "tournal.notifications.noop" },
  });
}
const realtimeClient = globalScope.__tournal_notifications_client__ as ReturnType<typeof createSupabaseClient>;

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

export async function getNotifications(limit = 80) {
  return dataRequest<ServerNotification[]>(
    `notifications?select=id,user_id,boutique_id,category,title,body,icon,action_tab,action_filter,created_at,read_at,dismissed_at&dismissed_at=is.null&order=created_at.desc&limit=${Math.max(1,Math.min(limit,100))}`,
  );
}

export async function markNotificationRead(id: number) {
  return dataRequest<void>("rpc/mark_notification_read", {
    method: "POST",
    body: JSON.stringify({ p_id:id }),
  });
}

export async function markAllNotificationsRead() {
  return dataRequest<void>("rpc/mark_all_notifications_read", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function dismissAllNotifications() {
  return dataRequest<void>("rpc/dismiss_all_notifications", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function subscribeToNotifications(onChange: () => void) {
  const session = readSession();
  if (!session?.access_token || !session.user?.id) return () => undefined;
  try {
    realtimeClient.realtime.setAuth(session.access_token);
    const channel = realtimeClient
      .channel(`notifications:${session.user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${session.user.id}`,
      }, onChange)
      .subscribe();
    return () => { void realtimeClient.removeChannel(channel); };
  } catch {
    return () => undefined;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

async function getRegistration() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker indisponible");
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/service-worker.js");
}

export async function getPushState(): Promise<PushState> {
  const supported = typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
  if (!supported) return { supported:false, permission:"unsupported", subscribed:false, iosNeedsInstall:false };
  const iosNeedsInstall = isIos() && !isStandalonePwa();
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    subscribed = Boolean(await registration?.pushManager.getSubscription());
  } catch {}
  return { supported:true, permission:Notification.permission, subscribed, iosNeedsInstall };
}

export async function enableWebPush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Les notifications Push ne sont pas supportées sur ce navigateur");
  }
  if (isIos() && !isStandalonePwa()) {
    throw new Error("Sur iPhone/iPad, installez d’abord Tournal sur l’écran d’accueil, puis activez les notifications depuis l’app installée");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Autorisation de notifications refusée");

  const registration = await getRegistration();
  const publicKey = await dataRequest<string>("rpc/get_push_public_key", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!publicKey || typeof publicKey !== "string") throw new Error("Clé Push indisponible");

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Abonnement Push incomplet");
  const deviceLabel = `${navigator.platform || "Web"} · ${navigator.userAgent.includes("Mobile") ? "Mobile" : "PC"}`;
  await dataRequest<unknown>("rpc/claim_push_subscription", {
    method: "POST",
    body: JSON.stringify({
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent,
      p_device_label: deviceLabel,
    }),
  });
  return getPushState();
}

export async function disableWebPush() {
  if (!("serviceWorker" in navigator)) return getPushState();
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    try {
      await dataRequest<unknown>("rpc/remove_push_subscription", {
        method: "POST",
        body: JSON.stringify({ p_endpoint: subscription.endpoint }),
      });
    } finally {
      await subscription.unsubscribe().catch(() => false);
    }
  }
  return getPushState();
}
