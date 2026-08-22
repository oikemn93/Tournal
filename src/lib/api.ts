import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Small browser-only client for the Tournal Supabase project.
 *
 * The project uses the publishable key only; privileged credentials never
 * reach the browser. Authorization is enforced by PostgreSQL RLS.
 */

type AuthUser = { id: string; email?: string | null };
type AuthSession = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  expires_at?: number;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";
const SESSION_STORAGE_KEY = "tournal.supabase.session";
const SESSION_REFRESH_SKEW_MS = 2 * 60_000;
const JWT_CLOCK_SKEW_MAX_RETRIES = 3;
const JWT_CLOCK_SKEW_RETRY_DELAY_MS = 1_000;
let refreshSessionInFlight: Promise<AuthSession> | null = null;
let jwtClockSkewWaitInFlight: Promise<void> | null = null;
type AppSessionRecoveryHandler = () => Promise<boolean>;
let appSessionRecoveryHandler: AppSessionRecoveryHandler | null = null;

/**
 * Lets the active application screen restore an expired server-side app
 * session before a protected request is rejected by RLS. The handler is kept
 * in the UI layer because only it knows the currently selected boutique.
 */
export function setAppSessionRecoveryHandler(handler: AppSessionRecoveryHandler | null) {
  appSessionRecoveryHandler = handler;
}

// Singleton stored on globalThis so HMR re-evaluations reuse the same instance.
const _global = globalThis as unknown as Record<string, unknown>;
if (!_global.__tournal_realtime_client__) {
  _global.__tournal_realtime_client__ = createSupabaseClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "tournal.realtime.noop" },
  });
}
const realtimeClient = _global.__tournal_realtime_client__ as ReturnType<typeof createSupabaseClient>;

function phoneToEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) throw new Error("Numéro de téléphone invalide");
  return `${digits}@tournal.internal`;
}

function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Private browsing can reject storage. The in-memory request still succeeds.
  }
}

function accessTokenExpiryMs(accessToken: string): number | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const parsed = JSON.parse(atob(padded)) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function apiErrorMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const value = body as Record<string, unknown>;
  return [value.message, value.msg, value.hint, value.details, value.error]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function isJwtIssuedAtFutureError(body: unknown) {
  const message = apiErrorMessage(body).toLowerCase();
  return message.includes("jwt") && message.includes("issued at future");
}

/**
 * Auth can mint a token a fraction of a second before another Supabase service
 * observes its clock. A 401/403 carrying this exact error is therefore safe to
 * retry: authentication was rejected before the requested RPC or mutation ran.
 * Requests share one short wait so the four bootstrap queries do not stampede.
 */
function waitForJwtClockSkew() {
  if (!jwtClockSkewWaitInFlight) {
    jwtClockSkewWaitInFlight = new Promise<void>((resolve) => {
      window.setTimeout(resolve, JWT_CLOCK_SKEW_RETRY_DELAY_MS);
    });
    void jwtClockSkewWaitInFlight.finally(() => {
      jwtClockSkewWaitInFlight = null;
    });
  }
  return jwtClockSkewWaitInFlight;
}

async function fetchJsonWithJwtClockSkewRetry(request: () => Promise<Response>) {
  for (let attempt = 0; attempt <= JWT_CLOCK_SKEW_MAX_RETRIES; attempt += 1) {
    const response = await request();
    const body = await response.json().catch(() => null);
    if (
      response.ok
      || (response.status !== 401 && response.status !== 403)
      || !isJwtIssuedAtFutureError(body)
      || attempt === JWT_CLOCK_SKEW_MAX_RETRIES
    ) {
      return { response, body };
    }
    await waitForJwtClockSkew();
  }
  throw new Error("Réponse Supabase inattendue");
}

async function authRequest(path: string, init: RequestInit) {
  const { response, body } = await fetchJsonWithJwtClockSkewRetry(() =>
    fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    }),
  );
  if (!response.ok) throw new Error(apiErrorMessage(body) || "Authentification impossible");
  return body;
}

/**
 * Keeps the browser-only session alive without moving tokens to localStorage.
 * The same refreshed token is immediately supplied to active Realtime channels.
 */
export async function refreshSessionIfNeeded(force = false): Promise<AuthSession> {
  const session = readSession();
  if (!session?.access_token || !session.refresh_token) throw new Error("Connexion requise");

  const expiryMs = typeof session.expires_at === "number"
    ? session.expires_at * 1000
    : accessTokenExpiryMs(session.access_token);
  if (!force && (expiryMs === null || expiryMs - Date.now() > SESSION_REFRESH_SKEW_MS)) return session;

  if (!refreshSessionInFlight) {
    refreshSessionInFlight = authRequest("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).then((body) => {
      const refreshed = body as AuthSession;
      if (!refreshed.access_token || !refreshed.refresh_token) throw new Error("Renouvellement de session incomplet");
      storeSession(refreshed);
      realtimeClient.realtime.setAuth(refreshed.access_token);
      window.dispatchEvent(new Event("tournal:session-refreshed"));
      return refreshed;
    }).finally(() => {
      refreshSessionInFlight = null;
    });
  }
  return refreshSessionInFlight;
}

async function dataRequest<T>(path: string, init: RequestInit = {}, allowSessionRecovery = true): Promise<T> {
  const session = await refreshSessionIfNeeded();
  const { response, body } = await fetchJsonWithJwtClockSkewRetry(() =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    }),
  );
  if (!response.ok) {
    // RLS uses the same HTTP status for a genuine missing permission and for
    // an expired application session. Ask the app to restore the latter once,
    // then retry the original request exactly once. A valid app session leaves
    // the real permission error untouched.
    if (allowSessionRecovery && (response.status === 401 || response.status === 403) && appSessionRecoveryHandler) {
      const restored = await appSessionRecoveryHandler().catch(() => false);
      if (restored) return dataRequest<T>(path, init, false);
    }
    throw new Error(apiErrorMessage(body) || "Accès aux données refusé");
  }
  return body as T;
}

