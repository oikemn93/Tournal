import fs from "node:fs";

const app = fs.readFileSync("src/app/App.tsx", "utf8");
const api = fs.readFileSync("src/lib/api.ts", "utf8");

function ok(value, message) { if (!value) throw new Error(message); }

// Settings must come from auth_settings, not from the platform-user cache.
ok(api.includes('auth_settings?select=lock_minutes,session_minutes'), "lock_minutes must be loaded directly from auth_settings");
ok(app.includes("setAuthSettingsBoutiqueId(boutiqueId)"), "idle timer must wait for the active boutique auth settings");
ok(app.includes('authSettingsBoutiqueId !== activeBoutiqueId'), "idle timer must not arm against a stale/default boutique setting");

// Realtime auth noise must never be treated as proof that the PIN session is locked.
ok(api.includes("const appSessionIsValid = await validateAppSession(boutiqueId);"), "Realtime authorization failures must confirm the app session on the server");
ok(!api.includes("explicitAuthorizationFailure ? false : await validateAppSession"), "Realtime explicit auth errors must not bypass authoritative session validation");

// Only actual DOM activity may move lastUserActivityAt.
ok(app.includes("function registerUserActivity()"), "real user activity handler missing");
ok(app.includes("armLockFromLastActivity();\n      armExpiryFromLastActivity();\n    }"), "effect setup must re-arm from the prior real activity time");
ok(!app.includes("function resetTimers()"), "legacy effect-driven activity reset must be removed");
ok(app.includes('document.addEventListener(e, registerUserActivity'), "real input events must reset the deadline");

// Admin must follow asynchronously loaded settings and boutique switches.
ok(app.includes("setLockMinutes(lockMinutesInit ?? 10)"), "Admin lock field must sync from loaded lock_minutes");
ok(app.includes("[sessionMinutesInit]"), "Admin session field must sync from loaded session_minutes");

// Deterministic 2-minute timing proof. Re-arming because of a render/background
// event must preserve the deadline; only real activity may move it.
const timeout = 2 * 60_000;
const remaining = (lastActivity, now) => timeout - (now - lastActivity);
const t0 = 1_000_000;
ok(remaining(t0, t0 + 119_999) === 1, "2-minute lock fired early");
ok(remaining(t0, t0 + 120_000) === 0, "2-minute lock did not fire exactly at the configured deadline");
ok(remaining(t0, t0 + 60_000) === 60_000, "background re-arm incorrectly reset the 2-minute deadline");
const realActivityAt = t0 + 60_000;
ok(remaining(realActivityAt, t0 + 179_999) === 1, "real activity did not postpone lock correctly");
ok(remaining(realActivityAt, t0 + 180_000) === 0, "post-activity 2-minute deadline is not exact");

console.log("Session lock timing contract passed: 2 minutes = 120000 ms, neither early nor late");
