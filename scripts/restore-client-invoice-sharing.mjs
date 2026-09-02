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

const invoicePath='src/app/utils/invoice.ts';
let invoiceUtil=fs.readFileSync(invoicePath,'utf8');
if(!invoiceUtil.includes('export function buildPaymentReceiptHtml')) {
  const anchor='export function openInvoicePDF(inv: Invoice, boutique: Boutique, clients: Client[]) {';
  if(!invoiceUtil.includes(anchor)) throw new Error('invoice utility anchor not found');
  const paymentHelpers=`export type PaymentReceiptData = {\n  id: number|string;\n  invoiceId: string;\n  amount: number;\n  paymentMethod: string;\n  paidAt: string;\n  operatorName: string;\n};\n\nexport function buildPaymentReceiptHtml(payment: PaymentReceiptData, inv: Invoice, client: Client, boutique: Boutique): string {\n  const esc=(value:unknown)=>String(value??\"\").replace(/[&<>\"']/g,ch=>({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",\"\\\"\":\"&quot;\",\"'\":\"&#39;\"}[ch]??ch));\n  const fmtN=(n:number)=>new Intl.NumberFormat(\"fr-FR\").format(n);\n  const parsed=new Date(payment.paidAt);\n  const paidAt=Number.isNaN(parsed.getTime())?payment.paidAt:parsed.toLocaleString(\"fr-FR\",{day:\"2-digit\",month:\"2-digit\",year:\"numeric\",hour:\"2-digit\",minute:\"2-digit\"});\n  const remaining=Math.max(0,inv.montant-invoicePaidAmount(inv));\n  return \`<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"/><title>Justificatif de versement - \${esc(inv.id)}</title><style>@page{size:A5;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;background:#fff}.wrap{max-width:620px;margin:0 auto}.head{border-bottom:2px solid \${boutique.color||\"#111827\"};padding-bottom:18px;margin-bottom:22px}.brand{font-size:22px;font-weight:900;color:\${boutique.color||\"#111827\"}}.muted{color:#6b7280;font-size:12px}.title{font-size:18px;font-weight:900;margin-top:20px}.card{border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin:14px 0}.row{display:flex;justify-content:space-between;gap:20px;padding:7px 0;border-bottom:1px solid #f3f4f6}.row:last-child{border:0}.label{color:#6b7280;font-size:12px}.value{font-weight:800;text-align:right}.amount{font-size:26px;font-weight:900;color:#16a34a}.foot{margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div class=\"wrap\"><div class=\"head\"><div class=\"brand\">\${esc(boutique.nom)}</div><div class=\"muted\">\${esc(boutique.ville)}\${boutique.tel?\` · \${esc(boutique.tel)}\`:\"\"}</div><div class=\"title\">Justificatif de versement</div></div><div class=\"card\"><div class=\"row\"><span class=\"label\">Client</span><span class=\"value\">\${esc(client.nom)}</span></div><div class=\"row\"><span class=\"label\">Facture</span><span class=\"value\">\${esc(inv.id)}</span></div><div class=\"row\"><span class=\"label\">Date du versement</span><span class=\"value\">\${esc(paidAt)}</span></div><div class=\"row\"><span class=\"label\">Mode de paiement</span><span class=\"value\">\${esc(payment.paymentMethod)}</span></div><div class=\"row\"><span class=\"label\">Enregistré par</span><span class=\"value\">\${esc(payment.operatorName)}</span></div></div><div class=\"card\"><div class=\"label\">Montant versé</div><div class=\"amount\">\${fmtN(payment.amount)} F</div><div class=\"row\"><span class=\"label\">Reste dû sur la facture</span><span class=\"value\">\${fmtN(remaining)} F</span></div></div><div class=\"foot\">Ce justificatif atteste de l'enregistrement du versement dans Tournal. Référence : \${esc(inv.id)} / paiement \${esc(payment.id)}.</div></div></body></html>\`;\n}\n\nexport function openPaymentReceiptPreview(payment: PaymentReceiptData, inv: Invoice, client: Client, boutique: Boutique) {\n  const w=window.open(\"\",\"_blank\",\"width=620,height=760\");\n  if(!w)return;\n  w.document.open();\n  w.document.write(hardenGeneratedHtml(buildPaymentReceiptHtml(payment,inv,client,boutique)));\n  w.document.close();\n  w.focus();\n}\n\nexport async function generatePaymentReceiptPDFBlob(payment: PaymentReceiptData, inv: Invoice, client: Client, boutique: Boutique): Promise<Blob> {\n  const [{jsPDF},html2canvasModule]=await Promise.all([import(\"jspdf\"),import(\"html2canvas\")]);\n  const html2canvas=html2canvasModule.default;\n  const iframe=document.createElement(\"iframe\");\n  iframe.style.cssText=\"position:fixed;left:-10000px;top:0;width:620px;height:880px;border:0;visibility:hidden;pointer-events:none;\";\n  document.body.appendChild(iframe);\n  try{\n    const doc=iframe.contentDocument??iframe.contentWindow?.document;\n    if(!doc)throw new Error(\"Préparation du justificatif impossible\");\n    doc.open();doc.write(hardenGeneratedHtml(buildPaymentReceiptHtml(payment,inv,client,boutique)));doc.close();\n    await new Promise(resolve=>setTimeout(resolve,100));\n    if(doc.fonts?.ready)await doc.fonts.ready;\n    doc.body.style.width=\"620px\";doc.body.style.padding=\"36px\";doc.body.style.background=\"#fff\";\n    const canvas=await html2canvas(doc.body,{scale:1.5,useCORS:true,backgroundColor:\"#ffffff\",logging:false});\n    const pdf=new jsPDF({orientation:\"portrait\",unit:\"mm\",format:\"a5\",compress:true});\n    const pageWidth=148,pageHeight=210,imgHeight=canvas.height*pageWidth/canvas.width;\n    const image=canvas.toDataURL(\"image/jpeg\",0.9);let position=0,remaining=imgHeight;\n    pdf.addImage(image,\"JPEG\",0,position,pageWidth,imgHeight,undefined,\"FAST\");remaining-=pageHeight;\n    while(remaining>0){position-=pageHeight;pdf.addPage();pdf.addImage(image,\"JPEG\",0,position,pageWidth,imgHeight,undefined,\"FAST\");remaining-=pageHeight;}\n    return pdf.output(\"blob\");\n  }finally{iframe.remove();}\n}\n\n`;
  invoiceUtil=invoiceUtil.replace(anchor,paymentHelpers+anchor);
  fs.writeFileSync(invoicePath,invoiceUtil);
}

