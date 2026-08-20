from pathlib import Path

p = Path('src/app/App.tsx')
s = p.read_text()

s = s.replace('const SESSION_KEY = "tournal_session";\n', 'const SESSION_KEY = "tournal_session";\nconst APP_LOCK_KEY = "tournal_app_locked";\n', 1)
s = s.replace('function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} }', 'function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(APP_LOCK_KEY); } catch {} }', 1)
s = s.replace('  const [locked,           setLocked]           = useState(false);', '  const [locked,           setLocked]           = useState(() => {\n    try { return sessionStorage.getItem(APP_LOCK_KEY) === "1"; } catch { return false; }\n  });', 1)
s = s.replace('      lockTimer.current   = setTimeout(() => setLocked(true), LOCK_TIMEOUT_MS);', '      lockTimer.current   = setTimeout(() => {\n        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}\n        setLocked(true);\n      }, LOCK_TIMEOUT_MS);', 1)
s = s.replace('      if (lockPin === currentUser.password) { setLocked(false); setLockPin(""); }', '      if (lockPin === currentUser.password) {\n        try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}\n        setLocked(false); setLockPin("");\n      }', 1)

required = [
    'const APP_LOCK_KEY = "tournal_app_locked";',
    'sessionStorage.getItem(APP_LOCK_KEY) === "1"',
    'sessionStorage.setItem(APP_LOCK_KEY, "1")',
    'sessionStorage.removeItem(APP_LOCK_KEY)',
]
for needle in required:
    if needle not in s:
        raise SystemExit(f'missing expected hardened lock fragment: {needle}')

p.write_text(s)
print('persistent idle lock hardened across browser refresh')
