from pathlib import Path
import re

# Browser API client: remove the legacy anon JWT from the bundle, use the
# publishable key for Edge Functions, and keep auth tokens only for the current
# browser session instead of persisting them across browser restarts.
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
api, removed = re.subn(
    r'// Edge functions require the standard anon JWT, not the publishable key format\.\nconst ANON_KEY = "[^"]+";\n',
    '', api, count=1,
)
if removed != 1 and 'const ANON_KEY' in api:
    raise SystemExit('legacy anon key could not be removed safely')
api = api.replace('apikey: ANON_KEY', 'apikey: PUBLISHABLE_KEY')
api = api.replace('localStorage.getItem(SESSION_STORAGE_KEY)', 'sessionStorage.getItem(SESSION_STORAGE_KEY)')
api = api.replace('localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))', 'sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))')
api = api.replace('localStorage.removeItem(SESSION_STORAGE_KEY)', 'sessionStorage.removeItem(SESSION_STORAGE_KEY)')
if 'const ANON_KEY' in api or 'apikey: ANON_KEY' in api:
    raise SystemExit('legacy anon key still referenced')
if 'sessionStorage.getItem(SESSION_STORAGE_KEY)' not in api:
    raise SystemExit('session storage migration failed')
api_path.write_text(api)

# Generated invoice/receipt/order HTML: every document written into an iframe or
# popup receives its own strict CSP. This prevents stored business data from
# executing JavaScript or making network requests even if it contains markup.
inv_path = Path('src/app/utils/invoice.ts')
inv = inv_path.read_text()
anchor = 'import { invoicePaymentEvents } from "./payments";\n'
helper = '''import { invoicePaymentEvents } from "./payments";\n\nconst GENERATED_DOC_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; font-src data:";\n\nfunction hardenGeneratedHtml(html: string): string {\n  if (/http-equiv=[\\"']Content-Security-Policy[\\"']/i.test(html)) return html;\n  const meta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${GENERATED_DOC_CSP}\"/><meta name=\"referrer\" content=\"no-referrer\"/>`;\n  return /<head>/i.test(html) ? html.replace(/<head>/i, `<head>${meta}`) : meta + html;\n}\n'''
if 'const GENERATED_DOC_CSP' not in inv:
    if anchor not in inv:
        raise SystemExit('invoice import anchor missing')
    inv = inv.replace(anchor, helper, 1)
replacements = [
    ('doc.write(buildInvoicePDFHtml(inv, boutique, clients));', 'doc.write(hardenGeneratedHtml(buildInvoicePDFHtml(inv, boutique, clients)));'),
    ('w.document.write(html);', 'w.document.write(hardenGeneratedHtml(html));'),
    ('doc.open(); doc.write(html); doc.close();', 'doc.open(); doc.write(hardenGeneratedHtml(html)); doc.close();'),
]
for old_write, new_write in replacements:
    if new_write not in inv:
        if old_write not in inv:
            raise SystemExit(f'invoice write anchor missing: {old_write}')
        inv = inv.replace(old_write, new_write)
inv_path.write_text(inv)

# Remove the inline service-worker bootstrap so the top-level CSP can disallow
# inline scripts. Register it from the compiled module instead.
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

print('security hardening patch applied')
