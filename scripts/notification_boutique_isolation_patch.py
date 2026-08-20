from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str):
    s = path.read_text()
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    path.write_text(s.replace(old, new, 1))

app = Path("src/app/App.tsx")
center = Path("src/app/components/NotificationCenter.tsx")

replace_once(
    app,
    'import { getNotifications, markNotificationRead, markAllNotificationsRead, dismissAllNotifications, subscribeToNotifications, getPushState, enableWebPush, disableWebPush, type PushState } from "../lib/notifications";',
    'import { getNotifications, markNotificationRead, markAllNotificationsRead, dismissAllNotifications, subscribeToNotifications, getPushState, enableWebPush, disableWebPush, syncWebPushBoutique, type PushState } from "../lib/notifications";',
    "notifications import",
)

replace_once(
    app,
'''  const refreshServerNotifications = React.useCallback(async () => {\n    try {\n      const rows = await getNotifications(80);\n''',
'''  const refreshServerNotifications = React.useCallback(async () => {\n    if (!activeBoutiqueId) { setNotifs([]); return; }\n    try {\n      const rows = await getNotifications(activeBoutiqueId, 80);\n''',
    "scoped notification refresh start",
)
replace_once(
    app,
'''    } catch (error) {\n      console.warn("Notifications serveur indisponibles", error);\n    }\n  }, []);\n''',
'''    } catch (error) {\n      console.warn("Notifications serveur indisponibles", error);\n    }\n  }, [activeBoutiqueId]);\n''',
    "scoped notification refresh deps",
)

replace_once(
    app,
'''  useEffect(() => {\n    if (!currentUser || !hasAuthenticatedSession()) return;\n    void refreshServerNotifications();\n    const refreshPushState = () => { void getPushState().then(setPushState).catch(() => undefined); };\n    refreshPushState();\n    const unsubscribe = subscribeToNotifications(() => { void refreshServerNotifications(); });\n    const onVisible = () => { if (document.visibilityState === "visible") refreshPushState(); };\n    document.addEventListener("visibilitychange", onVisible);\n    navigator.serviceWorker?.addEventListener("controllerchange", refreshPushState);\n    return () => {\n      unsubscribe();\n      document.removeEventListener("visibilitychange", onVisible);\n      navigator.serviceWorker?.removeEventListener("controllerchange", refreshPushState);\n    };\n  }, [currentUser?.id, refreshServerNotifications]);\n''',
'''  useEffect(() => {\n    if (screen !== "app" || !currentUser || !activeBoutiqueId || !hasAuthenticatedSession()) {\n      setNotifs([]);\n      return;\n    }\n    let cancelled = false;\n    let unsubscribe = () => undefined;\n    const refreshPushState = () => { void getPushState().then(setPushState).catch(() => undefined); };\n    const activate = async () => {\n      setNotifs([]);\n      try { await startAppSession(activeBoutiqueId); } catch {}\n      if (cancelled) return;\n      await syncWebPushBoutique().catch(() => undefined);\n      if (cancelled) return;\n      await refreshServerNotifications();\n      if (cancelled) return;\n      refreshPushState();\n      unsubscribe = subscribeToNotifications(activeBoutiqueId, () => { void refreshServerNotifications(); });\n    };\n    void activate();\n    const onVisible = () => { if (document.visibilityState === "visible") refreshPushState(); };\n    document.addEventListener("visibilitychange", onVisible);\n    navigator.serviceWorker?.addEventListener("controllerchange", refreshPushState);\n    return () => {\n      cancelled = true;\n      unsubscribe();\n      document.removeEventListener("visibilitychange", onVisible);\n      navigator.serviceWorker?.removeEventListener("controllerchange", refreshPushState);\n    };\n  }, [screen, currentUser?.id, activeBoutiqueId, refreshServerNotifications]);\n''',
    "scoped notification effect",
)

replace_once(
    center,
'''  const [search, setSearch] = useState("");\n  const [boutiqueFilter, setBoutiqueFilter] = useState("all");\n  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory|"all">("all");\n''',
'''  const [search, setSearch] = useState("");\n  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory|"all">("all");\n''',
    "remove boutique filter state",
)
replace_once(
    center,
'''        boutiqueId: boutiqueFilter === "all" ? undefined : boutiqueFilter,\n''',
'''        boutiqueId: activeBoutiqueId,\n''',
    "force active boutique history",
)
replace_once(
    center,
'''    setSection("history");\n    setBoutiqueFilter("all");\n    setCategoryFilter("all");\n    setUnreadOnly(false);\n    setSearch("");\n    void loadHistory(false);\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [open]);\n''',
'''    setSection("history");\n    setItems([]);\n    setCategoryFilter("all");\n    setUnreadOnly(false);\n    setSearch("");\n    void loadHistory(false);\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [open, activeBoutiqueId]);\n''',
    "reload center per active boutique",
)
replace_once(
    center,
'''  }, [boutiqueFilter, categoryFilter, unreadOnly, search, section]);\n''',
'''  }, [categoryFilter, unreadOnly, search, section, activeBoutiqueId]);\n''',
    "center filter deps",
)
replace_once(
    center,
'''            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">\n              <select value={boutiqueFilter} onChange={e=>setBoutiqueFilter(e.target.value)} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold"><option value="all">Toutes les boutiques</option>{boutiques.map(b=><option key={b.id} value={b.id}>{b.nom}</option>)}</select>\n              <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value as NotificationCategory|"all")} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold"><option value="all">Tous les types</option>{NOTIFICATION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>\n              <button onClick={()=>setUnreadOnly(v=>!v)} className="rounded-xl border px-3 py-2.5 text-xs font-bold" style={{borderColor:unreadOnly?"#2563eb":"var(--border)",background:unreadOnly?"#eff6ff":"transparent",color:unreadOnly?"#1d4ed8":"#6b7280"}}>Non lues seulement</button>\n              <button onClick={()=>void markAllRead()} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold">Tout marquer lu</button>\n            </div>\n''',
'''            <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">\n              <div><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Boutique</p><p className="text-sm font-bold">{activeBoutiqueName}</p></div>\n              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">Isolée</span>\n            </div>\n            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">\n              <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value as NotificationCategory|"all")} className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-bold"><option value="all">Tous les types</option>{NOTIFICATION_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>\n              <button onClick={()=>setUnreadOnly(v=>!v)} className="rounded-xl border px-3 py-2.5 text-xs font-bold" style={{borderColor:unreadOnly?"#2563eb":"var(--border)",background:unreadOnly?"#eff6ff":"transparent",color:unreadOnly?"#1d4ed8":"#6b7280"}}>Non lues seulement</button>\n              <button onClick={()=>void markAllRead()} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold">Tout marquer lu</button>\n            </div>\n''',
    "remove all-boutiques selector",
)

print("notification boutique isolation patch applied")
