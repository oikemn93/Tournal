import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET = "invoice-pdfs";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: config, error: configError } = await sb.rpc("get_internal_invoice_cleanup_config");
    const supplied = req.headers.get("x-tournal-cron-secret") ?? "";
    const expected = String(config?.cleanupSecret ?? "");
    if (configError || !expected || !supplied || !constantTimeEqual(supplied, expected)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const cutoff = new Date(Date.now() - MAX_AGE_MS);
    const toDelete: string[] = [];
    const { data: topLevel, error: topErr } = await sb.storage
      .from(BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (topErr) throw topErr;

    for (const entry of topLevel ?? []) {
      if (!entry.id) {
        const { data: files, error: folderErr } = await sb.storage
          .from(BUCKET)
          .list(entry.name, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
        if (folderErr) throw folderErr;
        for (const file of files ?? []) {
          if (file.created_at && new Date(file.created_at) <= cutoff) toDelete.push(`${entry.name}/${file.name}`);
        }
      } else if (entry.created_at && new Date(entry.created_at) <= cutoff) {
        toDelete.push(entry.name);
      }
    }

    let deleted = 0;
    for (let index = 0; index < toDelete.length; index += 1000) {
      const batch = toDelete.slice(index, index + 1000);
      const { error } = await sb.storage.from(BUCKET).remove(batch);
      if (error) throw error;
      deleted += batch.length;
    }
    return json({ ok: true, deleted, cutoff: cutoff.toISOString() });
  } catch (error) {
    console.error("cleanup-invoice-pdfs", error instanceof Error ? error.message : "unknown");
    return json({ error: "Cleanup failed" }, 500);
  }
});
