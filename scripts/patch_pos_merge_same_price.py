from pathlib import Path

p = Path('src/app/screens/POSView.tsx')
s = p.read_text()

old = '    setCart(prev => [...prev, item]);'
new = '''    setCart(prev => {
      const existingIndex = prev.findIndex(existing =>
        existing.productId === item.productId &&
        existing.prixUnit === item.prixUnit &&
        (existing.sellUnit ?? existing.unit) === (item.sellUnit ?? item.unit)
      );
      if (existingIndex < 0) return [...prev, item];
      return prev.map((existing, index) => {
        if (index !== existingIndex) return existing;
        if (existing.sellUnit && existing.sellQty !== undefined && item.sellQty !== undefined) {
          return { ...existing, sellQty: existing.sellQty + item.sellQty, qty: existing.qty + item.qty };
        }
        return { ...existing, qty: existing.qty + item.qty };
      });
    });'''
if old not in s:
    raise SystemExit('cart append block not found')
s = s.replace(old, new, 1)

old = '''                  const matchingLines=cart.filter(i=>i.productId===p.id);
                  const inCart=matchingLines[0];'''
new = '''                  const matchingLines=cart.filter(i=>i.productId===p.id);
                  const inCart=matchingLines[0];
                  const totalInCart=matchingLines.reduce((sum,line)=>sum+lineDispQty(line),0);'''
if old not in s:
    raise SystemExit('inline matching lines block not found')
s = s.replace(old, new, 1)

old = '{inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>{matchingLines.length} ligne{matchingLines.length>1?"s":""} ✓</p>}'
new = '{inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>Dans la vente : {totalInCart} {lineDispUnit(inCart)}{matchingLines.length>1?` · ${matchingLines.length} tarifs`:""}</p>}'
if old not in s:
    raise SystemExit('inline cart summary not found')
s = s.replace(old, new, 1)

p.write_text(s)
