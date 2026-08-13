// Scheduled edge function — runs daily at 03:00 UTC (see supabase/config.toml).
// Deletes all files in the invoice-pdfs bucket that are older than 72 hours
// (links expire after 48h; the 24h extra window avoids race conditions with
// in-flight downloads).

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const BUCKET = "invoice-pdfs";
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

Deno.serve(async (_req) => {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - MAX_AGE_MS);
    const toDelete: string[] = [];

    // Files are stored as `{boutiqueId}/{invoiceId}-{timestamp}.pdf`.
    // List top-level entries (folder prefixes + any root-level files).
    const { data: topLevel, error: topErr } = await sb.storage
      .from(BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    if (topErr) throw topErr;

    for (const entry of topLevel ?? []) {
      if (!entry.id) {
        // Folder prefix — list its contents
        const { data: files } = await sb.storage
          .from(BUCKET)
          .list(entry.name, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
        for (const file of files ?? []) {
          if (file.created_at && new Date(file.created_at) < cutoff) {
            toDelete.push(`${entry.name}/${file.name}`);
          }
        }
      } else if (entry.created_at && new Date(entry.created_at) < cutoff) {
        toDelete.push(entry.name);
      }
    }

    let deleted = 0;
    // Supabase Storage remove accepts up to 1000 paths per call
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const { error: delErr } = await sb.storage.from(BUCKET).remove(batch);
      if (delErr) {
        console.error("Batch delete error:", delErr.message);
      } else {
        deleted += batch.length;
      }
    }

    console.log(`invoice-pdfs cleanup: ${deleted} file(s) deleted, cutoff=${cutoff.toISOString()}`);
    return new Response(JSON.stringify({ ok: true, deleted, cutoff: cutoff.toISOString() }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
