import fs from 'node:fs';

const path = 'src/app/screens/POSView.tsx';
let source = fs.readFileSync(path, 'utf8');
const before = 'const canCancelOrder = (invoice: Invoice) => canCancelPendingOrder && canManagePendingOrder(invoice) && invoice.origin !== "client_profile";';
const after = 'const canCancelOrder = (invoice: Invoice) => canCancelPendingOrder && invoice.origin !== "client_profile";';
if (!source.includes(before)) {
  if (source.includes(after)) process.exit(0);
  throw new Error('POS cancellation permission guard shape changed');
}
source = source.replace(before, after);
fs.writeFileSync(path, source);
