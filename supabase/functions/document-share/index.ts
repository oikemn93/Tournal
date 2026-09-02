import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET = "invoice-pdfs";
const APP_URL = "https://tournal.vercel.app";

function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="robots" content="noindex,nofollow,noarchive"/>
  <meta name="referrer" content="no-referrer"/>
  <title>${htmlEscape(title)} · Tournal</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f4;color:#161616;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,480px);background:#fff;border:1px solid #e9e9e3;border-radius:28px;padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.07)}.brand{font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#111827}.mark{width:48px;height:48px;border-radius:16px;background:#111827;color:#fff;display:grid;place-items:center;font-weight:900;margin-bottom:18px}.title{font-size:26px;line-height:1.1;font-weight:900;margin:8px 0 10px}.muted{color:#6b7280;font-size:14px;line-height:1.6}.meta{margin:22px 0;border:1px solid #ecece7;border-radius:18px;padding:15px 16px;background:#fafaf8}.row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;font-size:13px}.row span:first-child{color:#6b7280}.row strong{text-align:right}.btn{display:flex;align-items:center;justify-content:center;width:100%;padding:14px 18px;border-radius:16px;background:#111827;color:#fff;text-decoration:none;font-weight:900;font-size:14px}.foot{margin-top:16px;text-align:center;color:#9ca3af;font-size:11px;line-height:1.5}
  </style>
</head><body><main class="card">${body}</main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return page("Document indisponible", `<div class="mark">T</div><div class="brand">Tournal</div><h1 class="title">Document indisponible</h1><p class="muted">Cette adresse ne peut pas être utilisée de cette façon.</p>`, 405);

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) {
    return page("Lien invalide", `<div class="mark">T</div><div class="brand">Tournal</div><h1 class="title">Lien invalide</h1><p class="muted">Ce lien de document n’est pas valide.</p>`, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await sha256(token);
    const { data: share, error } = await admin.from("document_shares")
      .select("boutique_id,document_type,document_ref,storage_path,download_name,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!share || new Date(share.expires_at).getTime() <= Date.now()) {
      return page("Lien expiré", `<div class="mark">T</div><div class="brand">Tournal</div><h1 class="title">Lien expiré</h1><p class="muted">Ce document n’est plus disponible. Demandez à la boutique de générer un nouveau lien.</p>`, 410);
    }

    const remainingSeconds = Math.max(60, Math.min(30 * 60, Math.floor((new Date(share.expires_at).getTime() - Date.now()) / 1000)));
    const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(share.storage_path, remainingSeconds, { download: share.download_name });
    if (signError || !signed?.signedUrl) throw signError ?? new Error("signed_url_missing");

    const { data: boutique } = await admin.from("boutiques").select("nom,ville").eq("id", share.boutique_id).maybeSingle();
    const typeLabel = share.document_type === "invoice" ? "Facture" : "Justificatif de versement";
    const reference = share.document_ref.replace(/^invoice-|^payment-|^advance-/, "");
    return page(typeLabel, `
      <div class="mark">T</div>
      <div class="brand">Tournal</div>
      <h1 class="title">${htmlEscape(typeLabel)}</h1>
      <p class="muted">Document partagé par ${htmlEscape(boutique?.nom ?? "une boutique Tournal")}.</p>
      <div class="meta">
        <div class="row"><span>Référence</span><strong>${htmlEscape(reference)}</strong></div>
        ${boutique?.ville ? `<div class="row"><span>Boutique</span><strong>${htmlEscape(boutique.nom)} · ${htmlEscape(boutique.ville)}</strong></div>` : `<div class="row"><span>Boutique</span><strong>${htmlEscape(boutique?.nom ?? "Tournal")}</strong></div>`}
        <div class="row"><span>Validité du lien</span><strong>48 h maximum</strong></div>
      </div>
      <a class="btn" href="${htmlEscape(signed.signedUrl)}" rel="noreferrer">Consulter / télécharger le PDF</a>
      <div class="foot">Lien sécurisé généré par Tournal. Le document PDF reste temporaire.</div>
    `);
  } catch (error) {
    console.error("document-share", error);
    return page("Document indisponible", `<div class="mark">T</div><div class="brand">Tournal</div><h1 class="title">Document indisponible</h1><p class="muted">Impossible d’ouvrir ce document pour le moment.</p>`, 500);
  }
});