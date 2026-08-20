from pathlib import Path
import re

api_path = Path('src/lib/api.ts')
app_path = Path('src/app/App.tsx')
api = api_path.read_text()
app = app_path.read_text()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

# --- API: lightweight auth/bootstrap metadata ---
bootstrap_api = r'''
export async function getAuthBootstrap() {
  const authUser = getCurrentAuthUser();
  if (!authUser?.id) throw new Error("Connexion requise");
  const uid = encodeURIComponent(authUser.id);
  const [users, assignments, boutiques, groupes] = await Promise.all([
    dataRequest<Array<any>>(`platform_users?select=id,phone,nom,initials,color,is_super_admin,is_suspended,suspension_reason,suspended_at,group_id,is_compte_mere,must_change_password&id=eq.${uid}&limit=1`),
    dataRequest<Array<any>>(`boutique_assignments?select=boutique_id,user_id,role,droits&user_id=eq.${uid}`),
    dataRequest<Array<any>>("boutiques?select=id,nom,ville,color,initials,logo_url,adresse,email,tel&order=nom.asc"),
    dataRequest<Array<{ id:string; nom:string }>>("groupes?select=id,nom&order=nom.asc"),
  ]);
  const row = users[0];
  if (!row) return null;
  const toRole = (role: string) => role === "owner" ? "Propriétaire" : role === "manager" ? "Manager" : "Vendeur";
  return {
    user: {
      id: row.id,
      phone: row.phone,
      password: "",
      nom: row.nom,
      initials: row.initials,
      color: row.color,
      isSuperAdmin: row.is_super_admin === true,
      isSuspended: row.is_suspended === true,
      suspensionReason: row.suspension_reason ?? undefined,
      suspendedAt: row.suspended_at ?? undefined,
      groupeId: row.group_id ?? undefined,
      isCompteMere: row.is_compte_mere ?? undefined,
      mustChangePassword: row.must_change_password === true,
      assignments: assignments.map((a) => ({ boutiqueId:a.boutique_id, role:toRole(a.role), droits:a.droits ?? {} })),
    },
    boutiques: boutiques.map((b) => ({
      id:b.id,
      nom:b.nom,
      ville:b.ville ?? "",
      color:b.color ?? "#C9A227",
      initials:b.initials ?? (b.nom ?? "?").split(/\s+/).map((x:string)=>x[0]).join("").slice(0,2).toUpperCase(),
      logo:b.logo_url ?? undefined,
      adresse:b.adresse ?? undefined,
      email:b.email ?? undefined,
      tel:b.tel ?? undefined,
      products:[], entries:[], suppliers:[], clients:[], invoices:[], auditLog:[], charges:[], categories:[], productParams:[], caisseHistory:[],
    })),
    groupes,
  };
}

'''
api = replace_once(
    api,
    '/** Reads the compatibility state while the screens are progressively moved to relational tables. */\nexport async function getData<T>(key: string): Promise<T | null> {',
    bootstrap_api + '/** Reads the compatibility state while the screens are progressively moved to relational tables. */\nexport async function getData<T>(key: string): Promise<T | null> {',
    'insert auth bootstrap API',
)

