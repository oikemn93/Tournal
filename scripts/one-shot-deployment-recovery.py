from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


p = Path('src/app/App.tsx')
s = p.read_text()
s = replace_once(s, '  const Component = React.lazy(loader);', '''  const Component = React.lazy(() => loader().catch((error) => {
    const recover = (window as Window & { __tournalRecoverFromStaleModule?: (error: unknown) => void }).__tournalRecoverFromStaleModule;
    recover?.(error);
    throw error;
  }));''', 'lazy loader recovery')
s = replace_once(s, '>Retour à Tournal Ops</button>', '>Réessayer</button>', 'generic boundary label')
platform_match = re.search(r'(type PlatformUser = \{[\s\S]*?\n\};\n)(type Product\s+=)', s)
if not platform_match:
    raise SystemExit('missing PlatformUser block')
helper = '''\nfunction userCanAccessOps(user: PlatformUser | null | undefined) {
  return !!user && (user.isSuperAdmin || Boolean((user as PlatformUser & { opsRole?: string }).opsRole));
}
'''
s = s[:platform_match.end(1)] + helper + s[platform_match.end(1):]
old_super = '''  // Reaching this screen requires either SuperAdmin or an active Ops profile.
  // Ops users always carry opsRole from the authenticated bootstrap, so a
  // missing opsRole is the safe SuperAdmin fallback during Ops-shell hydration.
  const canSystemAdmin = !!currentProfile?.isSuperAdmin || (!!authUserId && !opsRole);'''
new_super = '''  const canAccessOps = !!currentProfile?.isSuperAdmin || !!opsRole;
  if (!canAccessOps) {
    return <div className="min-h-screen flex items-center justify-center px-5 bg-background text-foreground"><div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm"><ShieldCheck className="mb-4 text-red-600"/><h1 className="text-xl font-black">Accès Tournal Ops refusé</h1><p className="mt-2 text-sm text-muted-foreground">Ce compte n’est ni SuperAdmin ni membre Ops actif. Les données Ops restent protégées côté serveur.</p></div></div>;
  }
  const canSystemAdmin = !!currentProfile?.isSuperAdmin;'''
s = replace_once(s, old_super, new_super, 'SuperAdmin fallback')
route_marker = '  if (screen==="superadmin"&&currentUser) return (\n'
route_guard = '''  if (screen==="superadmin"&&currentUser&&!userCanAccessOps(currentUser)) return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background text-foreground"><div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm"><ShieldCheck className="mb-4 text-red-600"/><h1 className="text-xl font-black">Accès Tournal Ops refusé</h1><p className="mt-2 text-sm text-muted-foreground">Votre compte n’a pas les droits Ops.</p><button type="button" onClick={()=>setScreen("boutique-select")} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white">Retour aux boutiques</button></div></div>
  );
  if (screen==="superadmin"&&currentUser&&userCanAccessOps(currentUser)) return (
'''
s = replace_once(s, route_marker, route_guard, 'superadmin route guard')
old_reset = '<BoutiqueAppErrorBoundary onReset={()=>{activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen("superadmin");}}>'
new_reset = '<BoutiqueAppErrorBoundary onReset={()=>{if(userCanAccessOps(currentUser)){activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen("superadmin");return;}window.location.reload();}}>'
s = replace_once(s, old_reset, new_reset, 'boutique boundary reset')
old_missing = 'onClick={()=>{activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen("superadmin");}} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white">Retour à Tournal Ops</button>'
new_missing = 'onClick={()=>{if(userCanAccessOps(currentUser)){activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen("superadmin");}else{window.location.reload();}}} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white">{userCanAccessOps(currentUser)?"Retour à Tournal Ops":"Recharger Tournal"}</button>'
s = replace_once(s, old_missing, new_missing, 'incomplete boutique fallback')
p.write_text(s)

p = Path('src/main.tsx')
s = p.read_text()
s = replace_once(s, '  | { type: "TOURNAL_OFFLINE_QUEUE_STATUS"; queueCount: number; oldestCreatedAt?: number };', '  | { type: "TOURNAL_OFFLINE_QUEUE_STATUS"; queueCount: number; oldestCreatedAt?: number }\n  | { type: "TOURNAL_STALE_ASSET"; assetPath?: string };', 'worker stale message')
marker = 'createRoot(document.getElementById("root")!).render(<OfflineCoordinator><App /></OfflineCoordinator>);\n'
recovery = '''const MODULE_RECOVERY_KEY = "tournal.module-recovery.v1";
const MODULE_FAILURE_PATTERN = /importing a module script failed|failed to fetch dynamically imported module|failed to load module script|error loading dynamically imported module|loading chunk [^ ]+ failed/i;

function isStaleModuleFailure(value: unknown) {
  const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  return MODULE_FAILURE_PATTERN.test(message);
}

async function recoverFromStaleModule(value: unknown) {
  if (!isStaleModuleFailure(value)) return;
  const lastAttempt = Number(sessionStorage.getItem(MODULE_RECOVERY_KEY) || 0);
  if (lastAttempt && Date.now() - lastAttempt < 30_000) return;
  sessionStorage.setItem(MODULE_RECOVERY_KEY, String(Date.now()));
  try {
    workerPost({ type: "TOURNAL_CLEAR_SHELL_CACHE" });
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("tournal-shell-")).map(key => caches.delete(key)));
    }
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(registrations.map(registration => registration.update().catch(() => undefined)));
  } finally {
    window.location.reload();
  }
}

(window as Window & { __tournalRecoverFromStaleModule?: (error: unknown) => void }).__tournalRecoverFromStaleModule = (error) => {
  void recoverFromStaleModule(error);
};
window.addEventListener("error", event => { void recoverFromStaleModule(event.error ?? event.message); });
window.addEventListener("unhandledrejection", event => { void recoverFromStaleModule(event.reason); });
window.setTimeout(() => sessionStorage.removeItem(MODULE_RECOVERY_KEY), 15_000);

'''
s = replace_once(s, marker, recovery + marker, 'main recovery insertion')
stale_case = '''      if (message.type === "TOURNAL_STALE_ASSET") {
        void recoverFromStaleModule(`Failed to fetch dynamically imported module: ${message.assetPath ?? "unknown"}`);
        return;
      }
'''
target = '      if (message.type === "TOURNAL_OFFLINE_QUEUE_STATUS") {\n'
s = replace_once(s, target, stale_case + target, 'stale SW message handling')
p.write_text(s)

