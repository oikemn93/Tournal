type Config = {
  url: string
  serviceKey: string
  turnstileSecret: string
  origins: string[]
}
const received = { received: true }
const invalid = { error: "Vérifiez les champs du formulaire." }
async function readBody(req: Request) {
  const reader = req.body?.getReader()
  if (!reader) throw new Error("body")
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) {
        await reader.cancel()
        throw new Error("size")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function createHandler(config: Config, request: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("Origin") || ""
    const allowed = config.origins.includes(origin)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    }
    if (allowed)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "content-type, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      })
    const reply = (body: object, status = 200) =>
      new Response(JSON.stringify(body), { status, headers })
    if (!allowed) return reply({ error: "Origine non autorisée." }, 403)
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers })
    if (req.method !== "POST")
      return reply({ error: "Méthode non autorisée." }, 405)
    if (!config.url || !config.serviceKey || !config.turnstileSecret)
      return reply({ error: "Service momentanément indisponible." }, 503)
    if (
      !req.headers
        .get("Content-Type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return reply(invalid, 400)
    let body: Record<string, unknown>
    try {
      body = await readBody(req)
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply(invalid, 400)
    } catch {
      return reply(invalid, 400)
    }
    // A filled trap returns the same public confirmation without touching the DB.
    if (typeof body.website !== "string") return reply(invalid, 400)
    if (body.website) return reply(received)
    const validText = (key: string, min: number, max: number) =>
      typeof body[key] === "string" &&
      (body[key] as string).trim().length >= min &&
      (body[key] as string).length <= max
    if (
      !validText("nom", 2, 100) ||
      !validText("societe", 0, 120) ||
      !validText("type_activite", 2, 80) ||
      !validText("message", 0, 1000) ||
      !validText("telephone", 1, 32)
    )
      return reply(invalid, 400)
    const phone = body.telephone as string
    let digits = phone.replace(/[^0-9]/g, "")
    if (digits.startsWith("00")) digits = digits.slice(2)
    if (digits.length === 9) digits = "221" + digits
    if (!/^\+?[0-9 ()-]+$/.test(phone) || !/^[1-9][0-9]{7,14}$/.test(digits))
      return reply(invalid, 400)
    if (!validText("token", 1, 2048))
      return reply({ error: "Recommencez la vérification anti-spam." }, 400)
    try {
      const verified = await request(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: config.turnstileSecret,
            response: body.token,
          }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!verified.ok)
        return reply({ error: "Vérification momentanément indisponible." }, 503)
      const result = await verified.json()
      if (
        result.success !== true ||
        result.action !== "access_request" ||
        result.hostname !== new URL(origin).hostname
      )
        return reply({ error: "Recommencez la vérification anti-spam." }, 400)
      const submitted = await request(
        `${config.url}/rest/v1/rpc/submit_access_request`,
        {
          method: "POST",
          headers: {
            apikey: config.serviceKey,
            Authorization: `Bearer ${config.serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_nom: body.nom,
            p_societe: body.societe,
            p_telephone: phone,
            p_type_activite: body.type_activite,
            p_message: body.message,
          }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!submitted.ok)
        return reply({ error: "Envoi indisponible. Réessayez plus tard." }, 503)
      // No database response, account existence, PII or captcha token is logged or returned.
      return reply(received)
    } catch {
      return reply({ error: "Envoi indisponible. Réessayez plus tard." }, 503)
    }
  }
}
