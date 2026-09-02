import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 occurrence, found ${count}`);
  return source.replace(from, to);
}

const clientsPath = 'src/app/screens/ClientsView.tsx';
let clients = fs.readFileSync(clientsPath, 'utf8');

clients = replaceOnce(
  clients,
  'import { generatePaymentReceiptPDFBlob, openInvoicePDF, openOrderDocument, openPaymentReceiptPreview, openReceiptPreview } from "../utils/invoice";',
  'import { generatePaymentReceiptPDFBlob, openInvoicePDF, openPaymentReceiptPreview, openReceiptPreview } from "../utils/invoice";',
  'remove client order-document import',
);

clients = replaceOnce(
  clients,
  '              const canEdit = canCreateOrder && (canManageAnyPendingOrder || inv.operatorId === currentUser.id) && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;\n              const canReturnInvoice = canReturn && !isReturn && inv.status !== "annulée" && !!inv.stockDeductedAt && (inv.lines?.length ?? 0) > 0 && invoiceHasReturnable(inv);\n',
  '',
  'remove list-only edit/return predicates',
);

clients = replaceOnce(
  clients,
  '                  {canReturnInvoice&&<button type="button" onClick={()=>startClientReturn(inv)} className="rounded-lg px-2 py-2 text-[11px] font-black inline-flex items-center gap-1" style={{background:"#fef2f2",color:"#dc2626"}} title="Retourner des articles"><RotateCcw size={12}/> Retour</button>}\n                  {canEdit&&<button type="button" onClick={()=>{setEditingClientInvoice(inv);setOrderClient(c);}} className="rounded-lg px-2 py-2 text-[11px] font-black" style={{background:"#eff6ff",color:"#1d4ed8"}}>Modifier</button>}\n',
  '',
  'remove edit/return buttons from invoice list',
);

clients = replaceOnce(
  clients,
  '          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>{setShareInvoice(viewedInvoice);setViewedInvoice(null);}} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black inline-flex items-center justify-center gap-1.5"><Send size={14}/> Envoyer</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n            {viewedInvoice.type.toLowerCase() !== "retour" && <button type="button" onClick={()=>openOrderDocument(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📋 Bon de commande</button>}\n          </div>',
  '          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>{setShareInvoice(viewedInvoice);setViewedInvoice(null);}} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black inline-flex items-center justify-center gap-1.5"><Send size={14}/> Envoyer</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n          </div>',
  'remove client order document action',
);

fs.writeFileSync(clientsPath, clients);

const posPath = 'src/app/screens/POSView.tsx';
let pos = fs.readFileSync(posPath, 'utf8');
pos = replaceOnce(
  pos,
  '      setExpDone(true);\n      setTimeout(() => doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente"), 150);\n      setTimeout(() => {',
  '      setExpDone(true);\n      // A paid express sale must attempt its receipt before the express flow is dismissed.\n      // Awaiting the print adapter avoids losing the job if the modal/view unmounts immediately.\n      await doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente");\n      setTimeout(() => {',
  'make express receipt printing deterministic',
);
fs.writeFileSync(posPath, pos);
