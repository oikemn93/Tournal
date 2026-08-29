from pathlib import Path

p = Path('src/app/screens/ClientsView.tsx')
s = p.read_text()
needle = '''function dueLabel(dueDate: string | undefined, remaining: number) {'''
insert = '''function clientInvoiceRemainingAmount(invoice: Invoice): number {\n  return Math.max(0, roundMoney(baseInvoiceRemainingAmount(invoice)));\n}\n\n'''
if insert.strip() not in s:
    if needle not in s:
        raise SystemExit('dueLabel anchor not found')
    s = s.replace(needle, insert + needle, 1)
old = '''          const montantDu = clientInvoices.reduce((s,inv)=>s+invoiceRemainingAmount(inv),0);'''
new = '''          // The list view is rendered outside the client-detail scope. Use the\n          // module-level helper here; the detail-only return-aware helper is not\n          // in scope and previously caused a ReferenceError/blank Clients screen.\n          const montantDu = clientInvoices.reduce((s,inv)=>s+clientInvoiceRemainingAmount(inv),0);'''
if old not in s:
    raise SystemExit('client list balance anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)
