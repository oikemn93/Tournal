from pathlib import Path

p = Path('src/app/screens/InventoryView.tsx')
s = p.read_text()

def once(old: str, new: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'expected 1 occurrence, got {count}: {old[:80]!r}')
    s = s.replace(old, new, 1)

once('  getInventorySession,\n  listInventorySessions,', '  getInventorySession,\n  getFifoRealizedMargin,\n  listInventorySessions,')
once('  type InventoryCountingDetail,\n  type InventoryLine,', '  type FifoRealizedMarginReport,\n  type InventoryCountingDetail,\n  type InventoryLine,')

start = s.index('function ReportCards(')
end = s.index('\nexport function InventoryView', start)
s = s[:start] + '''function ReportCards({ report, margin, loading }: { report: InventoryReport; margin: FifoRealizedMarginReport | null; loading: boolean }) {
  const variancePositive = report.varianceCost >= 0;
  const marginPositive = Number(margin?.realizedMargin ?? 0) >= 0;
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Valeur FIFO théorique</p><p className="mt-1 text-lg font-black">{money(report.theoreticalCost)}</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Valeur FIFO inventoriée</p><p className="mt-1 text-lg font-black">{money(report.countedCost)}</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Écart de valorisation FIFO</p><p className={`mt-1 text-lg font-black ${variancePositive ? "text-emerald-700" : "text-red-700"}`}>{report.varianceCost > 0 ? "+" : ""}{money(report.varianceCost)}</p><p className="text-[11px] text-muted-foreground mt-1">Écart physique valorisé en FIFO</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Marge réalisée FIFO · 30 j</p><p className={`mt-1 text-lg font-black ${marginPositive ? "text-emerald-700" : "text-red-700"}`}>{loading ? "…" : money(Number(margin?.realizedMargin ?? 0))}</p><p className="text-[11px] text-muted-foreground mt-1">CA réel − coût FIFO consommé</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Taux de marge réel · 30 j</p><p className={`mt-1 text-lg font-black ${marginPositive ? "text-emerald-700" : "text-red-700"}`}>{loading ? "…" : `${number(Number(margin?.marginRate ?? 0))} %`}</p>{!loading && Number(margin?.unmatchedLines ?? 0) > 0 && <p className="text-[11px] text-amber-700 mt-1">{margin!.unmatchedLines} ligne(s) sans sortie stock rapprochée</p>}</div>
  </div>;
}
''' + s[end:]

once('  const [historyLoading, setHistoryLoading] = useState(true);\n  const [asOfLocal,', '  const [historyLoading, setHistoryLoading] = useState(true);\n  const [marginReport, setMarginReport] = useState<FifoRealizedMarginReport | null>(null);\n  const [marginLoading, setMarginLoading] = useState(false);\n  const [asOfLocal,')

needle = '''  useEffect(() => {
    if (session) resetDrafts(session);
  }, [session?.id]);
'''
replacement = needle + '''
  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setMarginReport(null);
      setMarginLoading(false);
      return () => { cancelled = true; };
    }
    const to = new Date(session.asOfAt);
    const from = new Date(to);
    from.setDate(from.getDate() - 30);
    setMarginLoading(true);
    void getFifoRealizedMargin({ boutiqueId: boutique.id, fromAt: from.toISOString(), toAt: to.toISOString() })
      .then(next => { if (!cancelled) setMarginReport(next); })
      .catch(error => {
        console.warn("Marge FIFO réalisée indisponible", error);
        if (!cancelled) setMarginReport(null);
      })
      .finally(() => { if (!cancelled) setMarginLoading(false); });
    return () => { cancelled = true; };
  }, [boutique.id, session?.id, session?.asOfAt]);
'''
once(needle, replacement)

needle = '  const report = session?.status === "completed" ? session.report : session ? liveReport(session.lines, drafts) : zeroReport;\n'
replacement = needle + '''  const scopedMargin = useMemo<FifoRealizedMarginReport | null>(() => {
    if (!marginReport || !session) return null;
    const ids = new Set(session.lines.map(line => line.productId));
    const products = marginReport.products.filter(row => ids.has(row.productId));
    const revenue = products.reduce((sum, row) => sum + row.revenue, 0);
    const fifoCost = products.reduce((sum, row) => sum + row.fifoCost, 0);
    const realizedMargin = revenue - fifoCost;
    const unmatchedLines = products.reduce((sum, row) => sum + row.unmatchedLines, 0);
    return { ...marginReport, products, revenue, fifoCost, realizedMargin, unmatchedLines, marginRate: revenue !== 0 ? realizedMargin / revenue * 100 : 0 };
  }, [marginReport, session]);
'''
once(needle, replacement)

once('      <ReportCards report={report}/>', '      <ReportCards report={report} margin={scopedMargin} loading={marginLoading}/>')

once('          const saved = line.countedQty != null;\n          return <div', '          const saved = line.countedQty != null;\n          const productMargin = scopedMargin?.products.find(row => row.productId === line.productId);\n          return <div')

old = '''                <p className="text-xs text-muted-foreground mt-1">Théorique : <strong>{number(theoretical)} {line.unit}</strong> · Coût FIFO moyen {money(theoretical > 0 ? line.fifoTheoreticalCost / theoretical : line.fifoUnitCost)}</p>
'''
new = old + '''                <p className="text-xs text-muted-foreground mt-1">Marge réalisée FIFO · 30 j : <strong className={Number(productMargin?.realizedMargin ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}>{marginLoading ? "…" : money(Number(productMargin?.realizedMargin ?? 0))}</strong>{!marginLoading && productMargin ? ` · CA ${money(productMargin.revenue)} · coût FIFO ${money(productMargin.fifoCost)}` : ""}{!marginLoading && Number(productMargin?.unmatchedLines ?? 0) > 0 ? ` · ${productMargin!.unmatchedLines} ligne(s) non rapprochée(s)` : ""}</p>
'''
once(old, new)

p.write_text(s)
