from pathlib import Path

# ── Types: historical invoice identity snapshot ───────────────────────────────
types_path = Path('src/app/types.ts')
types = types_path.read_text()
old = '''export type Invoice    = {
  id: string; clientId?: number; client: string; clientTel?: string; clientType?: ClientType;
  lines?: InvoiceLine[]; payments?: InvoicePayment[];
  montant: number; acompte: number; date: string; dateRaw?: string;
  status: InvoiceStatus; type: string;
  operatorNom?: string; operatorColor?: string;
  paymentMethod?: PaymentMethod; paymentSplit?: PaymentEntry[];
};'''
new = '''export type Invoice    = {
  id: string; clientId?: number; client: string; clientTel?: string; clientType?: ClientType;
  clientEmailSnapshot?: string; clientAdresseSnapshot?: string; clientVilleSnapshot?: string; clientTypeSnapshot?: ClientType;
  boutiqueNomSnapshot?: string; boutiqueVilleSnapshot?: string; boutiqueAdresseSnapshot?: string; boutiqueTelSnapshot?: string; boutiqueEmailSnapshot?: string; boutiqueLogoSnapshot?: string;
  lines?: InvoiceLine[]; payments?: InvoicePayment[];
  montant: number; acompte: number; date: string; dateRaw?: string;
  status: InvoiceStatus; type: string;
  operatorNom?: string; operatorColor?: string;
  paymentMethod?: PaymentMethod; paymentSplit?: PaymentEntry[];
};'''
if old not in types:
    raise SystemExit('Invoice type anchor not found')
types = types.replace(old, new, 1)
types_path.write_text(types)

# ── API projection: expose snapshots to the UI ────────────────────────────────
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
old = '''          clientId:i.client_id ?? undefined,
          client:i.client_nom ?? "Client comptoir",
          clientTel:i.client_tel ?? undefined,
          clientType:clientRecord?.type ?? undefined,
          montant:Number(i.montant),'''
new = '''          clientId:i.client_id ?? undefined,
          client:i.client_nom ?? "Client comptoir",
          clientTel:i.client_tel ?? undefined,
          clientType:i.client_type_snapshot ?? clientRecord?.type ?? undefined,
          clientEmailSnapshot:i.client_email_snapshot ?? undefined,
          clientAdresseSnapshot:i.client_adresse_snapshot ?? undefined,
          clientVilleSnapshot:i.client_ville_snapshot ?? undefined,
          clientTypeSnapshot:i.client_type_snapshot ?? undefined,
          boutiqueNomSnapshot:i.boutique_nom_snapshot ?? undefined,
          boutiqueVilleSnapshot:i.boutique_ville_snapshot ?? undefined,
          boutiqueAdresseSnapshot:i.boutique_adresse_snapshot ?? undefined,
          boutiqueTelSnapshot:i.boutique_tel_snapshot ?? undefined,
          boutiqueEmailSnapshot:i.boutique_email_snapshot ?? undefined,
          boutiqueLogoSnapshot:i.boutique_logo_snapshot ?? undefined,
          montant:Number(i.montant),'''
if old not in api:
    raise SystemExit('API invoice snapshot anchor not found')
api = api.replace(old, new, 1)
api = api.replace('''          operatorNom:operator.nom ?? undefined,''', '''          operatorNom:i.operator_nom_snapshot ?? operator.nom ?? undefined,''', 1)
api_path.write_text(api)

# ── PDF: prefer historical snapshot over current mutable records ──────────────
invoice_path = Path('src/app/utils/invoice.ts')
invoice = invoice_path.read_text()
old = '''  const clientTypeLabel = clientRecord?.type === "B2B" ? "Client B2B (Grossiste)"
    : clientRecord?.type === "Intergroupe" ? "Client Intergroupe"
    : "Client B2C (Particulier)";

  const parsedInvoiceDate = inv.dateRaw ? new Date(inv.dateRaw) : null;'''
new = '''  const clientType = inv.clientTypeSnapshot ?? inv.clientType ?? clientRecord?.type;
  const clientTypeLabel = clientType === "B2B" ? "Client B2B (Grossiste)"
    : "Client B2C (Particulier)";
  const invoiceBoutiqueNom = inv.boutiqueNomSnapshot ?? boutique.nom;
  const invoiceBoutiqueVille = inv.boutiqueVilleSnapshot ?? boutique.ville;
  const invoiceBoutiqueAdresse = inv.boutiqueAdresseSnapshot ?? boutique.adresse;
  const invoiceBoutiqueTel = inv.boutiqueTelSnapshot ?? boutique.tel;
  const invoiceBoutiqueEmail = inv.boutiqueEmailSnapshot ?? boutique.email;
  const invoiceClientAdresse = inv.clientAdresseSnapshot ?? clientRecord?.adresse;
  const invoiceClientEmail = inv.clientEmailSnapshot ?? clientRecord?.email;
  const invoiceClientVille = inv.clientVilleSnapshot ?? clientRecord?.ville;

  const parsedInvoiceDate = inv.dateRaw ? new Date(inv.dateRaw) : null;'''
if old not in invoice:
    raise SystemExit('PDF snapshot variables anchor not found')
invoice = invoice.replace(old, new, 1)
invoice = invoice.replace('<title>${docLabel} ${inv.id} — ${boutique.nom}</title>', '<title>${docLabel} ${inv.id} — ${invoiceBoutiqueNom}</title>', 1)
invoice = invoice.replace('<div class="brand-name">${boutique.nom}</div>', '<div class="brand-name">${invoiceBoutiqueNom}</div>', 1)
invoice = invoice.replace('''        ${boutique.adresse ? boutique.adresse + "<br/>" : ""}
        ${boutique.tel ? "Tél : " + boutique.tel + "<br/>" : ""}
        ${boutique.email ? boutique.email : ""}''', '''        ${invoiceBoutiqueAdresse ? invoiceBoutiqueAdresse + "<br/>" : ""}
        ${invoiceBoutiqueTel ? "Tél : " + invoiceBoutiqueTel + "<br/>" : ""}
        ${invoiceBoutiqueEmail ? invoiceBoutiqueEmail : ""}''', 1)
invoice = invoice.replace('<div class="party-name">${boutique.nom}</div>', '<div class="party-name">${invoiceBoutiqueNom}</div>', 1)
invoice = invoice.replace('''        ${boutique.adresse ?? ""}<br/>
        ${boutique.tel ? "Tél : " + boutique.tel : ""}<br/>
        ${boutique.email ?? ""}''', '''        ${invoiceBoutiqueAdresse ?? ""}<br/>
        ${invoiceBoutiqueVille ?? ""}<br/>
        ${invoiceBoutiqueTel ? "Tél : " + invoiceBoutiqueTel : ""}<br/>
        ${invoiceBoutiqueEmail ?? ""}''', 1)
invoice = invoice.replace('''        ${clientRecord?.adresse ?? ""}<br/>
        ${clientRecord?.email ?? ""}''', '''        ${invoiceClientAdresse ?? ""}<br/>
        ${invoiceClientVille ?? ""}<br/>
        ${invoiceClientEmail ?? ""}''', 1)
invoice = invoice.replace('''      Document généré par ${boutique.nom} — ${new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}.<br/>''', '''      Document régénéré depuis les données de la facture ${inv.id} — ${new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}.<br/>''', 1)
invoice_path.write_text(invoice)

print('Historical invoice snapshots integrated successfully')
