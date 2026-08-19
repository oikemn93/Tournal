import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const headers = { ...cors, "Content-Type": "text/plain; charset=utf-8" };

function pemBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function base64(bytes: ArrayBuffer) {
  let value = "";
  for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte);
  return btoa(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers });
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = authHeader.slice(7).trim();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers });
    const { data: profile } = await admin.from("platform_users").select("is_suspended").eq("id", user.id).maybeSingle();
    if (!profile || profile.is_suspended) return new Response("Forbidden", { status: 403, headers });

    const pem = Deno.env.get("QZ_PRIVATE_KEY");
    if (!pem) return new Response("QZ signing is not configured", { status: 503, headers });
    const body = await request.json().catch(() => null) as { request?: unknown } | null;
    if (typeof body?.request !== "string" || !body.request || body.request.length > 250000) return new Response("Invalid signing payload", { status: 400, headers });
    const key = await crypto.subtle.importKey("pkcs8", pemBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" }, false, ["sign"]);
    const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body.request));
    return new Response(base64(signed), { status: 200, headers });
  } catch (error) {
    console.error("qz-sign", error instanceof Error ? error.message : "unknown");
    return new Response("Unable to sign QZ request", { status: 500, headers });
  }
});
