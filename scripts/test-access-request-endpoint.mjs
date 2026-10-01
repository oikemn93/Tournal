import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const source = readFileSync(
  "supabase/functions/submit-access-request/handler.ts",
  "utf8",
)
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const { createHandler } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
)
const config = {
  url: "https://db.example",
  serviceKey: "server-only-test-key",
  turnstileSecret: "test-secret",
  origins: ["https://tournal.example"],
}
const valid = {
  nom: "Prospect fictif",
  societe: "",
  telephone: "77 123 45 67",
  type_activite: "Tissus",
  message: "",
  website: "",
  token: "fresh-token",
}
const req = (body = valid, origin = "https://tournal.example") =>
  new Request("https://edge.example", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
let calls = []
let verification = {
  success: true,
  hostname: "tournal.example",
  action: "access_request",
}
let dbStatus = 200
const fakeFetch = async (url, options) => {
  calls.push({ url, body: JSON.parse(options.body), headers: options.headers })
  return new Response(
    JSON.stringify(
      url.includes("siteverify")
        ? verification
        : { received: true, private_account_details: "must-never-leak" },
    ),
    { status: url.includes("siteverify") ? 200 : dbStatus },
  )
}
const handler = createHandler(config, fakeFetch)
let response = await handler(req())
assert.equal(response.status, 200)
assert.deepEqual(await response.json(), { received: true })
assert.equal(calls.length, 2)
assert.equal(calls[1].body.p_telephone, valid.telephone)
assert.equal(calls[1].headers.Authorization, `Bearer ${config.serviceKey}`)
assert.equal(
  response.headers.get("Access-Control-Allow-Origin"),
  config.origins[0],
)
for (const [field, value] of [
  ["nom", "x"],
  ["telephone", "bad"],
  ["telephone", "123"],
  ["message", "x".repeat(1001)],
  ["type_activite", ""],
  ["token", "x".repeat(2049)],
  ["societe", false],
]) {
  calls = []
  assert.equal(
    (await handler(req({ ...valid, [field]: value }))).status,
    400,
    field,
  )
  assert.equal(calls.length, 0)
}
calls = []
response = await handler(req({ ...valid, website: "spam" }))
assert.deepEqual(await response.json(), { received: true })
assert.equal(calls.length, 0)
calls = []
assert.equal((await handler(req(valid, "https://evil.example"))).status, 403)
assert.equal(calls.length, 0)
assert.equal(
  (await createHandler({ ...config, turnstileSecret: "" }, fakeFetch)(req()))
    .status,
  503,
)
for (const result of [
  { ...verification, success: false },
  { ...verification, hostname: "evil.example" },
  { ...verification, action: "login" },
]) {
  verification = result
  calls = []
  assert.equal((await handler(req())).status, 400)
  assert.equal(calls.length, 1)
}
verification = {
  success: true,
  hostname: "tournal.example",
  action: "access_request",
}
// Provider-issued tokens are single-use: a replay must never reach the DB.
let used = false
const singleUse = createHandler(config, async (url, options) => {
  if (url.includes("siteverify")) {
    const success = !used
    used = true
    return new Response(JSON.stringify({ ...verification, success }))
  }
  return fakeFetch(url, options)
})
calls = []
assert.equal((await singleUse(req())).status, 200)
assert.equal((await singleUse(req())).status, 400)
assert.equal(calls.length, 1)
// Existing account / duplicate / quota all get the same public answer from DB RPC.
for (let i = 0; i < 3; i++)
  assert.deepEqual(await (await handler(req())).json(), { received: true })
dbStatus = 500
response = await handler(req())
assert.equal(response.status, 503)
assert(!JSON.stringify(await response.json()).includes("private_account"))
const failing = createHandler(config, async () => {
  throw new Error("private network error")
})
assert.equal((await failing(req())).status, 503)
assert.equal(
  (
    await handler(
      new Request("https://edge.example", {
        method: "OPTIONS",
        headers: { Origin: config.origins[0] },
      }),
    )
  ).status,
  204,
)
assert.equal(
  (await handler(req({ ...valid, message: "x".repeat(9000) }))).status,
  400,
)
console.log(
  "access_request_endpoint_ok: validation, captcha hostname/action/replay, honeypot, fail closed, generic response, bounded payload, no PII leakage",
)
