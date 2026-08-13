import { useState, useEffect } from "react";
import { signQZ } from "../../lib/api";
import type { Invoice, Boutique, Client, CaisseSession } from "../types";
import { lineDispQty, lineDispUnit, lineTotal } from "./inventory";
import { PAYMENT_METHODS, PM_ICON } from "../constants";
import { fmt } from "./formatting";

// ─── INVOICE MESSAGE ──────────────────────────────────────────────────────────

export function buildInvoiceMessage(inv: Invoice, boutique: Boutique): string {
  const reste = inv.montant - inv.acompte;
  const lines = inv.lines?.map(l => `  • ${l.nom} × ${lineDispQty(l)} ${lineDispUnit(l)} = ${fmt(lineTotal(l))}`).join("\n") ?? "";
  return `*Facture ${inv.id}* — ${boutique.nom}\n📋 Client: ${inv.client}\n` +
    (lines ? `\n${lines}\n` : "") +
    `\n💰 Total: ${fmt(inv.montant)}\n` +
    (inv.acompte > 0 ? `✅ Acompte: ${fmt(inv.acompte)}\n` : "") +
    (reste > 0 ? `⏳ Reste: ${fmt(reste)}\n` : "") +
    `📅 ${inv.date}\nMerci pour votre confiance ! 🙏`;
}

// ─── INVOICE PDF ──────────────────────────────────────────────────────────────

