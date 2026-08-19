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
    '''  const lines = inv.lines ?? [];
  const operator = inv.operatorNom ?? fallbackOperator ?? "—";
  const COL = 32;''',
    '''  const lines = inv.lines ?? [];
  const operator = inv.operatorNom ?? fallbackOperator ?? "—";
  const paymentRows = inv.payments?.length
    ? inv.payments.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
    : inv.paymentSplit?.length
      ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
      : inv.paymentMethod && inv.acompte > 0
        ? [{ method:inv.paymentMethod, amount:inv.acompte }]
        : [];
  const COL = 32;''',
    'receipt payment rows',
)

replace_once(
    '''  ${inv.paymentMethod ? `<div class="row"><span class="label">Mode de paiement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;">''',
    '''  ${paymentRows.length > 0 ? `
  <div class="sep-dash"></div>
  <div class="bold small" style="margin-bottom:1mm;">PAIEMENTS</div>
  ${paymentRows.map(payment => `<div class="row"><span class="label">${payment.method}</span><span class="value">${fnum(payment.amount)}&nbsp;F</span></div>`).join("")}
  ` : ""}
  <div style="text-align:right;margin-top:1.5mm;">''',
    'receipt multipayment detail',
)

path.write_text(text)
print('Receipt multipayment detail patched successfully')
