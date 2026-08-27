from pathlib import Path

path = Path('src/app/App.tsx')
s = path.read_text()

old = 'const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 60 min idle session default'
new = 'const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12h idle session default; matches Admin and Supabase fallback'
if old not in s:
    raise RuntimeError('session default anchor missing')
s = s.replace(old, new, 1)

old = 'const APP_LOCK_KEY = "tournal_app_locked";\ntype StoredSession = { userId: string; boutiqueId: string | null; assignJson: string | null; loginAt?: number };'
new = 'const APP_LOCK_KEY = "tournal_app_locked";\nconst APP_LAST_ACTIVITY_KEY = "tournal_last_activity_at";\ntype StoredSession = { userId: string; boutiqueId: string | null; assignJson: string | null; loginAt?: number };'
if old not in s:
    raise RuntimeError('activity key anchor missing')
s = s.replace(old, new, 1)

old = 'function saveSession(userId: string, boutiqueId: string | null, assign: BoutiqueAssignment | null) {\n  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: Date.now() })); } catch {}\n}'
new = 'function saveSession(userId: string, boutiqueId: string | null, assign: BoutiqueAssignment | null) {\n  try {\n    const now = Date.now();\n    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: now }));\n    sessionStorage.setItem(APP_LAST_ACTIVITY_KEY, String(now));\n  } catch {}\n}'
if old not in s:
    raise RuntimeError('saveSession anchor missing')
s = s.replace(old, new, 1)

old = 'function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(APP_LOCK_KEY); } catch {} }'
new = 'function readLastActivityAt() {\n  try {\n    const value = Number(sessionStorage.getItem(APP_LAST_ACTIVITY_KEY));\n    return Number.isFinite(value) && value > 0 ? value : Date.now();\n  } catch { return Date.now(); }\n}\nfunction clearSession() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(APP_LOCK_KEY); sessionStorage.removeItem(APP_LAST_ACTIVITY_KEY); } catch {} }'
if old not in s:
    raise RuntimeError('clearSession anchor missing')
s = s.replace(old, new, 1)

old = '  const lastUserActivityAt = useRef(Date.now());'
new = '  const lastUserActivityAt = useRef(readLastActivityAt());'
if old not in s:
    raise RuntimeError('last activity ref anchor missing')
s = s.replace(old, new, 1)

old = '  const sessMinutes = Math.max(5, Math.round(sessValue * (sessUnit === "min" ? 1 : sessUnit === "h" ? 60 : 1440)));'
new = '  const sessMinutes = Math.max(lockMinutes, 5, Math.round(sessValue * (sessUnit === "min" ? 1 : sessUnit === "h" ? 60 : 1440)));'
if old not in s:
    raise RuntimeError('session minutes anchor missing')
s = s.replace(old, new, 1)

