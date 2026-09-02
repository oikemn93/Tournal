import fs from 'node:fs';
import assert from 'node:assert/strict';

const clients = fs.readFileSync('src/app/screens/ClientsView.tsx','utf8');
const pos = fs.readFileSync('src/app/screens/POSView.tsx','utf8');

assert.ok(!clients.includes('openOrderDocument(viewedInvoice,boutique,boutique.clients)'), 'Bon de commande must not be exposed in Client invoice modal');
assert.ok(!clients.includes('const canReturnInvoice ='), 'Return predicate must not be list-scoped');
assert.ok(!clients.includes('const canEdit = canCreateOrder'), 'Edit predicate must not be list-scoped');
assert.equal((clients.match(/Retourner des articles/g) || []).length, 1, 'Return action must exist only in opened invoice context');
assert.equal((clients.match(/Modifier la commande/g) || []).length, 1, 'Edit action must exist only in opened invoice context');
assert.ok(clients.includes('viewedInvoice&&<Modal'), 'Opened invoice modal must remain available');
assert.ok(clients.includes('!!viewedInvoice.stockDeductedAt'), 'Return action must still require committed stock');
assert.ok(clients.includes('viewedInvoice.origin === "client_profile" && viewedInvoice.status === "en attente"'), 'Edit action must remain restricted to pending Client orders');
assert.ok(pos.includes('await doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente");'), 'Paid express sale must await receipt print attempt');
assert.ok(!pos.includes('setTimeout(() => doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente"), 150);'), 'Express receipt printing must not be fire-and-forget');

console.log('Client invoice actions and express receipt regressions: OK');
