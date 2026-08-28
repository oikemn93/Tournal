from pathlib import Path
p=Path('src/app/screens/InventoryView.tsx')
s=p.read_text()
s=s.replace('function liveReport(lines: InventoryLine[], drafts: Record<number, CountDraft>): InventoryReport {', 'function liveReport(lines: InventoryLine[], drafts: Record<number, CountDraft>): InventoryReport {')
start=s.index('function liveReport(')
end=s.index('\nfunction ReportCards', start)
s=s[:start]+'''function liveReport(lines: InventoryLine[], drafts: Record<number, CountDraft>): InventoryReport {
  return lines.reduce<InventoryReport>((report, line) => {
    const counted = countedFromDraft(line, drafts[line.productId] ?? initialDraft(line));
    const actual = counted ?? line.countedQty;
    const theoretical = line.finalTheoreticalQty ?? line.theoreticalQty;
    report.theoreticalCost += line.fifoTheoreticalCost;
    if (actual != null) {
      const unit = theoretical > 0 ? line.fifoTheoreticalCost / theoretical : line.fifoUnitCost;
      report.countedCost += actual * unit;
      report.varianceCost += actual * unit - line.fifoTheoreticalCost;
    }
    return report;
  }, { ...zeroReport });
}
'''+s[end:]
start=s.index('function ReportCards(')
end=s.index('\nexport function InventoryView', start)
s=s[:start]+'''function ReportCards({ report }: { report: InventoryReport }) {
  const variancePositive = report.varianceCost >= 0;
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Valeur FIFO théorique</p><p className="mt-1 text-lg font-black">{money(report.theoreticalCost)}</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Valeur FIFO inventoriée</p><p className="mt-1 text-lg font-black">{money(report.countedCost)}</p></div>
    <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs font-bold text-muted-foreground">Écart de valorisation FIFO</p><p className={`mt-1 text-lg font-black ${variancePositive ? "text-emerald-700" : "text-red-700"}`}>{report.varianceCost > 0 ? "+" : ""}{money(report.varianceCost)}</p><p className="text-[11px] text-muted-foreground mt-1">Sans prix de vente théorique</p></div>
  </div>;
}
'''+s[end:]
s=s.replace('  const [historyLoading, setHistoryLoading] = useState(true);', '  const [historyLoading, setHistoryLoading] = useState(true);\n  const [asOfLocal, setAsOfLocal] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });')
s=s.replace('const next = await startInventorySession({ boutiqueId: boutique.id, scopeType, scopeId: scopeType === "all" ? null : scopeId });', 'const next = await startInventorySession({ boutiqueId: boutique.id, scopeType, scopeId: scopeType === "all" ? null : scopeId, asOfAt: new Date(asOfLocal).toISOString() });')
s=s.replace('<p className="text-xs text-muted-foreground mt-1">Le stock théorique et les prix sont figés au démarrage pour produire un rapport fiable.</p>', '<p className="text-xs text-muted-foreground mt-1">Choisissez une date de situation. Le stock théorique est reconstruit à cette date et valorisé en FIFO.</p>\n      </div>\n      <label className="block text-sm font-black">Date et heure de situation\n        <input type="datetime-local" max={(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); })()} value={asOfLocal} onChange={event => setAsOfLocal(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/>\n        <span className="block text-[11px] font-normal text-muted-foreground mt-1">Les mouvements postérieurs restent hors de cette situation et ne sont pas perdus lors de la finalisation.</span>\n      </label>\n      <div>')
s=s.replace('Démarré le {new Date(session.startedAt).toLocaleString("fr-FR")}', 'Situation au {new Date(session.asOfAt).toLocaleString("fr-FR")} · démarré le {new Date(session.startedAt).toLocaleString("fr-FR")}')
s=s.replace(' · Achat {money(line.purchasePrice)} · Vente {money(line.salePrice)}', ' · Coût FIFO moyen {money(theoretical > 0 ? line.fifoTheoreticalCost / theoretical : line.fifoUnitCost)}')
s=s.replace('<div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Impact coût</p><p className="font-black">{money(Number(line.differenceQty ?? 0) * line.purchasePrice)}</p></div>\n              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Impact CA</p><p className="font-black">{money(Number(line.differenceQty ?? 0) * line.salePrice)}</p></div>', '<div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Valeur FIFO</p><p className="font-black">{money(line.fifoCountedCost)}</p></div>\n              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Coût FIFO / unité</p><p className="font-black">{money(line.fifoUnitCost)}</p></div>')
s=s.replace('La finalisation recalcule le stock théorique courant et applique tous les écarts dans une seule transaction.', 'La finalisation applique au stock courant uniquement l’écart constaté à la date de situation, sans écraser les mouvements postérieurs.')
p.write_text(s)

p=Path('src/lib/inventoryApi.ts')
s=p.read_text().replace('Number(line.fifoTheoreticalCost ?? line.theoreticalQty * line.purchasePrice ?? 0)', 'Number(line.fifoTheoreticalCost ?? (Number(line.theoreticalQty ?? 0) * Number(line.purchasePrice ?? 0)))')
p.write_text(s)