async function dataRequestAll<T>(path: string, order = "id.asc"): Promise<T[]> {
  const pageSize = 1000;
  const separator = path.includes("?") ? "&" : "?";
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await dataRequest<T[]>(
      `${path}${separator}order=${encodeURIComponent(order)}&limit=${pageSize}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function adminProvision<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-provision`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Opération administrateur impossible");
  return body as T;
}

export async function createInvoiceShare(params: { boutiqueId:string; invoiceId:string; pdf:Blob }) {
  const session = await refreshSessionIfNeeded();
  const form = new FormData();
  form.append("boutique_id", params.boutiqueId);
  form.append("invoice_id", params.invoiceId);
  form.append("file", params.pdf, `facture-${params.invoiceId}.pdf`);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice-share`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Création du lien de facture impossible");
  return body as { url:string; expires_at:string };
}

export async function signInWithPhone(phone: string, password: string) {
  const body = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: phoneToEmail(phone), password }),
  });
  storeSession(body as AuthSession);
  return body as AuthSession;
}

export async function changeOwnPassword(password: string) {
  if (password.length < 12) throw new Error("Utilisez un mot de passe d’au moins 12 caractères");
  const session = await refreshSessionIfNeeded();
  await authRequest("/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ password }),
  });
  await dataRequest("rpc/complete_password_change", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function signUpWithPhone(phone: string, password: string, fullName: string) {
  if (password.length < 12) throw new Error("Utilisez un mot de passe d’au moins 12 caractères");
  const body = await authRequest("/signup", {
    method: "POST",
    body: JSON.stringify({
      email: phoneToEmail(phone),
      password,
      data: { phone, full_name: fullName.trim() || phone },
    }),
  });
  if (body?.access_token) storeSession(body as AuthSession);
  return body as Partial<AuthSession>;
}

export async function signOut() {
  const session = readSession();
  try {
    if (session?.access_token) {
      await authRequest("/logout", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    }
  } finally {
    storeSession(null);
  }
}

export function getCurrentAuthUser(): AuthUser | null {
  return readSession()?.user ?? null;
}

export function hasAuthenticatedSession() {
  return Boolean(readSession()?.access_token);
}

/** Validates the locally cached token with Supabase Auth, not just localStorage. */
export async function validateServerSession(): Promise<boolean> {
  if (!readSession()?.access_token) return false;
  try {
    const session = await refreshSessionIfNeeded();
    const { response, body } = await fetchJsonWithJwtClockSkewRetry(() =>
      fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
      }),
    );
    if (!response.ok) {
      // Do not discard a brand-new local session merely because a second
      // Supabase service is momentarily behind the Auth server's clock.
      if (isJwtIssuedAtFutureError(body)) return true;
      storeSession(null);
      return false;
    }
    const user = body as AuthUser;
    if (!user?.id || user.id !== session.user?.id) { storeSession(null); return false; }
    return true;
  } catch {
    // Do not turn a transient network loss into an unexpected logout. Mutations
    // will still fail safely server-side until the network comes back.
    return Boolean(readSession()?.access_token);
  }
}

export async function startAppSession(boutiqueId: string) {
  return dataRequest<{ expires_at:string; locked:boolean }>("rpc/start_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) }, false);
}

export async function validateAppSession(boutiqueId: string) {
  return dataRequest<boolean>("rpc/validate_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) }, false);
}

export async function getPinStatus() {
  return dataRequest<{ configured:boolean; lockedUntil?:string|null }>(
    "rpc/get_pin_status", { method:"POST", body:JSON.stringify({}) },
  );
}

export async function setQuickPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new Error("Le PIN doit contenir exactement 6 chiffres");
  return dataRequest<void>(
    "rpc/set_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },
  );
}

export async function verifyQuickPin(pin: string, boutiqueId: string) {
  if (!/^\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0, lockedUntil:null, sessionExpired:false } as const;
  return dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null; sessionExpired?:boolean }>(
    "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin, p_boutique_id:boutiqueId }) },
  );
}

export async function lockAppSession(boutiqueId: string) {
  return dataRequest<void>("rpc/lock_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) }, false);
}

export async function resetUserQuickPin(userId: string) {
  return dataRequest<void>(
    "rpc/reset_user_quick_pin", { method:"POST", body:JSON.stringify({ p_user_id:userId }) },
  );
}

export type LegacyBoutiqueChange = {
  table: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  record: Record<string, unknown>;
  oldRecord: Record<string, unknown>;
  ownStockWrite: boolean;
};

/**
 * Watches the legacy Postgres Changes transport for a boutique. The callback
 * receives a short batch so the UI can fast-path isolated stock movements,
 * while non-stock changes still reconcile from the canonical full snapshot.
 */
export function subscribeToBoutiqueChanges(
  boutiqueId: string,
  onChanges: (changes: LegacyBoutiqueChange[], reason: "events" | "reconnect" | "unavailable") => void,
) {
  const session = readSession();
  if (!session?.access_token || !boutiqueId) return () => undefined;

  try {
    realtimeClient.realtime.setAuth(session.access_token);
    const refreshRealtimeAuth = () => {
      const refreshed = readSession();
      if (refreshed?.access_token) realtimeClient.realtime.setAuth(refreshed.access_token);
    };
    window.addEventListener("tournal:session-refreshed", refreshRealtimeAuth);
    const filter = `boutique_id=eq.${boutiqueId}`;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let hasSubscribed = false;
    let pending: LegacyBoutiqueChange[] = [];
    const flush = (reason: "events" | "reconnect" | "unavailable") => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        const changes = pending;
        pending = [];
        onChanges(changes, reason);
      }, 80);
    };
    let channel = realtimeClient.channel(`tournal:${boutiqueId}`);
    // Each subscription is scoped to one boutique and only to relational tables.
    // This deliberately avoids both the former global JSON blob and polling.
    for (const table of ["products", "stock_entries", "invoices", "invoice_lines", "invoice_payments", "clients", "client_advances", "charges", "caisse_sessions", "suppliers", "categories", "boutique_partners", "boutique_assignments", "audit_log"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, (payload: any) => {
        const operation = payload?.eventType;
        if (operation !== "INSERT" && operation !== "UPDATE" && operation !== "DELETE") return;
        const record = (operation === "DELETE" ? payload?.old : payload?.new) ?? {};
        const oldRecord = payload?.old ?? {};
        pending.push({
          table,
          operation,
          record,
          oldRecord,
          // Products do not keep an operator id, but the paired stock entry
          // does. The UI uses this to avoid merging an optimistic own entry
          // with its canonical Realtime copy.
          ownStockWrite: table === "stock_entries" && String(record.operator_id ?? "") === session.user.id,
        });
        flush("events");
      });
    }
    channel = channel.subscribe((status) => {
      // The first snapshot is loaded explicitly by the application. A later
      // subscription means the socket reconnected and needs reconciliation.
      if (status === "SUBSCRIBED") {
        if (hasSubscribed) flush("reconnect");
        hasSubscribed = true;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Realtime ${status.toLowerCase()} pour la boutique ${boutiqueId}`);
        flush("unavailable");
      }
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("tournal:session-refreshed", refreshRealtimeAuth);
      void realtimeClient.removeChannel(channel);
    };
  } catch (error) {
    // Realtime is an enhancement. A transient channel issue must never block
    // the relational data already loaded for the selected boutique.
    console.warn("Realtime indisponible pour cette boutique", error);
    return () => undefined;
  }
}

/**
 * Watches transfer headers from both directions for one boutique, plus the
 * transfer lines visible through RLS. stock_transfers has no single boutique_id,
 * so from/to filters must stay distinct.
 */
export function subscribeToStockTransfers(boutiqueId: string, onChange: () => void) {
  const session = readSession();
  if (!session?.access_token || !boutiqueId) return () => undefined;

  try {
    realtimeClient.realtime.setAuth(session.access_token);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let hasSubscribed = false;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        onChange();
      }, 300);
    };
    let channel = realtimeClient.channel(`stock-transfers:${boutiqueId}`);
    channel = channel
      .on("postgres_changes", {
        event: "*", schema: "public", table: "stock_transfers",
        filter: `from_boutique_id=eq.${boutiqueId}`,
      }, scheduleRefresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "stock_transfers",
        filter: `to_boutique_id=eq.${boutiqueId}`,
      }, scheduleRefresh)
      // stock_transfer_lines has no boutique column. RLS on the parent transfer
      // authorizes which line events this authenticated subscriber can receive.
      .on("postgres_changes", {
        event: "*", schema: "public", table: "stock_transfer_lines",
      }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed) scheduleRefresh();
          hasSubscribed = true;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`Realtime transferts ${status.toLowerCase()} pour ${boutiqueId}`);
        }
      });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void realtimeClient.removeChannel(channel);
    };
  } catch (error) {
    console.warn("Realtime transferts indisponible", error);
    return () => undefined;
  }
}

export async function recordAuditLog(params: {
  boutiqueId: string;
  userId: string;
  action: string;
  detail: string;
  icon: string;
  source?: "native";
}) {
  return dataRequest<Array<{ id: number; boutique_id: string; user_id: string; action: string; detail: string; icon: string; source?: string; created_at: string }>>(
    "audit_log",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        boutique_id: params.boutiqueId,
        user_id: params.userId,
        action: params.action,
        detail: params.detail,
        icon: params.icon,
        source: params.source ?? "native",
      }),
    },
  );
}

export async function createBoutique(nom: string, ville: string, ownerId: string) {
  return adminProvision<{ boutiqueId: string }>("create_boutique", { nom, ville, ownerId });
}

export async function createUser(phone: string, fullName: string, password: string, boutiqueId?: string) {
  const requestId = `${Date.now()}-${crypto.randomUUID()}`;
  const payload = { phone, fullName, password, boutiqueId, requestId };
  console.log("create_user request", requestId, { ...payload, password: "[REDACTED]" });
  return adminProvision<{ userId: string }>("create_user", payload);
}

export async function resetUserPassword(userId: string, password: string) {
  return adminProvision<{ ok: true }>("reset_password", { userId, password });
}

export async function updateAdminUser(params:{userId:string;fullName:string;phone:string}) {
  return adminProvision<{ok:true}>("update_user", params);
}

export async function setAdminUserSuspended(params:{userId:string;suspended:boolean;reason?:string}) {
  return adminProvision<{ok:true;isSuspended:boolean}>("set_user_suspended", params);
}

export async function deleteAdminUser(userId:string) {
  return adminProvision<{ok:true;transferredBoutiques:string[]}>("delete_user", {userId});
}

