from pathlib import Path

path = Path('src/app/utils/invoice.ts')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    '''export function buildOrderTicketHtml(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean): string {
  const fnum = (n: number) => n.toLocaleString("fr-FR");
  const now = new Date();
  const lines = inv.lines ?? [];''',
    '''export function buildOrderTicketHtml(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean): string {
  const fnum = (n: number) => n.toLocaleString("fr-FR");
  const printedAt = new Date();
  const parsedCreatedAt = inv.dateRaw ? new Date(inv.dateRaw) : null;
  const hasCreatedAt = parsedCreatedAt != null && !Number.isNaN(parsedCreatedAt.getTime());
  const createdLabel = hasCreatedAt
    ? parsedCreatedAt!.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : inv.date;
  const printedLabel = printedAt.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const lines = inv.lines ?? [];''',
    'order ticket original timestamp',
)

replace_once(
    '''<div class="row"><span>Date</span><span class="value">${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span></div>''',
    '''<div class="row"><span>Créée le</span><span class="value">${createdLabel}</span></div>
${isDuplicate ? `<div class="row"><span>Réimprimée le</span><span class="value">${printedLabel}</span></div>` : ""}''',
    'order ticket dates',
)

replace_once(
    '''${lines.map(l=>`<div style="margin:1.5mm 0;"><div class="bold">${l.nom}</div><div class="row small" style="margin-top:0.5mm;"><span>${fnum(l.qty)}&nbsp;${l.unit}&nbsp;×&nbsp;${fnum(l.prixUnit)}&nbsp;F</span><span class="bold" style="color:#000;">${fnum(l.qty*l.prixUnit)}&nbsp;F</span></div></div>`).join("")}''',
    '''${lines.map(l=>`<div style="margin:1.5mm 0;"><div class="bold">${l.nom}</div><div class="row small" style="margin-top:0.5mm;"><span>${fnum(lineDispQty(l))}&nbsp;${lineDispUnit(l)}&nbsp;×&nbsp;${fnum(l.prixUnit)}&nbsp;F</span><span class="bold" style="color:#000;">${fnum(lineTotal(l))}&nbsp;F</span></div></div>`).join("")}''',
    'order ticket display unit and total',
)

replace_once(
    '''<div class="alert">⚠ À RÉGLER EN CAISSE ⚠<br/>Ce bon n'est pas une preuve de paiement</div>''',
    '''<div class="alert">⚠ NON PAYÉ — À RÉGLER EN CAISSE ⚠<br/>Ce bon n'est pas une preuve de paiement</div>''',
    'order ticket unpaid warning',
)

path.write_text(text)
print('Order ticket printing corrected successfully')
