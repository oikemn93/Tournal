from pathlib import Path

p = Path('src/app/screens/InventoryView.tsx')
s = p.read_text()

def once(old: str, new: str):
    global s
    c = s.count(old)
    if c != 1:
        raise SystemExit(f'expected 1 occurrence, got {c}: {old[:100]!r}')
    s = s.replace(old, new, 1)

# Dynamic period labels on report cards.
once(
'''function ReportCards({ report, margin, loading }: { report: InventoryReport; margin: FifoRealizedMarginReport | null; loading: boolean }) {''',
'''function ReportCards({ report, margin, loading, periodLabel }: { report: InventoryReport; margin: FifoRealizedMarginReport | null; loading: boolean; periodLabel: string }) {'''
)
s = s.replace('Marge réalisée FIFO · 30 j', 'Marge réalisée FIFO · {periodLabel}', 1)
s = s.replace('Taux de marge réel · 30 j', 'Taux de marge réel · {periodLabel}', 1)

# User-selected margin period; default to current calendar month through today.
once(
'''  const [marginLoading, setMarginLoading] = useState(false);\n  const [asOfLocal, setAsOfLocal] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });''',
'''  const [marginLoading, setMarginLoading] = useState(false);\n  const [asOfLocal, setAsOfLocal] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });\n  const [marginFromDate, setMarginFromDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; });\n  const [marginToDate, setMarginToDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });'''
)

# Replace fixed 30-day query with custom inclusive local-date range capped at inventory situation.
old = '''    const to = new Date(session.asOfAt);\n    const from = new Date(to);\n    from.setDate(from.getDate() - 30);\n    setMarginLoading(true);\n    void getFifoRealizedMargin({ boutiqueId: boutique.id, fromAt: from.toISOString(), toAt: to.toISOString() })'''
new = '''    const from = new Date(`${marginFromDate}T00:00:00`);\n    const requestedEndExclusive = new Date(`${marginToDate}T00:00:00`);\n    requestedEndExclusive.setDate(requestedEndExclusive.getDate() + 1);\n    const situation = new Date(session.asOfAt);\n    const to = requestedEndExclusive < situation ? requestedEndExclusive : situation;\n    if (!marginFromDate || !marginToDate || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {\n      setMarginReport(null);\n      setMarginLoading(false);\n      return () => { cancelled = true; };\n    }\n    setMarginLoading(true);\n    void getFifoRealizedMargin({ boutiqueId: boutique.id, fromAt: from.toISOString(), toAt: to.toISOString() })'''
once(old, new)
once('  }, [boutique.id, session?.id, session?.asOfAt]);', '  }, [boutique.id, session?.id, session?.asOfAt, marginFromDate, marginToDate]);')

# Add readable period label.
needle = '''  const report = session?.status === "completed" ? session.report : session ? liveReport(session.lines, drafts) : zeroReport;\n'''
replacement = needle + '''  const marginPeriodLabel = useMemo(() => {\n    if (!marginFromDate || !marginToDate) return "période choisie";\n    const from = new Date(`${marginFromDate}T00:00:00`);\n    const to = new Date(`${marginToDate}T00:00:00`);\n    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "période choisie";\n    return `${from.toLocaleDateString("fr-FR")} → ${to.toLocaleDateString("fr-FR")}`;\n  }, [marginFromDate, marginToDate]);\n'''
once(needle, replacement)

# Remove redundant top Inventory header card + external Retour button.
start = s.index('    <div className="rounded-3xl p-5 border border-border bg-card">\n      <div className="flex items-start justify-between gap-3">')
end_marker = '    </div>\n\n    {!session &&'
end = s.index(end_marker, start) + len('    </div>\n\n')
s = s[:start] + s[end:]

# Add period selector before starting an inventory.
needle = '''      <label className="block text-sm font-black">Date et heure de situation\n        <input type="datetime-local" max={(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); })()} value={asOfLocal} onChange={event => setAsOfLocal(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/>\n        <span className="block text-[11px] font-normal text-muted-foreground mt-1">Les mouvements postérieurs restent hors de cette situation et ne sont pas perdus lors de la finalisation.</span>\n      </label>\n      <div>\n      </div>'''
replacement = '''      <label className="block text-sm font-black">Date et heure de situation\n        <input type="datetime-local" max={(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); })()} value={asOfLocal} onChange={event => setAsOfLocal(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/>\n        <span className="block text-[11px] font-normal text-muted-foreground mt-1">Les mouvements postérieurs restent hors de cette situation et ne sont pas perdus lors de la finalisation.</span>\n      </label>\n      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">\n        <div><p className="text-sm font-black">Période d'analyse de la marge</p><p className="text-[11px] text-muted-foreground mt-1">Choisissez librement la période de ventes à comparer au coût FIFO. La période ne dépassera jamais la date de situation de l'inventaire.</p></div>\n        <div className="grid sm:grid-cols-2 gap-3">\n          <label className="text-xs font-black">Du<input type="date" value={marginFromDate} onChange={event => setMarginFromDate(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background p-3"/></label>\n          <label className="text-xs font-black">Au<input type="date" value={marginToDate} onChange={event => setMarginToDate(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background p-3"/></label>\n        </div>\n        <div className="flex flex-wrap gap-2">\n          {[30,90,180,365].map(days => <button key={days} type="button" onClick={() => { const end = new Date(asOfLocal); const start = new Date(end); start.setDate(start.getDate() - days + 1); const f=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; setMarginFromDate(f(start)); setMarginToDate(f(end)); }} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold">{days} j</button>)}\n        </div>\n      </div>'''
once(needle, replacement)

# Add editable period selector to active/history session as well.
needle = '''      <ReportCards report={report} margin={scopedMargin} loading={marginLoading}/>'''
replacement = '''      <div className="rounded-2xl border border-border bg-card p-4">\n        <div className="flex flex-col sm:flex-row sm:items-end gap-3">\n          <div className="flex-1"><p className="text-sm font-black">Période d'analyse de la marge FIFO</p><p className="text-[11px] text-muted-foreground mt-1">Modifiable à tout moment, sans changer la date de situation ni le comptage.</p></div>\n          <label className="text-xs font-black">Du<input type="date" value={marginFromDate} onChange={event => setMarginFromDate(event.target.value)} className="mt-1 block rounded-xl border border-border bg-background p-2.5"/></label>\n          <label className="text-xs font-black">Au<input type="date" value={marginToDate} onChange={event => setMarginToDate(event.target.value)} className="mt-1 block rounded-xl border border-border bg-background p-2.5"/></label>\n        </div>\n      </div>\n\n      <ReportCards report={report} margin={scopedMargin} loading={marginLoading} periodLabel={marginPeriodLabel}/>'''
once(needle, replacement)

# Product row uses same dynamic label.
s = s.replace('Marge réalisée FIFO · 30 j :', 'Marge réalisée FIFO · {marginPeriodLabel} :')

p.write_text(s)
