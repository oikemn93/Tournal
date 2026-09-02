import fs from 'node:fs';
const p='src/app/screens/ClientsView.tsx';
let s=fs.readFileSync(p,'utf8');
s=s.replace('cancelPendingInvoice, confirmClientDelivery, createClient,', 'cancelPendingInvoice, createClient,');
s=s.replace('  const [confirmingDeliveryId, setConfirmingDeliveryId] = useState<string|null>(null);\n','');
const start=s.indexOf('    async function confirmDelivery(invoice: Invoice) {');
const end=s.indexOf('    async function applyAdvanceToInvoice(invoice: Invoice) {',start);
if(start<0||end<0) throw new Error('confirmDelivery block not found');
s=s.slice(0,start)+s.slice(end);
s=s.replace('{pendingDeliveries.length>0&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"><CalendarClock size={13} className="mr-1 inline"/> {pendingDeliveries.length} livraison{pendingDeliveries.length>1?"s":""} à confirmer · stock non déduit</div>}','');
s=s.replace('              const deliveryPending = !isReturn && inv.origin==="client_profile" && inv.status!=="annulée" && !inv.stockDeductedAt;\n','');
s=s.replace('                  {deliveryPending&&<p className="ml-1 mt-1 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-black text-amber-800">📦 Livraison à confirmer</p>}\n','');
// Remove any explicit confirm-delivery action in the invoice row/modal.
s=s.replace(/\{deliveryPending&&<button[^}]*confirmDelivery\(inv\)[\s\S]*?<\/button>\}/g,'');
fs.writeFileSync(p,s);
