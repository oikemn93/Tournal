import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

// ── QZ Tray signing ───────────────────────────────────────────────────────────
// Private key is stored as env var QZ_PRIVATE_KEY (PKCS#8 PEM, no extra whitespace).
// Set it with: supabase secrets set QZ_PRIVATE_KEY="$(cat qz-private-pkcs8.pem)"

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
    false, ["sign"]
  );
}

async function signRequest(message: string): Promise<string> {
  const pemRaw = Deno.env.get("QZ_PRIVATE_KEY") ?? "";
  if (!pemRaw) throw new Error("QZ_PRIVATE_KEY not set");
  const key = await importPrivateKey(pemRaw);
  const data = new TextEncoder().encode(message);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const app = new Hono();

app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-9ae2c303/health", (c) => c.json({ status: "ok" }));

// Helper: gzip-compress a JSON value and return a Response with Content-Encoding: gzip
async function jsonGzip(payload: unknown, status = 200): Promise<Response> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  return new Response(compressed, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// GET /data/:key — retrieve a stored value
app.get("/make-server-9ae2c303/data/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const value = await kv.get(key);
    const acceptsGzip = (c.req.header("Accept-Encoding") ?? "").includes("gzip");
    if (acceptsGzip) return jsonGzip({ data: value ?? null });
    return c.json({ data: value ?? null });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /data/:key — upsert a stored value
app.put("/make-server-9ae2c303/data/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const text = await c.req.text();
    if (!text) return c.json({ error: "Empty body" }, 400);
    const body = JSON.parse(text);
    await kv.set(key, body.data);
    return c.json({ ok: true });
  } catch (err) {
    console.error("PUT error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /data/:key — upsert via POST (proxy-friendly alternative to PUT)
app.post("/make-server-9ae2c303/data/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const text = await c.req.text();
    if (!text) return c.json({ error: "Empty body" }, 400);
    const body = JSON.parse(text);
    await kv.set(key, body.data);
    return c.json({ ok: true });
  } catch (err) {
    console.error("POST error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ── Email sending via Resend ──────────────────────────────────────────────────
// Set env var: supabase secrets set RESEND_API_KEY="re_..."
app.post("/make-server-9ae2c303/email/invoice", async (c) => {
  try {
    const body = await c.req.json() as {
      to: string; subject: string; html: string;
      fromName?: string; fromEmail?: string;
    };
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return c.json({ error: "RESEND_API_KEY not configured" }, 503);
    const from = body.fromEmail
      ? `${body.fromName ?? "Boutique"} <${body.fromEmail}>`
      : `Notifications <notifications@resend.dev>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: body.to, subject: body.subject, html: body.html }),
    });
    const data = await res.json();
    if (!res.ok) return c.json({ error: data }, res.status as any);
    return c.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Email error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ── PDF storage for SMS/WhatsApp links ───────────────────────────────────────
// Receives a base64-encoded PDF binary (generated client-side via jsPDF),
// uploads it as a real .pdf file to Supabase Storage, returns a 48h signed URL.
// Auto-creates the bucket on first use.
app.post("/make-server-9ae2c303/pdf/store", async (c) => {
  try {
    const { invoiceId, boutiqueId, pdfBase64 } = await c.req.json() as {
      invoiceId: string; boutiqueId: string; pdfBase64: string;
    };
    if (!pdfBase64) return c.json({ error: "pdfBase64 is required" }, 400);

    // Decode base64 → binary bytes
    const binaryStr = atob(pdfBase64);
    const pdfBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) pdfBytes[i] = binaryStr.charCodeAt(i);

    const { createClient } = await import("jsr:@supabase/supabase-js@2.49.8");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auto-create the bucket if it doesn't exist yet
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === "invoice-pdfs")) {
      const { error: createErr } = await sb.storage.createBucket("invoice-pdfs", { public: false });
      if (createErr && !createErr.message.includes("already exists")) {
        return c.json({ error: `Bucket creation failed: ${createErr.message}` }, 500);
      }
    }

    const path = `${boutiqueId}/${invoiceId}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from("invoice-pdfs")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return c.json({ error: upErr.message }, 500);

    const { data: signed, error: signErr } = await sb.storage.from("invoice-pdfs")
      .createSignedUrl(path, 48 * 60 * 60); // 48h TTL
    if (signErr) return c.json({ error: signErr.message }, 500);
    return c.json({ ok: true, url: signed.signedUrl });
  } catch (err) {
    console.error("PDF store error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /qz/sign — sign a QZ Tray request with the private key (server-side only)
app.post("/make-server-9ae2c303/qz/sign", async (c) => {
  try {
    const message = await c.req.text();
    if (!message) return c.json({ error: "Empty request body" }, 400);
    const signature = await signRequest(message);
    return c.text(signature);
  } catch (err) {
    console.error("QZ sign error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

Deno.serve(
  {
    onError(err: unknown) {
      // "Http: connection closed" = client disconnected mid-response — not a bug, suppress it.
      if ((err as any)?.name === "Http") return new Response(null, { status: 0 });
      console.error("Server error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    },
  },
  async (req) => {
    // Client already disconnected before we started processing
    if (req.signal?.aborted) return new Response(null, { status: 0 });
    try {
      return await app.fetch(req);
    } catch (err) {
      if ((err as any)?.name === "Http" || (err as any)?.name === "AbortError") {
        return new Response(null, { status: 0 });
      }
      console.error("Unhandled error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }
);