old_head = '''  if (key === "boutiques") {\n    // Compatibility projection: legacy screens still consume a Boutique object,\n    // but its data now comes exclusively from the relational source of truth.\n    const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, charges, sessions, users, auditLogs] = await Promise.all([\n      dataRequest<any[]>("boutiques?select=*&order=nom.asc"),\n      dataRequest<any[]>("categories?select=*"), dataRequest<any[]>("products?select=*"),\n      dataRequestAll<any>("stock_entries?select=*"), dataRequest<any[]>("clients?select=*"),\n      dataRequest<any[]>("suppliers?select=*"),\n      dataRequest<any[]>("invoices?select=*,invoice_lines(*)"),\n      dataRequest<any[]>("invoice_payments?select=*&order=paid_at.asc"), dataRequest<any[]>("charges?select=*"),\n      dataRequest<any[]>("caisse_sessions?select=*"),\n      dataRequest<any[]>("platform_users?select=id,nom,initials,color"),\n      dataRequest<any[]>("audit_log?select=*&order=created_at.desc"),\n    ]);\n'''
new_head = '''  const targetedBoutiqueId = key.startsWith("boutique:") ? key.slice("boutique:".length) : null;\n  if (key === "boutiques" || targetedBoutiqueId) {\n    // Compatibility projection: callers can request all visible boutiques or one\n    // targeted boutique. Login and Realtime use the targeted path so business\n    // payloads never block the authentication shell.\n    const bid = targetedBoutiqueId ? encodeURIComponent(targetedBoutiqueId) : null;\n    const boutiqueFilter = bid ? `&id=eq.${bid}` : "";\n    const scoped = (column = "boutique_id") => bid ? `&${column}=eq.${bid}` : "";\n    const [boutiques, categories, products, entries, clients, suppliers, invoices, payments, charges, sessions, users, auditLogs] = await Promise.all([\n      dataRequest<any[]>(`boutiques?select=*${boutiqueFilter}&order=nom.asc`),\n      dataRequest<any[]>(`categories?select=*${scoped()}`), dataRequest<any[]>(`products?select=*${scoped()}`),\n      dataRequestAll<any>(`stock_entries?select=*${scoped()}`), dataRequest<any[]>(`clients?select=*${scoped()}`),\n      dataRequest<any[]>(`suppliers?select=*${scoped()}`),\n      dataRequest<any[]>(`invoices?select=*,invoice_lines(*)${scoped()}`),\n      dataRequest<any[]>(`invoice_payments?select=*${scoped()}&order=paid_at.asc`), dataRequest<any[]>(`charges?select=*${scoped()}`),\n      dataRequest<any[]>(`caisse_sessions?select=*${scoped()}`),\n      dataRequest<any[]>("platform_users?select=id,nom,initials,color"),\n      dataRequest<any[]>(`audit_log?select=*${scoped()}&order=created_at.desc`),\n    ]);\n'''
api = replace_once(api, old_head, new_head, 'target boutique getData')

# --- APP imports + loading state ---
app = replace_once(
    app,
    'getCurrentAuthUser, hasAuthenticatedSession, validateServerSession, signInWithPhone,',
    'getCurrentAuthUser, hasAuthenticatedSession, validateServerSession, getAuthBootstrap, signInWithPhone,',
    'import getAuthBootstrap',
)
app = replace_once(
    app,
    '  const [activeAssign,     setActiveAssign]     = useState<BoutiqueAssignment|null>(null);\n',
    '  const [activeAssign,     setActiveAssign]     = useState<BoutiqueAssignment|null>(null);\n  const [businessLoading,  setBusinessLoading]  = useState(false);\n',
    'business loading state',
)

# Target pullRemote instead of reading every boutique business table.
old_pull = '''      const [remoteB, remoteU, remoteG] = await Promise.all([\n        getData<Boutique[]>("boutiques"),\n        getData<PlatformUser[]>("platform_users"),\n        getData<Groupe[]>("groupes"),\n      ]);\n'''
new_pull = '''      const bid = activeBoutiqueIdRef.current;\n      const [remoteB, remoteU, remoteG] = await Promise.all([\n        bid ? getData<Boutique[]>(`boutique:${bid}`) : Promise.resolve(null),\n        getData<PlatformUser[]>("platform_users"),\n        getData<Groupe[]>("groupes"),\n      ]);\n'''
app = replace_once(app, old_pull, new_pull, 'target pullRemote')
old_set = '''          setBoutiques(freshBoutiques);\n          checkRecurringCharges(freshBoutiques);\n'''
new_set = '''          if (bid && freshBoutiques[0]) {\n            setBoutiques(prev => prev.some(b=>b.id===bid)\n              ? prev.map(b=>b.id===bid?freshBoutiques[0]:b)\n              : [...prev, freshBoutiques[0]]);\n          } else {\n            setBoutiques(freshBoutiques);\n          }\n          checkRecurringCharges(freshBoutiques);\n'''
app = replace_once(app, old_set, new_set, 'merge targeted pull')

