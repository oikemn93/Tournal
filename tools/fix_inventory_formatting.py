from pathlib import Path

path = Path('src/app/screens/InventoryView.tsx')
s = path.read_text()

s = s.replace('import { fmt } from "../utils/formatting";\n', '')

old = '''function money(value: number) {\n  return `${fmt(Math.round(value))} F`;\n}\n'''
new = '''function number(value: number) {\n  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(Number(value) || 0);\n}\n\nfunction money(value: number) {\n  return `${number(Math.round(value))} F`;\n}\n'''
if old not in s:
    raise RuntimeError('money formatter anchor missing')
s = s.replace(old, new, 1)

s = s.replace('fmt(', 'number(')
path.write_text(s)
