/**
 * Small browser-only client for the Tournal Supabase project.
 *
 * The project uses the publishable key only; privileged credentials never
 * reach the browser. Authorization is enforced by PostgreSQL RLS.
 */

type AuthUser = { id: string; email?: string | null };
type AuthSession = { access_token: string; refresh_token: string; user: AuthUser };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://cnxtylngddwmhugxkzju.supabase.co";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq";
const SESSION_STORAGE_KEY = "tournal.supabase.session";

function phoneToEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) throw new Error("Numéro de téléphone invalide");
  return `${digits}@tournal.internal`;
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Private browsing can reject storage. The in-memory request still succeeds.
  }
}

async function authRequest(path: string, init: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.msg ?? body?.message ?? "Authentification impossible");
  return body;
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
  if (!response.ok) throw new Error(body?.message ?? body?.hint ?? "Accès aux données refusé");
  return body as T;
}

async function adminProvision<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const session = readSession();
  if (!session?.access_token) throw new Error("Connexion requise");
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

export async function signInWithPhone(phone: string, password: string) {
  const body = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: phoneToEmail(phone), password }),
  });
  storeSession(body as AuthSession);
  return body as AuthSession;
}

export async function signUpWithPhone(phone: string, password: string, fullName: string) {
  if (password.length < 12) throw new Error("Utilisez au moins 12 caractères pour le mot de passe");
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

export async function createBoutique(nom: string, ville: string, ownerId: string) {
  return adminProvision<{ boutiqueId: string }>("create_boutique", { nom, ville, ownerId });
}

export async function createUser(phone: string, fullName: string, password: string) {
  return adminProvision<{ userId: string }>("create_user", { phone, fullName, password });
}

export async function resetUserPassword(userId: string, password: string) {
  return adminProvision<{ ok: true }>("reset_password", { userId, password });
}

/** Reads the compatibility state while the screens are progressively moved to relational tables. */
export async function getData<T>(key: string): Promise<T | null> {
  if (key === "boutiques") {
    const rows = await dataRequest<Array<{ value: T }>>("boutique_state?select=value&order=updated_at.asc");
    return rows.map((row) => row.value) as T;
  }
  if (key === "platform_users") {
    const [users, assignments] = await Promise.all([
      dataRequest<Array<any>>("platform_users?select=id,phone,nom,initials,color,is_super_admin,group_id,is_compte_mere"),
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
      groupeId: user.group_id ?? undefined,
      isCompteMere: user.is_compte_mere ?? undefined,
      assignments: assignments.filter((a) => a.user_id === user.id).map((a) => ({
        boutiqueId: a.boutique_id,
        role: toRole(a.role),
        droits: a.droits ?? {},
      })),
    })) as T;
  }
  if (key === "groupes") {
    const rows = await dataRequest<Array<{ id: string; nom: string }>>("groupes?select=id,nom&order=nom.asc");
    return rows as T;
  }
  if (key.startsWith("settings:auth:")) {
    const boutiqueId = key.slice("settings:auth:".length);
    const rows = await dataRequest<Array<{ lock_minutes: number; session_minutes: number }>>(
      `auth_settings?select=lock_minutes,session_minutes&boutique_id=eq.${encodeURIComponent(boutiqueId)}&limit=1`,
    );
    const row = rows[0];
    return row ? { lockMinutes: row.lock_minutes, sessionMinutes: row.session_minutes } as T : null;
  }
  // Technical logs are intentionally not mirrored in the browser anymore.
  return null;
}

export async function saveData<T>(key: string, value: T): Promise<void> {
  if (key === "boutiques") {
    const boutiques = value as Array<{ id: string }>;
    const body = boutiques.map((boutique) => ({ boutique_id: boutique.id, value: boutique }));
    if (!body.length) return;
    await dataRequest("boutique_state?on_conflict=boutique_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
    });
    return;
  }
  if (key === "groupes") {
    const groups = value as Array<{ id: string; nom: string }>;
    if (!groups.length) return;
    await dataRequest("groupes?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(groups),
    });
    return;
  }
  if (key.startsWith("settings:auth:")) {
    const boutiqueId = key.slice("settings:auth:".length);
    const settings = value as { lockMinutes?: number; sessionMinutes?: number };
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
}

export async function checkBackend(): Promise<boolean> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE_KEY } });
    return true;
  } catch {
    return false;
  }
}

/** Images stay in the protected boutique JSON state until Storage migration is complete. */
export function stripImages<T>(boutiques: T) {
  return { stripped: boutiques, images: {} as Record<string, string> };
}

export function mergeImages<T>(boutiques: T, _images: Record<string, string>) {
  return boutiques;
}

export async function signQZ(_toSign: string): Promise<string> {
  throw new Error("La signature QZ doit être configurée dans une fonction Supabase dédiée.");
}

export async function sendInvoiceEmail(_params: unknown): Promise<void> {
  throw new Error("L’envoi d’e-mail sera disponible après configuration de Resend côté serveur.");
}

export async function storePDFForSMS(_params: unknown): Promise<string | null> {
  return null;
}
