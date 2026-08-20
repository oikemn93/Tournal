from pathlib import Path

path = Path('src/app/App.tsx')
s = path.read_text()


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    s = s.replace(old, new, 1)

# 1) Reuse the existing authenticated bootstrap without browser reloads.
replace_once(
'''  useEffect(() => {\n    async function load() {\n''',
'''  const refreshAuthenticatedFlow = useCallback(async () => {\n''',
'auth bootstrap start')
replace_once(
'''\n    }\n    load();\n  }, []);\n\n  // Prevent accidental value changes when scrolling over a focused number input.\n''',
'''\n  }, []);\n\n  useEffect(() => { void refreshAuthenticatedFlow(); }, [refreshAuthenticatedFlow]);\n\n  // Prevent accidental value changes when scrolling over a focused number input.\n''',
'auth bootstrap end')

replace_once(
'''  if (screen==="login") return <LoginScreen onAuthenticated={() => window.location.reload()}/>;\n  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={() => window.location.reload()}/>;\n  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={() => window.location.reload()}/>;\n''',
'''  if (screen==="login") return <LoginScreen onAuthenticated={() => void refreshAuthenticatedFlow()}/>;\n  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={() => void refreshAuthenticatedFlow()}/>;\n  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={() => void refreshAuthenticatedFlow()}/>;\n''',
'auth screen callbacks')

# 2) Password login: better focus/autocomplete/mobile keyboard and clearer loading state.
replace_once(
'''  const [loading, setLoading] = useState(false);\n  const [attempts, setAttempts] = useState(0);\n''',
'''  const [loading, setLoading] = useState(false);\n  const passwordRef = useRef<HTMLInputElement>(null);\n  const [attempts, setAttempts] = useState(0);\n''',
'login password ref')
replace_once(
'''        <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={phone} onChange={e=>{const v=e.target.value;setPhone(v.startsWith("+221 ")?v:"+221 ");setErr("");}} placeholder="+221 77 000 0000" type="tel" disabled={isLocked} className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&login()}/></div>\n''',
'''        <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={phone} onChange={e=>{const v=e.target.value;setPhone(v.startsWith("+221 ")?v:"+221 ");setErr("");}} placeholder="+221 77 000 0000" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" disabled={isLocked||loading} className={inputCls+" pl-11"} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();passwordRef.current?.focus();}}}/></div>\n''',
'login phone input')
replace_once(
'''        <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="••••••••••••" type={show?"text":"password"} disabled={isLocked} className={inputCls+" pl-11 pr-12"} onKeyDown={e=>e.key==="Enter"&&login()}/><button onClick={()=>setShow(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{show?<EyeOff size={18} className="text-muted-foreground"/>:<Eye size={18} className="text-muted-foreground"/>}</button></div>\n''',
'''        <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input ref={passwordRef} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="••••••••••••" type={show?"text":"password"} autoComplete="current-password" enterKeyHint="go" disabled={isLocked||loading} className={inputCls+" pl-11 pr-12"} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void login();}}}/><button type="button" aria-label={show?"Masquer le mot de passe":"Afficher le mot de passe"} onClick={()=>setShow(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{show?<EyeOff size={18} className="text-muted-foreground"/>:<Eye size={18} className="text-muted-foreground"/>}</button></div>\n''',
'login password input')
replace_once(
'''      <button onClick={login} disabled={loading||isLocked} className="w-full py-4 rounded-2xl text-base font-black active:scale-95 disabled:opacity-60" style={{background:"#C9A227",color:"#fff",fontFamily:"'Nunito', sans-serif"}}>{loading?"Veuillez patienter…":isLocked?"Connexion bloquée":"Se connecter →"}</button>\n''',
'''      <button onClick={()=>void login()} disabled={loading||isLocked||!pwd} className="w-full py-4 rounded-2xl text-base font-black active:scale-95 disabled:opacity-60 transition-all" style={{background:"#C9A227",color:"#fff",fontFamily:"'Nunito', sans-serif"}}>{loading?"Vérification du compte…":isLocked?"Connexion bloquée":"Se connecter →"}</button>\n''',
'login submit button')

# 3) Lock screen gets dedicated PIN state, local errors, numeric input and automatic submit at digit 6.
replace_once(
'''  const [lockPin,          setLockPin]          = useState("");\n  const [moreOpen,         setMoreOpen]         = useState(false);\n''',
'''  const [lockPin,          setLockPin]          = useState("");\n  const [lockBusy,         setLockBusy]         = useState(false);\n  const [lockError,        setLockError]        = useState("");\n  const [moreOpen,         setMoreOpen]         = useState(false);\n''',
'lock states')