export async function getAdminUserDebug(userId:string) {
  return adminProvision<{
    user:{id:string;nom:string;phone:string;isSuspended:boolean;suspensionReason?:string|null};
    auth:{createdAt?:string|null;lastSignInAt?:string|null;bannedUntil?:string|null;email?:string|null};
    assignments:Array<{boutique_id:string;role:string;droits?:Record<string,boolean>;boutiques?:{nom?:string;ville?:string}|null}>;
  }>("get_user_debug", {userId});
}

export async function assignUserToBoutique(
  boutiqueId: string,
  userId: string,
  role: "owner" | "manager" | "employee",
  droits: Record<string, boolean>,
) {
  return adminProvision<{ ok: true }>("assign_user", { boutiqueId, userId, role, droits });
}

export async function unassignUserFromBoutique(boutiqueId: string, userId: string) {
  return adminProvision<{ ok: true }>("unassign_user", { boutiqueId, userId });
}

/** Owner-scoped assignment upsert through the privileged Edge Function.
 *  A direct PATCH can return 204 even when no row exists, so it is not an upsert.
 */
export async function upsertAssignmentDirect(boutiqueId: string, userId: string, role: string, droits: Record<string, boolean>) {
  return adminProvision<{ ok: true }>("assign_user", { boutiqueId, userId, role, droits });
}