const clientsPath='src/app/screens/ClientsView.tsx';
let clients=fs.readFileSync(clientsPath,'utf8');

clients=clients.replace(
  'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, Minus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw } from "lucide-react";',
  'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, Minus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText, RotateCcw, Send } from "lucide-react";'
);
clients=clients.replace(
  'applyClientAdvanceFifo, applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, deleteClientIfUnused, recordClientPayment, refundClientAdvance, returnSale, updateClientContact',
  'applyClientAdvanceFifo, applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, createInvoiceShare, deleteClientIfUnused, recordClientPayment, refundClientAdvance, returnSale, updateClientContact'
);
clients=clients.replace(
  'import { openInvoicePDF, openOrderDocument, openReceiptPreview } from "../utils/invoice";',
  'import { generatePaymentReceiptPDFBlob, openInvoicePDF, openOrderDocument, openPaymentReceiptPreview, openReceiptPreview } from "../utils/invoice";'
);

const posImport='import { POSView as EmbeddedClientPOSView } from "./POSView";';
if(!clients.includes('import { ShareInvoiceModal } from "./FacturesView";')) {
  if(!clients.includes(posImport)) throw new Error('POS import anchor not found');
  clients=clients.replace(posImport,`${posImport}\nimport { ShareInvoiceModal } from "./FacturesView";`);
}

const viewedState='  const [viewedInvoice, setViewedInvoice] = useState<Invoice|null>(null);';
if(!clients.includes('const [shareInvoice, setShareInvoice]')) {
  if(!clients.includes(viewedState)) throw new Error('viewedInvoice state anchor not found');
  clients=clients.replace(viewedState,`${viewedState}\n  const [shareInvoice, setShareInvoice] = useState<Invoice|null>(null);\n  const [sharingPaymentId, setSharingPaymentId] = useState<number|string|null>(null);`);
}

const buttonsOld=`          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n            {viewedInvoice.type.toLowerCase() !== "retour" && <button type="button" onClick={()=>openOrderDocument(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📋 Bon de commande</button>}\n          </div>`;
const buttonsNew=`          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">\n            <button type="button" onClick={()=>openInvoicePDF(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📄 {viewedInvoice.type.toLowerCase()==="retour" ? "Avoir PDF" : "Facture PDF"}</button>\n            <button type="button" onClick={()=>{setShareInvoice(viewedInvoice);setViewedInvoice(null);}} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black inline-flex items-center justify-center gap-1.5"><Send size={14}/> Envoyer</button>\n            <button type="button" onClick={()=>openReceiptPreview(viewedInvoice,boutique,currentUser.nom)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">🧾 {viewedInvoice.type.toLowerCase()==="retour" ? (Number(viewedInvoice.returnRefundAmount??0)>0 ? "Justificatif remboursement" : "Justificatif avoir") : "Ticket caisse"}</button>\n            {viewedInvoice.type.toLowerCase() !== "retour" && <button type="button" onClick={()=>openOrderDocument(viewedInvoice,boutique,boutique.clients)} className="rounded-xl border border-border bg-card py-3 px-2 text-xs font-black">📋 Bon de commande</button>}\n          </div>`;
if(!clients.includes('setShareInvoice(viewedInvoice)')) {
  if(!clients.includes(buttonsOld)) throw new Error('invoice document buttons anchor not found');
  clients=clients.replace(buttonsOld,buttonsNew);
}

