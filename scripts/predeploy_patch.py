from pathlib import Path

path = Path('src/app/App.tsx')
text = path.read_text()

old_label = '{id:"encaissement_vente" as Permission, label:"Encaisser dans Vente", icon:"💳"},'
new_label = '{id:"encaissement_vente" as Permission, label:"Encaissement", icon:"💳"},'
if old_label in text:
    text = text.replace(old_label, new_label, 1)
elif new_label not in text:
    raise SystemExit('encaissement label: neither old nor new label found')

old_guard = '''    // Encaisser dans Vente dépend obligatoirement de l'accès Vente.
    if (perm === "encaissement_vente" && !assignment.droits.vente) return;

'''
if old_guard in text:
    text = text.replace(old_guard, '', 1)

# Encaissement is intentionally independent from Vente: a user may collect invoices
# in Factures without having access to the POS screen.
path.write_text(text)
print('Encaissement permission patched successfully')