# Insert dedicated background hydration before auth bootstrap.
hydrate = r'''
  const hydrateBoutique = useCallback(async (boutiqueId: string) => {
    setBusinessLoading(true);
    try {
      const [remoteB, remoteU, remoteG] = await Promise.all([
        getData<Boutique[]>(`boutique:${boutiqueId}`),
        getData<PlatformUser[]>("platform_users"),
        getData<Groupe[]>("groupes"),
      ]);
      if (remoteB?.[0]) {
        const hydrated = remoteB[0];
        lastRemoteB.current = JSON.stringify(remoteB);
        setBoutiques(prev => prev.some(b=>b.id===boutiqueId)
          ? prev.map(b=>b.id===boutiqueId?hydrated:b)
          : [...prev, hydrated]);
        checkRecurringCharges(remoteB);
      }
      if (remoteU?.length) {
        lastRemoteU.current = JSON.stringify(remoteU);
        setPlatformUsers(remoteU);
      }
      if (remoteG?.length) setGroupes(remoteG);
      setLastSyncAt(Date.now());
      void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));
    } catch (error) {
      setBackendOk(false);
      toast.error("Données boutique indisponibles : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
    } finally {
      setBusinessLoading(false);
    }
  }, []);

'''
app = replace_once(app, '  const refreshAuthenticatedFlow = useCallback(async () => {\n', hydrate + '  const refreshAuthenticatedFlow = useCallback(async () => {\n', 'insert hydrator')

# Replace heavy auth bootstrap with lightweight phase.
pattern = re.compile(r'  const refreshAuthenticatedFlow = useCallback\(async \(\) => \{.*?\n  \}, \[\]\);\n\n  useEffect\(\(\) => \{ void refreshAuthenticatedFlow\(\); \}, \[refreshAuthenticatedFlow\]\);', re.S)
match = pattern.search(app)
if not match:
    raise SystemExit('refreshAuthenticatedFlow block not found')
new_refresh = r'''  const refreshAuthenticatedFlow = useCallback(async () => {
    if (!hasAuthenticatedSession()) {
      setSynced(true);
      setScreen("login");
      return;
    }
    if (!await validateServerSession()) {
      clearSession();
      setCurrentUser(null);
      setSynced(true);
      setScreen("login");
      return;
    }
    try {
      const bootstrap = await getAuthBootstrap();
      if (!bootstrap?.user) throw new Error("Profil utilisateur introuvable");
      const user = bootstrap.user as PlatformUser;
      const shellBoutiques = bootstrap.boutiques as Boutique[];
      setCurrentUser(user);
      setPlatformUsers([user]);
      setBoutiques(shellBoutiques);
      setGroupes((bootstrap.groupes ?? []) as Groupe[]);
      setSynced(true);

      if (user.isSuspended) {
        await signOutFromSupabase(); clearSession(); setCurrentUser(null); setScreen("login");
        toast.error("Compte suspendu — contactez l’administrateur Tournal");
        return;
      }
      if (user.mustChangePassword) { setScreen("password-change"); return; }
      const pinState = await getPinStatus().catch(() => ({ configured:false }));
      if (!pinState.configured) { setScreen("pin-setup"); return; }

      // The global admin shell needs account metadata, never all boutique business data.
      if (user.isSuperAdmin) {
        setScreen("superadmin");
        setTimeout(() => { void Promise.all([
          getData<PlatformUser[]>("platform_users"), getData<Groupe[]>("groupes"),
        ]).then(([users, groups]) => {
          if (users?.length) setPlatformUsers(users);
          if (groups?.length) setGroupes(groups);
          void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));
        }).catch(()=>undefined); }, 0);
        return;
      }

      const assignments = user.assignments.filter(a => shellBoutiques.some(b => b.id === a.boutiqueId));
      const rememberedId = loadSession()?.boutiqueId ?? null;
      const remembered = rememberedId ? assignments.find(a=>a.boutiqueId===rememberedId) : undefined;
      const selected = remembered ?? (assignments.length === 1 ? assignments[0] : undefined);
      if (selected) {
        activeBoutiqueIdRef.current = selected.boutiqueId;
        setActiveBoutiqueId(selected.boutiqueId);
        setActiveAssign(selected);
        setTab("dashboard");
        saveSession(user.id, selected.boutiqueId, selected);
        setBusinessLoading(true);
        setScreen("app");
        void loadAuthSettings(selected.boutiqueId);
        setTimeout(() => { void hydrateBoutique(selected.boutiqueId); }, 0);
        return;
      }
      saveSession(user.id, null, null);
      setScreen("boutique-select");
    } catch (error) {
      setSynced(true);
      setBackendOk(false);
      toast.error("Connexion impossible : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
    }
  }, [hydrateBoutique]);

  useEffect(() => { void refreshAuthenticatedFlow(); }, [refreshAuthenticatedFlow]);'''
