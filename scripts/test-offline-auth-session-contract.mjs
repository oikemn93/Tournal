import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync("src/lib/api.ts", "utf8");
const appSource = fs.readFileSync("src/app/App.tsx", "utf8");
const pinSource = fs.readFileSync("src/lib/offlinePin.ts", "utf8");

assert.match(apiSource, /response\.status >= 500[\s\S]*return Boolean\(readSession\(\)\?\.access_token\)/, "auth 5xx/offline must preserve an existing active session");
assert.match(apiSource, /isJwtIssuedAtFutureError\(body\)[\s\S]*storeSession\(null\)[\s\S]*return false/, "explicit non-transient auth rejection must still invalidate the session");
assert.match(apiSource, /armOfflinePin\(pin, userId\)/, "successful PIN setup/verification must arm session-scoped offline unlock");
assert.match(apiSource, /isOfflineAvailabilityError\(error\)[\s\S]*verifyOfflinePin\(pin, userId\)/, "PIN verification must fall back locally only for availability failures");
assert.match(apiSource, /clearOfflinePin\(\)[\s\S]*storeSession\(null\)/, "logout must clear the local offline PIN verifier");
assert.match(pinSource, /sessionStorage\.setItem\(OFFLINE_PIN_KEY/, "offline PIN verifier must be session-scoped, not persisted in localStorage");
assert.doesNotMatch(pinSource, /localStorage\./, "offline PIN material must never use localStorage");
assert.match(pinSource, /PBKDF2_ITERATIONS = 250_000/, "offline PIN verifier must use a deliberately expensive KDF");
assert.match(pinSource, /OFFLINE_PIN_TTL_MS = 12 \* 60 \* 60 \* 1000/, "offline PIN authorization must expire after 12 hours");
assert.match(pinSource, /OFFLINE_PIN_MAX_ATTEMPTS = 5/, "offline PIN must rate-limit failed attempts");
assert.match(pinSource, /OFFLINE_PIN_LOCK_MS = 15 \* 60 \* 1000/, "offline PIN must locally lock after repeated failures");
assert.match(appSource, /verifyQuickPin\(pinValue, boutique\.id\)/, "lock screen must keep using the shared PIN verifier path");

console.log("Offline auth/PIN contract OK: active session survives outages; PIN fallback is session-scoped, KDF-protected, expiring, and rate-limited.");
