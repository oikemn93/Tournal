from pathlib import Path
p=Path('src/app/screens/InventoryView.tsx')
s=p.read_text()
old='montantDu: Number(line.differenceQty ?? 0) * line.purchasePrice,'
new='montantDu: line.fifoCountedCost - line.fifoTheoreticalCost,'
if s.count(old)!=1:
    raise SystemExit(f'expected one occurrence, got {s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s)
