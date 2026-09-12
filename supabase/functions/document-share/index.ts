import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET = "invoice-pdfs";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return text("Document indisponible", 405);

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return text("Lien invalide", 400);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const tokenHash = await sha256(token);

    const { data: share, error } = await admin.from("document_shares")
      .select("storage_path,download_name,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!share || new Date(share.expires_at).getTime() <= Date.now()) return text("Lien expiré", 410);

    const remainingSeconds = Math.max(60, Math.min(30 * 60, Math.floor((new Date(share.expires_at).getTime() - Date.now()) / 1000)));
    const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(
      share.storage_path,
      remainingSeconds,
      { download: share.download_name },
    );
    if (signError || !signed?.signedUrl) throw signError ?? new Error("signed_url_missing");

    return new Response(null, {
      status: 302,
      headers: {
        "Location": signed.signedUrl,
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("document-share", error);
    return text("Document indisponible", 500);
  }
});
