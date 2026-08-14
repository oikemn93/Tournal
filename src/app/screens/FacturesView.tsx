import React, { useEffect, useMemo, useState } from "react";
import { Search, Plus, Send, FileText, Eye, Mail, MessageCircle, Smartphone, Phone, Wallet, CreditCard, RotateCcw, ShoppingCart, Receipt, AlertCircle, Trash2, CheckCircle, Minus, Store } from "lucide-react";
import type { Boutique, Invoice, InvoiceStatus, InvoiceLine, StockEntry, PaymentMethod, Client, PlatformUser } from "../types";
import { SEM, inputCls, PAYMENT_METHODS, PM_ICON, PM_COLOR, PLACEHOLDER_IMGS } from "../constants";
import { createSale, recordPayment, returnSale } from "../../lib/api";
import { fmt, today, imgSrc } from "../utils/formatting";
import { invBadge, lineTotal, lineDispQty, lineDispUnit, genInvoiceId, productQty, getSiblings, invoiceMargin } from "../utils/inventory";
import { buildReceiptHtml, openInvoicePDF, buildInvoiceMessage, agentPrint, printReceipt } from "../utils/invoice";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";

// ─── SHARE INVOICE MODAL ──────────────────────────────────────────────────────

function ShareInvoiceModal({ inv, boutique, clients, onClose }: { inv: Invoice; boutique: Boutique; clients: Client[]; onClose: () => void }) {
  const msg = buildInvoiceMessage(inv, boutique);
  const phone = inv.clientTel ? inv.clientTel.replace(/[\s\-().]/g,"").replace("+","") : "";
  const clientRecord = clients.find(c=>c.nom===inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const [channel, setChannel] = useState<"apercu"|"email"|"whatsapp"|"sms">("apercu");
  const [emailAddr, setEmailAddr] = useState(clientRecord?.email ?? "");
  const [waPhone, setWaPhone] = useState(inv.clientTel ?? "");
  const [smsPhone, setSmsPhone] = useState(inv.clientTel ?? "");
  const [generating, setGenerating] = useState(false);

  const inputCls2 = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring";

  function doPreview() {
    setGenerating(true);
    setTimeout(() => { openInvoicePDF(inv, boutique, clients); setGenerating(false); }, 100);
  }

  function doEmail() {
    if (!emailAddr.trim()) return;
    openInvoicePDF(inv, boutique, clients);
    const subject = encodeURIComponent(`Facture ${inv.id} — ${boutique.nom}`);
    const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    const bodyText = `Bonjour ${inv.client},\n\nVeuillez trouver ci-joint votre facture N° ${inv.id} d'un montant de ${fmtN(inv.montant)} F.`
      + (reste > 0 ? `\nMontant restant dû : ${fmtN(reste)} F.` : `\nStatut : Payé.`)
      + `\n\nCordialement,\n${boutique.nom}` + (boutique.tel ? `\n${boutique.tel}` : "") + (boutique.email ? `\n${boutique.email}` : "");
    const body = encodeURIComponent(bodyText);
    setTimeout(() => { window.location.href = `mailto:${emailAddr}?subject=${subject}&body=${body}`; }, 800);
  }

  function doWhatsApp() {
    const rawPhone = (waPhone||phone).replace(/[\s\-().+]/g,"");
    if (!rawPhone) return;
    const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    const statusLine = reste<=0 ? "Statut : Payé"
      : inv.acompte>0 ? `Acompte de ${fmtN(inv.acompte)} F versé — reste dû : ${fmtN(reste)} F`
      : "Statut : Impayé";
    const text = encodeURIComponent(
      `Bonjour ${inv.client}\n\nVoici votre facture *${inv.id}* de *${boutique.nom}* :\n` +
      `Total : *${fmtN(inv.montant)} F*\n${statusLine}\nDate : ${inv.date}\n\nMerci pour votre confiance`
    );
    openInvoicePDF(inv, boutique, clients);
    setTimeout(() => window.open(`https://wa.me/${rawPhone}?text=${text}`, "_blank"), 800);
  }

  function doSMS() {
    const rawPhone = (smsPhone||phone).replace(/[\s\-()]/g,"");
    if (!rawPhone) return;
    const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    const text = encodeURIComponent(
      `Facture ${inv.id} - ${boutique.nom} : ${fmtN(inv.montant)} F`
      + (reste > 0 ? ` (reste: ${fmtN(reste)} F)` : " (Paye)")
      + `. Consultez le PDF envoye separement.`
    );
    openInvoicePDF(inv, boutique, clients);
    setTimeout(() => window.open(`sms:${rawPhone}?body=${text}`, "_self"), 800);
  }

  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
  const waPreview = `Bonjour ${inv.client}\n\nVoici votre facture *${inv.id}* de *${boutique.nom}* :\nTotal : *${fmtN(inv.montant)} F*\n${reste<=0?"Statut : Paye":inv.acompte>0?`Acompte de ${fmtN(inv.acompte)} F verse — reste du : ${fmtN(reste)} F`:"Statut : Impaie"}\nDate : ${inv.date}\n\nMerci pour votre confiance`;

  const CHANNELS: Array<{id:"apercu"|"email"|"whatsapp"|"sms"; label:string; color:string}> = [
    { id:"apercu",   label:"Apercu PDF", color:"#374151" },
    { id:"email",    label:"E-mail",     color:"#0ea5e9" },
    { id:"whatsapp", label:"WhatsApp",   color:"#16a34a" },
    { id:"sms",      label:"SMS",        color:"#7c3aed" },
  ];

  return (
    <Modal title="Envoyer la facture" color="#374151" onClose={onClose}>
      {/* Invoice summary */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:"#f3f4f6", border:"1px solid #e5e7eb" }}>
        <FileText size={18} className="text-muted-foreground flex-shrink-0"/>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">{inv.id} · {inv.client}</p>
          <p className="text-xs text-muted-foreground">{fmtN(inv.montant)} F · {inv.date}</p>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-lg"
          style={{ background:reste<=0?"#f0fdf4":inv.acompte>0?"#fffbeb":"#fef2f2", color:reste<=0?"#16a34a":inv.acompte>0?"#d97706":"#dc2626" }}>
          {reste<=0?"Payé":inv.acompte>0?"Acompte":"Impayé"}
        </span>
      </div>

      {/* Channel tabs */}
      <div className="grid grid-cols-4 gap-2">
        {CHANNELS.map(ch=>(
          <button key={ch.id} onClick={()=>setChannel(ch.id)}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all"
            style={{ background:channel===ch.id?ch.color+"18":"#f9f9f7", border:channel===ch.id?`2px solid ${ch.color}55`:"2px solid transparent" }}>
            {ch.id==="apercu"&&<Eye size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>}
            {ch.id==="email"&&<Mail size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>}
            {ch.id==="whatsapp"&&<MessageCircle size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>}
            {ch.id==="sms"&&<Smartphone size={17} style={{ color:channel===ch.id?ch.color:"#9ca3af" }}/>}
            <span className="text-xs font-bold" style={{ color:channel===ch.id?ch.color:"#6b7280" }}>{ch.label}</span>
          </button>
        ))}
      </div>

      {channel==="apercu"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#f9f9f7", border:"1px solid #e5e7eb" }}>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ouvre la facture PDF dans un nouvel onglet. Utilisez <strong>Fichier → Imprimer → Enregistrer en PDF</strong> pour la télécharger.
            </p>
          </div>
          <button onClick={doPreview} disabled={generating}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background:"#374151", color:"#fff" }}>
            {generating
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Génération...</span></>
              : <><Eye size={16}/><span>Ouvrir l'aperçu PDF</span></>}
          </button>
        </div>
      )}

      {channel==="email"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#0ea5e910", border:"1px solid #0ea5e930" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#0284c7" }}>
              Le PDF s'ouvrira d'abord pour téléchargement — puis votre messagerie s'ouvrira avec le texte pré-rempli. Joignez le PDF depuis votre dossier Téléchargements.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">ADRESSE E-MAIL DU CLIENT</label>
            <input value={emailAddr} onChange={e=>setEmailAddr(e.target.value)} placeholder="client@exemple.com" type="email" className={inputCls2} autoFocus/>
            {boutique.email&&<p className="text-xs text-muted-foreground mt-1.5">Expéditeur suggéré : {boutique.email}</p>}
          </div>
          <button onClick={doEmail} disabled={!emailAddr.trim()}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#0ea5e9", color:"#fff" }}>
            <Mail size={16}/><span>Générer et envoyer par e-mail</span>
          </button>
        </div>
      )}

      {channel==="whatsapp"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#16a34a10", border:"1px solid #16a34a30" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#15803d" }}>
              Le PDF s'ouvrira pour téléchargement, puis WhatsApp s'ouvrira avec un message convivial pré-rédigé.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">NUMÉRO WHATSAPP DU CLIENT</label>
            <input value={waPhone} onChange={e=>setWaPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/>
          </div>
          <div className="px-3 py-3 rounded-xl text-xs leading-relaxed" style={{ background:"#f0fdf4", color:"#166534", border:"1px solid #bbf7d0", fontFamily:"monospace", whiteSpace:"pre-wrap" }}>{waPreview}</div>
          <button onClick={doWhatsApp} disabled={!(waPhone||phone).trim()}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#16a34a", color:"#fff" }}>
            <MessageCircle size={16}/><span>Générer et envoyer via WhatsApp</span>
          </button>
        </div>
      )}

      {channel==="sms"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#7c3aed10", border:"1px solid #7c3aed30" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#6d28d9" }}>
              Le PDF s'ouvrira — téléchargez-le et partagez le lien via SMS. Un message court sera pré-rempli dans votre application SMS.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">NUMÉRO DE TÉLÉPHONE DU CLIENT</label>
            <input value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls2}/>
          </div>
          <button onClick={doSMS} disabled={!(smsPhone||phone).trim()}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#7c3aed", color:"#fff" }}>
            <Smartphone size={16}/><span>Générer et envoyer par SMS</span>
          </button>
        </div>
      )}
    </Modal>
  );
}

