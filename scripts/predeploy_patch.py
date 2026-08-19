from pathlib import Path

path = Path('src/app/App.tsx')
text = path.read_text()
old = '{id:"encaissement_vente" as Permission, label:"Encaisser dans Vente", icon:"💳"},'
new = '{id:"encaissement_vente" as Permission, label:"Encaissement", icon:"💳"},'
count = text.count(old)
if count != 1:
    raise SystemExit(f'encaissement label: expected exactly 1 match, got {count}')
path.write_text(text.replace(old, new, 1))
print('Encaissement permission label patched successfully')
