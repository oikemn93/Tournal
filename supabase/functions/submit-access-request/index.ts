import { createHandler } from "./handler.ts"
Deno.serve(
  createHandler({
    url: Deno.env.get("SUPABASE_URL") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    turnstileSecret: Deno.env.get("TURNSTILE_SECRET_KEY") || "",
    emailSecret: Deno.env.get("ACCESS_EMAIL_SECRET") || "",
    emailDispatcherUrl: `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/access-request-email`,
    origins: (Deno.env.get("ACCESS_REQUEST_ALLOWED_ORIGINS") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  }),
)
