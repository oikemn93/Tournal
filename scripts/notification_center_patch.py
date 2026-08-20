from pathlib import Path

app = Path('src/app/App.tsx')
s = app.read_text()

def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    s = s.replace(old, new, 1)

replace_once(
'''import { SuperAdminUserActions } from "./components/SuperAdminUserActions";\n''',
'''import { SuperAdminUserActions } from "./components/SuperAdminUserActions";\nimport { NotificationCenter } from "./components/NotificationCenter";\n''',
'import NotificationCenter')

replace_once(
'''  const [notifOpen,        setNotifOpen]        = useState(false);\n  const [pushState,        setPushState]        = useState<PushState>({ supported:false, permission:"unsupported", subscribed:false, iosNeedsInstall:false });\n''',
'''  const [notifOpen,        setNotifOpen]        = useState(false);\n  const [notificationCenterOpen,setNotificationCenterOpen] = useState(false);\n  const [pushState,        setPushState]        = useState<PushState>({ supported:false, permission:"unsupported", subscribed:false, iosNeedsInstall:false });\n''',
'notification center state')

replace_once(
'''            <div className="flex items-center justify-between px-4 py-3 border-b border-border">\n              <p className="font-black text-sm">Notifications</p>\n              <div className="flex items-center gap-3">\n''',
'''            <div className="flex items-center justify-between px-4 py-3 border-b border-border">\n              <div className="flex items-center gap-2">\n                <p className="font-black text-sm">Notifications</p>\n                <button onClick={()=>{setNotifOpen(false);setNotificationCenterOpen(true);}} className="text-xs font-black px-2.5 py-1.5 rounded-lg" style={{background:"#111827",color:"#fff"}}>Tout voir</button>\n              </div>\n              <div className="flex items-center gap-3">\n''',
'notification header button')

replace_once(
'''      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card" style={{ borderTop:"1px solid rgba(0,0,0,0.08)" }}>\n''',
'''      <NotificationCenter\n        open={notificationCenterOpen}\n        onClose={()=>setNotificationCenterOpen(false)}\n        boutiques={boutiques.map(b=>({id:b.id,nom:b.nom}))}\n        activeBoutiqueId={activeBoutiqueId!}\n        canManageSettings={currentUser.isSuperAdmin || isOwner}\n        onNavigate={(targetTab,filter)=>{\n          const found=ALL_NAV.find(n=>n.id===targetTab);\n          if(found){ setTab(found.id); if(filter) setNavFilter(filter); }\n        }}\n      />\n      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card" style={{ borderTop:"1px solid rgba(0,0,0,0.08)" }}>\n''',
'notification center render')

app.write_text(s)

notifications = Path('src/lib/notifications.ts')
n = notifications.read_text()
old = '&dismissed_at=is.null&order=created_at.desc&limit=${Math.max(1,Math.min(limit,100))}`,'
new = '&dismissed_at=is.null&in_app_enabled=eq.true&order=created_at.desc&limit=${Math.max(1,Math.min(limit,100))}`,'
if n.count(old) != 1:
    raise SystemExit(f'notifications in-app filter: expected 1 match, got {n.count(old)}')
n = n.replace(old,new,1)
notifications.write_text(n)
print('notification center patch applied')
