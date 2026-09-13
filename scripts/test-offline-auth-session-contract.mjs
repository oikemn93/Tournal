import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync("src/lib/api.ts", "utf8");
const appSource = fs.readFileSync("src/app/App.tsx", "utf8");

assert.match(apiSource, /response\.status >= 500[\s\S]*return Boolean\(readSession\(\)\?\.access_token\)/, "auth 5xx/offline must preserve an existing active session");
assert.match(apiSource, /isJwtIssuedAtFutureError\(body\)[\s\S]*storeSession\(null\)[\s\S]*return false/, "explicit non-transient auth rejection must still invalidate the session");
assert.match(apiSource, /catch[\s\S]*return Boolean\(readSession\(\)\?\.access_token\)/, "real network exceptions must preserve an existing active session");
assert.match(appSource, /if \(!await validateServerSession\(\)\)[\s\S]*clearSession\(\)/, "the app may clear auth only when server validation explicitly returns false");

console.log("Offline auth session contract OK: active sessions survive auth 5xx/network loss; explicit invalidation still logs out.");
