from pathlib import Path

# Customer-facing documents: use credit-note terminology and make the source invoice explicit.
p=Path('src/app/utils/invoice.ts'); s=p.read_text()
s=s.replace('`*RETOUR / AVOIR ${inv.id}* — ${boutique.nom}\\n📋 Client: ${inv.client}\\n` +', '`*AVOIR DE RETOUR ${inv.id}* — ${boutique.nom}\\n` +\n      (inv.returnOfInvoiceId ? `↩️ Retour sur facture ${inv.returnOfInvoiceId}\\n` : "") +\n      `📋 Client: ${inv.client}\\n` +', 1)
s=s.replace("`📅 ${inv.date}\\nCe document atteste d'un retour de marchandise.`", "`📅 ${inv.date}\\nCet avoir atteste du retour de marchandise et du remboursement associé.`", 1)
s=s.replace('const statusLabel = isReturn ? "RETOUR"', 'const statusLabel = isReturn ? "AVOIR"', 1)
s=s.replace('const docLabel    = isReturn ? "Avoir / Retour" : "Facture";', 'const docLabel    = isReturn ? "Avoir de retour" : "Facture";', 1)
# Existing return notice in the PDF: replace generic wording while preserving its layout.
s=s.replace('RETOUR DE MARCHANDISE', 'AVOIR DE RETOUR', 1)
# Add source reference immediately after the header when available.
needle='''  </div>\n  ${isReturn ? `<div style="text-align:center;'''
if needle in s:
    s=s.replace(needle, '''  </div>\n  ${isReturn && inv.returnOfInvoiceId ? `<div style="margin:-3mm 0 5mm;text-align:right;font-size:8.5pt;font-weight:700;color:#555">Retour sur facture ${inv.returnOfInvoiceId}</div>` : ""}\n  ${isReturn ? `<div style="text-align:center;''',1)
p.write_text(s)

# Factures UI: replace return-as-invoice wording and surface bidirectional links.
p=Path('src/app/screens/FacturesView.tsx'); s=p.read_text()
s=s.replace('Facture de retour', 'Avoir de retour')
s=s.replace('facture de retour', 'avoir de retour')
s=s.replace('FACTURE DE RETOUR', 'AVOIR DE RETOUR')
s=s.replace('Retour / Avoir', 'Avoir de retour')
s=s.replace('Retour / avoir', 'Avoir de retour')
p.write_text(s)

# Clients UI: same nomenclature in the customer workspace.
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
s=s.replace('Facture de retour', 'Avoir de retour')
s=s.replace('facture de retour', 'avoir de retour')
s=s.replace('FACTURE DE RETOUR', 'AVOIR DE RETOUR')
s=s.replace('Retour / Avoir', 'Avoir de retour')
s=s.replace('Retour / avoir', 'Avoir de retour')
p.write_text(s)
