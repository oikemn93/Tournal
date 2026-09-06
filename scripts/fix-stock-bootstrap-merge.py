from pathlib import Path

app_path = Path('src/app/App.tsx')
app = app_path.read_text()
old_merge = '''function mergeOlderBootstrapHistory(current: Boutique, older: Boutique): Boutique {
  const byIdPreferCurrent = <T extends { id: string | number }>(currentRows: T[] = [], olderRows: T[] = []) => {
    const merged = new Map<string, T>();
    for (const row of olderRows) merged.set(String(row.id), row);
    for (const row of currentRows) merged.set(String(row.id), row);
    return [...merged.values()];
  };
  return {
    ...current,
    invoices: byIdPreferCurrent(current.invoices, older.invoices).sort((a,b)=>String(b.dateRaw ?? '').localeCompare(String(a.dateRaw ?? ''))),
    entries: byIdPreferCurrent(current.entries, older.entries).sort((a:any,b:any)=>String(b.recordedAt ?? b.date ?? '').localeCompare(String(a.recordedAt ?? a.date ?? ''))),
  };
}'''
new_merge = '''function mergeOlderBootstrapHistory(current: Boutique, older: Boutique): Boutique {
  const byIdPreferCurrent = <T extends { id: string | number }>(currentRows: T[] = [], olderRows: T[] = []) => {
    const merged = new Map<string, T>();
    for (const row of olderRows) merged.set(String(row.id), row);
    for (const row of currentRows) merged.set(String(row.id), row);
    return [...merged.values()];
  };
  // The bounded snapshot already reconciles recent movements to live stock.
  // Deferred history is for history only: adding it must never change the
  // authoritative quantity that was visible before the merge.
  const mergeStockEntriesPreservingCurrentQty = (currentRows: StockEntry[] = [], olderRows: StockEntry[] = []) => {
    const actualById = new Map<string, StockEntry>();
    for (const row of olderRows) if (row.movementType !== "bootstrap") actualById.set(String(row.id), row);
    for (const row of currentRows) if (row.movementType !== "bootstrap") actualById.set(String(row.id), row);
    const actualRows = [...actualById.values()];

    const currentTotalByProduct = new Map<number, number>();
    for (const row of currentRows) currentTotalByProduct.set(row.productId, (currentTotalByProduct.get(row.productId) ?? 0) + row.qty);
    const actualTotalByProduct = new Map<number, number>();
    for (const row of actualRows) actualTotalByProduct.set(row.productId, (actualTotalByProduct.get(row.productId) ?? 0) + row.qty);
    const bootstrapByProduct = new Map<number, StockEntry>();
    for (const row of currentRows) if (row.movementType === "bootstrap") bootstrapByProduct.set(row.productId, row);

    const reconciliations: StockEntry[] = [];
    for (const [productId, currentTotal] of currentTotalByProduct) {
      const qty = currentTotal - (actualTotalByProduct.get(productId) ?? 0);
      if (Math.abs(qty) <= 0.000001) continue;
      const template = bootstrapByProduct.get(productId);
      reconciliations.push(template ? { ...template, qty } : {
        id: -(9_000_000_000_000 + productId), productId, qty,
        unit: "unité", montantDu: 0, date: "", fournisseur: "", movementType: "bootstrap",
      });
    }
    return [...reconciliations, ...actualRows];
  };
  return {
    ...current,
    invoices: byIdPreferCurrent(current.invoices, older.invoices).sort((a,b)=>String(b.dateRaw ?? '').localeCompare(String(a.dateRaw ?? ''))),
    entries: mergeStockEntriesPreservingCurrentQty(current.entries, older.entries).sort((a:any,b:any)=>String(b.recordedAt ?? b.date ?? '').localeCompare(String(a.recordedAt ?? a.date ?? ''))),
  };
}'''
if app.count(old_merge) != 1:
    raise SystemExit(f'expected old stock merge once, found {app.count(old_merge)}')
app_path.write_text(app.replace(old_merge, new_merge))

pos_path = Path('src/app/screens/POSView.tsx')
pos = pos_path.read_text()
old_pos = '''  function getStock(p: Product) {
    return entries.filter(e => e.productId === p.id).reduce((s, e) => s + e.qty, 0);
  }'''
new_pos = '''  function getStock(p: Product) {
    return productQty(p.id, entries);
  }'''
if pos.count(old_pos) != 1:
    raise SystemExit(f'expected POS getStock once, found {pos.count(old_pos)}')
pos_path.write_text(pos.replace(old_pos, new_pos))

print('stock bootstrap and POS patch applied')
