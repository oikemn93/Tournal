from pathlib import Path

APP = Path('src/app/App.tsx')
API = Path('src/lib/api.ts')
EDGE = Path('supabase/functions/admin-provision/index.ts')

# ---- api.ts ---------------------------------------------------------------
s = API.read_text()
s = s.replace(
'''export async function changeOwnPassword(password: string) {\n  if (!/^\\d{6}$/.test(password)) throw new Error("Utilisez un code à 6 chiffres");''',
'''export async function changeOwnPassword(password: string) {\n  if (password.length < 12) throw new Error("Utilisez un mot de passe d’au moins 12 caractères");''', 1)
s = s.replace(
'''export async function signUpWithPhone(phone: string, password: string, fullName: string) {\n  if (!/^\\d{6}$/.test(password)) throw new Error("Utilisez un code à 6 chiffres");''',
'''export async function signUpWithPhone(phone: string, password: string, fullName: string) {\n  if (password.length < 12) throw new Error("Utilisez un mot de passe d’au moins 12 caractères");''', 1)
anchor = '''export async function validateAppSession(boutiqueId: string) {\n  return dataRequest<boolean>("rpc/validate_app_session", { method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }) });\n}\n'''
addition = anchor + '''\nexport async function getPinStatus() {\n  return dataRequest<{ configured:boolean; lockedUntil?:string|null }>(\n    "rpc/get_pin_status", { method:"POST", body:JSON.stringify({}) },\n  );\n}\n\nexport async function setQuickPin(pin: string) {\n  if (!/^\\d{6}$/.test(pin)) throw new Error("Le PIN doit contenir exactement 6 chiffres");\n  return dataRequest<void>(\n    "rpc/set_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },\n  );\n}\n\nexport async function verifyQuickPin(pin: string) {\n  if (!/^\\d{6}$/.test(pin)) return { ok:false, configured:true, attemptsRemaining:0 } as const;\n  return dataRequest<{ ok:boolean; configured:boolean; attemptsRemaining?:number; lockedUntil?:string|null }>(\n    "rpc/verify_quick_pin", { method:"POST", body:JSON.stringify({ p_pin:pin }) },\n  );\n}\n\nexport async function resetUserQuickPin(userId: string) {\n  return dataRequest<void>(\n    "rpc/reset_user_quick_pin", { method:"POST", body:JSON.stringify({ p_user_id:userId }) },\n  );\n}\n'''
if anchor not in s: raise SystemExit('api pin anchor missing')
s = s.replace(anchor, addition, 1)
API.write_text(s)

# ---- App.tsx --------------------------------------------------------------
s = APP.read_text()
s = s.replace(
'getCurrentAuthUser, hasAuthenticatedSession, validateServerSession, signInWithPhone, changeOwnPassword, signOut as signOutFromSupabase,',
'getCurrentAuthUser, hasAuthenticatedSession, validateServerSession, signInWithPhone, changeOwnPassword, getPinStatus, setQuickPin, verifyQuickPin, signOut as signOutFromSupabase,', 1)
s = s.replace(
'type Screen     = "login" | "password-change" | "superadmin" | "boutique-select" | "app";',
'type Screen     = "login" | "password-change" | "pin-setup" | "superadmin" | "boutique-select" | "app";', 1)

