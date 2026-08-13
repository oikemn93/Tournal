import { createClient } from "@supabase/supabase-js";

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
const realtimeClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

/** Validates the locally cached token with Supabase Auth, not just localStorage. */
export async function validateServerSession(): Promise<boolean> {
  const session = readSession();
  if (!session?.access_token) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) { storeSession(null); return false; }
    const user = await response.json() as AuthUser;
    if (!user?.id || user.id !== session.user?.id) { storeSession(null); return false; }
    return true;
  } catch {
    // Do not invalidate a session merely because the device is temporarily offline.
    return false;
  }
}

export async function startAppSession(boutiqueId: string) {
  return dataRequest<{ expires_at:string }>("rpc/start_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) });
}

export async function validateAppSession(boutiqueId: string) {
  return dataRequest<boolean>("rpc/validate_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) });
}

/**
 * Watches the shared boutique state over a WebSocket.  A database update
 * triggers a single refresh for connected users instead of periodic polling.
 */
export function subscribeToBoutiqueChanges(boutiqueId: string, onChange: () => void) {
  const session = readSession();
  if (!session?.access_token || !boutiqueId) return () => undefined;

  realtimeClient.realtime.setAuth(session.access_token);
  const filter = `boutique_id=eq.${boutiqueId}`;
  let channel = realtimeClient.channel(`tournal:${boutiqueId}`);
  // Each subscription is scoped to one boutique and only to relational tables.
  // This deliberately avoids both the former global JSON blob and polling.
  for (const table of ["products", "stock_entries", "invoices", "invoice_lines", "clients", "charges", "caisse_sessions"]) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, onChange);
  }
  channel = channel.subscribe();

  return () => { void realtimeClient.removeChannel(channel); };
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

/** Reads the compatibility state while the screens are progressively moved to relational tables. */
export async function getData<T>(key: string): Promise<T | null> {
  if (key === "boutiques") {
    // Compatibility projection: legacy screens still consume a Boutique object,
    // but its data now comes exclusively from the relational source of truth.
    const [boutiques, categories, products, entries, clients, suppliers, invoices, lines, charges, sessions] = await Promise.all([
      dataRequest<any[]>("boutiques?select=*&order=nom.asc"),
      dataRequest<any[]>("categories?select=*"), dataRequest<any[]>("products?select=*"),
      dataRequest<any[]>("stock_entries?select=*"), dataRequest<any[]>("clients?select=*"),
      dataRequest<any[]>("suppliers?select=*"), dataRequest<any[]>("invoices?select=*"),
      dataRequest<any[]>("invoice_lines?select=*"), dataRequest<any[]>("charges?select=*"),
      dataRequest<any[]>("caisse_sessions?select=*"),
    ]);
    const day = (value?: string | null) => value ? new Date(value).toLocaleDateString("fr-FR") : "";
    return boutiques.map((b) => ({
      id: b.id, nom: b.nom, ville: b.ville ?? "", color: "#C9A227",
      initials: (b.nom ?? "?").split(/\\s+/).map((x: string) => x[0]).join("").slice(0, 2).toUpperCase(),
      logo: b.logo_url ?? undefined, adresse: b.adresse ?? undefined, email: b.email ?? undefined, tel: b.tel ?? undefined,
      categories: categories.filter(c => c.boutique_id === b.id).map(c => ({ id:c.id, nom:c.nom, unitVente:"unité", nbPiecesParLot:1, longueurParPiece:1 })),
      products: products.filter(p => p.boutique_id === b.id).map(p => ({ id:p.id, nom:p.nom, img:"", unit:p.unit, fournisseur:"", categorie:categories.find(c=>c.boutique_id===b.id&&c.id===p.category_id)?.nom })),
      entries: entries.filter(e => e.boutique_id === b.id).map(e => ({ id:e.id, productId:e.product_id, qty:e.qty, unit:"unité", montantDu:Number(e.qty)*Number(e.prix_unit ?? 0), date:day(e.entry_date), fournisseur:e.note ?? "", invoiceId:undefined })),
      clients: clients.filter(c => c.boutique_id === b.id).map(c => ({ id:c.id, nom:c.nom, type:c.type, tel:c.tel ?? "", total:c.total ?? 0, last:day(c.last_invoice_at), ville:c.ville ?? "", adresse:c.adresse ?? undefined, email:c.email ?? undefined, contact:c.contact ?? undefined })),
      suppliers: suppliers.filter(s => s.boutique_id === b.id).map(s => ({ id:s.id, nom:s.nom, ville:s.ville ?? "", lastDelivery:day(s.last_delivery_at), tel:s.tel ?? "", initials:s.initials ?? "", color:s.color ?? "#C9A227", email:s.email ?? undefined, contact:s.contact ?? undefined })),
      invoices: invoices.filter(i => i.boutique_id === b.id).map(i => ({ id:i.id, client:i.client_nom ?? "Client comptoir", clientTel:i.client_tel ?? undefined, montant:Number(i.montant), acompte:Number(i.acompte), date:day(i.invoice_date), dateRaw:i.invoice_date, status:i.status === "payée" ? "payé" : i.status === "en_attente" ? "en attente" : i.status, type:i.type, paymentMethod:i.payment_method ?? undefined, lines:lines.filter(l=>l.boutique_id===b.id&&l.invoice_id===i.id).map(l=>({ productId:l.product_id, nom:l.nom, qty:Number(l.qty), unit:l.unit ?? "unité", prixUnit:Number(l.prix_unit), sellUnit:l.sell_unit ?? undefined, sellQty:l.sell_qty ? Number(l.sell_qty) : undefined })) })),
      charges: charges.filter(c => c.boutique_id === b.id).map(c => ({ id:c.id, label:c.label, montant:Number(c.montant), date:day(c.charge_date), dateRaw:c.charge_date, categorie:c.categorie ?? "Autre", recurrence:"unique", note:c.note ?? undefined })),
      caisseHistory: sessions.filter(s => s.boutique_id === b.id).map(s => ({ id:s.id, openedAt:day(s.opened_at), closedAt:s.closed_at ? day(s.closed_at) : undefined, fondDeCaisse:Number(s.fond_ouverture ?? 0), openedBy:"", closedBy:"" })),
      auditLog: [],
    })) as T;
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
    // Full-state writes are intentionally disabled: business mutations must use
    // a dedicated relational RPC or endpoint.
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

export async function createSale(params: { boutiqueId: string; client: string; clientTel?: string; paymentMethod?: string; lines: Array<{ productId:number; nom:string; qty:number; unit:string; prixUnit:number; sellUnit?:string; sellQty?:number }> }) {
  return dataRequest<{ invoice_id:string; total:number }>("rpc/create_sale", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_boutique_id:params.boutiqueId, p_idempotency_key:crypto.randomUUID(), p_client_nom:params.client, p_client_tel:params.clientTel ?? null, p_lines:params.lines, p_payment_method:params.paymentMethod ?? null }),
  });
}

