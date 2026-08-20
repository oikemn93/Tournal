import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: config, error: configError } = await admin.rpc("get_internal_push_config");
    if (configError || !config) return json({ error: "Push configuration unavailable" }, 503);

    const provided = req.headers.get("x-tournal-push-secret") ?? "";
    const expected = String(config.dispatchSecret ?? "");
    if (!provided || !expected || !constantTimeEqual(provided, expected)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = Number(body?.notificationId);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return json({ error: "Invalid notification" }, 400);
    }

    const { data: notification, error: notificationError } = await admin
      .from("notifications")
      .select("id,user_id,boutique_id,category,title,body,icon,action_tab")
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationError || !notification) return json({ error: "Notification not found" }, 404);

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", notification.user_id)
      .eq("enabled", true);
    if (subscriptionsError) return json({ error: "Subscription lookup failed" }, 500);

    webpush.setVapidDetails(
      "https://tournal.vercel.app",
      String(config.publicKey),
      String(config.privateKey),
    );

    const tab = notification.action_tab ? `&tab=${encodeURIComponent(notification.action_tab)}` : "";
    const boutique = notification.boutique_id ? `&boutique=${encodeURIComponent(notification.boutique_id)}` : "";
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `tournal-${notification.id}`,
      data: {
        notificationId: notification.id,
        category: notification.category,
        url: `/?notification=${notification.id}${tab}${boutique}`,
      },
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").update({ enabled: false }).eq("id", sub.id);
          removed++;
        } else {
          failed++;
          console.error("web-push delivery failed", { statusCode, notificationId, subscriptionId: sub.id });
        }
      }
    }

    await admin.from("notifications").update({ push_dispatched_at: new Date().toISOString() }).eq("id", notificationId);
    return json({ ok: true, sent, removed, failed });
  } catch (error) {
    console.error("web-push-dispatch error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Internal error" }, 500);
  }
});