/** Owner-scoped delete: removes an assignment without superadmin. */
export async function deleteAssignmentDirect(boutiqueId: string, userId: string) {
  return dataRequest<unknown>(
    `boutique_assignments?boutique_id=eq.${encodeURIComponent(boutiqueId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}


export async function getAuthBootstrap() {
  const authUser = getCurrentAuthUser();
  if (!authUser?.id) throw new Error("Connexion requise");
  const uid = encodeURIComponent(authUser.id);
  const [users, assignments, boutiques, groupes] = await Promise.all([
    dataRequest<Array<any>>(`platform_users?select=id,phone,nom,initials,color,is_super_admin,is_suspended,suspension_reason,suspended_at,group_id,is_compte_mere,must_change_password&id=eq.${uid}&limit=1`),
    dataRequest<Array<any>>(`boutique_assignments?select=boutique_id,user_id,role,droits&user_id=eq.${uid}`),
    dataRequest<Array<any>>("boutiques?select=id,nom,ville,color,initials,logo_url,adresse,email,tel&order=nom.asc"),
    dataRequest<Array<{ id:string; nom:string }>>("groupes?select=id,nom&order=nom.asc"),
  ]);
  const row = users[0];
  if (!row) return null;
  const toRole = (role: string) => role === "owner" ? "Propriétaire" : role === "manager" ? "Manager" : "Vendeur";
  return {
    user: {
      id: row.id,
      phone: row.phone,
      password: "",
      nom: row.nom,
      initials: row.initials,
      color: row.color,
      isSuperAdmin: row.is_super_admin === true,
      isSuspended: row.is_suspended === true,
      suspensionReason: row.suspension_reason ?? undefined,
      suspendedAt: row.suspended_at ?? undefined,
      groupeId: row.group_id ?? undefined,
      isCompteMere: row.is_compte_mere ?? undefined,
      mustChangePassword: row.must_change_password === true,
      assignments: assignments.map((a) => ({ boutiqueId:a.boutique_id, role:toRole(a.role), droits:a.droits ?? {} })),
    },
    boutiques: boutiques.map((b) => ({
      id:b.id,
      nom:b.nom,
      ville:b.ville ?? "",
      color:b.color ?? "#C9A227",
      initials:b.initials ?? (b.nom ?? "?").split(/\s+/).map((x:string)=>x[0]).join("").slice(0,2).toUpperCase(),
      logo:b.logo_url ?? undefined,
      adresse:b.adresse ?? undefined,
      email:b.email ?? undefined,
      tel:b.tel ?? undefined,
      products:[], entries:[], suppliers:[], clients:[], clientAdvances:[], invoices:[], auditLog:[], charges:[], categories:[], productParams:[], caisseHistory:[],
    })),
    groupes,
  };
}

/**
 * Loads the relational snapshot required by the active boutique screens.
 * It is intentionally scoped to one boutique: the authentication shell never
 * downloads another shop's business history.
 */
export async function loadBoutiqueSnapshot<T>(boutiqueId: string): Promise<T | null> {
    const bid = encodeURIComponent(boutiqueId);
    const boutiqueFilter = `&id=eq.${bid}`;
    const scoped = (column = "boutique_id") => `&${column}=eq.${bid}`;
    const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, advances, charges, sessions, users, auditLogs] = await Promise.all([
      dataRequest<any[]>(`boutiques?select=*${boutiqueFilter}&order=nom.asc`),
      dataRequest<any[]>(`categories?select=*${scoped()}`), dataRequest<any[]>(`products?select=*${scoped()}`),
      dataRequestAll<any>(`stock_entries?select=*${scoped()}`, "entry_date.desc,id.desc"), dataRequest<any[]>(`clients?select=*${scoped()}`),
      dataRequest<any[]>(`suppliers?select=*${scoped()}`),
      dataRequest<any[]>(`invoices?select=*,invoice_lines(*)${scoped()}`),
      dataRequest<any[]>(`invoice_payments?select=*${scoped()}&order=paid_at.asc`), dataRequest<any[]>(`client_advances?select=*${scoped()}&order=paid_at.desc,id.desc`), dataRequest<any[]>(`charges?select=*${scoped()}`),
      dataRequest<any[]>(`caisse_sessions?select=*${scoped()}`),
      dataRequest<any[]>("platform_users?select=id,nom,initials,color"),
      // The administration view presents recent activity. Loading the entire
      // audit trail at every login or Realtime event was the largest avoidable
      // payload in production.
      dataRequest<any[]>(`audit_log?select=*${scoped()}&order=created_at.desc&limit=200`),
    ]);
    const userById = new Map(users.map((u: any) => [u.id, u]));
    const categoryById = new Map(categories.map((category: any) => [category.id, category]));
    const clientById = new Map(clients.map((client: any) => [client.id, client]));
    const supplierById = new Map(suppliers.map((supplier: any) => [supplier.id, supplier]));
    const paymentsByInvoice = new Map<string, any[]>();
    for (const payment of payments) {
      const invoicePayments = paymentsByInvoice.get(payment.invoice_id) ?? [];
      invoicePayments.push(payment);
      paymentsByInvoice.set(payment.invoice_id, invoicePayments);
    }
    const day = (value?: string | null) => value ? new Date(value).toLocaleDateString("fr-FR") : "";
    return boutiques.map((b) => ({
      id: b.id, nom: b.nom, ville: b.ville ?? "", color: b.color ?? "#C9A227",
      initials: b.initials ?? (b.nom ?? "?").split(/\s+/).map((x: string) => x[0]).join("").slice(0, 2).toUpperCase(),
      logo: b.logo_url ?? undefined, adresse: b.adresse ?? undefined, email: b.email ?? undefined, tel: b.tel ?? undefined,
      categories: categories.filter(c => c.boutique_id === b.id).map(c => ({
        id: c.id,
        nom: c.nom,
        unitVente: c.unit_vente ?? "pièces",
        nbPiecesParLot: Number(c.pieces_per_lot ?? 0),
        longueurParPiece: Number(c.length_per_piece ?? 0),
      })),
      products: products.filter(p => p.boutique_id === b.id).map(p => ({ id:p.id, nom:p.nom, img:p.image_url ?? "", unit:p.unit, fournisseur:p.supplier_name ?? "", categorie:categoryById.get(p.category_id)?.nom, prixVente:Number(p.prix_vente ?? 0), prixAchat:Number(p.prix_achat ?? 0) })),
      productParams: products.filter(p => p.boutique_id === b.id && (p.pieces_per_lot != null || p.length_per_piece != null)).map(p => ({
        productId: p.id,
        nbPiecesParLot: Number(p.pieces_per_lot ?? 0),
        longueurParPiece: Number(p.length_per_piece ?? 0),
        unitVente: p.unit,
      })),
      entries: entries.filter(e => e.boutique_id === b.id).map(e => ({ id:e.id, productId:e.product_id, qty:Number(e.qty), unit:"unité", montantDu:Number(e.qty)*Number(e.prix_unit ?? 0), movementType:e.type ?? undefined, date:day(e.entry_date), recordedAt:e.entry_date, fournisseur:supplierById.get(e.supplier_id)?.nom ?? e.note ?? "", supplierId:e.supplier_id ?? undefined, invoiceId:undefined })),
      clients: clients.filter(c => c.boutique_id === b.id).map(c => {
        // A wholesale client is stored as B2B with a marker in `contact`.
        const isWholesale = typeof c.contact === "string" && c.contact.includes(WHOLESALE_MARKER);
        const effectiveType = isWholesale ? "Grossiste" : c.type;
        const cleanContact = isWholesale ? c.contact.replace(WHOLESALE_MARKER, "").trim() : c.contact;
        return { id:c.id, nom:c.nom, type:effectiveType, tel:c.tel ?? "", total:c.total ?? 0, last:day(c.last_invoice_at), ville:c.ville ?? "", adresse:c.adresse ?? undefined, email:c.email ?? undefined, contact:cleanContact || undefined };
      }),
      clientAdvances: advances.filter(a => a.boutique_id === b.id).map(a => ({
        id:Number(a.id), clientId:Number(a.client_id), amount:Number(a.amount),
        allocatedAmount:Number(a.allocated_amount ?? 0),
        paymentMethod:a.payment_method, paidAt:a.paid_at, recordedAt:a.recorded_at,
        operatorId:a.operator_id ?? undefined, operatorName:a.operator_name, note:a.note ?? undefined,
      })),
      suppliers: suppliers.filter(s => s.boutique_id === b.id).map(s => ({ id:s.id, nom:s.nom, ville:s.ville ?? "", lastDelivery:day(s.last_delivery_at), tel:s.tel ?? "", initials:s.initials ?? "", color:s.color ?? "#C9A227", email:s.email ?? undefined, contact:s.contact ?? undefined })),
      invoices: invoices.filter(i => i.boutique_id === b.id).map(i => {
        const invoicePayments = paymentsByInvoice.get(i.id) ?? [];
        const paid = invoicePayments.length
          ? invoicePayments.reduce((sum, p) => sum + Number(p.amount), 0)
          : Number(i.acompte);
        const operator = userById.get(i.operator_id) ?? {};
        const clientRecord = clientById.get(i.client_id);
        return {
          id:i.id,
          clientId:i.client_id ?? undefined,
          client:i.client_nom ?? "Client comptoir",
          clientTel:i.client_tel ?? undefined,
          clientType:i.client_type_snapshot ?? clientRecord?.type ?? undefined,
          clientEmailSnapshot:i.client_email_snapshot ?? undefined,
          clientAdresseSnapshot:i.client_adresse_snapshot ?? undefined,
          clientVilleSnapshot:i.client_ville_snapshot ?? undefined,
          clientTypeSnapshot:i.client_type_snapshot ?? undefined,
          boutiqueNomSnapshot:i.boutique_nom_snapshot ?? undefined,
          boutiqueVilleSnapshot:i.boutique_ville_snapshot ?? undefined,
          boutiqueAdresseSnapshot:i.boutique_adresse_snapshot ?? undefined,
          boutiqueTelSnapshot:i.boutique_tel_snapshot ?? undefined,
          boutiqueEmailSnapshot:i.boutique_email_snapshot ?? undefined,
          boutiqueLogoSnapshot:i.boutique_logo_snapshot ?? undefined,
          montant:Number(i.montant),
          acompte:paid,
          date:day(i.invoice_date),
          dateRaw:i.invoice_date,
          status:paid >= Number(i.montant) ? "payé" : paid > 0 ? "acompte" : i.status === "en_attente" ? "en attente" : i.status,
          type:i.type,
          returnOfInvoiceId:i.return_of_invoice_id ?? undefined,
          operatorId:i.operator_id ?? undefined,
          operatorNom:i.operator_nom_snapshot ?? operator.nom ?? undefined,
          operatorColor:operator.color ?? undefined,
          paymentMethod:i.payment_method ?? undefined,
          payments:invoicePayments.map(p => ({
            id:p.id,
            amount:Number(p.amount),
            paymentMethod:p.payment_method,
            paidAt:p.paid_at,
            recordedAt:p.recorded_at,
            operatorId:p.operator_id ?? undefined,
            operatorName:p.operator_name,
            batchId:p.batch_id,
            source:p.source,
          })),
          lines:(i.invoice_lines ?? []).map((l: any)=>({ productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), prixAchat:l.prix_achat!=null?Number(l.prix_achat):undefined, sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })),
        };
      }),
      charges: charges.filter(c => c.boutique_id === b.id).map(c => ({
        id:c.id, label:c.label, montant:Number(c.montant), date:day(c.charge_date), dateRaw:c.charge_date,
        categorie:c.categorie ?? "Autre", recurrence:c.recurrence ?? "unique", note:c.note ?? undefined,
        fournisseur:supplierById.get(c.supplier_id)?.nom ?? c.fournisseur ?? undefined, supplierId:c.supplier_id ?? undefined, paymentMethod:c.payment_method ?? undefined,
        status:c.status ?? "paid", paidAmount:Number(c.paid_amount ?? c.montant),
        transferId:c.transfer_id ?? undefined, source:c.source ?? "manual",
      })),
      caisseHistory: sessions
        .filter(s => s.boutique_id === b.id)
        .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
        .map(s => ({
          id: s.id,
          // Keep an ISO-compatible timestamp: the UI needs a Date, not a preformatted label.
          openedAt: s.opened_at,
          closedAt: s.closed_at ?? undefined,
          fondDeCaisse: Number(s.fond_ouverture ?? 0),
          openedBy: s.opened_by ?? "",
          closedBy: s.closed_by ?? "",
        })),
      caisseSession: sessions
        .filter(s => s.boutique_id === b.id && !s.closed_at)
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        .slice(0, 1)
        .map(s => ({ id:s.id, openedAt:s.opened_at, fondDeCaisse:Number(s.fond_ouverture ?? 0), openedBy:s.opened_by ?? "" }))[0],
      auditLog: auditLogs
        .filter((l: any) => l.boutique_id === b.id)
        .map((l: any) => {
          const ts = new Date(l.created_at).getTime();
          const user = userById.get(l.user_id) ?? {};
          return {
            id: l.id,
            userId: l.user_id,
            userNom: user.nom ?? "Utilisateur",
            userColor: user.color ?? "#6b7280",
            action: l.action,
            detail: l.detail,
            icon: l.icon,
            timestamp: ts,
            date: new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            source: l.source ?? undefined,
          };
        }),
    })) as T;
}

export type BoutiqueSyncEntity =
  | "product" | "category" | "stock_entry" | "invoice" | "invoice_line"
  | "invoice_payment" | "client" | "supplier" | "charge" | "caisse_session"
  | "audit_log" | "assignment" | "stock_transfer" | "client_advance";

export type BoutiqueSyncEvent = {
  event_id: string;
  revision: number;
  domain: "catalogue" | "stock" | "sales" | "clients" | "suppliers" | "charges" | "caisse" | "audit" | "access" | "transfers";
  entity_type: BoutiqueSyncEntity;
  entity_id: string;
  record_id?: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
};

export type BoutiqueSyncPatch = {
  categories?: any[];
  products?: any[];
  productParams?: any[];
  entries?: any[];
  clients?: any[];
  clientAdvances?: any[];
  suppliers?: any[];
  invoices?: any[];
  charges?: any[];
  caisseSessions?: any[];
  auditLog?: any[];
  deleted: Partial<Record<BoutiqueSyncEntity, string[]>>;
};

/**
 * The protocol is chosen by the server for the active boutique, never by a
 * global build flag. A failed probe deliberately falls back to the legacy
 * listener in App.tsx, so an unavailable rollout setting cannot stop sync.
 */
export async function isBoutiqueSyncV2Enabled(boutiqueId: string) {
  return dataRequest<boolean>("rpc/is_boutique_sync_v2_enabled", {
    method:"POST",
    body:JSON.stringify({ p_boutique_id:boutiqueId }),
  });
}

const syncDomains = new Set<BoutiqueSyncEvent["domain"]>([
  "catalogue", "stock", "sales", "clients", "suppliers", "charges", "caisse", "audit", "access", "transfers",
]);
const syncEntities = new Set<BoutiqueSyncEntity>([
  "product", "category", "stock_entry", "invoice", "invoice_line", "invoice_payment", "client", "supplier", "charge", "caisse_session", "audit_log", "assignment", "stock_transfer", "client_advance",
]);

function parseBoutiqueSyncEvent(value: unknown): BoutiqueSyncEvent | null {
  const event = value as Partial<BoutiqueSyncEvent> | null;
  if (!event || typeof event.event_id !== "string" || typeof event.revision !== "number"
    || !syncDomains.has(event.domain as BoutiqueSyncEvent["domain"])
    || !syncEntities.has(event.entity_type as BoutiqueSyncEntity)
    || typeof event.entity_id !== "string"
    || !["INSERT", "UPDATE", "DELETE"].includes(String(event.operation))) return null;
  return event as BoutiqueSyncEvent;
}

/**
 * V2 receives one small, private database event per changed record and batches
 * it in the browser. It deliberately does not carry business rows over the
 * socket: the subsequent narrow REST reads are still protected by table RLS.
 */
export function subscribeToBoutiqueSync(
  boutiqueId: string,
  onEvents: (events: BoutiqueSyncEvent[], reason: "events" | "reconnect") => void,
) {
  const session = readSession();
  if (!session?.access_token || !boutiqueId) return () => undefined;

  try {
    realtimeClient.realtime.setAuth(session.access_token);
    const refreshRealtimeAuth = () => {
      const refreshed = readSession();
      if (refreshed?.access_token) realtimeClient.realtime.setAuth(refreshed.access_token);
    };
    window.addEventListener("tournal:session-refreshed", refreshRealtimeAuth);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let hasSubscribed = false;
    let pending: BoutiqueSyncEvent[] = [];
    const flush = (reason: "events" | "reconnect") => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const events = pending;
        pending = [];
        onEvents(events, reason);
      }, 80);
    };
    const channel = realtimeClient
      .channel(`tournal:v2:${boutiqueId}`, { config: { private: true } })
      .on("broadcast", { event: "sync" }, (message: { payload?: unknown }) => {
        const event = parseBoutiqueSyncEvent(message?.payload);
        if (!event) return;
        pending.push(event);
        flush("events");
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed) flush("reconnect");
          hasSubscribed = true;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`Realtime Sync v2 ${status.toLowerCase()} pour la boutique ${boutiqueId}`);
        }
      });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("tournal:session-refreshed", refreshRealtimeAuth);
      void realtimeClient.removeChannel(channel);
    };
  } catch (error) {
    console.warn("Realtime Sync v2 indisponible pour cette boutique", error);
    return () => undefined;
  }
}

function syncInFilter(column: string, values: Array<string | number>) {
  const unique = [...new Set(values.map(value => String(value)).filter(Boolean))];
  return unique.length ? `&${column}=in.(${unique.map(encodeURIComponent).join(",")})` : "";
}

const syncDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("fr-FR") : "";

/** Reads the smallest canonical slices needed by the batched v2 event. */
export async function loadBoutiqueSyncPatch(boutiqueId: string, sourceEvents: BoutiqueSyncEvent[]): Promise<BoutiqueSyncPatch> {
  const events = sourceEvents.filter(event => event && event.entity_id);
  const deleted: BoutiqueSyncPatch["deleted"] = {};
  const ids = (entity: BoutiqueSyncEntity, includeDeleted = false) => {
    const relevant = events.filter(event => event.entity_type === entity);
    const removed = relevant.filter(event => event.operation === "DELETE");
    if (removed.length) deleted[entity] = removed.map(event => entity === "stock_entry" || entity === "client_advance" ? String(event.record_id ?? event.entity_id) : event.entity_id);
    return [...new Set(relevant.filter(event => includeDeleted || event.operation !== "DELETE").map(event => event.entity_id))];
  };
  const records = (entity: BoutiqueSyncEntity) => [...new Set(events.filter(event => event.entity_type === entity && event.operation !== "DELETE" && event.record_id).map(event => String(event.record_id)))];
  const bid = encodeURIComponent(boutiqueId);
  const scoped = `&boutique_id=eq.${bid}`;
  const productIds = [...new Set([...ids("product"), ...ids("stock_entry")])];
  const categoryIds = ids("category");
  const invoiceIds = [...new Set([...ids("invoice"), ...ids("invoice_line"), ...ids("invoice_payment")])];
  const clientIds = ids("client");
  const advanceIds = records("client_advance");
  const supplierIds = ids("supplier");
  const chargeIds = ids("charge");
  const caisseIds = ids("caisse_session");
  const auditIds = ids("audit_log");
  const entryIds = records("stock_entry");

  const [directProducts, categoryProducts, categories, entries, invoices, payments, clients, advances, suppliers, charges, sessions, logs] = await Promise.all([
    productIds.length ? dataRequest<any[]>(`products?select=*${scoped}${syncInFilter("id", productIds)}`) : Promise.resolve([]),
    categoryIds.length ? dataRequest<any[]>(`products?select=*${scoped}${syncInFilter("category_id", categoryIds)}`) : Promise.resolve([]),
    categoryIds.length ? dataRequest<any[]>(`categories?select=*${scoped}${syncInFilter("id", categoryIds)}`) : Promise.resolve([]),
    entryIds.length ? dataRequest<any[]>(`stock_entries?select=*${scoped}${syncInFilter("id", entryIds)}`) : Promise.resolve([]),
    invoiceIds.length ? dataRequest<any[]>(`invoices?select=*,invoice_lines(*)${scoped}${syncInFilter("id", invoiceIds)}`) : Promise.resolve([]),
    invoiceIds.length ? dataRequest<any[]>(`invoice_payments?select=*${scoped}${syncInFilter("invoice_id", invoiceIds)}&order=paid_at.asc`) : Promise.resolve([]),
    clientIds.length ? dataRequest<any[]>(`clients?select=*${scoped}${syncInFilter("id", clientIds)}`) : Promise.resolve([]),
    advanceIds.length ? dataRequest<any[]>(`client_advances?select=*${scoped}${syncInFilter("id", advanceIds)}&order=paid_at.desc,id.desc`) : Promise.resolve([]),
    supplierIds.length ? dataRequest<any[]>(`suppliers?select=*${scoped}${syncInFilter("id", supplierIds)}`) : Promise.resolve([]),
    chargeIds.length ? dataRequest<any[]>(`charges?select=*${scoped}${syncInFilter("id", chargeIds)}`) : Promise.resolve([]),
    caisseIds.length ? dataRequest<any[]>(`caisse_sessions?select=*${scoped}${syncInFilter("id", caisseIds)}`) : Promise.resolve([]),
    auditIds.length ? dataRequest<any[]>(`audit_log?select=*${scoped}${syncInFilter("id", auditIds)}&order=created_at.desc`) : Promise.resolve([]),
  ]);
  // A category rename changes the denormalized category label displayed on
  // every product in that category, so refresh that small product slice too.
  const products = [...new Map([...directProducts, ...categoryProducts].map(row => [row.id, row])).values()];
  const extraCategoryIds = products.map(row => row.category_id).filter(Boolean);
  const invoiceClientIds = invoices.map(row => row.client_id).filter(Boolean);
  const userIds = [...new Set([...invoices.map(row => row.operator_id), ...logs.map(row => row.user_id)].filter(Boolean))];
  const [extraCategories, invoiceClients, users] = await Promise.all([
    extraCategoryIds.length ? dataRequest<any[]>(`categories?select=id,nom${scoped}${syncInFilter("id", extraCategoryIds)}`) : Promise.resolve([]),
    invoiceClientIds.length ? dataRequest<any[]>(`clients?select=id,type,contact${scoped}${syncInFilter("id", invoiceClientIds)}`) : Promise.resolve([]),
    userIds.length ? dataRequest<any[]>(`platform_users?select=id,nom,color${syncInFilter("id", userIds)}`) : Promise.resolve([]),
  ]);
  const categoryById = new Map([...categories, ...extraCategories].map(row => [row.id, row]));
  const clientById = new Map([...clients, ...invoiceClients].map(row => [row.id, row]));
  const userById = new Map(users.map(row => [row.id, row]));
  const paymentsByInvoice = new Map<string, any[]>();
  payments.forEach(row => paymentsByInvoice.set(row.invoice_id, [...(paymentsByInvoice.get(row.invoice_id) ?? []), row]));

  const patch: BoutiqueSyncPatch = { deleted };
  if (categories.length) patch.categories = categories.map(row => ({ id:row.id, nom:row.nom, unitVente:row.unit_vente ?? "pièces", nbPiecesParLot:Number(row.pieces_per_lot ?? 0), longueurParPiece:Number(row.length_per_piece ?? 0) }));
  if (products.length) {
    patch.products = products.map(row => ({ id:row.id, nom:row.nom, img:row.image_url ?? "", unit:row.unit, fournisseur:row.supplier_name ?? "", categorie:categoryById.get(row.category_id)?.nom, prixVente:Number(row.prix_vente ?? 0), prixAchat:Number(row.prix_achat ?? 0) }));
    patch.productParams = products.filter(row => row.pieces_per_lot != null || row.length_per_piece != null).map(row => ({ productId:row.id, nbPiecesParLot:Number(row.pieces_per_lot ?? 0), longueurParPiece:Number(row.length_per_piece ?? 0), unitVente:row.unit }));
  }
  if (entries.length) patch.entries = entries.map(row => ({ id:row.id, productId:row.product_id, qty:Number(row.qty), unit:"unité", montantDu:Number(row.qty) * Number(row.prix_unit ?? 0), movementType:row.type ?? undefined, date:syncDate(row.entry_date), recordedAt:row.entry_date, fournisseur:row.note ?? "", supplierId:row.supplier_id ?? undefined, invoiceId:undefined }));
  if (clients.length) patch.clients = clients.map(row => {
    const wholesale = typeof row.contact === "string" && row.contact.includes(WHOLESALE_MARKER);
    return { id:row.id, nom:row.nom, type:wholesale ? "Grossiste" : row.type, tel:row.tel ?? "", total:Number(row.total ?? 0), last:syncDate(row.last_invoice_at), ville:row.ville ?? "", adresse:row.adresse ?? undefined, email:row.email ?? undefined, contact:wholesale ? row.contact.replace(WHOLESALE_MARKER, "").trim() || undefined : row.contact ?? undefined };
  });
  if (advances.length) patch.clientAdvances = advances.map(row => ({
    id:Number(row.id), clientId:Number(row.client_id), amount:Number(row.amount),
    allocatedAmount:Number(row.allocated_amount ?? 0),
    paymentMethod:row.payment_method, paidAt:row.paid_at, recordedAt:row.recorded_at,
    operatorId:row.operator_id ?? undefined, operatorName:row.operator_name, note:row.note ?? undefined,
  }));
  if (suppliers.length) patch.suppliers = suppliers.map(row => ({ id:row.id, nom:row.nom, ville:row.ville ?? "", lastDelivery:syncDate(row.last_delivery_at), tel:row.tel ?? "", initials:row.initials ?? "", color:row.color ?? "#C9A227", email:row.email ?? undefined, contact:row.contact ?? undefined }));
  if (invoices.length) patch.invoices = invoices.map(row => {
    const invoicePayments = paymentsByInvoice.get(row.id) ?? [];
    const paid = invoicePayments.length ? invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0) : Number(row.acompte);
    const operator = userById.get(row.operator_id) ?? {};
    const client = clientById.get(row.client_id);
    return { id:row.id, clientId:row.client_id ?? undefined, client:row.client_nom ?? "Client comptoir", clientTel:row.client_tel ?? undefined, clientType:row.client_type_snapshot ?? client?.type ?? undefined, clientEmailSnapshot:row.client_email_snapshot ?? undefined, clientAdresseSnapshot:row.client_adresse_snapshot ?? undefined, clientVilleSnapshot:row.client_ville_snapshot ?? undefined, clientTypeSnapshot:row.client_type_snapshot ?? undefined, boutiqueNomSnapshot:row.boutique_nom_snapshot ?? undefined, boutiqueVilleSnapshot:row.boutique_ville_snapshot ?? undefined, boutiqueAdresseSnapshot:row.boutique_adresse_snapshot ?? undefined, boutiqueTelSnapshot:row.boutique_tel_snapshot ?? undefined, boutiqueEmailSnapshot:row.boutique_email_snapshot ?? undefined, boutiqueLogoSnapshot:row.boutique_logo_snapshot ?? undefined, montant:Number(row.montant), acompte:paid, date:syncDate(row.invoice_date), dateRaw:row.invoice_date, status:paid >= Number(row.montant) ? "payé" : paid > 0 ? "acompte" : row.status === "en_attente" ? "en attente" : row.status, type:row.type, returnOfInvoiceId:row.return_of_invoice_id ?? undefined, operatorId:row.operator_id ?? undefined, operatorNom:row.operator_nom_snapshot ?? operator.nom ?? undefined, operatorColor:operator.color ?? undefined, paymentMethod:row.payment_method ?? undefined, payments:invoicePayments.map(payment => ({ id:payment.id, amount:Number(payment.amount), paymentMethod:payment.payment_method, paidAt:payment.paid_at, recordedAt:payment.recorded_at, operatorId:payment.operator_id ?? undefined, operatorName:payment.operator_name, batchId:payment.batch_id, source:payment.source })), lines:(row.invoice_lines ?? []).map((line:any) => ({ productId:line.product_id, nom:line.nom, qty:Number(line.qty), unit:line.unit ?? "unité", prixUnit:Number(line.prix_unit), prixAchat:line.prix_achat != null ? Number(line.prix_achat) : undefined, sellUnit:line.sell_unit ?? undefined, sellQty:line.sell_qty ? Number(line.sell_qty) : undefined })) };
  });
  if (charges.length) patch.charges = charges.map(row => ({ id:row.id, label:row.label, montant:Number(row.montant), date:syncDate(row.charge_date), dateRaw:row.charge_date, categorie:row.categorie ?? "Autre", recurrence:row.recurrence ?? "unique", note:row.note ?? undefined, fournisseur:row.fournisseur ?? undefined, supplierId:row.supplier_id ?? undefined, paymentMethod:row.payment_method ?? undefined, status:row.status ?? "paid", paidAmount:Number(row.paid_amount ?? row.montant), transferId:row.transfer_id ?? undefined, source:row.source ?? "manual" }));
  if (sessions.length) patch.caisseSessions = sessions.map(row => ({ id:row.id, openedAt:row.opened_at, closedAt:row.closed_at ?? undefined, fondDeCaisse:Number(row.fond_ouverture ?? 0), openedBy:row.opened_by ?? "", closedBy:row.closed_by ?? "" }));
  if (logs.length) patch.auditLog = logs.map(row => {
    const timestamp = new Date(row.created_at).getTime(); const user = userById.get(row.user_id) ?? {};
    return { id:row.id, userId:row.user_id, userNom:user.nom ?? "Utilisateur", userColor:user.color ?? "#6b7280", action:row.action, detail:row.detail, icon:row.icon, timestamp, date:new Date(timestamp).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }), source:row.source ?? undefined };
  });
  return patch;
}

/** Loads account metadata for administration screens from named relational tables. */
export async function loadPlatformUsers<T>(): Promise<T> {
    const [users, assignments] = await Promise.all([
      dataRequest<Array<any>>("platform_users?select=id,phone,nom,initials,color,is_super_admin,is_suspended,suspension_reason,suspended_at,group_id,is_compte_mere,must_change_password"),
      dataRequest<Array<any>>("boutique_assignments?select=boutique_id,user_id,role,droits"),
    ]);
    const toRole = (role: string) => role === "owner" ? "Propriétaire" : role === "manager" ? "Manager" : "Vendeur";
  return users.map((user) => ({
      id: user.id,
      phone: user.phone,
      nom: user.nom,
      initials: user.initials,
      color: user.color,
      isSuperAdmin: user.is_super_admin,
      isSuspended: user.is_suspended === true,
      suspensionReason: user.suspension_reason ?? undefined,
      suspendedAt: user.suspended_at ?? undefined,
      groupeId: user.group_id ?? undefined,
      isCompteMere: user.is_compte_mere ?? undefined,
      mustChangePassword: user.must_change_password === true,
      assignments: assignments.filter((a) => a.user_id === user.id).map((a) => ({
        boutiqueId: a.boutique_id,
        role: toRole(a.role),
        droits: a.droits ?? {},
      })),
  })) as T;
}

export async function loadGroupes<T>(): Promise<T> {
  const rows = await dataRequest<Array<{ id: string; nom: string }>>("groupes?select=id,nom&order=nom.asc");
  return rows as T;
}

export async function saveGroupes(groups: Array<{ id: string; nom: string }>): Promise<void> {
  if (!groups.length) return;
  await dataRequest("groupes?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(groups),
  });
}

export async function loadAuthSettings(boutiqueId: string): Promise<{ lockMinutes: number; sessionMinutes: number } | null> {
  const rows = await dataRequest<Array<{ lock_minutes: number; session_minutes: number }>>(
    `auth_settings?select=lock_minutes,session_minutes&boutique_id=eq.${encodeURIComponent(boutiqueId)}&limit=1`,
  );
  const row = rows[0];
  return row ? { lockMinutes: row.lock_minutes, sessionMinutes: row.session_minutes } : null;
}

export async function saveAuthSettings(boutiqueId: string, settings: { lockMinutes?: number; sessionMinutes?: number }): Promise<void> {
  await dataRequest("auth_settings?on_conflict=boutique_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      boutique_id: boutiqueId,
      lock_minutes: settings.lockMinutes ?? 10,
      session_minutes: settings.sessionMinutes ?? 720,
    }),
  });
}

export async function createSale(params: { boutiqueId: string; clientId?: number; client: string; clientTel?: string; paymentMethod?: string; lines: Array<{ productId:number; nom:string; qty:number; unit:string; prixUnit:number; sellUnit?:string; sellQty?:number }> }) {
  return dataRequest<{ invoice_id:string; client_id:number|null; total:number }>("rpc/create_sale", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_boutique_id:params.boutiqueId, p_idempotency_key:crypto.randomUUID(), p_client_nom:params.client, p_client_tel:params.clientTel ?? null, p_lines:params.lines, p_payment_method:params.paymentMethod ?? null, p_client_id:params.clientId ?? null }),
  });
}

export async function openCaisseSession(params: { boutiqueId: string; fondOuverture: number }) {
  return dataRequest<{ session_id:string; opened_at:string; fond_ouverture:number; already_open:boolean }>("rpc/open_caisse_session", {
    method: "POST", headers: { Prefer:"return=representation" },
    body: JSON.stringify({ p_boutique_id:params.boutiqueId, p_idempotency_key:crypto.randomUUID(), p_fond_ouverture:params.fondOuverture }),
  });
}

export async function closeCaisseSession(params: { boutiqueId:string; sessionId:string; fondFermeture?:number; totalVentes:number; totalCharges?:number }) {
  return dataRequest<{ session_id:string; closed_at:string }>("rpc/close_caisse_session", {
    method: "POST", headers: { Prefer:"return=representation" },
    body: JSON.stringify({ p_boutique_id:params.boutiqueId, p_session_id:params.sessionId, p_idempotency_key:crypto.randomUUID(), p_fond_fermeture:params.fondFermeture ?? null, p_total_ventes:params.totalVentes, p_total_charges:params.totalCharges ?? 0 }),
  });
}

export async function recordPayment(params: { boutiqueId:string; invoiceId:string; amount:number; paymentMethod:string }) {
  return dataRequest<{ invoice_id:string; acompte:number; applied_amount:number; status:string; stock_deducted:boolean; payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" } }>("rpc/record_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_invoice_id:params.invoiceId, p_idempotency_key:crypto.randomUUID(), p_amount:params.amount, p_payment_method:params.paymentMethod }),
  });
}

export async function recordMultiPayment(params: { boutiqueId:string; invoiceId:string; payments:Array<{amount:number;paymentMethod:string}> }) {
  return dataRequest<{ invoice_id:string; acompte:number; applied_amount:number; status:string; stock_deducted:boolean; batch_id:string; payments:Array<{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice"|"client_advance" }>; advance_allocations:Array<{advance_id:number;amount:number}> }>("rpc/record_multi_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_payments:params.payments,
    }),
  });
}

/** Apply already-received client credit to one registered client's invoice. */
export async function applyClientAdvanceToInvoice(params: { boutiqueId:string; invoiceId:string; amount?:number }) {
  return dataRequest<{
    invoice_id:string;
    client_id:number;
    acompte:number;
    applied_amount:number;
    status:string;
    stock_deducted:boolean;
    payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"client_advance" };
    allocations:Array<{advance_id:number;amount:number}>;
    remaining_advance:number;
  }>("rpc/apply_client_advance_to_invoice", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_amount:params.amount ?? null,
    }),
  });
}

export async function recordClientPayment(params: { boutiqueId:string; clientId:number; amount:number; paymentMethod:string; paymentDate:string }) {
  return dataRequest<{
    client_id:number; requested_amount:number; applied_amount:number; advance_amount:number; remaining_due:number;
    paid_at:string; operator_id:string; operator_name:string; allocations:Array<{invoice_id:string;amount:number}>;
    advance?: { advance_id:number; client_id:number; amount:number; payment_method:string; paid_at:string; recorded_at:string; operator_id:string; operator_name:string; note?:string|null } | null;
  }>("rpc/record_client_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_client_id:params.clientId,
      p_idempotency_key:crypto.randomUUID(),
      p_amount:params.amount,
      p_payment_method:params.paymentMethod,
      p_payment_date:params.paymentDate,
    }),
  });
}

export async function recordClientAdvance(params: { boutiqueId:string; clientId:number; amount:number; paymentMethod:string; paymentDate:string; note?:string }) {
  return dataRequest<{ advance_id:number; client_id:number; amount:number; payment_method:string; paid_at:string; recorded_at:string; operator_id:string; operator_name:string; note?:string|null }>("rpc/record_client_advance", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_client_id:params.clientId,
      p_idempotency_key:crypto.randomUUID(),
      p_amount:params.amount,
      p_payment_method:params.paymentMethod,
      p_payment_date:params.paymentDate,
      p_note:params.note ?? null,
    }),
  });
}

/** Cancel a pending (unpaid) sale atomically. The database enforces the caller's scope. */
export async function cancelPendingInvoice(params: { boutiqueId:string; invoiceId:string }) {
  return dataRequest<{ invoice_id:string; deleted:boolean }>("rpc/cancel_pending_sale", {
    method:"POST",
    headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
    }),
  });
}

export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{productId:number;qty:number}>; refundMethod:string }) {
  return dataRequest<{
    return_invoice_id:string; source_invoice_id:string; total:number; returned_at:string; refund_method:string;
    payment:{ id:number; amount:number; payment_method:string; paid_at:string; operator_id:string; operator_name:string; batch_id:string; source:"invoice" };
  }>("rpc/return_sale", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({
      p_boutique_id:params.boutiqueId,
      p_invoice_id:params.invoiceId,
      p_idempotency_key:crypto.randomUUID(),
      p_lines:params.lines,
      p_refund_method:params.refundMethod,
    }),
  });
}

export async function recordStockMovement(params:{ boutiqueId:string; productId:number; qty:number; type:"achat"|"ajustement"|"retour"|"inventaire"; prixUnit?:number; note?:string; supplierId?:number }) {
  return dataRequest<{ entry_id:number; product_id:number; stock:number; supplier_id?:number }>("rpc/record_stock_movement", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_product_id:params.productId, p_idempotency_key:crypto.randomUUID(), p_qty:params.qty, p_type:params.type, p_prix_unit:params.prixUnit ?? 0, p_note:params.note ?? null, p_supplier_id:params.supplierId ?? null }),
  });
}

export async function createCharge(params:{ boutiqueId:string; label:string; amount:number; category:string; note?:string; supplier?:string }) {
  return dataRequest<{ charge_id:number }>("rpc/create_charge", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_label:params.label,p_montant:params.amount,p_categorie:params.category,p_note:params.note ?? null,p_fournisseur:params.supplier ?? null }) });
}

// Marker stored in the free-text `contact` column to distinguish wholesale
// clients: the DB `type` column only accepts B2B/B2C, so a "Grossiste" is
// persisted as B2B + this marker, and reconstructed as "Grossiste" on load.
export const WHOLESALE_MARKER = "[GROSSISTE]";

export async function createClient(params:{ boutiqueId:string; name:string; type?:"B2B"|"B2C"; phone?:string; email?:string; city?:string }) {
  return dataRequest<{client_id:number}>("rpc/create_client", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_type:params.type ?? "B2C",p_tel:params.phone ?? null,p_email:params.email ?? null,p_ville:params.city ?? null }) });
}

// Persist the free-text contact field on a client row (used to tag wholesale
// clients). Kept as a plain table PATCH so it does not depend on RPC signatures.
export async function updateClientContact(clientId:number, contact:string|null) {
  await dataRequest(`clients?id=eq.${clientId}`, {
    method:"PATCH", headers:{ Prefer:"return=minimal" },
    body:JSON.stringify({ contact }),
  });
}
export async function createSupplier(params:{ boutiqueId:string; name:string; phone?:string; city?:string }) {
  return dataRequest<{supplier_id:number}>("rpc/create_supplier", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_tel:params.phone ?? null,p_ville:params.city ?? null }) });
}
export async function updateSupplier(params:{ boutiqueId:string; supplierId:number; name:string; phone?:string; city?:string; email?:string; contact?:string }) {
  return dataRequest<{supplier_id:number}>("rpc/update_supplier", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_supplier_id:params.supplierId,p_nom:params.name,p_tel:params.phone ?? null,p_ville:params.city ?? null,p_email:params.email ?? null,p_contact:params.contact ?? null }) });
}
export async function recordSupplierPayment(params:{ boutiqueId:string; supplierId:number; amount:number; paymentMethod:string; note?:string }) {
  return dataRequest<{charge_id:number; supplier_id:number; applied_amount:number; remaining_due:number; paid_at:string; payment_method:string}>("rpc/record_supplier_payment", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_supplier_id:params.supplierId,p_idempotency_key:crypto.randomUUID(),p_montant:params.amount,p_payment_method:params.paymentMethod,p_note:params.note ?? null }) });
}
export async function createProduct(params:{ boutiqueId:string; name:string; unit:string; categoryId?:string; purchasePrice?:number; salePrice?:number }) {
  return dataRequest<{product_id:number}>("rpc/create_product", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_unit:params.unit,p_category_id:params.categoryId ?? null,p_prix_achat:params.purchasePrice ?? 0,p_prix_vente:params.salePrice ?? 0 }) });
}

export async function updateProduct(params:{ boutiqueId:string; productId:number; name:string; categoryId?:string|null; purchasePrice:number }) {
  const body: Record<string, unknown> = { nom:params.name, prix_achat:params.purchasePrice };
  if (params.categoryId !== undefined) body.category_id = params.categoryId;
  const updated = await dataRequest<Array<{ id:number }>>(`products?id=eq.${params.productId}&boutique_id=eq.${encodeURIComponent(params.boutiqueId)}&select=id`, {
    method:"PATCH", headers:{ Prefer:"return=representation" }, body:JSON.stringify(body),
  });
  if (updated.length !== 1) throw new Error("Modification refusée ou produit introuvable");
}

export async function updateBoutiqueProfile(params: { boutiqueId:string; nom:string; ville:string; adresse?:string; email?:string; tel?:string }) {
  await dataRequest(`boutiques?id=eq.${encodeURIComponent(params.boutiqueId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ nom: params.nom, ville: params.ville, adresse: params.adresse ?? null, email: params.email ?? null, tel: params.tel ?? null }),
  });
}

