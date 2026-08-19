import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@tournal.internal`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Service-role client for all privileged operations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate caller: extract bearer token and validate via admin.auth.getUser()
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Non authentifié" }, 401);
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error: "Token invalide" }, 401);

    // Check caller privileges
    const { data: callerPlatform } = await admin
      .from("platform_users")
      .select("is_super_admin")
      .eq("id", caller.id)
      .single();
    const isSuperAdmin = callerPlatform?.is_super_admin === true;

    const body = await req.json();
    const { action } = body;

    // Helper: verify caller is owner of a given boutique
    async function isOwnerOf(boutiqueId: string): Promise<boolean> {
      if (isSuperAdmin) return true;
      const { data } = await admin
        .from("boutique_assignments")
        .select("role")
        .eq("boutique_id", boutiqueId)
        .eq("user_id", caller.id)
        .single();
      return data?.role === "owner";
    }

    // ── create_boutique ───────────────────────────────────────────────────────
    if (action === "create_boutique") {
      if (!isSuperAdmin) return json({ error: "SuperAdmin requis" }, 403);
      const { nom, ville, ownerId } = body;
      const { data: b, error } = await admin
        .from("boutiques")
        .insert({ nom, ville: ville ?? "", color: "#C9A227", initials: nom.slice(0, 2).toUpperCase() })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);
      await admin.from("boutique_assignments").insert({ boutique_id: b.id, user_id: ownerId, role: "owner", droits: {} });
      return json({ boutiqueId: b.id });
    }

    // ── create_user ───────────────────────────────────────────────────────────
    if (action === "create_user") {
      const { phone, fullName, password, boutiqueId } = body;
      const requestId = typeof body.requestId === "string"
        ? body.requestId
        : `${Date.now()}-${crypto.randomUUID()}`;
      if (boutiqueId && !(await isOwnerOf(boutiqueId))) return json({ error: "Accès refusé" }, 403);
      const email = phoneToEmail(phone);
      const payloadAuth = {
        email,
        password,
        email_confirm: true,
        user_metadata: { nom: fullName, phone },
      };
      console.log("auth signUp payload", requestId, { ...payloadAuth, password: "[REDACTED]" });

      const { data: created, error } = await admin.auth.admin.createUser(payloadAuth);
      if (error) return json({ error: error.message }, 400);
      const uid = created.user.id;
      const initials = fullName.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
      const colors = ["#C9A227","#2563eb","#16a34a","#dc2626","#9333ea","#0891b2","#ea580c"];
      const { count } = await admin.from("platform_users").select("*", { count: "exact", head: true });
      const color = colors[(count ?? 0) % colors.length];
      const platformUserPayload = {
        id: uid, phone, nom: fullName, initials, color, is_super_admin: false,
      };
      console.log("platform_users insert payload", requestId, platformUserPayload);

      const { error: puErr } = await admin.from("platform_users").upsert(platformUserPayload, {
        onConflict: "id",
        ignoreDuplicates: true,
      });

      if (puErr) {
        const conflictText = `${puErr.message ?? ""} ${puErr.details ?? ""}`;
        const isPhoneConflict = puErr.code === "23505" && /phone|platform_users_phone_key/i.test(conflictText);
        if (!isPhoneConflict) return json({ error: puErr.message }, 400);

        const { data: existingByPhone, error: lookupErr } = await admin
          .from("platform_users")
          .select("id, phone")
          .eq("phone", phone)
          .maybeSingle();

        if (lookupErr || !existingByPhone) return json({ error: puErr.message }, 400);

        const { error: updateErr } = await admin
          .from("platform_users")
          .update({ nom: fullName, initials, color, is_super_admin: false })
          .eq("id", existingByPhone.id);

        if (updateErr) return json({ error: updateErr.message }, 400);

        if (existingByPhone.id !== uid) {
          const { error: cleanupErr } = await admin.auth.admin.deleteUser(uid);
          if (cleanupErr) console.warn("create_user cleanup failed", requestId, cleanupErr.message);
        }

        return json({ userId: existingByPhone.id, nom: fullName, initials, color, phone });
      }

      return json({ userId: uid, nom: fullName, initials, color, phone });
    }

    // ── reset_password ────────────────────────────────────────────────────────
    if (action === "reset_password") {
      const { userId, password } = body;
      // Owner can reset passwords of members in their boutique
      if (!isSuperAdmin) {
        const { data: assignments } = await admin
          .from("boutique_assignments")
          .select("boutique_id, role")
          .eq("user_id", userId);
        const ownerBoutiques = (assignments ?? [])
          .map((a: { boutique_id: string }) => a.boutique_id);
        const isOwner = await Promise.all(ownerBoutiques.map(isOwnerOf));
        if (!isOwner.some(Boolean)) return json({ error: "Accès refusé" }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ── assign_user ───────────────────────────────────────────────────────────
    if (action === "assign_user") {
      const { boutiqueId, userId, role, droits } = body;
      if (!(await isOwnerOf(boutiqueId))) return json({ error: "Accès refusé" }, 403);
      const { error } = await admin.from("boutique_assignments").upsert(
        { boutique_id: boutiqueId, user_id: userId, role, droits },
        { onConflict: "boutique_id,user_id" },
      );
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ── unassign_user ─────────────────────────────────────────────────────────
    if (action === "unassign_user") {
      const { boutiqueId, userId } = body;
      if (!(await isOwnerOf(boutiqueId))) return json({ error: "Accès refusé" }, 403);
      const { error } = await admin
        .from("boutique_assignments")
        .delete()
        .eq("boutique_id", boutiqueId)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: `Action inconnue : ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur interne" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