export function buildInvoicePDFHtml(inv: Invoice, boutique: Boutique, clients: Client[]): string {
  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
  const fmtF = (n: number) => fmtN(n) + " F";
  const clientRecord = clients.find(c => c.nom === inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const accent = boutique.color;

  const statusColor = reste <= 0 ? "#16a34a" : inv.acompte > 0 ? "#d97706" : "#dc2626";
  const statusBg    = reste <= 0 ? "#f0fdf4" : inv.acompte > 0 ? "#fffbeb" : "#fef2f2";
  const statusBorder= reste <= 0 ? "#16a34a" : inv.acompte > 0 ? "#d97706" : "#dc2626";
  const statusLabel = reste <= 0 ? "PAYÉ"     : inv.acompte > 0 ? "ACOMPTE VERSÉ" : "IMPAYÉ";

  const lineRows = lines.map(l => {
    const qtyDisp = l.sellQty ?? l.qty;
    const unitDisp = l.sellUnit ?? l.unit;
    const total = lineTotal(l);
    return `
      <tr>
        <td class="td-name">${l.nom}</td>
        <td class="td-center">${fmtN(qtyDisp)}</td>
        <td class="td-center">${unitDisp}</td>
        <td class="td-right">${fmtN(l.prixUnit)} F</td>
        <td class="td-right td-bold">${fmtN(total)} F</td>
      </tr>`;
  }).join("");

  const clientTypeLabel = clientRecord?.type === "B2B" ? "Client B2B (Grossiste)"
    : clientRecord?.type === "Intergroupe" ? "Client Intergroupe"
    : "Client B2C (Particulier)";

  const today = new Date(inv.date + "T00:00:00");
  const dateFormatted = today.toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>Facture ${inv.id} — ${boutique.nom}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #1a1a1a; background: #fff; line-height: 1.5; }
  .page { width: 100%; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8mm; border-bottom: 2px solid ${accent}; margin-bottom: 8mm; }
  .brand-name { font-size: 18pt; font-weight: 900; color: ${accent}; letter-spacing: -0.5px; }
  .brand-meta { font-size: 8pt; color: #555; margin-top: 3px; line-height: 1.6; }
  .inv-meta { text-align: right; }
  .inv-id { font-size: 16pt; font-weight: 900; color: #1a1a1a; letter-spacing: 0.5px; }
  .inv-label { font-size: 7.5pt; font-weight: 700; color: #888; letter-spacing: 1px; text-transform: uppercase; }
  .inv-date { font-size: 8.5pt; color: #444; margin-top: 4px; }
  .status-badge { display: inline-block; font-size: 8pt; font-weight: 900; letter-spacing: 1.5px; padding: 3px 10px; border-radius: 4px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusBorder}; margin-top: 6px; }
  .parties { display: flex; gap: 12mm; margin-bottom: 8mm; }
  .party { flex: 1; }
  .party-label { font-size: 7pt; font-weight: 900; letter-spacing: 1.5px; color: #888; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e5e5e5; padding-bottom: 3px; }
  .party-name { font-size: 11pt; font-weight: 800; color: #1a1a1a; margin-bottom: 3px; }
  .party-detail { font-size: 8pt; color: #555; line-height: 1.6; }
  .party-type { display: inline-block; font-size: 7pt; font-weight: 700; color: #888; background: #f3f4f6; border-radius: 3px; padding: 1px 6px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  thead tr { background: #1a1a1a; color: #fff; }
  thead th { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 8px; text-align: left; }
  thead th.th-right { text-align: right; }
  thead th.th-center { text-align: center; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody tr { border-bottom: 1px solid #eeeeee; }
  .td-name { padding: 6px 8px; font-size: 9pt; font-weight: 500; }
  .td-center { padding: 6px 8px; text-align: center; font-size: 9pt; color: #333; }
  .td-right { padding: 6px 8px; text-align: right; font-size: 9pt; color: #333; }
  .td-bold { font-weight: 700; color: #1a1a1a !important; }
  .totals-block { display: flex; justify-content: flex-end; margin-bottom: 8mm; }
  .totals-inner { width: 72mm; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9pt; color: #555; border-bottom: 1px solid #f0f0f0; }
  .totals-row:last-child { border-bottom: none; }
  .totals-total { display: flex; justify-content: space-between; padding: 6px 10px; margin-top: 4px; background: ${accent}10; border-radius: 4px; border-left: 3px solid ${accent}; }
  .totals-total-label { font-size: 10pt; font-weight: 900; color: #1a1a1a; }
  .totals-total-value { font-size: 11pt; font-weight: 900; color: ${accent}; }
  .totals-reste { display: flex; justify-content: space-between; padding: 5px 10px; margin-top: 4px; background: ${statusBg}; border-radius: 4px; border-left: 3px solid ${statusColor}; }
  .totals-reste-label { font-size: 9pt; font-weight: 700; color: ${statusColor}; }
  .totals-reste-value { font-size: 10pt; font-weight: 900; color: ${statusColor}; }
  .footer { margin-top: 10mm; padding-top: 6mm; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-note { font-size: 7.5pt; color: #888; max-width: 110mm; line-height: 1.6; }
  .footer-thanks { font-size: 8pt; font-weight: 700; color: ${accent}; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">${boutique.nom}</div>
      <div class="brand-meta">
        ${boutique.adresse ? boutique.adresse + "<br/>" : ""}
        ${boutique.tel ? "Tél : " + boutique.tel + "<br/>" : ""}
        ${boutique.email ? boutique.email : ""}
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-label">Facture</div>
      <div class="inv-id">${inv.id}</div>
      <div class="inv-date">${dateFormatted}</div>
      <div><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="party-label">Émetteur</div>
      <div class="party-name">${boutique.nom}</div>
      <div class="party-detail">
        ${boutique.adresse ?? ""}<br/>
        ${boutique.tel ? "Tél : " + boutique.tel : ""}<br/>
        ${boutique.email ?? ""}
      </div>
    </div>
    <div class="party">
      <div class="party-label">Destinataire</div>
      <span class="party-type">${clientTypeLabel}</span>
      <div class="party-name">${inv.client}</div>
      <div class="party-detail">
        ${inv.clientTel ? "Tél : " + inv.clientTel : ""}<br/>
        ${clientRecord?.adresse ?? ""}<br/>
        ${clientRecord?.email ?? ""}
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:42%">Désignation</th>
        <th class="th-center" style="width:13%">Qté</th>
        <th class="th-center" style="width:13%">Unité</th>
        <th class="th-right" style="width:16%">Prix unit.</th>
        <th class="th-right" style="width:16%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>
  <div class="totals-block">
    <div class="totals-inner">
      ${lines.length > 1 ? `<div class="totals-row"><span>Sous-total</span><span>${fmtF(subtotal)}</span></div>` : ""}
      ${inv.acompte > 0 ? `<div class="totals-row"><span>Acompte versé</span><span>- ${fmtF(inv.acompte)}</span></div>` : ""}
      <div class="totals-total">
        <span class="totals-total-label">Total à payer</span>
        <span class="totals-total-value">${fmtF(inv.montant)}</span>
      </div>
      ${reste > 0 && inv.acompte > 0 ? `<div class="totals-reste"><span class="totals-reste-label">Reste dû</span><span class="totals-reste-value">${fmtF(reste)}</span></div>` : ""}
      ${reste > 0 && inv.acompte === 0 ? `<div class="totals-reste"><span class="totals-reste-label">Montant impayé</span><span class="totals-reste-value">${fmtF(reste)}</span></div>` : ""}
    </div>
  </div>
  <div class="footer">
    <div class="footer-note">
      Document généré par ${boutique.nom} — ${new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}.<br/>
      Ce document tient lieu de facture. Conservez-le pour vos archives.
    </div>
    <div class="footer-thanks">Merci pour votre confiance.</div>
  </div>
</div>
</body>
</html>`;
}

export function openInvoicePDF(inv: Invoice, boutique: Boutique, clients: Client[]) {
  const html = buildInvoicePDFHtml(inv, boutique, clients);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

// ─── SILENT PRINT ─────────────────────────────────────────────────────────────

export function silentPrint(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
  }, 350);
}

// ─── QZ TRAY PRINT AGENT ─────────────────────────────────────────────────────

export const PA: {
  status: "idle"|"loading"|"connected"|"disconnected";
  qz: any; printers: string[]; printer: string;
  listeners: Set<()=>void>;
} = { status:"idle", qz:null, printers:[], printer:"", listeners: new Set() };

export function onPAChange(cb: ()=>void) { PA.listeners.add(cb); return ()=>PA.listeners.delete(cb); }
export function notifyPA() { PA.listeners.forEach(cb=>cb()); }

export function usePAStatus() {
  const [, tick] = useState(0);
  useEffect(()=>{ const unsub = onPAChange(()=>tick(t=>t+1)); return unsub; }, []);
  return PA;
}

export async function connectQZ(savedPrinter?: string): Promise<void> {
  if (PA.status === "loading" || PA.status === "connected") return;
  PA.status = "loading"; notifyPA();
  try {
    if (!(window as any).qz) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";
        s.onload = ()=>resolve();
        s.onerror = ()=>reject(new Error("load failed"));
        document.head.appendChild(s);
      });
    }
    const qz = (window as any).qz;
    if (!qz) throw new Error("qz unavailable");
    qz.security.setCertificatePromise((res: any) => {
      fetch("/certs/qz-public.pem")
        .then(r => r.ok ? r.text() : "")
        .then(res)
        // A missing trusted certificate must not block local QZ Tray use.
        // QZ Tray will ask the operator to approve the first connection.
        .catch(() => res(""));
    }, { rejectOnFailure:false });
    qz.security.setSignaturePromise((toSign: string) => (res: any) => {
      // Production private keys stay server-only. Until a QZ trusted
      // certificate is configured, an empty signature intentionally triggers
      // QZ Tray's explicit local approval dialogue instead of failing.
      signQZ(toSign).then(res).catch(() => res(""));
    });
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({
        host:"localhost",
        port:{ secure:[8181,8182], insecure:[8181,8182] },
        usingSecure: false, keepAlive: 60, retries: 1,
      });
    }
    PA.qz = qz; PA.status = "connected";
    qz.websocket.setClosedCallbacks(()=>{ PA.status="disconnected"; PA.qz=null; PA.printers=[]; notifyPA(); });
    const found = await qz.printers.find();
    PA.printers = Array.isArray(found) ? found : (found ? [found] : []);
    if (savedPrinter && PA.printers.includes(savedPrinter)) PA.printer = savedPrinter;
    else if (!PA.printer && PA.printers.length > 0) PA.printer = PA.printers[0];
    notifyPA();
  } catch {
    PA.status = "disconnected"; notifyPA();
  }
}

export async function agentPrint(html: string, printer?: string): Promise<"ok"|"fail"|"fallback"> {
  const target = printer || PA.printer;
  if (PA.status === "connected" && PA.qz && target) {
    try {
      const cfg = PA.qz.configs.create(target, { size:{width:72,height:null}, units:"mm", copies:1 });
      await PA.qz.print(cfg, [{ type:"pixel", format:"html", flavor:"plain", data:html }]);
      return "ok";
    } catch { return "fail"; }
  }
  silentPrint(html);
  return "fallback";
}

// ─── RECEIPT HTML ─────────────────────────────────────────────────────────────

export function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const operator = inv.operatorNom ?? fallbackOperator ?? "—";
  const COL = 32;
  function pad(left: string, right: string, total = COL): string {
    const space = total - left.length - right.length;
    return left + (space > 0 ? " ".repeat(space) : " ") + right;
  }
  function fnum(n: number): string { return n.toLocaleString("fr-FR"); }

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<title>Ticket ${inv.id}</title>
<style>
  @page { size: 80mm auto; margin: 4mm 4mm 8mm 4mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 72mm; font-family: 'Courier New', Courier, monospace; font-size: 9pt; line-height: 1.45; color: #000; background: #fff; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .big    { font-size: 13pt; letter-spacing: 1.5px; }
  .small  { font-size: 7.5pt; color: #444; }
  .sep-solid { border-top: 1px solid #000; margin: 3mm 0; }
  .sep-dash  { border-top: 1px dashed #555; margin: 2.5mm 0; }
  pre { font-family: inherit; font-size: inherit; white-space: pre-wrap; word-break: break-all; }
  .row { display: flex; justify-content: space-between; margin: 0.8mm 0; }
  .row .label { flex: 1; }
  .row .value { font-weight: 700; text-align: right; padding-left: 2mm; }
  .total-block { margin: 2mm 0; padding: 1.5mm 0; border-top: 2px solid #000; border-bottom: 2px solid #000; }
  .total-block .row .value { font-size: 11pt; }
  .status { display: inline-block; border: 1px solid currentColor; border-radius: 2mm; padding: 0.5mm 2mm; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { font-size: 7.5pt; color: #555; text-align: center; margin-top: 3mm; }
</style>
</head><body>
<div class="center">
  <div class="bold big">${boutique.nom.toUpperCase()}</div>
  <div class="small">${boutique.ville}</div>
  ${boutique.adresse ? `<div class="small">${boutique.adresse}</div>` : ""}
  ${boutique.tel ? `<div class="small">Tél : ${boutique.tel}</div>` : ""}
  ${boutique.email ? `<div class="small">${boutique.email}</div>` : ""}
</div>
<div class="sep-solid"></div>
<div class="row"><span class="label">N°</span><span class="value">${inv.id}</span></div>
<div class="row"><span class="label">Date</span><span class="value">${inv.date}</span></div>
<div class="row"><span class="label">Client</span><span class="value">${inv.client}${inv.clientTel ? " · " + inv.clientTel : ""}</span></div>
<div class="row"><span class="label">Opérateur</span><span class="value">${operator}</span></div>
<div class="sep-dash"></div>
${lines.length > 0 ? `
<div class="bold small" style="margin-bottom:1.5mm;">DÉSIGNATION&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;QTÉ&nbsp;&nbsp;&nbsp;&nbsp;TOTAL</div>
<div class="sep-dash"></div>
${lines.map(l => `
  <div style="margin:1.5mm 0;">
    <div class="bold" style="font-size:9pt;">${l.nom}</div>
    <div class="row small" style="margin-top:0.5mm;">
      <span>${fnum(lineDispQty(l))}&nbsp;${lineDispUnit(l)}&nbsp;×&nbsp;${fnum(l.prixUnit)}&nbsp;F</span>
      <span class="bold" style="color:#000;">${fnum(lineTotal(l))}&nbsp;F</span>
    </div>
  </div>`).join("")}
<div class="sep-dash"></div>
` : ""}
<div class="total-block">
  <div class="row">
    <span class="label bold">TOTAL</span>
    <span class="value">${fnum(inv.montant)}&nbsp;F CFA</span>
  </div>
</div>
<div style="margin:2mm 0;">
  <div class="row">
    <span class="label">Acompte versé</span>
    <span class="value">${fnum(inv.acompte)}&nbsp;F</span>
  </div>
  <div class="row">
    <span class="label">Reste à payer</span>
    <span class="value" style="color:${reste > 0 ? "#c00" : "#000"};">${fnum(reste)}&nbsp;F</span>
  </div>
  ${inv.paymentMethod ? `<div class="row"><span class="label">Mode de paiement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
  <div style="text-align:right;margin-top:1.5mm;">
    <span class="status" style="color:${reste > 0 ? "#c00" : "#000"};">${inv.status.toUpperCase()}</span>
  </div>
</div>
<div class="sep-solid"></div>
<div class="footer">
  <div>Merci pour votre confiance !</div>
  <div style="margin-top:1mm;">Imprimé via Tournal</div>
</div>
</body></html>`;
  return html;
}

export function printReceipt(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean) {
  silentPrint(buildReceiptHtml(inv, boutique, fallbackOperator, isDuplicate));
}

// ─── ORDER TICKET ─────────────────────────────────────────────────────────────

export function buildOrderTicketHtml(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean): string {
  const fnum = (n: number) => n.toLocaleString("fr-FR");
  const now = new Date();
  const lines = inv.lines ?? [];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Bon ${inv.id}</title>
<style>
  @page { size: 80mm auto; margin: 4mm 4mm 8mm 4mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:72mm; font-family:'Courier New',Courier,monospace; font-size:9pt; line-height:1.45; color:#000; background:#fff; }
  .center{text-align:center}.bold{font-weight:700}.big{font-size:13pt;letter-spacing:1.5px}.small{font-size:7.5pt;color:#444}
  .sep-solid{border-top:1px solid #000;margin:3mm 0}.sep-dash{border-top:1px dashed #555;margin:2.5mm 0}
  .row{display:flex;justify-content:space-between;margin:0.8mm 0}.row .value{font-weight:700;text-align:right;padding-left:2mm}
  .total-block{margin:2mm 0;padding:1.5mm 0;border-top:2px solid #000;border-bottom:2px solid #000}.total-block .value{font-size:11pt}
  .alert{text-align:center;border:1.5px solid #000;border-radius:1.5mm;padding:2mm;margin:2.5mm 0;font-weight:700;font-size:8pt;letter-spacing:0.5px}
  .footer{font-size:7.5pt;color:#555;text-align:center;margin-top:3mm}
</style></head><body>
<div class="center"><div class="bold big">${boutique.nom.toUpperCase()}</div><div class="small">${boutique.ville}</div>${boutique.adresse ? `<div class="small">${boutique.adresse}</div>` : ""}${boutique.tel ? `<div class="small">Tél: ${boutique.tel}</div>` : ""}${boutique.email ? `<div class="small">${boutique.email}</div>` : ""}</div>
<div class="sep-solid"></div>
<div class="center bold" style="font-size:10pt;">BON DE COMMANDE</div>
${isDuplicate ? '<div class="center bold" style="font-size:9pt;letter-spacing:2px;border:1.5px solid #c00;color:#c00;padding:1.5mm 3mm;margin:2mm 0;">DUPLICATA</div>' : ""}
<div class="row"><span>N°</span><span class="value">${inv.id}</span></div>
<div class="row"><span>Date</span><span class="value">${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span></div>
<div class="row"><span>Client</span><span class="value">${inv.client}${inv.clientTel?" · "+inv.clientTel:""}</span></div>
<div class="row"><span>Vendeur</span><span class="value">${operatorNom}</span></div>
<div class="sep-dash"></div>
${lines.map(l=>`<div style="margin:1.5mm 0;"><div class="bold">${l.nom}</div><div class="row small" style="margin-top:0.5mm;"><span>${fnum(l.qty)}&nbsp;${l.unit}&nbsp;×&nbsp;${fnum(l.prixUnit)}&nbsp;F</span><span class="bold" style="color:#000;">${fnum(l.qty*l.prixUnit)}&nbsp;F</span></div></div>`).join("")}
<div class="sep-dash"></div>
<div class="total-block"><div class="row"><span class="bold">TOTAL</span><span class="value">${fnum(inv.montant)}&nbsp;F CFA</span></div></div>
<div class="alert">⚠ À RÉGLER EN CAISSE ⚠<br/>Ce bon n'est pas une preuve de paiement</div>
<div class="footer">Présentez ce bon au caissier · Tournal</div>
</body></html>`;
  return html;
}

export function printOrderTicket(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean) {
  silentPrint(buildOrderTicketHtml(inv, boutique, operatorNom, isDuplicate));
}

// ─── CAISSE REPORT ────────────────────────────────────────────────────────────

export function printCaisseReport(session: CaisseSession, boutique: Boutique, invoices: Invoice[]) {
  const todayStr = new Date().toISOString().split("T")[0];
  const todayPaid = invoices.filter(i => i.dateRaw === todayStr && i.acompte > 0);
  const byMethod = PAYMENT_METHODS.map(m => ({
    m, total: todayPaid.filter(i => i.paymentMethod === m).reduce((s, i) => s + i.acompte, 0),
    count: todayPaid.filter(i => i.paymentMethod === m).length,
  }));
  const totalEnc = todayPaid.reduce((s, i) => s + i.acompte, 0);
  const totalCaisse = session.fondDeCaisse + byMethod.find(b => b.m === "Espèces")!.total;
  const now = new Date();
  const fnum = (n: number) => n.toLocaleString("fr-FR");
  const pad = (l: string, r: string, t = 32) => l + " ".repeat(Math.max(1, t - l.length - r.length)) + r;
  const rows = byMethod.filter(b => b.count > 0).map(b => `<div>${pad(`${PM_ICON[b.m]} ${b.m} (${b.count})`, fnum(b.total) + " F")}</div>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Fermeture caisse</title>
<style>body{font-family:'Courier New',monospace;font-size:12px;padding:4mm 6mm;max-width:80mm;margin:0 auto;line-height:1.6}.center{text-align:center}.bold{font-weight:900}.sep{border:none;border-top:1px dashed #000;margin:4px 0}.pre{white-space:pre-wrap}</style></head>
<body>
<div class="center bold">${boutique.nom}</div>
<div class="center">RAPPORT DE FERMETURE DE CAISSE</div>
<hr class="sep"/>
<div>Date : ${now.toLocaleDateString("fr-FR")}</div>
<div>Ouverture : ${new Date(session.openedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} — ${session.openedBy}</div>
<div>Fermeture : ${now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} — ${session.closedBy??""}</div>
<hr class="sep"/>
<div class="pre">${pad("Fond de caisse", fnum(session.fondDeCaisse) + " F")}</div>
<hr class="sep"/>
<div class="bold">Encaissements</div>
<div class="pre">${rows}</div>
<hr class="sep"/>
<div class="pre bold">${pad("TOTAL ENCAISSÉ", fnum(totalEnc) + " F")}</div>
<div class="pre bold">${pad("TOTAL EN CAISSE (espèces)", fnum(totalCaisse) + " F")}</div>
<hr class="sep"/>
<div>Transactions : ${todayPaid.length}</div>
</body></html>`;
  silentPrint(html);
}