// ─── FACTURES VIEW ────────────────────────────────────────────────────────────

export function FacturesView({ boutique, allBoutiques, platformUsers, currentUser, canReturn, canSeeMargin = false, onUpdate, onUpdateOtherBoutique, logAction, initialStatus, initialInvoiceId, initialClientId }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[]; currentUser: PlatformUser;
  canReturn: boolean;
  canSeeMargin?: boolean;
  onUpdate: (u: Partial<Boutique>) => void;
  onUpdateOtherBoutique: (boutiqueId: string, u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialStatus?: InvoiceStatus | "all" | "impayé";
  initialInvoiceId?: string;
  initialClientId?: number;
}) {
  const { invoices, clients, products, entries } = boutique;
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);

  // Quantities already returned, per source invoice and product. Every return
  // restores stock via an entry tagged "Retour <sourceInvoiceId>", mirroring the
  // return_sale RPC, so summing those entries tells us how much of each line has
  // already been sent back. This prevents returning the same invoice repeatedly.
  const returnedByInvoiceProduct = useMemo(() => {
    const map = new Map<string, number>();
    const prefix = "Retour ";
    for (const e of entries) {
      const note = e.fournisseur ?? "";
      if (!note.startsWith(prefix)) continue;
      const sourceId = note.slice(prefix.length);
      const key = `${sourceId}::${e.productId}`;
      map.set(key, (map.get(key) ?? 0) + Number(e.qty || 0));
    }
    return map;
  }, [entries]);
  const remainingReturnable = (inv: Invoice, line: InvoiceLine) =>
    Math.max(0, line.qty - (returnedByInvoiceProduct.get(`${inv.id}::${line.productId}`) ?? 0));
  const invoiceHasReturnable = (inv: Invoice) =>
    !!inv.lines && inv.lines.some(l => remainingReturnable(inv, l) > 0);
  const [statusFilter,setStatusFilter] = useState<InvoiceStatus|"all"|"impayé">(initialStatus ?? "all");
  const [invSearch, setInvSearch] = useState("");
  const [modal,setModal]   = useState(false);
  const [shareInv,setShareInv]   = useState<Invoice|null>(null);
  const [detailInv,setDetailInv] = useState<Invoice|null>(null);
  const [encaissInv,setEncaissInv] = useState<Invoice|null>(null);
  const [encaissAmt,setEncaissAmt] = useState("");
  const [encaissMethod,setEncaissMethod] = useState<PaymentMethod>("Espèces");
  const [encaissDone,setEncaissDone] = useState(false);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  // Return state
  const [returnInv, setReturnInv] = useState<Invoice|null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number,number>>({});
  const [returnDone, setReturnDone] = useState(false);
  const [client,setClient] = useState(clients[0]?.nom??"");
  const [lines, setLines]  = useState<InvoiceLine[]>([]);
  const [acompte,setAcompte]=useState("");
  const [status,setStatus] = useState<InvoiceStatus>("en attente");
  // Line form
  const [lPid,setLPid]=useState<number>(products[0]?.id??0);
  const [lQty,setLQty]=useState("");
  const [lPrix,setLPrix]=useState("");
  const [lSellUnit,setLSellUnit]=useState(""); // mirrors POS: "Lot" | "Pièce" | baseUnit

  useEffect(() => {
    if (initialInvoiceId) {
      const invoice = invoices.find(item => item.id === initialInvoiceId);
      if (invoice) setDetailInv(invoice);
      return;
    }
    if (initialClientId != null) {
      const selectedClient = clients.find(item => item.id === initialClientId);
      if (selectedClient) {
        setClient(selectedClient.nom);
        setLines([]);
        setAcompte("");
        setModal(true);
      }
    }
  }, [initialClientId, initialInvoiceId]);

  // Sell options for the invoice line form — mirrors getSellOptions in POS
  function getInvSellOptions(pid: number): string[] {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return [];
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    if (!cat || cat.nbPiecesParLot<=0) return [prod.unit];
    const opts: string[] = ["Lot"];
    if (cat.unitVente !== "pièces") opts.push("Pièce");
    opts.push(cat.unitVente);
    return opts;
  }
  function invToBaseQty(sellQty: number, sellUnit: string, pid: number): number {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return sellQty;
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    if (!cat || cat.nbPiecesParLot<=0) return sellQty;
    if (sellUnit==="Lot") return cat.unitVente==="pièces"
      ? sellQty*cat.nbPiecesParLot
      : sellQty*cat.nbPiecesParLot*(cat.longueurParPiece||1);
    if (sellUnit==="Pièce") return cat.unitVente==="pièces" ? sellQty : sellQty*(cat.longueurParPiece||1);
    return sellQty; // direct unit (yards/mètres)
  }
  function invDefaultUnit(pid: number): string {
    const opts = getInvSellOptions(pid);
    if (opts.length===0) return "";
    const prod = products.find(p=>p.id===pid);
    const cat = (boutique.categories??[]).find(c=>c.nom===prod?.categorie);
    const base = cat?.unitVente ?? prod?.unit ?? "";
    const isFabric = base==="yards"||base==="mètres"||base==="metres";
    if (isFabric && opts.includes(base)) return base;
    if (opts.includes("Pièce")) return "Pièce";
    return opts[0];
  }

  const montant = lines.reduce((s,l)=>s+lineTotal(l),0);
  const aNum = Number(acompte)||0;
  const pct  = montant>0?Math.min(100,Math.round(aNum/montant*100)):0;
  const siblingClient = siblings.find(s=>s.nom===client);

  function addLine() {
    const prod = products.find(p=>p.id===lPid); if (!prod||!lQty) return;
    const cat = (boutique.categories??[]).find(c=>c.nom===prod.categorie);
    const baseUnit = cat?.unitVente ?? prod.unit;
    const opts = getInvSellOptions(lPid);
    const effectiveUnit = lSellUnit || invDefaultUnit(lPid) || opts[0] || prod.unit;
    const sellQtyN = Number(lQty);
    const baseQty = invToBaseQty(sellQtyN, effectiveUnit, lPid);
    const isSell = opts.length > 1 && effectiveUnit !== baseUnit;
    const line: InvoiceLine = {
      productId: lPid, nom: prod.nom, qty: baseQty, unit: baseUnit, prixUnit: Number(lPrix)||0,
      ...(isSell ? { sellUnit: effectiveUnit, sellQty: sellQtyN } : {}),
    };
    setLines(prev=>[...prev, line]);
    setLQty(""); setLPrix("");
  }
  function removeLine(i: number) { setLines(prev=>prev.filter((_,j)=>j!==i)); }

  async function submitEncaiss() {
    if (!encaissInv || submittingPayment) return;
    const montantEncaiss = Number(encaissAmt) || 0;
    if (montantEncaiss <= 0) return;
    setSubmittingPayment(true);
    let persisted;
    try {
      persisted = await recordPayment({ boutiqueId:boutique.id, invoiceId:encaissInv.id, amount:montantEncaiss, paymentMethod:encaissMethod });
    } catch (error) {
      setSubmittingPayment(false);
      alert(error instanceof Error ? error.message : "Encaissement impossible");
      return;
    }
    const newAcompte = persisted.acompte;
    const newStatus: InvoiceStatus = persisted.status === "payée" ? "payé" : "acompte";
    const updatedInv: Invoice = {
      ...encaissInv,
      acompte:newAcompte,
      status:newStatus,
      paymentMethod:encaissMethod,
      payments:[...(encaissInv.payments ?? []), {
        id:persisted.payment.id,
        amount:persisted.payment.amount,
        paymentMethod:persisted.payment.payment_method as PaymentMethod,
        paidAt:persisted.payment.paid_at,
        operatorId:persisted.payment.operator_id,
        operatorName:persisted.payment.operator_name,
        batchId:persisted.payment.batch_id,
        source:persisted.payment.source,
      }],
    };

    const saleEntries: StockEntry[] = persisted.stock_deducted
      ? (encaissInv.lines ?? []).map((line, index) => ({
          id: Date.now() + index,
          productId: line.productId,
          qty: -line.qty,
          unit: line.unit,
          montantDu: 0,
          date: today(),
          fournisseur: `Vente ${encaissInv.id}`,
          invoiceId: encaissInv.id,
        }))
      : [];
    onUpdate({
      invoices: invoices.map(i => i.id === encaissInv.id ? updatedInv : i),
      ...(saleEntries.length ? { entries: [...entries, ...saleEntries] } : {}),
    });
    logAction("Encaissement", `${encaissInv.id} · +${fmt(persisted.applied_amount)} · ${encaissMethod}`, "💵");
    setTimeout(() => agentPrint(buildReceiptHtml(updatedInv, boutique, currentUser.nom)), 200);
    setEncaissDone(true);
    setTimeout(() => { setEncaissInv(null); setEncaissAmt(""); setEncaissDone(false); setSubmittingPayment(false); }, 1400);
  }

  function openReturn(inv: Invoice) {
    if (!inv.lines || inv.lines.length === 0) return;
    if (!invoiceHasReturnable(inv)) {
      alert("Cette facture a déjà été entièrement retournée.");
      return;
    }
    const initQtys: Record<number,number> = {};
    inv.lines.forEach((l,i) => { initQtys[i] = remainingReturnable(inv, l); });
    setReturnQtys(initQtys);
    setReturnDone(false);
    setReturnInv(inv);
    setDetailInv(null);
  }

  async function submitReturn() {
    if (!returnInv || !returnInv.lines) return;
    const lines = returnInv.lines;
    const returnLines = lines.map((l,i) => ({ ...l, qty: returnQtys[i] ?? 0 })).filter(l => l.qty > 0);
    if (returnLines.length === 0) return;
    // Never let a line send back more than what is still returnable.
    const overLine = lines.find((l,i) => (returnQtys[i] ?? 0) > remainingReturnable(returnInv, l));
    if (overLine) {
      alert("La quantité retournée dépasse ce qui reste à retourner pour cette facture.");
      return;
    }
    let persisted;
    try {
      persisted = await returnSale({ boutiqueId:boutique.id, invoiceId:returnInv.id, lines:returnLines.map(l=>({ productId:l.productId, qty:l.qty })) });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Retour impossible");
      return;
    }
    const refundTotal = returnLines.reduce((s, l) => s + l.qty * l.prixUnit, 0);
    const retId = persisted.return_invoice_id;
    const retInv: Invoice = {
      id: retId, client: returnInv.client, clientTel: returnInv.clientTel,
      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw: new Date().toISOString(), status: "payé", type: "Retour",
      operatorNom: currentUser.nom, operatorColor: currentUser.color,
    };
    // Restore stock
    const restoreEntries: StockEntry[] = returnLines.map((l,i) => ({
      id: Date.now() + i, productId: l.productId, qty: l.qty, unit: l.unit,
      montantDu: 0, date: today(), fournisseur: `Retour ${returnInv.id}`,
    }));
    onUpdate({ invoices: [...invoices, retInv], entries: [...entries, ...restoreEntries] });
    logAction("Retour articles", `${retId} ← ${returnInv.id} · ${returnLines.length} article(s) · ${fmt(refundTotal)}`, "↩️");
    setReturnDone(true);
    setTimeout(() => { setReturnInv(null); setReturnDone(false); }, 1600);
  }

  async function submit() {
    if (!client||lines.length===0 || submittingInvoice) return;
    setSubmittingInvoice(true);
    const isSiblingTransfer = !!siblingClient;
    const ct  = isSiblingTransfer ? "Inter-tenant" : (clients.find(c=>c.nom===client)?.type??"B2C");
    const cTel = clients.find(c=>c.nom===client)?.tel;
    let persisted;
    try {
      persisted = await createSale({ boutiqueId:boutique.id, client, clientTel:cTel, lines });
    } catch (error) {
      setSubmittingInvoice(false);
      alert(error instanceof Error ? error.message : "Création de facture impossible");
      return;
    }
    const id = persisted.invoice_id;
    let initialPayment: Awaited<ReturnType<typeof recordPayment>> | null = null;
    if (aNum > 0) {
      try {
        initialPayment = await recordPayment({ boutiqueId:boutique.id, invoiceId:id, amount:Math.min(aNum,montant), paymentMethod:"Espèces" });
      } catch (error) {
        setSubmittingInvoice(false);
        alert(`La facture ${id} a été créée, mais l'acompte n'a pas pu être enregistré : ${error instanceof Error ? error.message : "erreur inconnue"}`);
        return;
      }
    }
    const paidAtCreation = initialPayment?.acompte ?? 0;
    const s: InvoiceStatus = paidAtCreation>=montant&&montant>0?"payé":paidAtCreation>0?"acompte":status;
    const saleEntries: StockEntry[] = initialPayment?.stock_deducted
      ? lines.map((line,index)=>({
          id:Date.now()+index,
          productId:line.productId,
          qty:-line.qty,
          unit:line.unit,
          montantDu:0,
          date:today(),
          fournisseur:`Vente ${id}`,
          invoiceId:id,
        }))
      : [];
    const selectedClient = clients.find(c=>c.nom===client);
    const newInv: Invoice = {
      id, clientId:selectedClient?.id, client, clientTel:cTel, clientType:selectedClient?.type,
      lines, montant, acompte:paidAtCreation, date:today(), dateRaw:new Date().toISOString(), status:s, type:ct,
      operatorNom:currentUser.nom, operatorColor:currentUser.color,
      paymentMethod:initialPayment ? "Espèces" : undefined,
      payments:initialPayment ? [{
        id:initialPayment.payment.id, amount:initialPayment.payment.amount, paymentMethod:initialPayment.payment.payment_method as PaymentMethod,
        paidAt:initialPayment.payment.paid_at, operatorId:initialPayment.payment.operator_id, operatorName:initialPayment.payment.operator_name,
        batchId:initialPayment.payment.batch_id, source:initialPayment.payment.source,
      }] : [],
    };
    onUpdate({
      invoices:[...invoices, newInv],
      ...(saleEntries.length ? { entries:[...entries,...saleEntries] } : {}),
    });
    // Inter-tenant: add incoming stock entries to sibling boutique
    if (isSiblingTransfer && siblingClient) {
      const sbProducts = [...siblingClient.products];
      const sbEntries  = [...siblingClient.entries];
      lines.forEach((l, i) => {
        let pid = sbProducts.find(p => p.nom === l.nom)?.id;
        if (!pid) {
          // create product in sibling if it doesn't exist
          const srcProd = products.find(p => p.id === l.productId);
          pid = Date.now() + 1000 + i;
          sbProducts.push({ id:pid, nom:l.nom, img:srcProd?.img??PLACEHOLDER_IMGS[0], unit:l.unit, fournisseur:boutique.nom, categorie:srcProd?.categorie, couleur:srcProd?.couleur });
        }
        sbEntries.push({ id:Date.now()+500+i, productId:pid, qty:l.qty, unit:l.unit, montantDu:l.qty*l.prixUnit, date:today(), fournisseur:boutique.nom });
      });
      onUpdateOtherBoutique(siblingClient.id, { products:sbProducts, entries:sbEntries });
    }
    logAction(isSiblingTransfer?"Transfert inter-tenant":"Nouvelle facture", `${id} · ${client} · ${fmt(montant)}`, isSiblingTransfer?"🔄":"🧾");
    setLines([]); setAcompte(""); setModal(false); setSubmittingInvoice(false);
  }

  const UNPAID: InvoiceStatus[] = ["en attente","acompte","en retard"];
  const filtered = [...invoices].sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date)).filter(i=>(statusFilter==="all"||statusFilter==="impayé"?statusFilter==="impayé"?UNPAID.includes(i.status):true:i.status===statusFilter)&&(i.client.toLowerCase().includes(invSearch.toLowerCase())||i.id.toLowerCase().includes(invSearch.toLowerCase())));
  const pills: Array<{id:InvoiceStatus|"all"|"impayé";label:string;color:string}> = [
    {id:"all",      label:"Tout",     color:SEM.neutral.accent},
    {id:"impayé",   label:"Impayés",  color:SEM.danger.accent},
    {id:"acompte",  label:"Acompte",  color:SEM.warning.accent},
    {id:"payé",     label:"Payé ✓",   color:SEM.success.accent},
    {id:"en attente",label:"Attente", color:SEM.neutral.accent},
    {id:"en retard",label:"Retard",   color:SEM.danger.accent},
  ];

  return (
    <div data-screen-source="relational-factures" className="space-y-4 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={invSearch} onChange={e=>setInvSearch(e.target.value)} placeholder="Chercher une facture ou un client…" className={inputCls+" pl-11"}/></div>
      <div className="flex gap-2" style={{ overflowX:"auto", scrollbarWidth:"none" }}>
        {pills.map(s=><button key={s.id} onClick={()=>setStatusFilter(s.id as InvoiceStatus|"all"|"impayé")}className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{ background:statusFilter===s.id?s.color:s.color+"22", color:statusFilter===s.id?"#fff":s.color }}>{s.label}</button>)}
      </div>
      <div className="space-y-3">
        {filtered.map(inv=>{
          const [tc,bc]=invBadge(inv.status);
          const isReturn = inv.type === "Retour";
          return (
            <div key={inv.id} className="bg-card rounded-2xl p-4 border border-border" style={isReturn?{borderColor:"#ef444433"}:{}}>
              <div className="w-full text-left cursor-pointer" onClick={()=>{ if (!isReturn && inv.status !== "payé") { setEncaissInv(inv); setEncaissAmt(String(invoiceRemainingAmount(inv))); } else { setDetailInv(inv); } }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{inv.client}</p>
                      {isReturn && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background:SEM.danger.bg, color:SEM.danger.text }}><RotateCcw size={9}/> Retour</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{inv.id} · {formatPreciseDateTime(inv.dateRaw)} · {inv.type}</p>
                    {inv.lines&&inv.lines.length>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lines.length} produit{inv.lines.length>1?"s":""}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <div className="text-right"><p className="text-base font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p><span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize inline-block mt-0.5" style={{ background:bc,color:tc }}>{inv.status}</span></div>
                    {!isReturn && inv.status !== "payé" && (
                      <button onClick={e=>{e.stopPropagation();setEncaissInv(inv);setEncaissAmt(String(invoiceRemainingAmount(inv)));}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.success.bg }} title="Encaisser">
                        <Wallet size={15} style={{ color:SEM.success.text }}/>
                      </button>
                    )}
                    <button onClick={e=>{e.stopPropagation();setShareInv(inv);}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.neutral.bg }}>
                      <Send size={15} style={{ color:SEM.neutral.accent }}/>
                    </button>
                  </div>
                </div>
                {invoicePaidAmount(inv)>0&&invoiceRemainingAmount(inv)>0&&<p className="text-xs text-muted-foreground mt-2">Acompte versé : <span className="font-semibold text-foreground">{fmt(invoicePaidAmount(inv))}</span></p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoice detail modal */}
      {detailInv&&<Modal title={detailInv.id} color="#374151" onClose={()=>setDetailInv(null)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold">{detailInv.client}</p>
            {detailInv.clientTel&&<div className="flex items-center gap-1.5 mt-1"><Phone size={12} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{detailInv.clientTel}</span></div>}
            {detailInv.operatorNom&&<div className="flex items-center gap-1.5 mt-1">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background:detailInv.operatorColor??"#C9A227", fontSize:"8px", fontWeight:900 }}>
                {detailInv.operatorNom.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground">Opérateur : <span className="font-semibold text-foreground">{detailInv.operatorNom}</span></span>
            </div>}
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-bold capitalize" style={{ background:invBadge(detailInv.status)[1], color:invBadge(detailInv.status)[0] }}>{detailInv.status}</span>
        </div>
        {detailInv.lines&&detailInv.lines.length>0&&(
          <div>
            <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">PRODUITS FACTURÉS</p>
            <div className="space-y-2">
              {detailInv.lines.map((l,i)=>{
                const prod=products.find(p=>p.id===l.productId);
                return <div key={i} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                  {prod&&<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,80,80)} alt={l.nom} className="w-full h-full object-cover"/></div>}
                  <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{l.nom}</p><p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)}</p></div>
                  <p className="text-sm font-black flex-shrink-0" style={{ color:"#a855f7", fontFamily:"'Nunito', sans-serif" }}>{fmt(lineTotal(l))}</p>
                </div>;
              })}
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(detailInv.montant)}</p>
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">PAIEMENT</p>
          <div className="space-y-2">
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Acompte versé</span>
              <span className="text-sm font-bold" style={{ color:"#C9A227" }}>{fmt(invoicePaidAmount(detailInv))}</span>
            </div>
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Reste à payer</span>
              <span className="text-sm font-bold" style={{ color:invoiceRemainingAmount(detailInv)>0?SEM.danger.accent:SEM.success.accent }}>{fmt(invoiceRemainingAmount(detailInv))}</span>
            </div>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width:`${detailInv.montant>0?Math.round(invoicePaidAmount(detailInv)/detailInv.montant*100):0}%`, background:invBadge(detailInv.status)[0] }}/>
          </div>
        </div>

        {(detailInv.payments?.length ?? 0)>0&&<div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">HISTORIQUE DES ENCAISSEMENTS</p>
          <div className="space-y-2">{detailInv.payments!.map(payment=><div key={payment.id} className="bg-muted rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-bold">{payment.paymentMethod} · {formatPreciseDateTime(payment.paidAt)}</p><p className="text-xs text-muted-foreground truncate">Caissier : {payment.operatorName}</p></div>
            <p className="text-sm font-black" style={{color:SEM.success.accent}}>{fmt(payment.amount)}</p>
          </div>)}</div>
        </div>}

        {/* Margin — only after cashing in, only for users with the "Voir les marges" right. */}
        {canSeeMargin && detailInv.acompte > 0 && (() => {
          const m = invoiceMargin(detailInv, entries, products);
          if (!m.hasData) return null;
          const isReturn = detailInv.type === "Retour";
          const accent = m.marge >= 0 ? SEM.success.accent : "#ef4444";
          const bg = m.marge >= 0 ? SEM.success.bg : "#ef444415";
          return (
            <div className="rounded-2xl p-4" style={{ background:bg }}>
              <p className="text-xs font-black tracking-wider mb-2" style={{ color:accent }}>
                {isReturn ? "MARGE ANNULÉE (RETOUR)" : "MARGE RÉALISÉE"}
              </p>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-black" style={{ color:accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(m.marge)}</p>
                  <p className="text-xs font-semibold text-muted-foreground mt-0.5">Soit {m.pct}% du chiffre d'affaires</p>
                </div>
                <div className="text-right text-xs font-semibold text-muted-foreground">
                  <p>Vente : {fmt(m.ca)}</p>
                  <p>Coût (FIFO) : {fmt(m.cost)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* All payments use the same transactional RPC and cashier trace. */}
        {detailInv.status !== "payé" && (
          <button onClick={()=>{setEncaissInv(detailInv);setEncaissAmt(String(invoiceRemainingAmount(detailInv)));setDetailInv(null);}}
            className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
            style={{ background:SEM.success.accent, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
            <CreditCard size={18}/> Enregistrer un paiement
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={()=>{setDetailInv(null);setShareInv(detailInv);}} className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#a855f722", color:"#a855f7" }}>
            <Send size={16}/> Envoyer
          </button>
          <button onClick={()=>{ if(detailInv) openInvoicePDF(detailInv, boutique, clients); }} className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 active:scale-95" style={{ background:"#37415115", color:"#374151" }} title="Aperçu PDF">
            <FileText size={16}/>
          </button>
          {detailInv.acompte > 0 ? (
            <button onClick={()=>printReceipt(detailInv, boutique, currentUser.nom, true)} className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#0f172a", color:"#fff" }}>
              <Receipt size={16}/> Duplicata ticket
            </button>
          ) : (
            <button disabled title="Encaissez la commande avant d'imprimer le ticket de caisse" className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed" style={{ background:"#e2ddca", color:"#a39b7f" }}>
              <Receipt size={16}/> Ticket caisse
            </button>
          )}
        </div>
        {detailInv.acompte <= 0 && (
          <div className="px-3 py-2 rounded-xl text-xs flex items-center gap-2" style={{ background:SEM.warning.bg, color:SEM.warning.accent }}>
            <AlertCircle size={13}/> Ticket de caisse disponible après encaissement de la commande
          </div>
        )}
        {canReturn && detailInv.acompte > 0 && detailInv.type !== "Retour" && detailInv.lines && detailInv.lines.length > 0 && invoiceHasReturnable(detailInv) && (
          <button onClick={()=>openReturn(detailInv)} className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#ef444415", color:"#ef4444" }}>
            <RotateCcw size={16}/> Retour articles
          </button>
        )}
        {canReturn && detailInv.acompte > 0 && detailInv.type !== "Retour" && detailInv.lines && detailInv.lines.length > 0 && !invoiceHasReturnable(detailInv) && (
          <div className="w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2" style={{ background:SEM.neutral.bg, color:SEM.neutral.accent }}>
            <RotateCcw size={14}/> Facture entièrement retournée
          </div>
        )}
      </Modal>}

      <button onClick={()=>{ setLines([]); setAcompte(""); setLQty(""); setLPrix(""); setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:"#a855f7", boxShadow:"0 0 24px #a855f760" }}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>

      {modal&&<Modal title="Nouvelle facture" color="#374151" onClose={()=>setModal(false)}>
        <Field label="CLIENT">
          <select value={client} onChange={e=>setClient(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            {siblings.length>0&&<optgroup label="🏪 Mes autres boutiques">{siblings.map(sb=><option key={sb.id} value={sb.nom}>{sb.nom} — {sb.ville} (inter-tenant)</option>)}</optgroup>}
            <optgroup label="Clients">{clients.map(c=><option key={c.id} value={c.nom}>{c.nom} ({c.type})</option>)}</optgroup>
          </select>
          {siblingClient&&<div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#a855f715" }}>
            <Store size={14} style={{ color:"#a855f7" }}/>
            <p className="text-xs font-bold" style={{ color:"#a855f7" }}>Transfert inter-tenant · le stock sera mis à jour dans les 2 boutiques</p>
          </div>}
        </Field>

        {/* Product lines */}
        <div>
          <p className="text-xs font-black mb-2 tracking-wider" style={{ color:"#a855f7" }}>PRODUITS FACTURÉS</p>
          {lines.length>0&&<div className="space-y-2 mb-3">{lines.map((l,i)=>(
            <div key={i} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{l.nom}</p><p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)} = <span className="font-semibold text-foreground">{fmt(lineTotal(l))}</span></p></div>
              <button onClick={()=>removeLine(i)} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"#ef444420" }}><Trash2 size={13} style={{ color:"#ef4444" }}/></button>
            </div>
          ))}</div>}
          <div className="bg-muted rounded-2xl p-3 space-y-3">
            <select value={lPid} onChange={e=>{ const newPid=Number(e.target.value); setLPid(newPid); setLSellUnit(invDefaultUnit(newPid)); }} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ appearance:"none" }}>
              {products.map(p=><option key={p.id} value={p.id}>{p.nom} (stock: {productQty(p.id,entries)} {p.unit})</option>)}
            </select>
            {getInvSellOptions(lPid).length>1&&(()=>{
              const cat2=(boutique.categories??[]).find(c=>c.nom===products.find(p=>p.id===lPid)?.categorie);
              const effUnit=lSellUnit||invDefaultUnit(lPid);
              return(<div className="flex gap-2 flex-wrap">{getInvSellOptions(lPid).map(u=>{
                const lbl=u==="Lot"?(cat2?'Lot ('+cat2.nbPiecesParLot+'p)':'Lot'):u==="Pièce"?"Pièce":u;
                return(<button key={u} onClick={()=>setLSellUnit(u)} className="flex-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                  style={{ background:effUnit===u?"#1f2937":"#EEE9D8", color:effUnit===u?"#fff":"#374151" }}>{lbl}</button>);
              })}</div>);
            })()}
            <div className="flex gap-2">
              <input value={lQty} onChange={e=>setLQty(e.target.value)} placeholder={(lSellUnit||invDefaultUnit(lPid))==="Lot"?"Nb lots":(lSellUnit||invDefaultUnit(lPid))==="Pièce"?"Nb pièces":"Qté"} type="number" className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.nextElementSibling as HTMLInputElement|null)?.focus();}}}/>
              <input value={lPrix} onChange={e=>setLPrix(e.target.value)} placeholder={(lSellUnit||invDefaultUnit(lPid))==="Lot"?"Prix/lot":"Prix unitaire"} type="number" className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" onKeyDown={e=>e.key==="Enter"&&addLine()}/>
            </div>
            <button onClick={addLine} disabled={!lQty} className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
              style={{ background:lQty?"#a855f7":"#EEE9D8", color:lQty?"#fff":"#6b7280" }}>
              <Plus size={14}/> Ajouter la ligne
            </button>
          </div>
        </div>

        {/* Total from lines */}
        {montant>0&&<div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background:"#a855f715" }}>
          <span className="text-sm font-bold" style={{ color:"#a855f7" }}>Total facture</span>
          <span className="text-lg font-black" style={{ color:"#a855f7", fontFamily:"'Nunito', sans-serif" }}>{fmt(montant)}</span>
        </div>}

        <Field label="ACOMPTE VERSÉ (F CFA)" color="#C9A227">
          <input value={acompte} onChange={e=>setAcompte(e.target.value)} placeholder="Ex: 75 000" type="number" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/>
          {aNum>0&&montant>0&&<div className="mt-2"><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width:`${pct}%`, background:"#C9A227" }}/></div><div className="flex justify-between mt-1 text-xs"><span className="text-muted-foreground">Reste: {fmt(Math.max(0,montant-aNum))}</span><span style={{ color:"#C9A227",fontWeight:700 }}>{pct}%</span></div></div>}
        </Field>
        {aNum===0&&<Field label="STATUT"><div className="grid grid-cols-2 gap-2">{(["en attente","acompte","payé","en retard"] as InvoiceStatus[]).map(s=>{const [tc]=invBadge(s);return<button key={s} onClick={()=>setStatus(s)} className="py-3 rounded-xl text-xs font-bold capitalize" style={{ background:status===s?tc:tc+"22", color:status===s?"#fff":tc }}>{s}</button>;})}</div></Field>}
        <SubmitBtn color={boutique.color} label={submittingInvoice ? "Création…" : "Créer la facture"} onClick={submit} disabled={submittingInvoice || !client||lines.length===0}/>
      </Modal>}

      {shareInv&&<ShareInvoiceModal inv={shareInv} boutique={boutique} clients={clients} onClose={()=>setShareInv(null)}/>}

      {/* Return modal */}
      {returnInv && returnInv.lines && (
        <Modal title={`Retour · ${returnInv.id}`} color={SEM.danger.accent} onClose={()=>{ setReturnInv(null); setReturnDone(false); }}>
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"#ef444415" }}>
            <AlertCircle size={15} style={{ color:"#ef4444" }}/>
            <p className="text-xs" style={{ color:"#ef4444" }}>Les articles retournés seront remis en stock automatiquement.</p>
          </div>
          <div className="space-y-2">
            {returnInv.lines.map((l, i) => {
              const rem = remainingReturnable(returnInv, l);
              const alreadyReturned = l.qty - rem;
              return (
              <div key={i} className="flex items-center gap-3 bg-muted rounded-2xl p-3" style={rem<=0?{opacity:0.55}:{}}>
                {(() => { const prod = products.find(p=>p.id===l.productId); return prod ? <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,96,96)} alt={l.nom} className="w-full h-full object-cover"/></div> : null; })()}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} vendus · {fmt(l.prixUnit)} / {lineDispUnit(l)}</p>
                  {alreadyReturned > 0 && <p className="text-xs font-semibold" style={{ color:"#ef4444" }}>{rem > 0 ? `Reste à retourner : ${rem}` : "Déjà retourné en totalité"}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button disabled={rem<=0} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.max(0,(q[i]??0)-1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Minus size={12} style={{ color:"#ef4444" }}/></button>
                  <span className="w-8 text-center font-black text-sm" style={{ color:"#ef4444" }}>{returnQtys[i] ?? 0}</span>
                  <button disabled={(returnQtys[i] ?? 0) >= rem} onClick={()=>setReturnQtys(q=>({...q,[i]:Math.min(rem,(q[i]??0)+1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed" style={{ background:"#ef444422" }}><Plus size={12} style={{ color:"#ef4444" }}/></button>
                </div>
              </div>
              );
            })}
          </div>
          {(() => {
            const total = returnInv.lines.reduce((s,l,i)=>s+(returnQtys[i]??0)*l.prixUnit,0);
            return total > 0 ? (
              <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:"#ef444415" }}>
                <span className="font-bold text-sm" style={{ color:"#ef4444" }}>Montant remboursé</span>
                <span className="text-xl font-black" style={{ color:"#ef4444", fontFamily:"'Nunito', sans-serif" }}>{fmt(total)}</span>
              </div>
            ) : null;
          })()}
          {returnDone ? (
            <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={22} style={{ color:SEM.success.accent }}/>
              <p className="font-black text-sm" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>Retour enregistré ✓</p>
            </div>
          ) : (
            <SubmitBtn
              color={SEM.danger.accent}
              label="Confirmer le retour"
              onClick={submitReturn}
              disabled={!Object.values(returnQtys).some(q=>q>0)}
            />
          )}
        </Modal>
      )}

      {/* Quick encaissement modal */}
      {encaissInv && (
        <Modal title={`Encaisser · ${encaissInv.id}`} color={SEM.success.accent} onClose={()=>{setEncaissInv(null);setEncaissAmt("");setEncaissDone(false);}}>
          <div className="bg-muted rounded-2xl p-4">
            <p className="font-bold text-sm">{encaissInv.client}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{encaissInv.date} · {encaissInv.type}{encaissInv.paymentMethod ? ` · ${encaissInv.paymentMethod}` : ""}</p>
            {encaissInv.lines && encaissInv.lines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {encaissInv.lines.map((l, i) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <span className="text-foreground font-medium flex-1 truncate">{l.nom}</span>
                    <span className="text-muted-foreground ml-2">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)}</span>
                    <span className="font-bold ml-3" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(lineTotal(l))}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-baseline mt-3 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Total facturé</span>
              <span className="font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(encaissInv.montant)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xs text-muted-foreground">Déjà encaissé</span>
              <span className="font-bold text-sm" style={{color:SEM.success.accent}}>{fmt(invoicePaidAmount(encaissInv))}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1 pt-2 border-t border-border">
              <span className="text-xs font-bold">Reste dû</span>
              <span className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(invoiceRemainingAmount(encaissInv))}</span>
            </div>
          </div>
          <Field label="MODE DE PAIEMENT">
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m} type="button" onClick={()=>setEncaissMethod(m)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
                  style={{ background: encaissMethod===m ? PM_COLOR[m]+"22" : "#EEE9D8", color: encaissMethod===m ? PM_COLOR[m] : "#6b7280", border: encaissMethod===m ? `2px solid ${PM_COLOR[m]}` : "2px solid transparent" }}>
                  <span>{PM_ICON[m]}</span>{m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="MONTANT ENCAISSÉ (F CFA)">
            <input value={encaissAmt} onChange={e=>setEncaissAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(encaissAmt)>0&&submitEncaiss()} type="number" placeholder="0" className={inputCls+" text-center font-black text-lg"} autoFocus/>
          </Field>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setEncaissAmt(String(invoiceRemainingAmount(encaissInv)))} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{background:SEM.success.bg,color:SEM.success.accent}}>Solde total</button>
            <button type="button" onClick={()=>setEncaissAmt(String(Math.round(invoiceRemainingAmount(encaissInv)/2)))} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{background:"#C9A22722",color:"#C9A227"}}>50%</button>
          </div>
          {encaissDone ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:SEM.success.bg}}>
                <CheckCircle size={22} style={{color:SEM.success.accent}}/>
                <p className="font-black text-sm" style={{color:SEM.success.accent,fontFamily:"'Nunito', sans-serif"}}>Encaissement enregistré ✓</p>
              </div>
              {canSeeMargin && (() => {
                const m = invoiceMargin(encaissInv, entries, products);
                if (!m.hasData) return null;
                const accent = m.marge >= 0 ? SEM.success.accent : "#ef4444";
                return (
                  <div className="rounded-2xl p-3 flex items-center justify-between gap-3" style={{ background:SEM.neutral.bg }}>
                    <div>
                      <p className="text-xs font-black tracking-wider" style={{ color:accent }}>MARGE RÉALISÉE</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-0.5">{m.pct}% du CA · coût FIFO {fmt(m.cost)}</p>
                    </div>
                    <p className="text-xl font-black" style={{ color:accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(m.marge)}</p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <SubmitBtn color={boutique.color} label={submittingPayment ? "Encaissement…" : "Confirmer l'encaissement"} onClick={submitEncaiss} disabled={submittingPayment || !Number(encaissAmt)||Number(encaissAmt)<=0}/>
          )}
        </Modal>
      )}
    </div>
  );
}
