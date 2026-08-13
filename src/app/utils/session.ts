import type { StoredSession, BoutiqueAssignment } from "../types";

export const SESSION_KEY = "tournal_session";
export const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12h

export function saveSession(userId: string, boutiqueId: string | null, assign: BoutiqueAssignment | null) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: Date.now() })); } catch {}
}
export function loadSession(): StoredSession | null {
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (!s) return null;
    const parsed: StoredSession = JSON.parse(s);
    if (parsed.loginAt && Date.now() - parsed.loginAt > SESSION_EXPIRY_MS) { localStorage.removeItem(SESSION_KEY); return null; }
    return parsed;
  } catch { return null; }
}
export function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }
