import fs from "node:fs";

const apiPath = "src/lib/api.ts";
const testPath = "scripts/test-offline-auth-session-contract.mjs";

let api = fs.readFileSync(apiPath, "utf8");

if (!api.includes('from "./offlinePin"')) {
  api = api.replace(
    'import { createClient as createSupabaseClient } from "@supabase/supabase-js";\n',
    'import { createClient as createSupabaseClient } from "@supabase/supabase-js";\nimport { armOfflinePin, clearOfflinePin, isOfflineAvailabilityError, verifyOfflinePin } from "./offlinePin";\n',
  );
}

const setPinBefore = `export async function setQuickPin(pin: string) {\n  if (!/^\\d{6}$/.test(pin)) throw new Error("Le PIN doit contenir exactement 6 chiffres");\n  return dataRequest<void>(\n    "rpc/set_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },\n  );\n}`;
const setPinAfter = `export async function setQuickPin(pin: string) {\n  if (!/^\\d{6}$/.test(pin)) throw new Error("Le PIN doit contenir exactement 6 chiffres");\n  await dataRequest<void>(\n    "rpc/set_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },\n  );\n  const userId = getCurrentAuthUser()?.id;\n  if (userId) await armOfflinePin(pin, userId);\n}`;
if (!api.includes(setPinAfter)) {
  if (!api.includes(setPinBefore)) throw new Error("setQuickPin target not found");
  api = api.replace(setPinBefore, setPinAfter);
}

const verifyBefore = `export async function verifyQuickPin(pin: string, boutiqueId: string) {\n  if (!/^\\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0, lockedUntil:null, sessionExpired:false } as const;\n  return dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null; sessionExpired?:boolean }>(\n    "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin, p_boutique_id:boutiqueId }) },\n  );\n}`;
const verifyAfter = `export async function verifyQuickPin(pin: string, boutiqueId: string) {\n  if (!/^\\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0, lockedUntil:null, sessionExpired:false } as const;\n  const userId = getCurrentAuthUser()?.id;\n  try {\n    const result = await dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null; sessionExpired?:boolean }>(\n      "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin, p_boutique_id:boutiqueId }) },\n    );\n    if (result.ok && userId) await armOfflinePin(pin, userId);\n    return result;\n  } catch (error) {\n    if (!userId || !isOfflineAvailabilityError(error)) throw error;\n    const local = await verifyOfflinePin(pin, userId);\n    if (!local.configured || local.expired) {\n      throw new Error("Déverrouillage hors ligne indisponible ou expiré. Reconnectez-vous une fois à Internet et validez votre PIN pour réactiver l’accès hors ligne sur cet appareil.");\n    }\n    return {\n      ok:local.ok,\n      configured:true,\n      attemptsRemaining:local.attemptsRemaining,\n      lockedUntil:local.lockedUntil ?? null,\n      sessionExpired:false,\n      offline:true,\n    };\n  }\n}`;
if (!api.includes(verifyAfter)) {
  if (!api.includes(verifyBefore)) throw new Error("verifyQuickPin target not found");
  api = api.replace(verifyBefore, verifyAfter);
}

const signOutBefore = `  } finally {\n    storeSession(null);\n  }\n}\n\nexport function getCurrentAuthUser`;
const signOutAfter = `  } finally {\n    clearOfflinePin();\n    storeSession(null);\n  }\n}\n\nexport function getCurrentAuthUser`;
if (!api.includes(signOutAfter)) {
  if (!api.includes(signOutBefore)) throw new Error("signOut target not found");
  api = api.replace(signOutBefore, signOutAfter);
}

fs.writeFileSync(apiPath, api);

const test = `import assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst apiSource = fs.readFileSync("src/lib/api.ts", "utf8");\nconst appSource = fs.readFileSync("src/app/App.tsx", "utf8");\nconst pinSource = fs.readFileSync("src/lib/offlinePin.ts", "utf8");\n\nassert.match(apiSource, /response\\.status >= 500[\\s\\S]*return Boolean\\(readSession\\(\\)\\?\\.access_token\\)/, "auth 5xx/offline must preserve an existing active session");\nassert.match(apiSource, /isJwtIssuedAtFutureError\\(body\\)[\\s\\S]*storeSession\\(null\\)[\\s\\S]*return false/, "explicit non-transient auth rejection must still invalidate the session");\nassert.match(apiSource, /armOfflinePin\\(pin, userId\\)/, "successful PIN setup/verification must arm session-scoped offline unlock");\nassert.match(apiSource, /isOfflineAvailabilityError\\(error\\)[\\s\\S]*verifyOfflinePin\\(pin, userId\\)/, "PIN verification must fall back locally only for availability failures");\nassert.match(apiSource, /clearOfflinePin\\(\\)[\\s\\S]*storeSession\\(null\\)/, "logout must clear the local offline PIN verifier");\nassert.match(pinSource, /sessionStorage\\.setItem\\(OFFLINE_PIN_KEY/, "offline PIN verifier must be session-scoped, not persisted in localStorage");\nassert.doesNotMatch(pinSource, /localStorage\\./, "offline PIN material must never use localStorage");\nassert.match(pinSource, /PBKDF2_ITERATIONS = 250_000/, "offline PIN verifier must use a deliberately expensive KDF");\nassert.match(pinSource, /OFFLINE_PIN_TTL_MS = 12 \\* 60 \\* 60 \\* 1000/, "offline PIN authorization must expire after 12 hours");\nassert.match(pinSource, /OFFLINE_PIN_MAX_ATTEMPTS = 5/, "offline PIN must rate-limit failed attempts");\nassert.match(pinSource, /OFFLINE_PIN_LOCK_MS = 15 \\* 60 \\* 1000/, "offline PIN must locally lock after repeated failures");\nassert.match(appSource, /verifyQuickPin\\(pinValue, boutique\\.id\\)/, "lock screen must keep using the shared PIN verifier path");\n\nconsole.log("Offline auth/PIN contract OK: active session survives outages; PIN fallback is session-scoped, KDF-protected, expiring, and rate-limited.");\n`;
fs.writeFileSync(testPath, test);

console.log("Applied offline PIN Phase 1 integration.");
// trigger: app-only retry