export type BoutiqueDirectoryEntry = {
  boutique_id:string; nom:string; ville:string; tel:string; is_partner?:boolean; transfer_count:number;
};
export async function searchBoutiqueDirectory(boutiqueId:string, query="") {
  return dataRequest<BoutiqueDirectoryEntry[]>("rpc/search_boutique_directory", {
    method:"POST", body:JSON.stringify({ p_source_boutique_id:boutiqueId, p_query:query || null }),
  });
}
export async function getBoutiquePartners(boutiqueId:string) {
  return dataRequest<BoutiqueDirectoryEntry[]>("rpc/get_boutique_partners", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }),
  });
}
export async function addBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string) {
  return dataRequest<{boutique_id:string;nom:string;ville:string|null;tel:string|null}>("rpc/add_boutique_partner", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId }),
  });
}
export async function removeBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string) {
  return dataRequest<{removed:boolean;boutique_id:string}>("rpc/remove_boutique_partner", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId }),
  });
}

export type RelationalTransfer = {
  id:string; from_boutique_id:string; to_boutique_id:string; status:"pending"|"accepted"|"rejected"|"cancelled";
  relationship_type:"same_owner"|"commercial"|null; total_amount:number; invoice_id:string|null; charge_id:number|null;
  note:string|null; created_at:string;
  stock_transfer_lines:Array<{ product_name:string; unit:string; qty:number; prix_unit:number; discount_percent:number }>;
};
export async function getStockTransfers(boutiqueId: string) {
  return dataRequest<RelationalTransfer[]>(`stock_transfers?select=id,from_boutique_id,to_boutique_id,status,relationship_type,total_amount,invoice_id,charge_id,note,created_at,stock_transfer_lines(product_name,unit,qty,prix_unit,discount_percent)&or=(from_boutique_id.eq.${encodeURIComponent(boutiqueId)},to_boutique_id.eq.${encodeURIComponent(boutiqueId)})&order=created_at.desc`);
}
export async function createStockTransfer(params: { fromBoutiqueId:string; toBoutiqueId:string; lines:Array<{productId:number;qty:number;unitPrice:number;discountPercent:number}>; note?:string }) {
  return dataRequest<{transfer_id:string;status:string;relationship_type:"same_owner"|"commercial";total_amount:number}>("rpc/create_stock_transfer", { method:"POST", body:JSON.stringify({ p_from_boutique_id:params.fromBoutiqueId,p_to_boutique_id:params.toBoutiqueId,p_idempotency_key:crypto.randomUUID(),p_lines:params.lines.map(line=>({product_id:line.productId,qty:line.qty,unit_price:line.unitPrice,discount_percent:line.discountPercent})),p_note:params.note ?? null }) });
}
export async function acceptStockTransfer(transferId: string) {
  return dataRequest<{transfer_id:string;status:string;relationship_type:"same_owner"|"commercial";total_amount:number;invoice_id:string|null;charge_id:number|null}>("rpc/accept_stock_transfer", { method:"POST", body:JSON.stringify({ p_transfer_id:transferId,p_idempotency_key:crypto.randomUUID() }) });
}
export async function rejectStockTransfer(transferId: string) {
  return dataRequest<{transfer_id:string;status:string}>("rpc/reject_stock_transfer", { method:"POST", body:JSON.stringify({ p_transfer_id:transferId,p_idempotency_key:crypto.randomUUID() }) });
}
export async function recordTransferChargePayment(params:{boutiqueId:string;chargeId:number;amount:number;paymentMethod:string}) {
  return dataRequest<{charge_id:number;applied_amount:number;paid_amount:number;status:"partial"|"paid";invoice_id:string;payment_id:number}>("rpc/record_transfer_charge_payment", {
    method:"POST", body:JSON.stringify({p_boutique_id:params.boutiqueId,p_charge_id:params.chargeId,p_idempotency_key:crypto.randomUUID(),p_amount:params.amount,p_payment_method:params.paymentMethod}),
  });
}

export async function checkBackend(): Promise<boolean> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE_KEY } });
    return true;
  } catch {
    return false;
  }
}

export async function signQZ(toSign: string): Promise<string> {
  const session = await refreshSessionIfNeeded();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/qz-sign`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ request: toSign }),
  });
  const signature = await response.text();
  if (!response.ok || !signature) {
    // The Edge Function deliberately returns a short, safe diagnostic (for
    // example a missing signing key). Keep it so the workstation can be fixed
    // without exposing any secret or having to inspect browser devtools.
    throw new Error(signature.trim() || "Signature QZ indisponible");
  }
  return signature;
}

export async function sendInvoiceEmail(_params: unknown): Promise<void> {
  throw new Error("L’envoi d’e-mail sera disponible après configuration de Resend côté serveur.");
}

export async function storePDFForSMS(_params: unknown): Promise<string | null> {
  return null;
}
