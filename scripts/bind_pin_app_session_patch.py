from pathlib import Path

APP=Path('src/app/App.tsx')
API=Path('src/lib/api.ts')

s=API.read_text()
s=s.replace(
'''export async function verifyQuickPin(pin: string) {\n  if (!/^\\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0 } as const;\n  return dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null }>(\n    "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },\n  );\n}\n''',
'''export async function verifyQuickPin(pin: string, boutiqueId: string) {\n  if (!/^\\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0 } as const;\n  return dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null }>(\n    "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin, p_boutique_id:boutiqueId }) },\n  );\n}\n\nexport async function lockAppSession(boutiqueId: string) {\n  return dataRequest<void>("rpc/lock_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) });\n}\n''',1)
if 'export async function lockAppSession' not in s: raise SystemExit('api session binding patch failed')
API.write_text(s)

s=APP.read_text()
s=s.replace(
'changeOwnPassword, getPinStatus, setQuickPin, verifyQuickPin, signOut as signOutFromSupabase,',
'changeOwnPassword, getPinStatus, setQuickPin, verifyQuickPin, startAppSession, lockAppSession, signOut as signOutFromSupabase,',1)

s=s.replace(
'const result = await verifyQuickPin(lockPin);',
'const result = await verifyQuickPin(lockPin, activeBoutiqueId);',1)

# Mark server app session locked when the UI lock fires.
old='''      lockTimer.current   = setTimeout(() => {\n        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}\n        setLocked(true);\n      }, LOCK_TIMEOUT_MS);'''
new='''      lockTimer.current   = setTimeout(() => {\n        const bid = activeBoutiqueIdRef.current;\n        if (bid) void lockAppSession(bid).catch(() => undefined);\n        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}\n        setLocked(true);\n      }, LOCK_TIMEOUT_MS);'''
if old not in s: raise SystemExit('lock timer anchor missing')
s=s.replace(old,new,1)

# Every app entry establishes a server-side app session. If the same Auth session
# is already locked, start_app_session preserves locked_at; a fresh password login
# has a new auth session_id and can establish a fresh unlocked app session.
anchor='''  useEffect(() => {\n    if (screen !== "app") return;\n    function resetTimers() {'''
effect='''  useEffect(() => {\n    if (screen !== "app" || !activeBoutiqueId) return;\n    void startAppSession(activeBoutiqueId).catch((error) => {\n      console.warn("Impossible d’ouvrir la session applicative", error);\n    });\n  }, [screen, activeBoutiqueId]);\n\n  useEffect(() => {\n    if (screen !== "app") return;\n    function resetTimers() {'''
if anchor not in s: raise SystemExit('session start effect anchor missing')
s=s.replace(anchor,effect,1)

required=['startAppSession, lockAppSession','verifyQuickPin(lockPin, activeBoutiqueId)','void lockAppSession(bid)','Impossible d’ouvrir la session applicative']
for needle in required:
    if needle not in s: raise SystemExit(f'missing app-session binding: {needle}')
APP.write_text(s)
print('PIN bound to server app session in frontend source')
