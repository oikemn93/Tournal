import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync("src/lib/api.ts", "utf8");
const appSource = fs.readFileSync("src/app/App.tsx", "utf8");

assert.match(apiSource, /type ServerSessionValidation = "valid" \| "invalid" \| "unreachable"/, "auth validation must distinguish invalid credentials from an unreachable server");
assert.match(apiSource, /response\.status === 503[\s\S]*return "unreachable"/, "offline service-worker 503 must be treated as unreachable, not invalid");
assert.match(apiSource, /catch[\s\S]*return "unreachable"/, "network failures while validating auth must preserve an existing session");
assert.match(appSource, /validation === "invalid"[\s\S]*clearSession\(\)/, "only an explicitly invalid server session may clear local auth state");
assert.match(appSource, /validation === "unreachable"[\s\S]*Mode hors-ligne/, "active-session offline fallback must be explicit to the user");

console.log("Offline auth session contract OK: unreachable auth keeps the active session; only explicit invalidation logs out.");
