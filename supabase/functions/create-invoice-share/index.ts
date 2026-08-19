import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET = "invoice-pdfs";
const EXPIRES_SECONDS = 48 * 60 * 60;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Connexion requise" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return reply({ error: "Session invalide" }, 401);

    const form = await req.formData();
    const boutiqueId = String(form.get("boutique_id") ?? "").trim();
    const invoiceId = String(form.get("invoice_id") ?? "").trim();
    const file = form.get("file");
    if (!boutiqueId || !invoiceId || !(file instanceof File)) return reply({ error: "Données de facture incomplètes" }, 400);
    if (file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_PDF_BYTES) return reply({ error: "PDF invalide ou trop volumineux" }, 400);

    const [{ data: profile }, { data: assignment }, { data: invoice }] = await Promise.all([
      admin.from("platform_users").select("is_super_admin,is_suspended").eq("id", userData.user.id).maybeSingle(),
      admin.from("boutique_assignments").select("role,droits").eq("boutique_id", boutiqueId).eq("user_id", userData.user.id).maybeSingle(),
      admin.from("invoices").select("id,boutique_id").eq("boutique_id", boutiqueId).eq("id", invoiceId).maybeSingle(),
    ]);
    if (!profile || profile.is_suspended) return reply({ error: "Compte non autorisé" }, 403);
    const isSuperAdmin = profile.is_super_admin === true;
    const rights = (assignment?.droits ?? {}) as Record<string, unknown>;
    const canShare = isSuperAdmin || assignment?.role === "owner" || rights.factures === true || rights.vente === true;
    if (!canShare) return reply({ error: "Droit facture requis" }, 403);
    if (!invoice) return reply({ error: "Facture introuvable" }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, 5));
    if (magic !== "%PDF-") return reply({ error: "Contenu PDF invalide" }, 400);

    const safeInvoiceId = invoiceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeFolder = boutiqueId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const { data: existing, error: listErr } = await admin.storage.from(BUCKET).list(safeFolder, { limit: 1000 });
    if (listErr) throw listErr;
    const oldPaths = (existing ?? [])
      .filter((entry) => entry.name.startsWith(`${safeInvoiceId}-`) && entry.name.endsWith(".pdf"))
      .map((entry) => `${safeFolder}/${entry.name}`);
    if (oldPaths.length) {
      const { error } = await admin.storage.from(BUCKET).remove(oldPaths);
      if (error) throw error;
    }

    const path = `${safeFolder}/${safeInvoiceId}-${crypto.randomUUID()}.pdf`;
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, EXPIRES_SECONDS, { download: `facture-${safeInvoiceId}.pdf` });
    if (signErr || !signed?.signedUrl) {
      await admin.storage.from(BUCKET).remove([path]);
      throw signErr ?? new Error("Signing failed");
    }
    return reply({ url: signed.signedUrl, expires_at: new Date(Date.now() + EXPIRES_SECONDS * 1000).toISOString() });
  } catch (err) {
    console.error("create-invoice-share", err);
    return reply({ error: "Création du lien impossible" }, 500);
  }
});