old_unlock = '''    const unlock = async () => {\n      if (!/^\\d{6}$/.test(lockPin)) { toast.error("Entrez votre PIN à 6 chiffres"); return; }\n      try {\n        const result = await verifyQuickPin(lockPin, activeBoutiqueId);\n        setLockPin("");\n        if (result.ok) {\n          try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}\n          setLocked(false);\n          return;\n        }\n        if (!result.configured) { setLocked(false); setScreen("pin-setup"); return; }\n        if (result.lockedUntil) { toast.error("PIN temporairement bloqué. Utilisez Changer de compte pour vous reconnecter avec votre mot de passe."); return; }\n        toast.error(`PIN incorrect${typeof result.attemptsRemaining === "number" ? ` · ${result.attemptsRemaining} essai(s) restant(s)` : ""}`);\n      } catch (e) { toast.error(e instanceof Error ? e.message : "Vérification du PIN impossible"); }\n    };\n'''
new_unlock = '''    const unlock = async (pinValue = lockPin) => {\n      if (lockBusy) return;\n      if (!/^\\d{6}$/.test(pinValue)) { setLockError("Entrez votre PIN à 6 chiffres."); return; }\n      setLockBusy(true);\n      setLockError("");\n      try {\n        const result = await verifyQuickPin(pinValue, activeBoutiqueId);\n        if (result.ok) {\n          setLockPin("");\n          try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}\n          setLocked(false);\n          return;\n        }\n        if (!result.configured) { setLockPin(""); setLocked(false); setScreen("pin-setup"); return; }\n        setLockPin("");\n        if (result.lockedUntil) { setLockError("PIN temporairement bloqué. Reconnectez-vous avec votre mot de passe."); return; }\n        setLockError(`PIN incorrect${typeof result.attemptsRemaining === "number" ? ` · ${result.attemptsRemaining} essai(s) restant(s)` : ""}`);\n      } catch (e) {\n        setLockError(e instanceof Error ? e.message : "Vérification du PIN impossible");\n      } finally {\n        setLockBusy(false);\n      }\n    };\n'''
replace_once(old_unlock, new_unlock, 'unlock function')

old_overlay = '''          <div className="text-center">\n            <p className="text-white font-black text-xl" style={{ fontFamily:"'Nunito', sans-serif" }}>{currentUser.nom}</p>\n            <p className="text-sm mt-1" style={{ color:"rgba(255,255,255,0.5)" }}>Session verrouillée · Entrez votre mot de passe</p>\n          </div>\n          <div className="w-full relative">\n            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(255,255,255,0.4)" }}/>\n            <input type="password" value={lockPin} onChange={e=>setLockPin(e.target.value)}\n              onKeyDown={e=>e.key==="Enter"&&unlock()}\n              placeholder="Mot de passe" autoFocus\n              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-sm font-semibold outline-none"\n              style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", color:"#fff", caretColor:"#fff" }}/>\n          </div>\n          <button onClick={unlock} className="w-full py-3.5 rounded-2xl font-black text-sm" style={{ background:currentUser.color, color:"#fff" }}>\n            Déverrouiller\n          </button>\n          <button onClick={()=>{setLocked(false);setLockPin("");handleLogout();}} className="text-xs" style={{ color:"rgba(255,255,255,0.35)" }}>\n            Changer de compte\n          </button>\n'''
new_overlay = '''          <div className="text-center">\n            <p className="text-white font-black text-xl" style={{ fontFamily:"'Nunito', sans-serif" }}>{currentUser.nom}</p>\n            <p className="text-sm mt-1" style={{ color:"rgba(255,255,255,0.55)" }}>Session verrouillée · Saisissez votre PIN rapide</p>\n          </div>\n          <div className="flex items-center gap-2" aria-hidden="true">\n            {Array.from({length:6}).map((_,i)=><span key={i} className="w-2.5 h-2.5 rounded-full transition-all" style={{ background:i<lockPin.length?currentUser.color:"rgba(255,255,255,0.18)", transform:i<lockPin.length?"scale(1.08)":"scale(1)" }}/>) }\n          </div>\n          <div className="w-full relative">\n            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(255,255,255,0.4)" }}/>\n            <input type="password" value={lockPin}\n              onChange={e=>{\n                const next=e.target.value.replace(/\\D/g,"").slice(0,6);\n                setLockPin(next); setLockError("");\n                if(next.length===6&&!lockBusy) setTimeout(()=>void unlock(next),0);\n              }}\n              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void unlock();}}}\n              placeholder="PIN à 6 chiffres" autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" enterKeyHint="done"\n              disabled={lockBusy}\n              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-center text-lg font-black tracking-[0.3em] outline-none disabled:opacity-60"\n              style={{ background:"rgba(255,255,255,0.1)", border:`1px solid ${lockError?"rgba(239,68,68,0.65)":"rgba(255,255,255,0.15)"}`, color:"#fff", caretColor:"#fff" }}/>\n          </div>\n          {lockError&&<div role="alert" className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-center" style={{background:"rgba(239,68,68,0.12)",color:"#fca5a5"}}>{lockError}</div>}\n          <button onClick={()=>void unlock()} disabled={lockBusy||lockPin.length!==6} className="w-full py-3.5 rounded-2xl font-black text-sm disabled:opacity-55 transition-all" style={{ background:currentUser.color, color:"#fff" }}>\n            {lockBusy?"Vérification…":"Déverrouiller"}\n          </button>\n          <button onClick={()=>{setLocked(false);setLockPin("");setLockError("");handleLogout();}} disabled={lockBusy} className="text-xs font-bold" style={{ color:"rgba(255,255,255,0.48)" }}>\n            Utiliser mon mot de passe / Changer de compte\n          </button>\n'''
replace_once(old_overlay, new_overlay, 'lock overlay')

path.write_text(s)
print('auth UX patch applied')
