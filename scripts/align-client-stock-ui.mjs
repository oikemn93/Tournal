import fs from 'node:fs';

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`pattern not found: ${label}`);
  return source.replace(search, replacement);
}

// The previous pass already aligned the Clients/POS local state with the
// database stock lifecycle. Keep explicit assertions so this patch cannot run
// against an older branch and silently produce a mixed model.
const clients=fs.readFileSync('src/app/screens/ClientsView.tsx','utf8');
if (clients.includes('pendingDeliveries = ventes.filter')) throw new Error('ClientsView still contains legacy delivery reminders');
const pos=fs.readFileSync('src/app/screens/POSView.tsx','utf8');
if (!pos.includes('stockDeductedAt:orderOrigin === "client_profile"')) throw new Error('POSView client stock state is not aligned');

const facturesPath='src/app/screens/FacturesView.tsx';
let factures=fs.readFileSync(facturesPath,'utf8');

factures=replaceRequired(
  factures,
  `    const totalSplit = roundMoney(validSplit.reduce((s, e) => s + e.amount, 0));\n    if (validSplit.length === 0 || totalSplit <= 0) return;\n    if (moneyExceeds(totalSplit, invoiceRemainingAmount(encaissInv))) {\n      alert("Le total des paiements dépasse le reste à encaisser.");\n      return;\n    }`,
  `    const totalSplit = roundMoney(validSplit.reduce((s, e) => s + e.amount, 0));\n    if (validSplit.length === 0 || totalSplit <= 0) return;\n    const remainingDue = invoiceRemainingAmount(encaissInv);\n    const isCounterInvoice = (encaissInv.origin ?? "pos") === "pos";\n    if (isCounterInvoice && Math.abs(totalSplit - remainingDue) > 0.01) {\n      alert("Client comptoir : la facture doit être encaissée intégralement.");\n      return;\n    }\n    if (moneyExceeds(totalSplit, remainingDue)) {\n      alert("Le total des paiements dépasse le reste à encaisser.");\n      return;\n    }`,
  'counter full-payment submit guard',
);

factures=replaceRequired(
  factures,
  `    const cTel = selectedClient?.tel;\n    let persisted;\n    try {\n      persisted = await createSale({ boutiqueId:boutique.id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, lines });`,
  `    const cTel = selectedClient?.tel;\n    // A registered client always follows the Clients lifecycle even when this\n    // legacy invoice composer is used: stock is committed independently from\n    // payment, and partial/no payment remains allowed.\n    const saleOrigin: "pos"|"client_profile" = selectedClient ? "client_profile" : "pos";\n    let persisted;\n    try {\n      persisted = await createSale({ boutiqueId:boutique.id, clientId:selectedClient?.id, client:selectedClientName, clientTel:cTel, lines, origin:saleOrigin });`,
  'registered-client invoice origin',
);

factures=replaceRequired(
  factures,
  `      operatorNom:currentUser.nom, operatorColor:currentUser.color,\n      paymentMethod:initialPayment ? initialPayment.payment.payment_method as PaymentMethod : undefined,`,
  `      operatorNom:currentUser.nom, operatorColor:currentUser.color, origin:saleOrigin,\n      stockDeductedAt:saleOrigin === "client_profile" || initialPayment?.stock_deducted ? new Date().toISOString() : undefined,\n      paymentMethod:initialPayment ? initialPayment.payment.payment_method as PaymentMethod : undefined,`,
  'new invoice local stock/origin state',
);

factures=replaceRequired(
  factures,
  `            <div className="flex justify-between items-baseline mt-1 pt-2 border-t border-border">\n              <span className="text-xs font-bold">Reste dû</span>\n              <span className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(invoiceRemainingAmount(encaissInv))}</span>\n            </div>\n          </div>\n\n          {/* Multi-mode payment split */}`,
  `            <div className="flex justify-between items-baseline mt-1 pt-2 border-t border-border">\n              <span className="text-xs font-bold">Reste dû</span>\n              <span className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(invoiceRemainingAmount(encaissInv))}</span>\n            </div>\n          </div>\n          {(encaissInv.origin ?? "pos") === "pos" && <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Comptoir : encaissement intégral obligatoire. Plusieurs modes de paiement sont possibles, mais leur somme doit couvrir 100 % du reste dû.</div>}\n\n          {/* Multi-mode payment split */}`,
  'counter payment UX notice',
);

factures=replaceRequired(
  factures,
  `            <SubmitBtn color={boutique.color} label={submittingPayment ? "Encaissement…" : "Confirmer l'encaissement"} onClick={submitEncaiss}\n              disabled={submittingPayment || encaissSplit.reduce((s,e)=>s+e.amount,0)<=0}/>` ,
  `            <SubmitBtn color={boutique.color} label={submittingPayment ? "Encaissement…" : "Confirmer l'encaissement"} onClick={submitEncaiss}\n              disabled={submittingPayment || encaissSplit.reduce((s,e)=>s+e.amount,0)<=0 || ((encaissInv.origin ?? "pos") === "pos" && Math.abs(roundMoney(encaissSplit.reduce((s,e)=>s+e.amount,0)) - invoiceRemainingAmount(encaissInv)) > 0.01)}/>` ,
  'counter payment submit disabled until full amount',
);

fs.writeFileSync(facturesPath,factures);