login_start = s.index('function LoginScreen(')
pwd_start = s.index('function RequiredPasswordChangeScreen(', login_start)
new_login = r'''function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [phone, setPhone] = useState("+221 ");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(() => {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LOGIN_LOCK_KEY) : null;
    const ts = raw ? Number(raw) : 0;
    return ts > Date.now() ? ts : 0;
  });
  const [now, setNow] = useState(Date.now());
  const isLocked = lockedUntil > now;
  const remainingSec = Math.max(0, Math.ceil((lockedUntil-now)/1000));
  useEffect(()=>{
    if (!isLocked) return;
    const id = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(id);
  },[isLocked]);

  async function login() {
    if (isLocked || loading) return;
    if (!phone.trim() || !pwd) { setErr("Numéro de téléphone et mot de passe requis."); return; }
    setLoading(true);
    try {
      await signInWithPhone(phone, pwd);
      setErr(""); setAttempts(0); setLockedUntil(0);
      if (typeof localStorage !== "undefined") localStorage.removeItem(LOGIN_LOCK_KEY);
      onAuthenticated();
    } catch (error) {
      const next = attempts + 1;
      setAttempts(next); setPwd("");
      if (next >= LOGIN_MAX_ATTEMPTS) {
        const until = Date.now() + LOGIN_LOCK_MS;
        setLockedUntil(until);
        if (typeof localStorage !== "undefined") localStorage.setItem(LOGIN_LOCK_KEY, String(until));
        setErr(`Trop de tentatives. Connexion bloquée pendant ${Math.round(LOGIN_LOCK_MS/60000)} minutes.`);
      } else {
        const left = LOGIN_MAX_ATTEMPTS-next;
        setErr((error instanceof Error ? error.message : "Identifiants incorrects") + ` · ${left} tentative${left>1?"s":""} restante${left>1?"s":""}`);
      }
    } finally { setLoading(false); }
  }

  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><ShieldCheck size={32} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Connexion Tournal</h1><p className="text-sm text-muted-foreground mt-2">Utilisez votre mot de passe. Le PIN sert uniquement au déverrouillage rapide d’une session déjà ouverte.</p></div>
      <div><label className="text-xs font-black mb-2 block tracking-wider" style={{color:"#C9A227"}}>NUMÉRO DE TÉLÉPHONE</label>
        <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={phone} onChange={e=>{const v=e.target.value;setPhone(v.startsWith("+221 ")?v:"+221 ");setErr("");}} placeholder="+221 77 000 0000" type="tel" disabled={isLocked} className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
      </div>
      <div><label className="text-xs font-black mb-2 block tracking-wider" style={{color:"#C9A227"}}>MOT DE PASSE</label>
        <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="••••••••••••" type={show?"text":"password"} disabled={isLocked} className={inputCls+" pl-11 pr-12"} onKeyDown={e=>e.key==="Enter"&&login()}/><button onClick={()=>setShow(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{show?<EyeOff size={18} className="text-muted-foreground"/>:<Eye size={18} className="text-muted-foreground"/>}</button></div>
      </div>
      {err&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{background:"#ef444415"}}><X size={14} style={{color:"#ef4444"}}/><p className="text-sm font-semibold" style={{color:"#ef4444"}}>{err}</p></div>}
      {isLocked&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{background:"#ef444415"}}><Lock size={14} style={{color:"#ef4444"}}/><p className="text-sm font-semibold" style={{color:"#ef4444"}}>Réessayez dans {Math.floor(remainingSec/60)}:{String(remainingSec%60).padStart(2,"0")}</p></div>}
      <button onClick={login} disabled={loading||isLocked} className="w-full py-4 rounded-2xl text-base font-black active:scale-95 disabled:opacity-60" style={{background:"#C9A227",color:"#fff",fontFamily:"'Nunito', sans-serif"}}>{loading?"Veuillez patienter…":isLocked?"Connexion bloquée":"Se connecter →"}</button>
    </div>
  </div>;
}

'''
s = s[:login_start] + new_login + s[pwd_start:]