export async function recordPayment(params: { boutiqueId:string; invoiceId:string; amount:number; paymentMethod:string }) {
  return dataRequest<{ invoice_id:string; acompte:number; status:string }>("rpc/record_payment", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_invoice_id:params.invoiceId, p_idempotency_key:crypto.randomUUID(), p_amount:params.amount, p_payment_method:params.paymentMethod }),
  });
}

export async function returnSale(params: { boutiqueId:string; invoiceId:string; lines:Array<{productId:number;qty:number}> }) {
  return dataRequest<{ return_invoice_id:string; total:number }>("rpc/return_sale", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_invoice_id:params.invoiceId, p_idempotency_key:crypto.randomUUID(), p_lines:params.lines }),
  });
}

export async function recordStockMovement(params:{ boutiqueId:string; productId:number; qty:number; type:"achat"|"ajustement"|"retour"|"inventaire"; prixUnit?:number; note?:string }) {
  return dataRequest<{ product_id:number; stock:number }>("rpc/record_stock_movement", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId, p_product_id:params.productId, p_idempotency_key:crypto.randomUUID(), p_qty:params.qty, p_type:params.type, p_prix_unit:params.prixUnit ?? 0, p_note:params.note ?? null }),
  });
}

export async function createCharge(params:{ boutiqueId:string; label:string; amount:number; category:string; note?:string }) {
  return dataRequest<{ charge_id:number }>("rpc/create_charge", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_label:params.label,p_montant:params.amount,p_categorie:params.category,p_note:params.note ?? null }) });
}

export async function createClient(params:{ boutiqueId:string; name:string; type?:"B2B"|"B2C"; phone?:string; email?:string; city?:string }) {
  return dataRequest<{client_id:number}>("rpc/create_client", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_type:params.type ?? "B2C",p_tel:params.phone ?? null,p_email:params.email ?? null,p_ville:params.city ?? null }) });
}
export async function createSupplier(params:{ boutiqueId:string; name:string; phone?:string; city?:string }) {
  return dataRequest<{supplier_id:number}>("rpc/create_supplier", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_tel:params.phone ?? null,p_ville:params.city ?? null }) });
}
export async function createProduct(params:{ boutiqueId:string; name:string; unit:string; categoryId?:string; purchasePrice?:number; salePrice?:number }) {
  return dataRequest<{product_id:number}>("rpc/create_product", { method:"POST", body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_idempotency_key:crypto.randomUUID(),p_nom:params.name,p_unit:params.unit,p_category_id:params.categoryId ?? null,p_prix_achat:params.purchasePrice ?? 0,p_prix_vente:params.salePrice ?? 0 }) });
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
