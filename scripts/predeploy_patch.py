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
    '''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const operator = inv.operatorNom ?? fallbackOperator ?? "—";
  const paymentRows = inv.payments?.length
    ? inv.payments.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
    : inv.paymentSplit?.length
      ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
      : inv.paymentMethod && inv.acompte > 0
        ? [{ method:inv.paymentMethod, amount:inv.acompte }]
        : [];''',
    '''export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const isReturn = inv.type === "Retour";
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const paymentEvents = [...(inv.payments ?? [])].sort((a,b) => a.paidAt.localeCompare(b.paidAt));
  const lastPayment = paymentEvents.length ? paymentEvents[paymentEvents.length - 1] : undefined;
  const seller = inv.operatorNom ?? "—";
  const cashier = lastPayment?.operatorName ?? fallbackOperator ?? seller;
  const parsedSaleDate = inv.dateRaw ? new Date(inv.dateRaw) : null;
  const saleDateLabel = parsedSaleDate && !Number.isNaN(parsedSaleDate.getTime())
    ? parsedSaleDate.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : inv.date;
  const parsedPaidAt = lastPayment?.paidAt ? new Date(lastPayment.paidAt) : null;
  const paidDateLabel = parsedPaidAt && !Number.isNaN(parsedPaidAt.getTime())
    ? parsedPaidAt.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : null;
  const printedLabel = new Date().toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const paymentRows = paymentEvents.length
    ? paymentEvents.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
    : inv.paymentSplit?.length
      ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
      : inv.paymentMethod && inv.acompte > 0
        ? [{ method:inv.paymentMethod, amount:inv.acompte }]
        : [];''',
    'receipt payment metadata',
)

replace_once(
    '''  ${isReturn ? `<div class="bold big" style="margin-top:2mm;border:2px solid #000;padding:1mm 2mm;">RETOUR / AVOIR</div>` : ""}
</div>
<div class="sep-solid"></div>
<div class="row"><span class="label">N°</span><span class="value">${inv.id}</span></div>
<div class="row"><span class="label">Date</span><span class="value">${inv.date}</span></div>
<div class="row"><span class="label">Client</span><span class="value">${inv.client}${inv.clientTel ? " · " + inv.clientTel : ""}</span></div>
<div class="row"><span class="label">Opérateur</span><span class="value">${operator}</span></div>''',
    '''  ${isReturn ? `<div class="bold big" style="margin-top:2mm;border:2px solid #000;padding:1mm 2mm;">RETOUR / AVOIR</div>` : ""}
  ${isDuplicate ? `<div class="bold" style="margin-top:2mm;border:2px solid #000;padding:1mm 2mm;letter-spacing:2px;">DUPLICATA</div>` : ""}
</div>
<div class="sep-solid"></div>
<div class="row"><span class="label">N°</span><span class="value">${inv.id}</span></div>
<div class="row"><span class="label">Commande</span><span class="value">${saleDateLabel}</span></div>
${paidDateLabel ? `<div class="row"><span class="label">Encaissement</span><span class="value">${paidDateLabel}</span></div>` : ""}
${isDuplicate ? `<div class="row"><span class="label">Réimpression</span><span class="value">${printedLabel}</span></div>` : ""}
<div class="row"><span class="label">Client</span><span class="value">${inv.client}${inv.clientTel ? " · " + inv.clientTel : ""}</span></div>
<div class="row"><span class="label">Vendeur</span><span class="value">${seller}</span></div>
${!isReturn && inv.acompte > 0 ? `<div class="row"><span class="label">Caissier</span><span class="value">${cashier}</span></div>` : ""}''',
    'receipt header metadata',
)

replace_once(
    '''  <div class="row">
    <span class="label">Acompte versé</span>
    <span class="value">${fnum(inv.acompte)}&nbsp;F</span>
  </div>
  <div class="row">
    <span class="label">Reste à payer</span>
    <span class="value">${fnum(reste)}&nbsp;F</span>
  </div>''',
    '''  <div class="row">
    <span class="label">Total facture</span>
    <span class="value">${fnum(inv.montant)}&nbsp;F</span>
  </div>
  <div class="row">
    <span class="label">Total encaissé</span>
    <span class="value">${fnum(inv.acompte)}&nbsp;F</span>
  </div>
  <div class="row">
    <span class="label">Reste à payer</span>
    <span class="value">${fnum(reste)}&nbsp;F</span>
  </div>''',
    'receipt totals labels',
)

path.write_text(text)
print('Receipt payment metadata corrected successfully')
