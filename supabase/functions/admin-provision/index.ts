import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const authClient = createClient(url, anonKey);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const supportedPermissions = new Set(["dashboard", "stock", "fournisseurs", "clients", "factures", "remboursement", "charges", "compta", "vente", "inventaire", "marges", "encaissement_vente"]);
const supportedRoles = new Set(["employee", "manager"]);

function code() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 1_000_000).padStart(6, "0"); }
function cleanRights(input: unknown) {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key, value]) => supportedPermissions.has(key) && typeof value === "boolean"));
}
async function caller(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Connexion requise");
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Session invalide");
  return data.user;
}
async function owns(userId: string, boutiqueId: string) {
  const { data, error } = await admin.from("boutique_assignments").select("role").eq("user_id", userId).eq("boutique_id", boutiqueId).eq("role", "owner").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
async function assignedToOwnedBoutique(ownerId: string, userId: string, boutiqueId: string) {
  if (!(await owns(ownerId, boutiqueId))) throw new Error("Boutique non autorisée");
  const { data, error } = await admin.from("boutique_assignments").select("role").eq("user_id", userId).eq("boutique_id", boutiqueId).maybeSingle();
  if (error) throw error;
  if (!data || data.role === "owner") throw new Error("Cible employé non autorisée");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const actor = await caller(req);
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "create_user") {
      const { phone, fullName, boutiqueId, role = "employee", droits = {} } = body;
      if (!phone || !fullName || !boutiqueId || !supportedRoles.has(role)) throw new Error("Données employé invalides");
      if (!(await owns(actor.id, boutiqueId))) throw new Error("Seul le propriétaire de la boutique peut créer un employé");
      const temporaryCode = code();
      const email = `${String(phone).replace(/\D/g, "")}@tournal.internal`;
      const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password: temporaryCode, email_confirm: true, user_metadata: { phone, full_name: String(fullName).trim() } });
      if (authError || !created.user) throw authError ?? new Error("Création Auth impossible");
      try {
        const { error: platformError } = await admin.from("platform_users").insert({ id: created.user.id, phone, nom: String(fullName).trim(), initials: String(fullName).trim().split(/\s+/).map((x: string) => x[0]).join("").slice(0, 2).toUpperCase(), must_change_password: true, is_super_admin: false });
        if (platformError) throw platformError;
        const { error: assignmentError } = await admin.from("boutique_assignments").insert({ boutique_id: boutiqueId, user_id: created.user.id, role, droits: cleanRights(droits) });
        if (assignmentError) throw assignmentError;
      } catch (error) {
        await admin.from("platform_users").delete().eq("id", created.user.id);
        await admin.auth.admin.deleteUser(created.user.id);
        throw error;
      }
      return json({ userId: created.user.id, code: temporaryCode });
    }
    if (action === "reset_password") {
      const { userId, boutiqueId } = body;
      await assignedToOwnedBoutique(actor.id, userId, boutiqueId);
      const temporaryCode = code();
      const { error } = await admin.auth.admin.updateUserById(userId, { password: temporaryCode, email_confirm: true, user_metadata: { must_change_password: true } });
      if (error) throw error;
      await admin.from("platform_users").update({ must_change_password: true }).eq("id", userId);
      return json({ code: temporaryCode });
    }
    if (["assign_user", "unassign_user"].includes(action)) {
      const { boutiqueId, userId } = body;
      await assignedToOwnedBoutique(actor.id, userId, boutiqueId);
      if (action === "unassign_user") {
        const { error } = await admin.from("boutique_assignments").delete().eq("boutique_id", boutiqueId).eq("user_id", userId); if (error) throw error;
      } else {
        const role = body.role; if (!supportedRoles.has(role)) throw new Error("Rôle non autorisé");
        const { error } = await admin.from("boutique_assignments").update({ role, droits: cleanRights(body.droits) }).eq("boutique_id", boutiqueId).eq("user_id", userId); if (error) throw error;
      }
      return json({ ok: true });
    }
    if (action === "create_boutique") throw new Error("Création de boutique non disponible via cet endpoint");
    throw new Error("Action inconnue");
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Opération refusée" }, 400); }
});