app = app[:match.start()] + new_refresh + app[match.end():]

# Entering a boutique displays shell immediately, then hydrates targeted data.
old_select = '''  function handleSelectBoutique(b: Boutique, assignment: BoutiqueAssignment) {\n    setActiveBoutiqueId(b.id); setActiveAssign(assignment); setTab("dashboard"); setScreen("app");\n    if (currentUser) {\n      saveSession(currentUser.id, b.id, assignment);\n      logTech(b.id, { level:"info", cat:"session", msg:`Connexion : ${currentUser.nom}`, detail: assignment.role });\n    }\n  }\n'''
new_select = '''  function handleSelectBoutique(b: Boutique, assignment: BoutiqueAssignment) {\n    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assignment); setTab("dashboard"); setBusinessLoading(true); setScreen("app");\n    void loadAuthSettings(b.id);\n    setTimeout(()=>{ void hydrateBoutique(b.id); },0);\n    if (currentUser) {\n      saveSession(currentUser.id, b.id, assignment);\n      logTech(b.id, { level:"info", cat:"session", msg:`Connexion : ${currentUser.nom}`, detail: assignment.role });\n    }\n  }\n'''
app = replace_once(app, old_select, new_select, 'select boutique hydrate')
old_admin = '''  function handleEnterBoutiqueAsAdmin(b: Boutique) {\n    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true } };\n    setActiveBoutiqueId(b.id); setActiveAssign(assign); setTab("dashboard"); setScreen("app");\n    if (currentUser) saveSession(currentUser.id, b.id, assign);\n  }\n'''
new_admin = '''  function handleEnterBoutiqueAsAdmin(b: Boutique) {\n    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true } };\n    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assign); setTab("dashboard"); setBusinessLoading(true); setScreen("app");\n    void loadAuthSettings(b.id);\n    setTimeout(()=>{ void hydrateBoutique(b.id); },0);\n    if (currentUser) saveSession(currentUser.id, b.id, assign);\n  }\n'''
app = replace_once(app, old_admin, new_admin, 'admin boutique hydrate')

# Realtime starts after initial targeted hydration.
app = replace_once(
    app,
    '    if (!synced || !hasAuthenticatedSession()) return;\n',
    '    if (!synced || businessLoading || !hasAuthenticatedSession()) return;\n',
    'defer realtime while loading',
)
app = replace_once(
    app,
    '  }, [synced, pullRemote, activeBoutiqueId]);\n',
    '  }, [synced, pullRemote, activeBoutiqueId, businessLoading]);\n',
    'realtime loading dependency',
)

# Keep the app chrome visible while targeted business data hydrates.
app = replace_once(
    app,
    '<div className="bg-background text-foreground h-screen flex flex-col overflow-hidden" style={{ fontFamily:"\'Inter\', sans-serif" }}>\n',
    '<div className="bg-background text-foreground h-screen flex flex-col overflow-hidden relative" style={{ fontFamily:"\'Inter\', sans-serif" }}>\n',
    'relative app shell',
)
loading_overlay = '''      {businessLoading && <div className="absolute inset-x-0 top-[72px] bottom-[64px] z-40 bg-background/90 backdrop-blur-[2px] flex items-center justify-center px-6">\n        <div className="flex flex-col items-center gap-3 text-center">\n          <div className="w-8 h-8 rounded-full border-2 border-border border-t-foreground animate-spin"/>\n          <div><p className="text-sm font-black">Ouverture de la boutique…</p><p className="text-xs text-muted-foreground mt-1">Les données métier se chargent en arrière-plan.</p></div>\n        </div>\n      </div>}\n'''
app = replace_once(
    app,
    '      {isReadOnly && <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-800 bg-amber-50 border-b border-amber-200"><Lock size={12}/> Mode lecture seule — aucune modification possible</div>}\n',
    loading_overlay + '      {isReadOnly && <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-800 bg-amber-50 border-b border-amber-200"><Lock size={12}/> Mode lecture seule — aucune modification possible</div>}\n',
    'business loading overlay',
)

api_path.write_text(api)
app_path.write_text(app)
print('targeted auth bootstrap patch applied')
