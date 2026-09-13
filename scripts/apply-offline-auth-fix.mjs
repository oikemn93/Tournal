import fs from "node:fs";

const apiPath = "src/lib/api.ts";
const testPath = "scripts/test-offline-auth-session-contract.mjs";

let apiSource = fs.readFileSync(apiPath, "utf8");
const before = `    if (!response.ok) {\n      // Do not discard a brand-new local session merely because a second\n      // Supabase service is momentarily behind the Auth server's clock.\n      if (isJwtIssuedAtFutureError(body)) return true;\n      storeSession(null);\n      return false;\n    }`;
const after = `    if (!response.ok) {\n      // A network outage is surfaced by the service worker as a controlled 503.\n      // Server 5xx responses are availability failures, not proof that the\n      // locally-held authenticated session is invalid. Keep the active session\n      // so Phase 1 can continue queuing safe offline POS operations.\n      if (response.status >= 500) return Boolean(readSession()?.access_token);\n      // Do not discard a brand-new local session merely because a second\n      // Supabase service is momentarily behind the Auth server's clock.\n      if (isJwtIssuedAtFutureError(body)) return true;\n      storeSession(null);\n      return false;\n    }`;

if (!apiSource.includes(after)) {
  if (!apiSource.includes(before)) throw new Error("validateServerSession target block not found");
  apiSource = apiSource.replace(before, after);
  fs.writeFileSync(apiPath, apiSource);
}

fs.writeFileSync(testPath, `import assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst apiSource = fs.readFileSync("src/lib/api.ts", "utf8");\nconst appSource = fs.readFileSync("src/app/App.tsx", "utf8");\n\nassert.match(apiSource, /response\\.status >= 500[\\s\\S]*return Boolean\\(readSession\\(\\)\\?\\.access_token\\)/, "auth 5xx/offline must preserve an existing active session");\nassert.match(apiSource, /isJwtIssuedAtFutureError\\(body\\)[\\s\\S]*storeSession\\(null\\)[\\s\\S]*return false/, "explicit non-transient auth rejection must still invalidate the session");\nassert.match(apiSource, /catch[\\s\\S]*return Boolean\\(readSession\\(\\)\\?\\.access_token\\)/, "real network exceptions must preserve an existing active session");\nassert.match(appSource, /if \\(!await validateServerSession\\(\\)\\)[\\s\\S]*clearSession\\(\\)/, "the app may clear auth only when server validation explicitly returns false");\n\nconsole.log("Offline auth session contract OK: active sessions survive auth 5xx/network loss; explicit invalidation still logs out.");\n`);

console.log("Applied targeted offline active-session auth fix.");
