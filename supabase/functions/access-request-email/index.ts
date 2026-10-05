import { createHandler } from "./handler.ts";

Deno.serve(
  createHandler({
    url: Deno.env.get("SUPABASE_URL") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    secret: Deno.env.get("ACCESS_EMAIL_SECRET") || "",
    resendKey: Deno.env.get("RESEND_API_KEY") || "",
    emailTo: (Deno.env.get("ACCESS_REQUEST_EMAIL_TO") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    emailFrom:
      Deno.env.get("ACCESS_REQUEST_EMAIL_FROM") ||
      "Tournal <notifications@tournal.org>",
    opsUrl: Deno.env.get("ACCESS_REQUEST_OPS_URL") || "https://ops.tournal.org",
  }),
);
