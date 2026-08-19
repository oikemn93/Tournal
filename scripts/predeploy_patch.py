from pathlib import Path
import re

# ── API helper: authenticated temporary invoice upload ────────────────────────
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
anchor = '''export async function signInWithPhone(phone: string, password: string) {'''
helper = '''export async function createInvoiceShare(params: { boutiqueId:string; invoiceId:string; pdf:Blob }) {
  const session = readSession();
  if (!session?.access_token) throw new Error("Connexion requise");
  const form = new FormData();
  form.append("boutique_id", params.boutiqueId);
  form.append("invoice_id", params.invoiceId);
  form.append("file", params.pdf, `facture-${params.invoiceId}.pdf`);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice-share`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Création du lien de facture impossible");
  return body as { url:string; expires_at:string };
}

''' + anchor
if 'export async function createInvoiceShare' not in api:
    if anchor not in api:
        raise SystemExit('API insertion anchor not found')
    api = api.replace(anchor, helper, 1)
api_path.write_text(api)

# ── Invoice PDF blob generator: only invoked when sharing is requested ───────
invoice_path = Path('src/app/utils/invoice.ts')
invoice = invoice_path.read_text()
anchor = '''export function openInvoicePDF(inv: Invoice, boutique: Boutique, clients: Client[]) {'''
blob_helper = '''export async function generateInvoicePDFBlob(inv: Invoice, boutique: Boutique, clients: Client[]): Promise<Blob> {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) throw new Error("Préparation PDF impossible");
    doc.open();
    doc.write(buildInvoicePDFHtml(inv, boutique, clients));
    doc.close();
    await new Promise(resolve => setTimeout(resolve, 120));
    if (doc.fonts?.ready) await doc.fonts.ready;
    doc.body.style.width = "794px";
    doc.body.style.minHeight = "1123px";
    doc.body.style.padding = "53px 60px";
    doc.body.style.background = "#fff";

    const canvas = await html2canvas(doc.body, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4", compress:true });
    const pageWidth = 210;
    const pageHeight = 297;
    const imgHeight = canvas.height * pageWidth / canvas.width;
    const image = canvas.toDataURL("image/jpeg", 0.9);
    let position = 0;
    let remaining = imgHeight;
    pdf.addImage(image, "JPEG", 0, position, pageWidth, imgHeight, undefined, "FAST");
    remaining -= pageHeight;
    while (remaining > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(image, "JPEG", 0, position, pageWidth, imgHeight, undefined, "FAST");
      remaining -= pageHeight;
    }
    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}

''' + anchor
if 'export async function generateInvoicePDFBlob' not in invoice:
    if anchor not in invoice:
        raise SystemExit('Invoice PDF insertion anchor not found')
    invoice = invoice.replace(anchor, blob_helper, 1)
invoice_path.write_text(invoice)

# ── Factures share modal: links only, no attachments ─────────────────────────
view_path = Path('src/app/screens/FacturesView.tsx')
view = view_path.read_text()
view = view.replace(
    'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession } from "../../lib/api";',
    'import { createSale, recordPayment, recordMultiPayment, returnSale, openCaisseSession, closeCaisseSession, createInvoiceShare } from "../../lib/api";',
    1,
)
view = view.replace(
    'import { buildReceiptHtml, openInvoicePDF, buildInvoiceMessage, agentPrint, printReceipt, printCaisseReport } from "../utils/invoice";',
    'import { buildReceiptHtml, openInvoicePDF, buildInvoiceMessage, generateInvoicePDFBlob, agentPrint, printReceipt, printCaisseReport } from "../utils/invoice";',
    1,
)

