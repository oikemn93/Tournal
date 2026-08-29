from pathlib import Path

for path in (Path('src/app/App.tsx'), Path('src/app/constants.ts')):
    text = path.read_text()
    old = 'annulation_commande:false  }'
    new = 'annulation_commande:false, decaissement:false  }'
    if old not in text:
        raise SystemExit(f'missing cashier preset in {path}')
    path.write_text(text.replace(old, new, 1))

print('cashier disbursement preset fixed')
