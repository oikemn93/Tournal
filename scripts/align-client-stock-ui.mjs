import fs from 'node:fs';

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`pattern not found: ${label}`);
  return source.replace(search, replacement);
}

const clientsPath='src/app/screens/ClientsView.tsx';
let clients=fs.readFileSync(clientsPath,'utf8');
clients=clients.replace('    const pendingDeliveries = ventes.filter(i=>i.origin==="client_profile"&&i.status!=="annulée"&&!i.stockDeductedAt);\n','');
fs.writeFileSync(clientsPath,clients);

const posPath='src/app/screens/POSView.tsx';
let pos=fs.readFileSync(posPath,'utf8');
pos=replaceRequired(
  pos,
  'import type { Boutique, CartItem, Invoice, Product, PlatformUser, PaymentMethod, StockEntry } from "../types";',
  'import type { Boutique, CartItem, Invoice, Product, PlatformUser, PaymentMethod } from "../types";',
  'remove unused StockEntry import',
);
pos=replaceRequired(
  pos,
  '  // Client workspace can reopen an unpaid order for editing. The existing\n  // updatePendingInvoice path preserves the invoice number and only rewrites\n  // the order lines/total; no stock movement has happened before payment.\n',
  '  // Client workspace can reopen an unpaid order for editing. Client orders\n  // consume stock independently from payment; the backend atomically releases\n  // the old lines and recommits the edited lines before the transaction ends.\n',
  'client order edit comment',
);
pos=replaceRequired(
  pos,
  '          date:today(), dateRaw:new Date().toISOString(), dueDate:saved.due_date ?? undefined, status:"en attente", type:"vente",\n          operatorId:currentUser.id, operatorNom:currentUser.nom, operatorColor:currentUser.color, origin:orderOrigin,\n        };',
  '          date:today(), dateRaw:new Date().toISOString(), dueDate:saved.due_date ?? undefined, status:"en attente", type:"vente",\n          operatorId:currentUser.id, operatorNom:currentUser.nom, operatorColor:currentUser.color, origin:orderOrigin,\n          stockDeductedAt:orderOrigin === "client_profile" ? new Date().toISOString() : undefined,\n        };',
  'unpaid express client stock state',
);
pos=replaceRequired(
  pos,
  '        payments:paidPayments, origin:orderOrigin,\n      };\n      const saleEntries: StockEntry[] = paid.stock_deducted\n        ? [{ id:Date.now(), productId:line.productId, qty:-line.qty, unit:line.unit, montantDu:0, date:today(), fournisseur:`Vente ${saved.invoice_id}`, invoiceId:saved.invoice_id }]\n        : [];',
  '        payments:paidPayments, origin:orderOrigin, stockDeductedAt:new Date().toISOString(),\n      };',
  'paid express stock state',
);
pos=replaceRequired(
  pos,
  '        status:"en attente", type:"vente", operatorId:editingInvoice?.operatorId ?? currentUser.id, operatorNom:editingInvoice?.operatorNom ?? currentUser.nom, operatorColor:editingInvoice?.operatorColor ?? currentUser.color, origin:editingInvoice?.origin ?? orderOrigin,\n      };',
  '        status:"en attente", type:"vente", operatorId:editingInvoice?.operatorId ?? currentUser.id, operatorNom:editingInvoice?.operatorNom ?? currentUser.nom, operatorColor:editingInvoice?.operatorColor ?? currentUser.color, origin:editingInvoice?.origin ?? orderOrigin,\n        stockDeductedAt:(editingInvoice?.origin ?? orderOrigin) === "client_profile" ? new Date().toISOString() : undefined,\n      };',
  'standard client order stock state',
);
fs.writeFileSync(posPath,pos);
