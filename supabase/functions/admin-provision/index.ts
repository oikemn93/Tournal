import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Action = "create_boutique" | "create_user" | "reset_password" | "assign_user" | "unassign_user";

const allowedOrigins = new Set(["https://tournal-wldg.vercel.app"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin ?? "") ? origin! : "https://tournal-wldg.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function reply(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function text(value: unknown, label: string, maxLength = 120) {
  if (typeof value !== "string") throw new Error(`${label} est obligatoire`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(`${label} est invalide`);
  return result;
}

function phoneToEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 18) throw new Error("Numéro de téléphone invalide");
  return `${digits}@tournal.internal`;
}

const ownerRights = {
  dashboard: true, stock: true, fournisseurs: true, clients: true, factures: true,
  remboursement: true, charges: true, compta: true, vente: true, inventaire: true, marges: true,
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return reply(request, { error: "Méthode non autorisée" }, 405);

  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return reply(request, { error: "Origine non autorisée" }, 403);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(request, { error: "Connexion requise" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !serviceRoleKey) return reply(request, { error: "Service non configuré" }, 500);

  const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, serviceRoleKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return reply(request, { error: "Session invalide" }, 401);

  const { data: caller, error: callerError } = await admin
    .from("platform_users")
    .select("id, is_super_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerError || !caller) return reply(request, { error: "Droits administrateur requis" }, 403);

  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = payload.action as Action;

    if (action === "create_boutique") {
      const nom = text(payload.nom, "Nom de la boutique");
      const ville = typeof payload.ville === "string" ? payload.ville.trim().slice(0, 120) : "";
      const ownerId = text(payload.ownerId, "Propriétaire", 36);
      const boutiqueId = crypto.randomUUID();

      const { data: owner, error: ownerError } = await admin
        .from("platform_users")
        .select("id")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerError || !owner) return reply(request, { error: "Propriétaire introuvable" }, 422);

      const { error: boutiqueError } = await admin.from("boutiques").insert({
        id: boutiqueId, nom, ville: ville || null, owner_id: ownerId,
      });
      if (boutiqueError) throw boutiqueError;

      const { error: assignmentError } = await admin.from("boutique_assignments").insert({
        boutique_id: boutiqueId, user_id: ownerId, role: "owner", droits: ownerRights,
      });
      if (assignmentError) {
        await admin.from("boutiques").delete().eq("id", boutiqueId);
        throw assignmentError;
      }
      return reply(request, { boutiqueId });
    }

    if (action === "create_user") {
      const phone = text(payload.phone, "Numéro de téléphone", 32);
      const fullName = text(payload.fullName, "Nom", 120);
      const password = text(payload.password, "Mot de passe", 256);
      const boutiqueId = typeof payload.boutiqueId === "string" ? payload.boutiqueId.trim() : "";
      if (password.length < 12) return reply(request, { error: "Le mot de passe doit contenir au moins 12 caractères" }, 422);
      if (!boutiqueId && !caller?.is_super_admin) {
        return reply(request, { error: "Boutique requise pour cr�er ce compte" }, 422);
      }

      if (boutiqueId && !caller?.is_super_admin) {
        const { data: boutique, error: boutiqueError } = await admin
          .from("boutiques")
          .select("owner_id")
          .eq("id", boutiqueId)
          .maybeSingle();
        if (boutiqueError || !boutique) return reply(request, { error: "Boutique introuvable" }, 422);
        if (boutique.owner_id !== userData.user.id) {
          return reply(request, { error: "Seul le propri�taire de cette boutique peut cr�er ce compte" }, 403);
        }
      }

      const { data, error } = await admin.auth.admin.createUser({
        email: phoneToEmail(phone), password, email_confirm: true,
        user_metadata: { phone, full_name: fullName },
      });
      if (error || !data.user) return reply(request, { error: error?.message ?? "Création impossible" }, 422);
      return reply(request, { userId: data.user.id }, 201);
    }

    if (action === "reset_password") {
      const userId = text(payload.userId, "Utilisateur", 36);
      const password = text(payload.password, "Mot de passe", 256);
      if (password.length < 12) return reply(request, { error: "Le mot de passe doit contenir au moins 12 caractères" }, 422);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return reply(request, { error: error.message }, 422);
      return reply(request, { ok: true });
    }

    if (action === "assign_user") {
      const boutiqueId = text(payload.boutiqueId, "Boutique", 120);
      const userId = text(payload.userId, "Utilisateur", 36);
      const role = payload.role;
      if (role !== "owner" && role !== "manager" && role !== "employee") return reply(request, { error: "Rôle invalide" }, 422);
      const droits = typeof payload.droits === "object" && payload.droits !== null ? payload.droits : {};
      const { error } = await admin.from("boutique_assignments").upsert(
        { boutique_id: boutiqueId, user_id: userId, role, droits },
        { onConflict: "boutique_id,user_id" },
      );
      if (error) return reply(request, { error: error.message }, 422);
      return reply(request, { ok: true });
    }

    if (action === "unassign_user") {
      const boutiqueId = text(payload.boutiqueId, "Boutique", 120);
      const userId = text(payload.userId, "Utilisateur", 36);
      const { data: boutique, error: boutiqueError } = await admin
        .from("boutiques")
        .select("owner_id")
        .eq("id", boutiqueId)
        .maybeSingle();
      if (boutiqueError || !boutique) return reply(request, { error: "Boutique introuvable" }, 422);
      if (boutique.owner_id === userId) return reply(request, { error: "Le propri\u00e9taire ne peut pas \u00eatre retir\u00e9 de sa boutique" }, 422);

      const { error } = await admin.from("boutique_assignments")
        .delete()
        .eq("boutique_id", boutiqueId)
        .eq("user_id", userId);
      if (error) return reply(request, { error: error.message }, 422);
      return reply(request, { ok: true });
    }

    return reply(request, { error: "Action inconnue" }, 400);
  } catch (error) {
    console.error(error);
    return reply(request, { error: error instanceof Error ? error.message : "Erreur serveur" }, 400);
  }
});