pwd_start = s.index('function RequiredPasswordChangeScreen(')
admin_marker = s.index('// ─── SCREEN: SUPER ADMIN', pwd_start)
new_activation = r'''function RequiredPasswordChangeScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (password.length < 12) { setError("Le mot de passe doit comporter au moins 12 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    try { await changeOwnPassword(password); onComplete(); }
    catch (e) { setError(e instanceof Error ? e.message : "Modification impossible"); }
    finally { setLoading(false); }
  }

  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><ShieldCheck size={32} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Créez votre mot de passe</h1><p className="text-sm text-muted-foreground mt-2">Le mot de passe transmis lors de la création du compte est temporaire. Remplacez-le avant de configurer votre PIN rapide.</p></div>
      <Field label="NOUVEAU MOT DE PASSE (12 CARACTÈRES MIN.)" color="#C9A227"><input value={password} onChange={e=>{setPassword(e.target.value);setError("");}} type={show?"text":"password"} className={inputCls} autoComplete="new-password" autoFocus/></Field>
      <Field label="CONFIRMER LE MOT DE PASSE" color="#C9A227"><input value={confirm} onChange={e=>{setConfirm(e.target.value);setError("");}} type={show?"text":"password"} className={inputCls} autoComplete="new-password" onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Afficher le mot de passe</label>
      {error&&<div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{background:"#ef444415",color:"#ef4444"}}>{error}</div>}
      <SubmitBtn label={loading?"Modification…":"Enregistrer le mot de passe"} onClick={submit} disabled={loading}/>
    </div>
  </div>;
}

function PinSetupScreen({ onComplete }: { onComplete: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const onlyDigits = (v:string)=>v.replace(/\D/g,"").slice(0,6);
  async function submit() {
    if (!/^\d{6}$/.test(pin)) { setError("Le PIN doit comporter exactement 6 chiffres."); return; }
    if (pin !== confirm) { setError("Les deux PIN ne correspondent pas."); return; }
    setLoading(true);
    try { await setQuickPin(pin); onComplete(); }
    catch(e) { setError(e instanceof Error ? e.message : "Configuration du PIN impossible"); }
    finally { setLoading(false); }
  }
  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><Lock size={30} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Créez votre PIN rapide</h1><p className="text-sm text-muted-foreground mt-2">Choisissez 6 chiffres faciles à retenir pour déverrouiller rapidement cette session. Ce PIN ne remplace pas votre mot de passe.</p></div>
      <Field label="PIN (6 CHIFFRES)" color="#C9A227"><input value={pin} onChange={e=>{setPin(onlyDigits(e.target.value));setError("");}} type="password" inputMode="numeric" maxLength={6} className={inputCls+" text-center tracking-[0.5em] text-xl font-black"} autoFocus/></Field>
      <Field label="CONFIRMER LE PIN" color="#C9A227"><input value={confirm} onChange={e=>{setConfirm(onlyDigits(e.target.value));setError("");}} type="password" inputMode="numeric" maxLength={6} className={inputCls+" text-center tracking-[0.5em] text-xl font-black"} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      {error&&<div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{background:"#ef444415",color:"#ef4444"}}>{error}</div>}
      <SubmitBtn label={loading?"Configuration…":"Activer mon PIN"} onClick={submit} disabled={loading}/>
    </div>
  </div>;
}

'''
s = s[:pwd_start] + new_activation + s[admin_marker:]

bootstrap = '''            if (u.mustChangePassword) { setScreen("password-change"); return; }\n            if (u.isSuperAdmin) { setScreen("superadmin"); return; }'''
bootstrap_new = '''            if (u.mustChangePassword) { setScreen("password-change"); return; }\n            const pinState = await getPinStatus().catch(() => ({ configured:false }));\n            if (!pinState.configured) { setScreen("pin-setup"); return; }\n            if (u.isSuperAdmin) { setScreen("superadmin"); return; }'''
if bootstrap not in s: raise SystemExit('bootstrap anchor missing')
s = s.replace(bootstrap, bootstrap_new, 1)

render = '''  if (screen==="login") return <LoginScreen onAuthenticated={() => window.location.reload()}/>;\n  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={() => window.location.reload()}/>;'''
render_new = render + '''\n  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={() => window.location.reload()}/>;'''
if render not in s: raise SystemExit('render anchor missing')
s = s.replace(render, render_new, 1)