p = Path('public/service-worker.js')
s = p.read_text()
s = replace_once(s, "const CACHE_NAME = 'tournal-shell-v6';", "const CACHE_NAME = 'tournal-shell-v7';", 'cache version')
s = replace_once(s, "keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))", "keys.filter((key) => key.startsWith('tournal-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))", 'scoped cache cleanup')
notify_marker = "async function queueStatusMessage(type = 'TOURNAL_OFFLINE_QUEUE_STATUS') {"
sw_helpers = '''async function refreshShellCache() {
  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
}

async function recoverStaleAssetClient(clientId, assetPath) {
  try { await refreshShellCache(); } catch { await caches.delete(CACHE_NAME).catch(() => undefined); }
  await notifyClients({ type: 'TOURNAL_STALE_ASSET', assetPath });
  if (!clientId) return;
  const client = await self.clients.get(clientId).catch(() => null);
  if (client && 'navigate' in client) {
    try { await client.navigate(client.url); } catch {}
  }
}

'''
s = replace_once(s, notify_marker, sw_helpers + notify_marker, 'SW recovery helpers')
old_static = '''  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );'''
new_static = '''  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.status === 404 && url.pathname.startsWith('/assets/')) {
        event.waitUntil(recoverStaleAssetClient(event.clientId, url.pathname));
        return response;
      }
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })
  );'''
s = replace_once(s, old_static, new_static, 'static fetch recovery')
msg_marker = "  if (message.type === 'TOURNAL_GET_QUEUE_STATUS') {"
clear_msg = '''  if (message.type === 'TOURNAL_CLEAR_SHELL_CACHE') {
    event.waitUntil(refreshShellCache().catch(() => caches.delete(CACHE_NAME)));
    return;
  }
'''
s = replace_once(s, msg_marker, clear_msg + msg_marker, 'clear shell cache message')
p.write_text(s)

p = Path('scripts/test-offline-pos-contract.mjs')
s = p.read_text()
anchor = 'assert.match(mainSource, /sort\\(\\(a, b\\) => a\\.createdAt - b\\.createdAt\\)/, "replay must be chronological");\n'
extra = '''assert.match(workerSource, /TOURNAL_STALE_ASSET/, "missing hashed assets must trigger stale-deployment recovery");
assert.match(workerSource, /recoverStaleAssetClient/, "service worker must repair stale asset clients");
assert.match(workerSource, /key\\.startsWith\\('tournal-shell-'\\)/, "cache cleanup must be scoped to Tournal shell caches");
assert.match(mainSource, /MODULE_FAILURE_PATTERN/, "client must detect stale module import failures");
assert.match(mainSource, /TOURNAL_CLEAR_SHELL_CACHE/, "client recovery must clear the service-worker shell cache before reload");
'''
s = replace_once(s, anchor, anchor + extra, 'offline deployment assertions')
p.write_text(s)

p = Path('scripts/test-ops-boutique-entry.mjs')
s = p.read_text()
old = "assert.ok(app.includes('const canSystemAdmin = !!currentProfile?.isSuperAdmin || (!!authUserId && !opsRole);'),'SuperAdmin fallback must survive Ops-shell hydration');"
new = "assert.ok(app.includes('const canAccessOps = !!currentProfile?.isSuperAdmin || !!opsRole;'),'Ops shell must require SuperAdmin or an active Ops role');\nassert.ok(app.includes('const canSystemAdmin = !!currentProfile?.isSuperAdmin;'),'System administration must require explicit SuperAdmin');\nassert.ok(app.includes('screen===\\\"superadmin\\\"&&currentUser&&!userCanAccessOps(currentUser)'),'Normal users must be blocked before the Ops screen renders');\nassert.ok(app.includes('if(userCanAccessOps(currentUser))'),'Boutique error recovery must not route normal users to Ops');\nassert.ok(!app.includes('!!authUserId && !opsRole'),'Missing opsRole must never be treated as SuperAdmin');"
s = replace_once(s, old, new, 'ops contract hardening')
p.write_text(s)