old = '''  useEffect(() => {\n    if (screen !== "app" || !appSessionReady) return;\n    function resetTimers() {\n      const now = Date.now();\n      if (now - lastUserActivityAt.current >= sessionExpiryMs) {\n        endSessionForInactivity();\n        return;\n      }\n      lastUserActivityAt.current = now;\n      if (lockTimer.current)   clearTimeout(lockTimer.current);\n      if (logoutTimer.current) clearTimeout(logoutTimer.current);\n      lockTimer.current   = setTimeout(() => {\n        const bid = activeBoutiqueIdRef.current;\n        if (bid) void lockAppSession(bid).catch(() => undefined);\n        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}\n        setLocked(true);\n      }, LOCK_TIMEOUT_MS);\n      logoutTimer.current = setTimeout(() => {\n        endSessionForInactivity();\n      }, sessionExpiryMs);\n      // A live user refreshes the server-side gate at most once per minute.\n      // No interval runs in the background, so inactivity can still expire.\n      if (!locked && now - appSessionHeartbeatAt.current >= 60_000) void renewAppSession();\n    }\n    const events = ["mousemove", "pointerdown", "keydown", "touchstart", "click", "input", "change", "focusin", "wheel"];\n    events.forEach(e => document.addEventListener(e, resetTimers, { passive: true }));\n    document.addEventListener("scroll", resetTimers, { passive: true, capture: true });\n    resetTimers();\n    return () => {\n      if (lockTimer.current)   clearTimeout(lockTimer.current);\n      if (logoutTimer.current) clearTimeout(logoutTimer.current);\n      events.forEach(e => document.removeEventListener(e, resetTimers));\n      document.removeEventListener("scroll", resetTimers, true);\n    };\n  }, [appSessionReady, endSessionForInactivity, lockTimeoutMs, locked, renewAppSession, screen, sessionExpiryMs]);'''
new = '''  useEffect(() => {\n    if (screen !== "app" || !appSessionReady) return;\n    const events = ["mousemove", "pointerdown", "keydown", "touchstart", "click", "input", "change", "focusin", "wheel"];\n\n    function armExpiryFromLastActivity() {\n      const elapsed = Date.now() - lastUserActivityAt.current;\n      const remaining = sessionExpiryMs - elapsed;\n      if (logoutTimer.current) clearTimeout(logoutTimer.current);\n      if (remaining <= 0) {\n        endSessionForInactivity();\n        return false;\n      }\n      logoutTimer.current = setTimeout(() => endSessionForInactivity(), remaining);\n      return true;\n    }\n\n    function resetTimers() {\n      if (locked) return; // PIN-screen interactions must never extend the business idle session.\n      const now = Date.now();\n      if (now - lastUserActivityAt.current >= sessionExpiryMs) {\n        endSessionForInactivity();\n        return;\n      }\n      lastUserActivityAt.current = now;\n      try { sessionStorage.setItem(APP_LAST_ACTIVITY_KEY, String(now)); } catch {}\n      if (lockTimer.current) clearTimeout(lockTimer.current);\n      lockTimer.current = setTimeout(() => {\n        const bid = activeBoutiqueIdRef.current;\n        if (bid) void lockAppSession(bid).catch(() => undefined);\n        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}\n        setLocked(true);\n      }, LOCK_TIMEOUT_MS);\n      armExpiryFromLastActivity();\n      // A live user refreshes the server-side gate at most once per minute.\n      // No interval runs in the background, so inactivity can still expire.\n      if (now - appSessionHeartbeatAt.current >= 60_000) void renewAppSession();\n    }\n\n    if (locked) {\n      // Preserve the original idle deadline while the PIN screen is displayed.\n      armExpiryFromLastActivity();\n    } else {\n      events.forEach(e => document.addEventListener(e, resetTimers, { passive: true }));\n      document.addEventListener("scroll", resetTimers, { passive: true, capture: true });\n      resetTimers();\n    }\n\n    return () => {\n      if (lockTimer.current) clearTimeout(lockTimer.current);\n      if (logoutTimer.current) clearTimeout(logoutTimer.current);\n      events.forEach(e => document.removeEventListener(e, resetTimers));\n      document.removeEventListener("scroll", resetTimers, true);\n    };\n  }, [appSessionReady, endSessionForInactivity, lockTimeoutMs, locked, renewAppSession, screen, sessionExpiryMs]);'''
if old not in s:
    raise RuntimeError('timer effect anchor missing')
s = s.replace(old, new, 1)

# Make the relationship explicit in Admin UX.
old = '<div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Expiration de session</p><p className="text-xs text-muted-foreground mt-0.5">Durée maximale d\'inactivité avant une reconnexion complète</p></div>'
new = '<div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Expiration de session</p><p className="text-xs text-muted-foreground mt-0.5">Durée maximale d\'inactivité avant une reconnexion complète. Elle ne peut pas être inférieure au délai de verrouillage.</p></div>'
if old not in s:
    raise RuntimeError('admin copy anchor missing')
s = s.replace(old, new, 1)

path.write_text(s)
