import fs from 'node:fs';

// API: initial 7-day window, history-only stock supports bounded older slice.
{
  const path='src/lib/api.ts';
  let s=fs.readFileSync(path,'utf8');
  s=s.replace('const BOOTSTRAP_HISTORY_DAYS = 30;', 'const BOOTSTRAP_HISTORY_DAYS = 7;\nexport const FULL_BOOTSTRAP_HISTORY_DAYS = 30;');
  const oldStock='const stockWindow = `&entry_date=gte.${historyFromFilter}`;';
  const newStock='const stockWindow = `${historyFrom ? `&entry_date=gte.${historyFromFilter}` : ""}${historyTo ? `&entry_date=lt.${encodeURIComponent(historyTo)}` : ""}`;';
  if(!s.includes(oldStock)) throw new Error('stock window anchor changed');
  s=s.replace(oldStock,newStock);
  const oldEntries='(options.historyOnly ? Promise.resolve([]) : dataRequestAll<any>(`stock_entries_app?select=*${scoped()}${stockWindow}`, "entry_date.desc,id.desc")), dataRequest<any[]>(`clients?select=*${scoped()}`),';
  const newEntries='dataRequestAll<any>(`stock_entries_app?select=*${scoped()}${stockWindow}`, "entry_date.desc,id.desc"), dataRequest<any[]>(`clients?select=*${scoped()}`),';
  if(!s.includes(oldEntries)) throw new Error('history stock anchor changed');
  s=s.replace(oldEntries,newEntries);
  fs.writeFileSync(path,s);
}

// App: merge the older 23-day slice after the initial screen is hydrated.
{
  const path='src/app/App.tsx';
  let s=fs.readFileSync(path,'utf8');
  const importOld='loadBoutiqueSnapshot, loadBoutiqueSyncPatch';
  const importNew='loadBoutiqueSnapshot, FULL_BOOTSTRAP_HISTORY_DAYS, BOUNDED_BOOTSTRAP_HISTORY_DAYS, loadBoutiqueSyncPatch';
  if(!s.includes(importOld)) throw new Error('api import anchor changed');
  s=s.replace(importOld,importNew);

  const typeAnchor='type Boutique   = {\n  id: string; nom: string; ville: string; color: string; initials: string; logo?: string; adresse?: string; email?: string; tel?: string;';
  const helper=`function mergeOlderBootstrapHistory(current: Boutique, older: Boutique): Boutique {\n  const byIdPreferCurrent = <T extends { id: string | number }>(currentRows: T[] = [], olderRows: T[] = []) => {\n    const merged = new Map<string, T>();\n    for (const row of olderRows) merged.set(String(row.id), row);\n    for (const row of currentRows) merged.set(String(row.id), row);\n    return [...merged.values()];\n  };\n  return {\n    ...current,\n    invoices: byIdPreferCurrent(current.invoices, older.invoices).sort((a,b)=>String(b.dateRaw ?? '').localeCompare(String(a.dateRaw ?? ''))),\n    entries: byIdPreferCurrent(current.entries, older.entries).sort((a:any,b:any)=>String(b.recordedAt ?? b.date ?? '').localeCompare(String(a.recordedAt ?? a.date ?? ''))),\n  };\n}\n\n`;
  if(!s.includes(typeAnchor)) throw new Error('Boutique type anchor changed');
  s=s.replace(typeAnchor, helper+typeAnchor);

  const hydrate=`      setBoutiques(prev => prev.some(b=>b.id===boutiqueId)\n        ? prev.map(b=>b.id===boutiqueId?hydrated:b)\n        : [...prev, hydrated]);`;
  const hydrateNew=`      setBoutiques(prev => prev.some(b=>b.id===boutiqueId)\n        ? prev.map(b=>b.id===boutiqueId?hydrated:b)\n        : [...prev, hydrated]);\n\n      // Do not block boutique entry on the older history slice. The current\n      // state wins on duplicate IDs so Realtime updates received during this\n      // fetch cannot be overwritten by the deferred snapshot.\n      const now = Date.now();\n      const olderFrom = new Date(now - FULL_BOOTSTRAP_HISTORY_DAYS * 86_400_000).toISOString().slice(0,10);\n      const recentFrom = new Date(now - BOUNDED_BOOTSTRAP_HISTORY_DAYS * 86_400_000).toISOString().slice(0,10);\n      void loadBoutiqueSnapshot<Boutique[]>(boutiqueId, { historyFrom: olderFrom, historyTo: recentFrom, historyOnly: true })\n        .then(olderRows => {\n          const older = olderRows?.[0];\n          if (!older || activeBoutiqueIdRef.current !== boutiqueId) return;\n          setBoutiques(prev => prev.map(b => b.id === boutiqueId ? mergeOlderBootstrapHistory(b, older) : b));\n        })\n        .catch(error => techLog('sync','warn','Historique différé non chargé', error instanceof Error ? error.message : String(error)));`;
  if(!s.includes(hydrate)) throw new Error('boutique hydration anchor changed');
  s=s.replace(hydrate,hydrateNew);
  fs.writeFileSync(path,s);
}