new_modal = r'''function ShareInvoiceModal({ inv, boutique, clients, onClose }: { inv: Invoice; boutique: Boutique; clients: Client[]; onClose: () => void }) {
  const phone = inv.clientTel ? inv.clientTel.replace(/[\s\-().]/g, "").replace("+", "") : "";
  const clientRecord = inv.clientId != null ? clients.find(c=>c.id===inv.clientId) : clients.find(c=>c.nom===inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const [channel, setChannel] = useState<"apercu"|"email"|"whatsapp"|"sms">("apercu");
  const [emailAddr, setEmailAddr] = useState(clientRecord?.email ?? "");
  const [waPhone, setWaPhone] = useState(inv.clientTel ?? "");
  const [smsPhone, setSmsPhone] = useState(inv.clientTel ?? "");
  const [generating, setGenerating] = useState(false);
  const [shareError, setShareError] = useState("");

  const inputCls2 = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring";
  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

  function doPreview() {
    openInvoicePDF(inv, boutique, clients);
  }

  async function createTemporaryLink() {
    setShareError("");
    setGenerating(true);
    try {
      const pdf = await generateInvoicePDFBlob(inv, boutique, clients);
      return await createInvoiceShare({ boutiqueId:boutique.id, invoiceId:inv.id, pdf });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Création du lien impossible");
      return null;
    } finally {
      setGenerating(false);
    }
  }

  function shareText(url:string) {
    const statusLine = reste<=0 ? "Statut : Payé"
      : inv.acompte>0 ? `Encaissé : ${fmtN(inv.acompte)} F — reste dû : ${fmtN(reste)} F`
      : "Statut : Impayé";
    return `Bonjour ${inv.client}\n\nVoici votre facture ${inv.id} de ${boutique.nom}.\nTotal : ${fmtN(inv.montant)} F\n${statusLine}\n\nConsulter / télécharger la facture :\n${url}\n\nLien valable 48 h. Après expiration, la facture peut être régénérée sur demande.\n\nMerci pour votre confiance.`;
  }

  async function doEmail() {
    if (!emailAddr.trim() || generating) return;
    const share = await createTemporaryLink();
    if (!share) return;
    const subject = encodeURIComponent(`Facture ${inv.id} — ${boutique.nom}`);
    const body = encodeURIComponent(shareText(share.url));
    window.location.href = `mailto:${emailAddr.trim()}?subject=${subject}&body=${body}`;
  }

  async function doWhatsApp() {
    const rawPhone = (waPhone || phone).replace(/[\s\-().+]/g, "");
    if (!rawPhone || generating) return;
    const popup = window.open("about:blank", "_blank");
    const share = await createTemporaryLink();
    if (!share) { popup?.close(); return; }
    const target = `https://wa.me/${rawPhone}?text=${encodeURIComponent(shareText(share.url))}`;
    if (popup) popup.location.href = target;
    else window.location.href = target;
  }

  async function doSMS() {
    const rawPhone = (smsPhone || phone).replace(/[\s\-()]/g, "");
    if (!rawPhone || generating) return;
    const share = await createTemporaryLink();
    if (!share) return;
    const text = `Facture ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F. ${reste > 0 ? `Reste ${fmtN(reste)} F. ` : "Payée. "}Lien valable 48 h : ${share.url}`;
    window.location.href = `sms:${rawPhone}?body=${encodeURIComponent(text)}`;
  }

  const CHANNELS: Array<{id:"apercu"|"email"|"whatsapp"|"sms"; label:string; color:string}> = [
    { id:"apercu", label:"Aperçu PDF", color:"#374151" },
    { id:"email", label:"E-mail", color:"#0ea5e9" },
    { id:"whatsapp", label:"WhatsApp", color:"#16a34a" },
    { id:"sms", label:"SMS", color:"#7c3aed" },
  ];

  return (
    <Modal title="Partager la facture" color="#374151" onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:"#f3f4f6", border:"1px solid #e5e7eb" }}>
        <FileText size={18} className="text-muted-foreground flex-shrink-0"/>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">{inv.id} · {inv.client}</p>
          <p className="text-xs text-muted-foreground">{fmtN(inv.montant)} F · {inv.date}</p>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:reste<=0?"#f0fdf4":inv.acompte>0?"#fffbeb":"#fef2f2", color:reste<=0?"#16a34a":inv.acompte>0?"#d97706":"#dc2626" }}>
          {reste<=0?"Payé":inv.acompte>0?"Acompte":"Impayé"}
        </span>
      </div>

      <div className="px-4 py-3 rounded-2xl text-xs leading-relaxed" style={{background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe"}}>
        Aucun PDF n'est stocké tant que le client ne demande pas sa facture. Pour E-mail, WhatsApp ou SMS, Tournal génère un PDF temporaire et un lien privé valable 48 h. Le fichier est ensuite supprimé automatiquement. La facture reste toujours régénérable depuis les données Tournal.
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CHANNELS.map(ch=>(
          <button key={ch.id} onClick={()=>{setChannel(ch.id);setShareError("");}} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all" style={{ background:channel===ch.id?ch.color+"18":"#f9f9f7", border:channel===ch.id?`2px solid ${ch.color}55`:"2px solid transparent" }}>
            {ch.id==="apercu"&&<Eye size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="email"&&<Mail size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="whatsapp"&&<MessageCircle size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            {ch.id==="sms"&&<Smartphone size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>} 
            <span className="text-xs font-bold" style={{ color:channel===ch.id?ch.color:"#6b7280" }}>{ch.label}</span>
          </button>
        ))}
      </div>

      {shareError && <div className="px-4 py-3 rounded-xl text-xs font-bold" style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca"}}>{shareError}</div>}

      {channel==="apercu"&&(
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">L'aperçu est généré localement pour consultation ou impression. Aucun fichier n'est envoyé dans le stockage.</p>
          <button onClick={doPreview} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95" style={{background:"#374151",color:"#fff"}}><Eye size={16}/> Ouvrir l'aperçu PDF</button>
        </div>
      )}

      {channel==="email"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">E-MAIL DU CLIENT</label><input value={emailAddr} onChange={e=>setEmailAddr(e.target.value)} placeholder="client@exemple.com" type="email" className={inputCls2}/></div>
          <button onClick={()=>void doEmail()} disabled={!emailAddr.trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#0ea5e9",color:"#fff"}}><Mail size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir l'e-mail"}</button>
        </div>
      )}

      {channel==="whatsapp"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">WHATSAPP DU CLIENT</label><input value={waPhone} onChange={e=>setWaPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/></div>
          <button onClick={()=>void doWhatsApp()} disabled={!(waPhone||phone).trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#16a34a",color:"#fff"}}><MessageCircle size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir WhatsApp"}</button>
        </div>
      )}

      {channel==="sms"&&(
        <div className="space-y-3">
          <div><label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">TÉLÉPHONE DU CLIENT</label><input value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/></div>
          <button onClick={()=>void doSMS()} disabled={!(smsPhone||phone).trim()||generating} className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#7c3aed",color:"#fff"}}><Smartphone size={16}/>{generating?"Création du lien…":"Créer le lien et ouvrir SMS"}</button>
        </div>
      )}
    </Modal>
  );
}
'''
pattern = re.compile(r'function ShareInvoiceModal\(.*?\n}\n\n// ─── FACTURES VIEW', re.S)
match = pattern.search(view)
if not match:
    raise SystemExit('ShareInvoiceModal block not found')
view = view[:match.start()] + new_modal + '\n// ─── FACTURES VIEW' + view[match.end():]
view_path.write_text(view)

print('Temporary invoice share flow patched successfully')