const paymentAnchor='    const paymentHistoryCount = clientPayments.length + clientAdvances.length + clientCreditRefunds.length;';
if(!clients.includes('async function sharePaymentReceipt')) {
  if(!clients.includes(paymentAnchor)) throw new Error('payment history anchor not found');
  clients=clients.replace(paymentAnchor,`${paymentAnchor}\n    async function sharePaymentReceipt(payment: typeof clientPayments[number]) {\n      if(sharingPaymentId!==null)return;\n      const inv=clientInvoices.find(item=>item.id===payment.invoiceId);\n      if(!inv)return;\n      setSharingPaymentId(payment.id);\n      try{\n        const pdf=await generatePaymentReceiptPDFBlob(payment,inv,c,boutique);\n        const share=await createInvoiceShare({boutiqueId:boutique.id,invoiceId:inv.id,pdf});\n        const amount=new Intl.NumberFormat(\"fr-FR\").format(payment.amount);\n        const text=\`Justificatif de versement · \${c.nom} · \${amount} F · facture \${inv.id}\\n\${share.url}\nLien valable 48 h.\`;\n        if(navigator.share){\n          await navigator.share({title:\`Justificatif de versement - \${c.nom}\`,text});\n        }else{\n          const phone=(c.tel??\"\").replace(/[\\s\\-().+]/g,\"\");\n          if(phone)window.open(\`https://wa.me/\${phone}?text=\${encodeURIComponent(text)}\`,\"_blank\");\n          else{await navigator.clipboard?.writeText(text);alert(\"Lien du justificatif copié.\");}\n        }\n      }catch(error){\n        if(error instanceof DOMException&&error.name===\"AbortError\")return;\n        alert(error instanceof Error?error.message:\"Envoi du justificatif impossible\");\n      }finally{setSharingPaymentId(null);}\n    }`);
}

const paymentRow='{clientPayments.slice(0,20).map(payment=><div key={`${payment.invoiceId}-${payment.id}`} className="flex items-center justify-between gap-3 text-xs">\n                <div><p className="font-bold">{payment.invoiceId} · {payment.paymentMethod}</p><p className="text-muted-foreground">{formatPreciseDateTime(payment.paidAt)} · {payment.operatorName}</p></div>\n                <p className="font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p>';
if(!clients.includes('openPaymentReceiptPreview(payment')) {
  if(!clients.includes(paymentRow)) throw new Error('payment row anchor not found');
  clients=clients.replace(paymentRow,`{clientPayments.slice(0,20).map(payment=>{const inv=clientInvoices.find(item=>item.id===payment.invoiceId);return <div key={\`${'${payment.invoiceId}-${payment.id}'}\`} className="rounded-xl border border-border px-3 py-2 text-xs">\n                <div className="flex items-center justify-between gap-3"><div><p className="font-bold">{payment.invoiceId} · {payment.paymentMethod}</p><p className="text-muted-foreground">{formatPreciseDateTime(payment.paidAt)} · {payment.operatorName}</p></div><p className="font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p></div>\n                {inv&&<div className="mt-2 flex gap-2"><button type="button" onClick={()=>openPaymentReceiptPreview(payment,inv,c,boutique)} className="rounded-lg bg-muted px-2.5 py-1.5 font-black">Justificatif</button><button type="button" onClick={()=>void sharePaymentReceipt(payment)} disabled={sharingPaymentId!==null} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-black text-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"><Send size={12}/>{sharingPaymentId===payment.id?\"Envoi…\":\"Envoyer\"}</button></div>}`);
  clients=clients.replace('</p>\n              )}</div>','</div>})}</div>');
}

const afterViewed='        </Modal>}\n        {editClient&&<Modal title="Modifier le client"';
if(!clients.includes('{shareInvoice&&<ShareInvoiceModal')) {
  if(!clients.includes(afterViewed)) throw new Error('viewed invoice modal closing anchor not found');
  clients=clients.replace(afterViewed,`        </Modal>}\n        {shareInvoice&&<ShareInvoiceModal inv={shareInvoice} boutique={boutique} clients={boutique.clients} onClose={()=>setShareInvoice(null)}/>}\n        {editClient&&<Modal title="Modifier le client"`);
}

fs.writeFileSync(clientsPath,clients);
