import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "text/plain; charset=utf-8" };

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
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  const pem = Deno.env.get("QZ_PRIVATE_KEY");
  if (!pem) return new Response("QZ signing is not configured", { status: 503, headers });
  const body = await request.json().catch(() => null) as { request?: unknown } | null;
  if (typeof body?.request !== "string" || !body.request || body.request.length > 250000) return new Response("Invalid signing payload", { status: 400, headers });
  try {
    const key = await crypto.subtle.importKey("pkcs8", pemBytes(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" }, false, ["sign"]);
    const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body.request));
    return new Response(base64(signed), { status: 200, headers });
  } catch { return new Response("Unable to sign QZ request", { status: 500, headers }); }
});
