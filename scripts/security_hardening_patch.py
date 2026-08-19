from pathlib import Path

# Triggered after workflow installation.
# 1) Browser API client: remove legacy anon JWT and use publishable key for Edge Functions.
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
old = '''// Edge functions require the standard anon JWT, not the publishable key format.\nconst ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNueHR5bG5nZGR3bWh1Z3hremp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1Nzc3MzcsImV4cCI6MjEwMjE1MzczN30.wWYfLBbrP_yTZCeqfywkT0_TFFS8YlHDn_8ta4esDLw";\n'''
if old not in api:
    raise SystemExit('legacy anon key anchor missing')
api = api.replace(old, '', 1)
if 'apikey: ANON_KEY' not in api:
    raise SystemExit('edge apikey anchor missing')
api = api.replace('apikey: ANON_KEY', 'apikey: PUBLISHABLE_KEY')
api_path.write_text(api)

# 2) Generated invoice/receipt/order HTML: inject a locked-down CSP before document.write.
inv_path = Path('src/app/utils/invoice.ts')
inv = inv_path.read_text()
anchor = 'import { invoicePaymentEvents } from "./payments";\n'
helper = '''import { invoicePaymentEvents } from "./payments";\n\nconst GENERATED_DOC_CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; font-src data:";\n\nfunction hardenGeneratedHtml(html: string): string {\n  if (/http-equiv=[\\"']Content-Security-Policy[\\"']/i.test(html)) return html;\n  const meta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${GENERATED_DOC_CSP}\"/><meta name=\"referrer\" content=\"no-referrer\"/>`;\n  return /<head>/i.test(html) ? html.replace(/<head>/i, `<head>${meta}`) : meta + html;\n}\n'''
if anchor not in inv:
    raise SystemExit('invoice import anchor missing')
inv = inv.replace(anchor, helper, 1)
for old_write, new_write in [
    ('doc.write(buildInvoicePDFHtml(inv, boutique, clients));', 'doc.write(hardenGeneratedHtml(buildInvoicePDFHtml(inv, boutique, clients)));'),
    ('w.document.write(html);', 'w.document.write(hardenGeneratedHtml(html));'),
    ('doc.open(); doc.write(html); doc.close();', 'doc.open(); doc.write(hardenGeneratedHtml(html)); doc.close();'),
]:
    if old_write not in inv:
        raise SystemExit(f'invoice write anchor missing: {old_write}')
    inv = inv.replace(old_write, new_write)
inv_path.write_text(inv)

# 3) Remove inline service-worker bootstrap so CSP can forbid inline scripts.
index_path = Path('index.html')
index = index_path.read_text()
inline = '''    <script>\n      if ('serviceWorker' in navigator) {\n        window.addEventListener('load', () => {\n          navigator.serviceWorker.register('/service-worker.js').catch((error) => {\n            console.error('Service worker registration failed:', error);\n          });\n        });\n      }\n    </script>\n'''
if inline not in index:
    raise SystemExit('inline service worker anchor missing')
index = index.replace(inline, '', 1)
index_path.write_text(index)

main_path = Path('src/main.tsx')
main = main_path.read_text()
append = '''\n\nif ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => {\n    navigator.serviceWorker.register("/service-worker.js").catch((error) => {\n      console.error("Service worker registration failed:", error);\n    });\n  });\n}\n'''
if 'navigator.serviceWorker.register("/service-worker.js")' not in main:
    main = main.rstrip() + append
main_path.write_text(main)

print('security hardening patch applied')