old_unlock = '''    const unlock = () => {\n      if (lockPin === currentUser.password) {\n        try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}\n        setLocked(false); setLockPin("");\n      }\n      else { toast.error("Code incorrect"); setLockPin(""); }\n    };'''
new_unlock = '''    const unlock = async () => {\n      if (!/^\\d{6}$/.test(lockPin)) { toast.error("Entrez votre PIN à 6 chiffres"); return; }\n      try {\n        const result = await verifyQuickPin(lockPin);\n        setLockPin("");\n        if (result.ok) {\n          try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}\n          setLocked(false);\n          return;\n        }\n        if (!result.configured) { setLocked(false); setScreen("pin-setup"); return; }\n        if (result.lockedUntil) { toast.error("PIN temporairement bloqué. Utilisez Changer de compte pour vous reconnecter avec votre mot de passe."); return; }\n        toast.error(`PIN incorrect${typeof result.attemptsRemaining === "number" ? ` · ${result.attemptsRemaining} essai(s) restant(s)` : ""}`);\n      } catch (e) { toast.error(e instanceof Error ? e.message : "Vérification du PIN impossible"); }\n    };'''
if old_unlock not in s: raise SystemExit('unlock anchor missing')
s = s.replace(old_unlock, new_unlock, 1)
APP.write_text(s)

# ---- admin-provision ------------------------------------------------------
s = EDGE.read_text()
s = s.replace('const pinOk=(v:unknown)=>/^\\d{6}$/.test(String(v??""));', 'const passwordOk=(v:unknown)=>String(v??"").length>=12;', 1)
s = s.replace('if(cp.must_change_password)return reply({error:"Changement de PIN requis"},403);', 'if(cp.must_change_password)return reply({error:"Changement de mot de passe requis"},403);', 1)
s = s.replace('if(o.is_suspended||o.must_change_password)return reply({error:"Le propriétaire doit avoir un compte actif et un PIN validé"},400);', 'if(o.is_suspended)return reply({error:"Le propriétaire doit avoir un compte actif"},400);', 1)
s = s.replace('if(!phone||!fullName||!pinOk(password))return reply({error:"Nom, téléphone et PIN à 6 chiffres requis"},400);', 'if(!phone||!fullName||!passwordOk(password))return reply({error:"Nom, téléphone et mot de passe temporaire d’au moins 12 caractères requis"},400);', 1)
s = s.replace('must_change_password:false', 'must_change_password:true', 1)
s = s.replace('if(!userId||!pinOk(password))return reply({error:"Utilisateur et PIN à 6 chiffres requis"},400);', 'if(!userId||!passwordOk(password))return reply({error:"Utilisateur et mot de passe temporaire d’au moins 12 caractères requis"},400);', 1)
s = s.replace('if(t.is_suspended||t.must_change_password)return reply({error:"Le compte doit être actif et son PIN validé avant affectation"},400);', 'if(t.is_suspended)return reply({error:"Le compte doit être actif avant affectation"},400);', 1)
for bad in ['pinOk(password)', 'PIN à 6 chiffres requis', 'PIN validé avant affectation']:
    if bad in s: raise SystemExit(f'legacy edge pin-password coupling remains: {bad}')
EDGE.write_text(s)

# sanity
app = APP.read_text(); api = API.read_text(); edge = EDGE.read_text()
required = [
  ('app pin setup', 'function PinSetupScreen', app),
  ('app pin verify', 'await verifyQuickPin(lockPin)', app),
  ('app password login', 'MOT DE PASSE', app),
  ('api status', 'export async function getPinStatus()', api),
  ('api pin verify', 'export async function verifyQuickPin', api),
  ('edge strong password', 'const passwordOk=', edge),
  ('edge pending activation', 'must_change_password:true', edge),
]
for name, needle, text in required:
    if needle not in text: raise SystemExit(f'missing {name}: {needle}')
print('password/PIN separation patch applied')
