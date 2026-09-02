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
    const documentType = String(form.get("document_type") ?? "invoice").trim();
    const invoiceId = String(form.get("invoice_id") ?? "").trim();
    const paymentId = String(form.get("payment_id") ?? "").trim();
    const advanceId = String(form.get("advance_id") ?? "").trim();
    const file = form.get("file");
    if (!boutiqueId || !(file instanceof File)) return reply({ error: "Données de document incomplètes" }, 400);
    if (file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_PDF_BYTES) return reply({ error: "PDF invalide ou trop volumineux" }, 400);

    const [{ data: profile }, { data: assignment }] = await Promise.all([
      admin.from("platform_users").select("is_super_admin,is_suspended").eq("id", userData.user.id).maybeSingle(),
      admin.from("boutique_assignments").select("role,droits").eq("boutique_id", boutiqueId).eq("user_id", userData.user.id).maybeSingle(),
    ]);
    if (!profile || profile.is_suspended) return reply({ error: "Compte non autorisé" }, 403);
    const isSuperAdmin = profile.is_super_admin === true;
    const rights = (assignment?.droits ?? {}) as Record<string, unknown>;
    const owner = assignment?.role === "owner" || assignment?.role === "Propriétaire";
    const canShareInvoice = isSuperAdmin || owner || rights.factures === true || rights.vente === true;
    const canSharePayment = isSuperAdmin || owner || rights.encaissement_vente === true || rights.clients === true || rights.factures === true || rights.vente === true;

    let documentRef = "";
    let downloadName = "document-tournal.pdf";
    if (documentType === "invoice") {
      if (!invoiceId) return reply({ error: "Facture manquante" }, 400);
      if (!canShareInvoice) return reply({ error: "Droit facture requis" }, 403);
      const { data: invoice } = await admin.from("invoices").select("id").eq("boutique_id", boutiqueId).eq("id", invoiceId).maybeSingle();
      if (!invoice) return reply({ error: "Facture introuvable" }, 404);
      documentRef = `invoice-${invoiceId}`;
      downloadName = `facture-${invoiceId}.pdf`;
    } else if (documentType === "invoice_payment") {
      if (!paymentId) return reply({ error: "Versement manquant" }, 400);
      if (!canSharePayment) return reply({ error: "Droit encaissement requis" }, 403);
      const { data: payment } = await admin.from("invoice_payments").select("id,invoice_id").eq("boutique_id", boutiqueId).eq("id", paymentId).maybeSingle();
      if (!payment) return reply({ error: "Versement introuvable" }, 404);
      documentRef = `payment-${payment.id}`;
      downloadName = `justificatif-versement-${payment.id}.pdf`;
    } else if (documentType === "client_advance") {
      if (!advanceId) return reply({ error: "Versement manquant" }, 400);
      if (!canSharePayment) return reply({ error: "Droit encaissement requis" }, 403);
      const { data: advance } = await admin.from("client_advances").select("id").eq("boutique_id", boutiqueId).eq("id", advanceId).maybeSingle();
      if (!advance) return reply({ error: "Versement introuvable" }, 404);
      documentRef = `advance-${advance.id}`;
      downloadName = `justificatif-versement-${advance.id}.pdf`;
    } else {
      return reply({ error: "Type de document invalide" }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, 5));
    if (magic !== "%PDF-") return reply({ error: "Contenu PDF invalide" }, 400);

    const safeRef = documentRef.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeFolder = boutiqueId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const { data: existing, error: listErr } = await admin.storage.from(BUCKET).list(safeFolder, { limit: 1000 });
    if (listErr) throw listErr;
    const oldPaths = (existing ?? []).filter((entry) => entry.name.startsWith(`${safeRef}-`) && entry.name.endsWith(".pdf")).map((entry) => `${safeFolder}/${entry.name}`);
    if (oldPaths.length) {
      const { error } = await admin.storage.from(BUCKET).remove(oldPaths);
      if (error) throw error;
    }

    const path = `${safeFolder}/${safeRef}-${crypto.randomUUID()}.pdf`;
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
    if (uploadErr) throw uploadErr;
    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, EXPIRES_SECONDS, { download: downloadName });
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
