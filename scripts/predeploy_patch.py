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
    '''  const isReturn = inv.type === "Retour";
  const clientRecord = clients.find(c => c.nom === inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const accent = isReturn ? "#dc2626" : boutique.color;''',
    '''  const isReturn = inv.type === "Retour";
  const clientRecord = inv.clientId != null
    ? clients.find(c => c.id === inv.clientId)
    : clients.find(c => c.nom === inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const accent = isReturn ? "#dc2626" : boutique.color;
  const paymentEvents = [...(inv.payments ?? [])].sort((a,b) => a.paidAt.localeCompare(b.paidAt));
  const rawPayments = paymentEvents.length
    ? paymentEvents.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
    : inv.paymentSplit?.length
      ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
      : inv.paymentMethod && inv.acompte > 0
        ? [{ method:inv.paymentMethod, amount:inv.acompte }]
        : [];
  const paymentByMethod = new Map<string,number>();
  for (const payment of rawPayments) paymentByMethod.set(payment.method, (paymentByMethod.get(payment.method) ?? 0) + payment.amount);
  const paymentRows = [...paymentByMethod.entries()].map(([method, amount]) => ({ method, amount }));
  const lastPayment = paymentEvents.length ? paymentEvents[paymentEvents.length - 1] : undefined;
  const cashier = lastPayment?.operatorName ?? null;
  const parsedPaidAt = lastPayment?.paidAt ? new Date(lastPayment.paidAt) : null;
  const paidAtFormatted = parsedPaidAt && !Number.isNaN(parsedPaidAt.getTime())
    ? parsedPaidAt.toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : null;''',
    'invoice client and payment metadata',
)

replace_once(
    '''  const today = new Date(inv.date + "T00:00:00");
  const dateFormatted = today.toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });''',
    '''  const parsedInvoiceDate = inv.dateRaw ? new Date(inv.dateRaw) : null;
  const dateFormatted = parsedInvoiceDate && !Number.isNaN(parsedInvoiceDate.getTime())
    ? parsedInvoiceDate.toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })
    : inv.date;''',
    'invoice PDF canonical date',
)

replace_once(
    '''  .totals-reste-value { font-size: 10pt; font-weight: 900; color: ${statusColor}; }
  .footer { margin-top: 10mm; padding-top: 6mm; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-end; }''',
    '''  .totals-reste-value { font-size: 10pt; font-weight: 900; color: ${statusColor}; }
  .payment-block { margin: 0 0 8mm auto; width: 86mm; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4mm; }
  .payment-title { font-size: 7pt; font-weight: 900; letter-spacing: 1.4px; color: #777; text-transform: uppercase; margin-bottom: 3px; }
  .payment-row { display: flex; justify-content: space-between; gap: 8mm; padding: 2px 0; font-size: 8.5pt; border-bottom: 1px solid #f2f2f2; }
  .payment-row:last-child { border-bottom: 0; }
  .payment-meta { margin-top: 3mm; padding-top: 2.5mm; border-top: 1px dashed #d1d5db; font-size: 7.8pt; color: #555; line-height: 1.7; }
  .footer { margin-top: 10mm; padding-top: 6mm; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-end; }''',
    'invoice PDF payment styles',
)

replace_once(
    '''      ${lines.length > 1 ? `<div class="totals-row"><span>Sous-total</span><span>${fmtF(subtotal)}</span></div>` : ""}
      ${inv.acompte > 0 ? `<div class="totals-row"><span>Acompte versé</span><span>- ${fmtF(inv.acompte)}</span></div>` : ""}
      <div class="totals-total">
        <span class="totals-total-label">${isReturn ? "Montant remboursé" : "Total à payer"}</span>
        <span class="totals-total-value">${isReturn ? "- " : ""}${fmtF(inv.montant)}</span>
      </div>''',
    '''      ${lines.length > 1 ? `<div class="totals-row"><span>Sous-total</span><span>${fmtF(subtotal)}</span></div>` : ""}
      <div class="totals-total">
        <span class="totals-total-label">${isReturn ? "Montant remboursé" : "Total facture"}</span>
        <span class="totals-total-value">${isReturn ? "- " : ""}${fmtF(inv.montant)}</span>
      </div>
      ${!isReturn && inv.acompte > 0 ? `<div class="totals-row" style="margin-top:4px;"><span>Total encaissé</span><span>${fmtF(inv.acompte)}</span></div>` : ""}''',
    'invoice PDF paid totals',
)

replace_once(
    '''  </div>
  <div class="footer">
    <div class="footer-note">''',
    '''  </div>
  ${!isReturn && (paymentRows.length > 0 || inv.operatorNom || cashier || paidAtFormatted) ? `
  <div class="payment-block">
    ${paymentRows.length > 0 ? `
      <div class="payment-title">${paymentRows.length > 1 ? "Modes de paiement" : "Mode de paiement"}</div>
      ${paymentRows.map(payment => `<div class="payment-row"><span>${payment.method}</span><strong>${fmtF(payment.amount)}</strong></div>`).join("")}
    ` : ""}
    <div class="payment-meta">
      ${inv.operatorNom ? `<div><strong>Vendeur :</strong> ${inv.operatorNom}</div>` : ""}
      ${cashier ? `<div><strong>Caissier :</strong> ${cashier}</div>` : ""}
      ${paidAtFormatted ? `<div><strong>Dernier encaissement :</strong> ${paidAtFormatted}</div>` : ""}
    </div>
  </div>` : ""}
  <div class="footer">
    <div class="footer-note">''',
    'invoice PDF payment block',
)

path.write_text(text)
print('Invoice PDF payment details corrected successfully')
