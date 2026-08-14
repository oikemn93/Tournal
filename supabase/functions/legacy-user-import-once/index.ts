import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LegacyUserSeed = {
  fullName: string;
  phone?: string;
  email?: string;
  password: string;
  initials: string;
  color: string;
  isSuperAdmin: boolean;
  isCompteMere: boolean;
  groupId?: string | null;
  assignments: Array<{
    boutiqueId: string;
    role: "owner" | "manager" | "employee";
    droits: Record<string, unknown>;
  }>;
};

const MIGRATION_TOKEN = "mafemmeestbelle";

const ownerRights = {
  dashboard: true,
  stock: true,
  fournisseurs: true,
  clients: true,
  factures: true,
  remboursement: true,
  charges: true,
  compta: true,
  vente: true,
  inventaire: true,
  marges: true,
  _display_role: "Propriétaire",
};

const legacyUsers: LegacyUserSeed[] = [
  {
    fullName: "Malick Gaye",
    phone: "+221 784584825",
    password: "1932",
    initials: "MG",
    color: "#14b8a6",
    isSuperAdmin: false,
    isCompteMere: true,
    groupId: "g1785701651549",
    assignments: [
      { boutiqueId: "b1785701619891", role: "owner", droits: ownerRights },
      { boutiqueId: "b1785724579923", role: "owner", droits: ownerRights },
    ],
  },
  {
    fullName: "ISSEU",
    phone: "+221 783351919",
    password: "1919",
    initials: "I",
    color: "#ef4444",
    isSuperAdmin: false,
    isCompteMere: false,
    assignments: [
      {
        boutiqueId: "b1785701619891",
        role: "employee",
        droits: {
          stock: false,
          vente: false,
          compta: false,
          charges: true,
          clients: true,
          factures: true,
          dashboard: false,
          fournisseurs: true,
          remboursement: false,
          _display_role: "Caissier",
        },
      },
    ],
  },
  {
    fullName: "SECONDEUR",
    phone: "+221 338772900",
    password: "2900",
    initials: "S",
    color: "#C9A227",
    isSuperAdmin: false,
    isCompteMere: false,
    assignments: [
      {
        boutiqueId: "b1786128930569",
        role: "manager",
        droits: {
          stock: false,
          vente: true,
          compta: false,
          marges: false,
          charges: true,
          clients: true,
          factures: false,
          dashboard: false,
          inventaire: false,
          fournisseurs: false,
          remboursement: false,
          _display_role: "Gérant",
        },
      },
    ],
  },
  {
    fullName: "YIAGF",
    email: "yiagf@tournal.internal",
    password: "UGIG",
    initials: "Y",
    color: "#ec4899",
    isSuperAdmin: false,
    isCompteMere: false,
    assignments: [],
  },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-auth-migration-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function digits(value: string | undefined) {
  return value ? value.replace(/\D/g, "") : "";
}

function normalizePhone(value: string | undefined) {
  const result = (value ?? "").trim();
  return result || null;
}

async function upsertUser(
  admin: ReturnType<typeof createClient>,
  seed: LegacyUserSeed,
) {
  const phone = normalizePhone(seed.phone);
  const email = seed.email ?? (phone ? `${digits(phone)}@tournal.internal` : `${seed.fullName.toLowerCase().replace(/\s+/g, ".")}@tournal.internal`);

  const { data: usersResult } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = usersResult.users.find((user) => {
    if (phone && user.phone) return digits(user.phone) === digits(phone);
    if (!phone && user.email) return user.email.toLowerCase() === email.toLowerCase();
    return false;
  });

  let userId = existing?.id ?? null;

  if (!existing) {
    const createPayload: Record<string, unknown> = {
      password: seed.password,
      email,
      user_metadata: {
        full_name: seed.fullName,
        initials: seed.initials,
        color: seed.color,
        isSuperAdmin: seed.isSuperAdmin,
        isCompteMere: seed.isCompteMere,
        migration_source: "legacy_kv",
      },
      app_metadata: {
        role: seed.isSuperAdmin ? "superadmin" : "authenticated",
        migration_source: "legacy_kv",
      },
    };

    if (phone) {
      createPayload.phone = phone;
      createPayload.phone_confirm = true;
      createPayload.email_confirm = true;
    } else {
      createPayload.email_confirm = true;
    }

    const { data, error } = await admin.auth.admin.createUser(createPayload as any);
    if (error || !data.user) throw new Error(error?.message ?? `Impossible de créer ${seed.fullName}`);
    userId = data.user.id;
  } else {
    const updatePayload: Record<string, unknown> = {
      password: seed.password,
      email,
      user_metadata: {
        full_name: seed.fullName,
        initials: seed.initials,
        color: seed.color,
        isSuperAdmin: seed.isSuperAdmin,
        isCompteMere: seed.isCompteMere,
        migration_source: "legacy_kv",
      },
      app_metadata: {
        role: seed.isSuperAdmin ? "superadmin" : "authenticated",
        migration_source: "legacy_kv",
      },
    };
    if (phone && !existing.phone) {
      updatePayload.phone = phone;
      updatePayload.phone_confirm = true;
    }
    if (phone && !existing.email) {
      updatePayload.email = email;
      updatePayload.email_confirm = true;
    }
    const { error } = await admin.auth.admin.updateUserById(existing.id, updatePayload as any);
    if (error) throw new Error(error.message);
  }

  if (!userId) throw new Error(`User id manquant pour ${seed.fullName}`);

  const { error: platformUserError } = await admin.from("platform_users").upsert({
    id: userId,
    phone: phone ?? email,
    nom: seed.fullName,
    initials: seed.initials,
    color: seed.color,
    is_super_admin: seed.isSuperAdmin,
    group_id: seed.groupId ?? null,
    is_compte_mere: seed.isCompteMere,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (platformUserError) throw new Error(platformUserError.message);

  return { userId, phone: phone ?? email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return reply({ error: "Méthode non autorisée" }, 405);

  const token = req.headers.get("x-auth-migration-token");
  if (token !== MIGRATION_TOKEN) return reply({ error: "Token de migration invalide" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return reply({ error: "Configuration Supabase incomplète" }, 500);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const createdUsers: Array<{ fullName: string; userId: string; phone: string }> = [];
    const userIdByName = new Map<string, string>();

    for (const seed of legacyUsers) {
      const result = await upsertUser(admin, seed);
      createdUsers.push({ fullName: seed.fullName, userId: result.userId, phone: result.phone });
      userIdByName.set(seed.fullName, result.userId);
    }

    const assignments: Array<{
      boutique_id: string;
      user_id: string;
      role: "owner" | "manager" | "employee";
      droits: Record<string, unknown>;
      updated_at: string;
    }> = [];

    for (const seed of legacyUsers) {
      const userId = userIdByName.get(seed.fullName);
      if (!userId) continue;

      for (const assignment of seed.assignments) {
        assignments.push({
          boutique_id: assignment.boutiqueId,
          user_id: userId,
          role: assignment.role,
          droits: assignment.droits,
          updated_at: new Date().toISOString(),
        });

        if (assignment.role === "owner") {
          const { error } = await admin.from("boutiques")
            .update({ owner_id: userId, updated_at: new Date().toISOString() })
            .eq("id", assignment.boutiqueId);
          if (error) throw new Error(error.message);
        }
      }
    }

    if (assignments.length > 0) {
      const { error } = await admin.from("boutique_assignments").upsert(assignments, {
        onConflict: "boutique_id,user_id",
      });
      if (error) throw new Error(error.message);
    }

    return reply({
      ok: true,
      users: createdUsers.length,
      assignments: assignments.length,
      createdUsers,
    });
  } catch (error) {
    console.error(error);
    return reply({ ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" }, 400);
  }
});
