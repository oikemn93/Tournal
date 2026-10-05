type Config = {
  url: string;
  serviceKey: string;
  secret: string;
  resendKey: string;
  emailTo: string[];
  emailFrom: string;
  opsUrl: string;
};

type EmailJob = {
  id: string;
  lease: string;
  created_at: string;
  nom: string;
  societe: string | null;
  telephone: string;
  type_activite: string;
  message: string | null;
};

async function authorized(req: Request, secret: string) {
  if (secret.length < 32) return false;
  const header = req.headers.get("Authorization") || "";
  if (header.length > 256) return false;
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [actual, expected] = await Promise.all([
    digest(header),
    digest(`Bearer ${secret}`),
  ]);
  const av = new Uint8Array(actual);
  const ev = new Uint8Array(expected);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ ev[i];
  return diff === 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function oneLine(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("body");
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        throw new Error("size");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}

async function rpc(
  config: Config,
  request: typeof fetch,
  name: string,
  args: object,
) {
  const response = await request(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("database");
  return response.json();
}

function renderEmail(job: EmailJob, opsUrl: string) {
  const company = oneLine(job.societe);
  const label = company || oneLine(job.nom) || "nouvelle demande";
  const subject = `Nouvelle demande Tournal — ${label}`.slice(0, 180);
  const message = oneLine(job.message);
  const created = new Date(job.created_at);
  const createdLabel = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

  const rows = [
    ["Nom", job.nom],
    ["Société", job.societe || "—"],
    ["Téléphone", job.telephone],
    ["Activité", job.type_activite],
    ["Reçue le", createdLabel || "—"],
  ]
    .map(
      ([key, value]) =>
        `<tr><td style="padding:7px 12px;color:#64748b;font-size:13px">${escapeHtml(key)}</td><td style="padding:7px 12px;font-weight:600;color:#0f172a">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px">
      <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Tournal Ops</div>
        <h1 style="font-size:22px;margin:8px 0 18px">Nouvelle demande d’accès</h1>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px">${rows}</table>
        ${
          message
            ? `<div style="margin-top:18px"><div style="font-size:13px;color:#64748b;margin-bottom:6px">Message</div><div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(job.message)}</div></div>`
            : ""
        }
        <div style="margin-top:24px">
          <a href="${escapeHtml(opsUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 16px;border-radius:9px;font-weight:700">Ouvrir Tournal Ops</a>
        </div>
      </div>
      <div style="font-size:12px;color:#94a3b8;margin-top:12px">Notification automatique — ne contient pas de mot de passe.</div>
    </div>
  </body>
</html>`;

  const text = [
    "Nouvelle demande d’accès Tournal",
    "",
    `Nom : ${job.nom}`,
    `Société : ${job.societe || "—"}`,
    `Téléphone : ${job.telephone}`,
    `Activité : ${job.type_activite}`,
    createdLabel ? `Reçue le : ${createdLabel}` : "",
    job.message ? `Message : ${job.message}` : "",
    "",
    `Ouvrir Tournal Ops : ${opsUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

async function sendJob(
  config: Config,
  request: typeof fetch,
  job: EmailJob,
) {
  const mail = renderEmail(job, config.opsUrl);
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `access-request/${job.id}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: config.emailTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  return response.ok;
}

export function createHandler(config: Config, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const reply = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });

    if (req.method !== "POST") return reply({ error: "method" }, 405);
    if (!(await authorized(req, config.secret)))
      return reply({ error: "unauthorized" }, 401);
    if (!config.url || !config.serviceKey)
      return reply({ error: "unavailable" }, 503);

    let body: Record<string, unknown>;
    try {
      body = await readBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply({ error: "body" }, 400);
    } catch {
      return reply({ error: "body" }, 400);
    }

    try {
      if (body.action === "claim") {
        return reply(await rpc(config, request, "access_email_claim", {}));
      }

      if (body.action === "complete") {
        const uuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (
          typeof body.id !== "string" ||
          !uuid.test(body.id) ||
          typeof body.lease !== "string" ||
          !uuid.test(body.lease) ||
          typeof body.success !== "boolean"
        )
          return reply({ error: "body" }, 400);
        return reply(
          await rpc(config, request, "access_email_complete", {
            p_id: body.id,
            p_lease: body.lease,
            p_success: body.success,
          }),
        );
      }

      if (body.action === "dispatch") {
        if (
          !config.resendKey ||
          config.emailTo.length === 0 ||
          !config.emailFrom
        )
          return reply({ error: "email_not_configured" }, 503);

        const claimed = await rpc(
          config,
          request,
          "access_email_claim",
          {},
        );
        const jobs = Array.isArray(claimed) ? (claimed as EmailJob[]) : [];
        let sent = 0;
        let failed = 0;

        for (const job of jobs) {
          let success = false;
          try {
            success = await sendJob(config, request, job);
          } catch {
            success = false;
          }

          try {
            await rpc(config, request, "access_email_complete", {
              p_id: job.id,
              p_lease: job.lease,
              p_success: success,
            });
          } catch {
            // A completion failure leaves the lease to expire. Resend's
            // idempotency key prevents duplicate sends during the retry window.
          }

          if (success) sent += 1;
          else failed += 1;
        }

        return reply({ processed: jobs.length, sent, failed });
      }

      return reply({ error: "action" }, 400);
    } catch {
      // Never log request bodies, applicant information, recipient addresses,
      // provider credentials, or service credentials.
      return reply({ error: "unavailable" }, 503);
    }
  };
}
