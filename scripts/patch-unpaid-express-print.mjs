import fs from 'node:fs';

const path='src/app/screens/POSView.tsx';
let s=fs.readFileSync(path,'utf8');
const from='        setExpDone(true);\n        setTimeout(() => { setExpressModal(null); setExpDone(false); setExpBusy(false); }, 1200);\n        return;';
const to='        setExpDone(true);\n        await doPrint(buildOrderTicketHtml(newInv, boutique, currentUser.nom), "Commande express non encaissée");\n        setTimeout(() => { setExpressModal(null); setExpDone(false); setExpBusy(false); }, 1200);\n        return;';
if(!s.includes(from)) throw new Error('target not found');
s=s.replace(from,to);
fs.writeFileSync(path,s);

const testPath='scripts/test-client-invoice-actions.mjs';
let t=fs.readFileSync(testPath,'utf8');
const marker='assert.ok(pos.includes(\'await doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente");\'), \'Paid express sale must await receipt print attempt\');\n';
if(!t.includes(marker)) throw new Error('test marker not found');
t=t.replace(marker, marker+"assert.ok(pos.includes('await doPrint(buildOrderTicketHtml(newInv, boutique, currentUser.nom), \\\"Commande express non encaissée\\\");'), 'Unpaid express order must await printable non-paid ticket');\n");
fs.writeFileSync(testPath,t);

// one-shot trigger
