from pathlib import Path

path = Path('src/app/App.tsx')
text = path.read_text()
original = text

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)

api_import_end = '} from "../lib/api";'
idx = text.find(api_import_end)
if idx < 0:
    raise SystemExit('api import anchor not found')
insert_at = idx + len(api_import_end)
notification_import = '\nimport { getNotifications, markNotificationRead, markAllNotificationsRead, dismissAllNotifications, subscribeToNotifications, getPushState, enableWebPush, disableWebPush, type PushState } from "../lib/notifications";'
if '../lib/notifications' not in text:
    text = text[:insert_at] + notification_import + text[insert_at:]

replace_once(
    'type Notif      = { id: number; icon: string; title: string; body: string; dateRaw: string; read: boolean; tab?: Tab; filter?: Record<string,string> };',
    'type Notif      = { id: number; icon: string; title: string; body: string; dateRaw: string; read: boolean; tab?: Tab; filter?: Record<string,string>; serverId?: number };',
    'Notif type',
)

replace_once(
    '  const [notifs,           setNotifs]           = useState<Notif[]>([]);\n  const [notifOpen,        setNotifOpen]        = useState(false);',
    '  const [notifs,           setNotifs]           = useState<Notif[]>([]);\n  const [notifOpen,        setNotifOpen]        = useState(false);\n  const [pushState,        setPushState]        = useState<PushState>({ supported:false, permission:"unsupported", subscribed:false, iosNeedsInstall:false });\n  const [pushBusy,         setPushBusy]         = useState(false);',
    'notification state',
)

start = text.find('  const sendNotif = React.useCallback')
if start < 0:
    raise SystemExit('sendNotif start not found')
end = text.find('\n\n  //', start)
if end < 0:
    raise SystemExit('sendNotif end marker not found')
existing = text[start:end]
if 'Notification.requestPermission' not in existing:
    raise SystemExit('sendNotif block is not the expected browser-notification implementation')

new_block = '''  const sendNotif = React.useCallback(async (params: Omit<Notif,"id"|"read"|"dateRaw">) => {
    // Immediate in-app feedback only. System notifications are emitted by the
    // backend audit/event pipeline so PC, mobile and background PWA stay in sync.
    const n: Notif = { ...params, id: Date.now(), read: false, dateRaw: new Date().toISOString() };
    setNotifs(prev => [n, ...prev].slice(0, 100));
  }, []);

  const refreshServerNotifications = React.useCallback(async () => {
    try {
      const rows = await getNotifications(80);
      setNotifs(prev => {
        const server = rows.map(row => ({
          id: row.id,
          serverId: row.id,
          icon: row.icon || "🔔",
          title: row.title,
          body: row.body || "",
          dateRaw: row.created_at,
          read: Boolean(row.read_at),
          tab: (row.action_tab || undefined) as Tab | undefined,
          filter: row.action_filter || undefined,
        } satisfies Notif));
        const locals = prev.filter(n => !n.serverId && !rows.some(row =>
          row.title === n.title && row.body === n.body && Math.abs(new Date(row.created_at).getTime() - new Date(n.dateRaw).getTime()) < 120000
        ));
        return [...server, ...locals]
          .sort((a,b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime())
          .slice(0, 100);
      });
    } catch (error) {
      console.warn("Notifications serveur indisponibles", error);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || !hasAuthenticatedSession()) return;
    void refreshServerNotifications();
    void getPushState().then(setPushState).catch(() => undefined);
    const unsubscribe = subscribeToNotifications(() => { void refreshServerNotifications(); });
    return unsubscribe;
  }, [currentUser?.id, refreshServerNotifications]);

  const togglePushNotifications = React.useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const next = pushState.subscribed ? await disableWebPush() : await enableWebPush();
      setPushState(next);
      toast.success(next.subscribed ? "Notifications Push activées sur cet appareil" : "Notifications Push désactivées sur cet appareil");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier les notifications Push");
      void getPushState().then(setPushState).catch(() => undefined);
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushState.subscribed]);

  const markAllNotifsRead = React.useCallback(() => {
    setNotifs(prev => prev.map(n => ({...n,read:true})));
    void markAllNotificationsRead().catch(() => undefined);
  }, []);

  const clearAllNotifs = React.useCallback(() => {
    setNotifs([]);
    void dismissAllNotifications().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (screen !== "app") return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab") as Tab | null;
    const requestedBoutique = params.get("boutique");
    const allowedTabs: Tab[] = ["dashboard","stock","fournisseurs","clients","factures","pos","charges","compta","admin","inventaire","transferts"];
    if (requestedBoutique && requestedBoutique !== activeBoutiqueId) return;
    if (requestedTab && allowedTabs.includes(requestedTab)) setTab(requestedTab);
    if (params.has("notification")) window.history.replaceState({}, "", window.location.pathname);
  }, [screen, activeBoutiqueId]);'''
text = text[:start] + new_block + text[end:]

replace_once(
    '<p className="font-black text-sm">Notifications</p>\n              <div className="flex items-center gap-3">',
    '<p className="font-black text-sm">Notifications</p>\n              <div className="flex items-center gap-3">\n                <button onClick={togglePushNotifications} disabled={pushBusy || !pushState.supported || pushState.permission==="denied"} title={pushState.iosNeedsInstall?"Sur iPhone/iPad, installez Tournal sur l’écran d’accueil":"Notifications système sur cet appareil"} className="text-xs font-black px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{background:pushState.subscribed?"#dcfce7":"#f3f4f6",color:pushState.subscribed?"#166534":"#374151"}}>{pushBusy?"…":pushState.subscribed?"Push ✓":pushState.iosNeedsInstall?"Installer PWA":pushState.permission==="denied"?"Push bloqué":"Activer Push"}</button>',
    'notification panel push control',
)

replace_once(
    '<button onClick={()=>setNotifs(prev=>prev.map(n=>({...n,read:true})))} className="text-xs font-bold text-muted-foreground">Tout lire</button>',
    '<button onClick={markAllNotifsRead} className="text-xs font-bold text-muted-foreground">Tout lire</button>',
    'mark all button',
)
replace_once(
    '<button onClick={()=>setNotifs([])} className="text-xs font-bold" style={{color:"#ef4444"}}>Effacer</button>',
    '<button onClick={clearAllNotifs} className="text-xs font-bold" style={{color:"#ef4444"}}>Effacer</button>',
    'clear all button',
)
replace_once(
    '<button key={n.id} onClick={()=>{\n                  setNotifs(prev=>prev.map(x=>x.id===n.id?{...x,read:true}:x));',
    '<button key={n.serverId?`server-${n.serverId}`:`local-${n.id}`} onClick={()=>{\n                  setNotifs(prev=>prev.map(x=>x.id===n.id?{...x,read:true}:x));\n                  if (n.serverId) void markNotificationRead(n.serverId).catch(()=>undefined);',
    'notification row click',
)

if text == original:
    raise SystemExit('no changes produced')
path.write_text(text)
print('global notification UI patch applied')
