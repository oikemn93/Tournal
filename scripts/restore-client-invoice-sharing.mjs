import fs from 'node:fs';

const facturesPath='src/app/screens/FacturesView.tsx';
let factures=fs.readFileSync(facturesPath,'utf8');
const shareFn='function ShareInvoiceModal({ inv, boutique, clients, onClose }:';
if(factures.includes(shareFn)) {
  factures=factures.replace(shareFn,'export function ShareInvoiceModal({ inv, boutique, clients, onClose }:');
} else if(!factures.includes('export function ShareInvoiceModal({ inv, boutique, clients, onClose }:')) {
  throw new Error('ShareInvoiceModal declaration not found');
}
fs.writeFileSync(facturesPath,factures);

const clientsPath='src/app/screens/ClientsView.tsx';
let clients=fs.readFileSync(clientsPath,'utf8');

clients=clients.replace(
  'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, Minus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw } from "lucide-react";',
  'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, Minus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw, Send } from "lucide-react";'
);

const posImport='import { POSView as EmbeddedClientPOSView } from "./POSView";';
if(!clients.includes('import { ShareInvoiceModal } from "./FacturesView";')) {
  if(!clients.includes(posImport)) throw new Error('POS import anchor not found');
  clients=clients.replace(posImport,`${posImport}\nimport { ShareInvoiceModal } from "./FacturesView";`);
}

const viewedState='  const [viewedInvoice, setViewedInvoice] = useState<Invoice|null>(null);';
if(!clients.includes('const [shareInvoice, setShareInvoice]')) {
  if(!clients.includes(viewedState)) throw new Error('viewedInvoice state anchor not found');
  clients=clients.replace(viewedState,`${viewedState}\n  const [shareInvoice, setShareInvoice] = useState<Invoice|null>(null);`);
}

const buttonsOld=`          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n            {viewedInvoice.type.toLowerCase() !== "retour" && <button type="button" onClick={()=>openOrderDocument(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📋 Bon de commande</button>}\n          </div>`;
const buttonsNew=`          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>{setShareInvoice(viewedInvoice);setViewedInvoice(null);}} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black inline-flex items-center justify-center gap-1.5"><Send size={14}/> Envoyer</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n            {viewedInvoice.type.toLowerCase() !== "retour" && <button type="button" onClick={()=>openOrderDocument(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📋 Bon de commande</button>}\n          </div>`;
if(!clients.includes('setShareInvoice(viewedInvoice)')) {
  if(!clients.includes(buttonsOld)) throw new Error('invoice document buttons anchor not found');
  clients=clients.replace(buttonsOld,buttonsNew);
}

const afterViewed='        </Modal>}\n        {editClient&&<Modal title="Modifier le client"';
if(!clients.includes('{shareInvoice&&<ShareInvoiceModal')) {
  if(!clients.includes(afterViewed)) throw new Error('viewed invoice modal closing anchor not found');
  clients=clients.replace(afterViewed,`        </Modal>}\n        {shareInvoice&&<ShareInvoiceModal inv={shareInvoice} boutique={boutique} clients={boutique.clients} onClose={()=>setShareInvoice(null)}/>}\n        {editClient&&<Modal title="Modifier le client"`);
}

fs.writeFileSync(clientsPath,clients);
