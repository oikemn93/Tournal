from pathlib import Path
import re

# Browser API client: remove legacy anon JWT, use the publishable key for Edge
# Functions, and persist Auth only for the current browser session.
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
api, _ = re.subn(
    r'// Edge functions require the standard anon JWT, not the publishable key format\.\nconst ANON_KEY = "[^"]+";\n',
    '', api, count=1,
)
api = api.replace('apikey: ANON_KEY', 'apikey: PUBLISHABLE_KEY')
api = api.replace('localStorage.getItem(SESSION_STORAGE_KEY)', 'sessionStorage.getItem(SESSION_STORAGE_KEY)')
api = api.replace('localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))', 'sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))')
api = api.replace('localStorage.removeItem(SESSION_STORAGE_KEY)', 'sessionStorage.removeItem(SESSION_STORAGE_KEY)')
if 'const ANON_KEY' in api or 'apikey: ANON_KEY' in api:
    raise SystemExit('legacy anon key still referenced')
api_path.write_text(api)

# Generated invoice/receipt/order HTML: lock generated documents so stored data
# can never execute script or make network requests.
inv_path = Path('src/app/utils/invoice.ts')
inv = inv_path.read_text()
anchor = 'import { invoicePaymentEvents } from "./payments";\n'
helper = '''import { invoicePaymentEvents } from "./payments";\n\nconst GENERATED_DOC_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; font-src data:";\n\nfunction hardenGeneratedHtml(html: string): string {\n  if (/http-equiv=[\\"']Content-Security-Policy[\\"']/i.test(html)) return html;\n  const meta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${GENERATED_DOC_CSP}\"/><meta name=\"referrer\" content=\"no-referrer\"/>`;\n  return /<head>/i.test(html) ? html.replace(/<head>/i, `<head>${meta}`) : meta + html;\n}\n'''
if 'const GENERATED_DOC_CSP' not in inv:
    if anchor not in inv:
        raise SystemExit('invoice import anchor missing')
    inv = inv.replace(anchor, helper, 1)
for old_write, new_write in [
    ('doc.write(buildInvoicePDFHtml(inv, boutique, clients));', 'doc.write(hardenGeneratedHtml(buildInvoicePDFHtml(inv, boutique, clients)));'),
    ('w.document.write(html);', 'w.document.write(hardenGeneratedHtml(html));'),
    ('doc.open(); doc.write(html); doc.close();', 'doc.open(); doc.write(hardenGeneratedHtml(html)); doc.close();'),
]:
    if new_write not in inv:
        if old_write not in inv:
            raise SystemExit(f'invoice write anchor missing: {old_write}')
        inv = inv.replace(old_write, new_write)
inv_path.write_text(inv)

# Top-level CSP compatibility: service worker registration must not be inline.
index_path = Path('index.html')
index = index_path.read_text()
index = re.sub(
    r'\n\s*<script>\s*if \([\'\"]serviceWorker[\'\"] in navigator\).*?</script>\s*',
    '\n', index, count=1, flags=re.S,
)
index_path.write_text(index)

main_path = Path('src/main.tsx')
main = main_path.read_text()
append = '''\n\nif ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => {\n    navigator.serviceWorker.register("/service-worker.js").catch((error) => {\n      console.error("Service worker registration failed:", error);\n    });\n  });\n}\n'''
if 'navigator.serviceWorker.register("/service-worker.js")' not in main:
    main = main.rstrip() + append
main_path.write_text(main)

# UI session metadata follows Auth sessionStorage and really expires after the
# configured idle duration. Previously it only checked whether the JWT was still
# valid and returned without logging out.
app_path = Path('src/app/App.tsx')
app = app_path.read_text()
app = app.replace('const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12h', 'const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 60 min idle session default')
app = app.replace('localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: Date.now() }))', 'sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: Date.now() }))')
app = app.replace('localStorage.getItem(SESSION_KEY)', 'sessionStorage.getItem(SESSION_KEY)')
app = app.replace('localStorage.removeItem(SESSION_KEY)', 'sessionStorage.removeItem(SESSION_KEY)')
old_logout = '''      logoutTimer.current = setTimeout(() => {\n        const bid = activeBoutiqueIdRef.current;\n        if (!bid) return;\n        void validateServerSession().then(valid => {\n          if (valid) return;\n          logTech(bid, { level:"info", cat:"session", msg:"Session expirée côté serveur" });\n          clearSession(); setCurrentUser(null); setActiveBoutiqueId(null); setActiveAssign(null); setScreen("login");\n        }).catch(() => undefined);\n      }, sessionExpiryMs);'''
new_logout = '''      logoutTimer.current = setTimeout(() => {\n        const bid = activeBoutiqueIdRef.current;\n        if (bid) void logTech(bid, { level:"info", cat:"session", msg:"Session expirée après inactivité" });\n        void signOutFromSupabase().catch(() => undefined).finally(() => {\n          clearSession(); setCurrentUser(null); setActiveBoutiqueId(null); setActiveAssign(null); setLocked(false); setScreen("login");\n        });\n      }, sessionExpiryMs);'''
if old_logout in app:
    app = app.replace(old_logout, new_logout, 1)
elif new_logout not in app:
    raise SystemExit('session expiry anchor missing')
if 'localStorage.getItem(SESSION_KEY)' in app or 'localStorage.setItem(SESSION_KEY' in app:
    raise SystemExit('UI session still persisted in localStorage')
app_path.write_text(app)

print('security hardening patch applied')
