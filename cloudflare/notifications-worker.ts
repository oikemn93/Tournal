import { EmailMessage } from "cloudflare:email";
import { timingSafeEqual } from "node:crypto";

type AccessRequestJob = {
  id: string;
  lease: string;
  created_at: string;
  nom: string;
  societe: string | null;
  telephone: string | null;
  type_activite: string;
  message: string | null;
};

type Env = {
  ACCESS_EMAIL_SECRET: string;
  DELIVERY_ADDRESS: string;
  OUTBOX_URL: string;
  EMAIL: { send(message: EmailMessage): Promise<void> };
};

function buildMessage(job: AccessRequestJob, test = false) {
  const body = [
    test ? "Test de notification Tournal" : "Nouvelle demande d’accès à Tournal",
    "",
    `Nom : ${job.nom}`,
    `Boutique / société : ${job.societe || "Non précisée"}`,
    `Téléphone : ${job.telephone || "Non renseigné"}`,
    `Activité : ${job.type_activite}`,
    `Reçue le : ${job.created_at}`,
    "",
    "Message du demandeur :",
    job.message || "(Aucun message)",
    "",
    "Consulter et traiter les demandes : https://ops.tournal.org/",
    "",
    `Référence : ${job.id}`,
    "Ce message est une alerte automatique. Le traitement reste à effectuer dans Tournal Ops.",
  ].join("\n");

  const bytes = new TextEncoder().encode(body);
  const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
  const id = /^[a-f0-9-]{36}$/i.test(job.id) ? job.id : crypto.randomUUID();

  return [
    "From: Tournal <notifications@tournal.org>",
    `To: ${""}`,
    `Subject: ${test ? "[TEST] Tournal - notification des demandes" : "Tournal - Nouvelle demande d acces"}`,
    `Message-ID: <access-${id}@tournal.org>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encoded.match(/.{1,76}/g)?.join("\r\n") || "",
    "",
  ].join("\r\n");
}

async function runOutbox(
  url: string,
  secret: string,
  send: (job: AccessRequestJob) => Promise<void>,
  request: typeof fetch = fetch,
) {
  if (secret.length < 32) throw new Error("configuration");

  async function rpc(body: object) {
    const response = await request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("outbox_unavailable");
    return response.json();
  }

  const jobs = await rpc({ action: "claim" });
  if (!Array.isArray(jobs) || jobs.length > 5) throw new Error("invalid_batch");

  let sent = 0, failed = 0, unacknowledged = 0;
  for (const job of jobs as AccessRequestJob[]) {
    let success = false;
    try {
      await send(job);
      success = true;
    } catch {
      failed++;
    }

    try {
      const acknowledged = await rpc({ action: "complete", id: job.id, lease: job.lease, success });
      if (acknowledged !== true) unacknowledged++;
      else if (success) sent++;
    } catch {
      unacknowledged++;
    }
  }

  return { claimed: jobs.length, sent, failed, unacknowledged };
}

const sender = "notifications@tournal.org";

function authorized(req: Request, secret: string) {
  if (!secret || secret.length < 32) return false;
  const got = new TextEncoder().encode(req.headers.get("Authorization") || "");
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

async function send(env: Env, job: AccessRequestJob, test = false) {
  const raw = buildMessage(job, test).replace("To: \r\n", `To: ${env.DELIVERY_ADDRESS}\r\n`);
  await env.EMAIL.send(new EmailMessage(sender, env.DELIVERY_ADDRESS, raw));
}

async function run(env: Env) {
  const result = await runOutbox(env.OUTBOX_URL, env.ACCESS_EMAIL_SECRET, (job) => send(env, job));
  console.log(JSON.stringify({ event: "access_request_emails", ...result }));
  return result;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    await run(env);
  },
  async fetch(req: Request, env: Env) {
    if (req.method !== "POST") return new Response("Not found", { status: 404 });
    if (!authorized(req, env.ACCESS_EMAIL_SECRET)) return new Response("Unauthorized", { status: 401 });

    try {
      const path = new URL(req.url).pathname;
      if (path === "/run") return Response.json(await run(env));
      if (path === "/test") {
        await send(env, {
          id: crypto.randomUUID(),
          lease: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          nom: "Test de notification Tournal",
          societe: "Tournal",
          telephone: "",
          type_activite: "Test technique",
          message: "Ceci est un test de réception des alertes de demandes d’accès. Aucune demande réelle n’a été créée.",
        }, true);
        return Response.json({ accepted: true });
      }
      return new Response("Not found", { status: 404 });
    } catch {
      console.error(JSON.stringify({ event: "access_request_email_run_failed" }));
      return Response.json({ error: "delivery_failed" }, { status: 502 });
    }
  },
};
