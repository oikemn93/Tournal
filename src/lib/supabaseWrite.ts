/**
 * Supabase write helpers — called from every mutation in App.tsx.
 * Fire-and-forget: callers do sw*(...).catch(e => console.error("[sw]", e))
 */
import { supabase } from "./supabaseClient";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapInvoiceType(t?: string): string {
  if (!t) return "vente";
  const low = t.toLowerCase();
  if (low === "retour") return "retour";
  if (low === "devis")  return "devis";
  if (low.includes("commande")) return "commande";
  return "vente"; // B2B, B2C, Grossiste, Inter-tenant, Vente…
}

function mapInvoiceStatus(s: string): string {
  if (s === "payé" || s === "payée") return "payée";
  if (s === "annulé" || s === "annulée") return "annulée";
  if (s === "retour") return "retour";
  return "en_attente";
}

function mapRole(fr: string): "owner" | "manager" | "employee" {
  if (fr === "Propriétaire") return "owner";
  if (fr === "Manager" || fr === "Gérant") return "manager";
  return "employee";
}

function tryDate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function sw(table: string, row: Record<string, unknown>, onConflict: string) {
  const { error } = await (supabase.from(table) as any)
    .upsert(row, { onConflict });
  if (error) throw new Error(`[sw:${table}] ${error.message}`);
}

async function del(table: string, match: Record<string, unknown>) {
  let q = supabase.from(table).delete() as any;
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw new Error(`[del:${table}] ${error.message}`);
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function swCategory(boutiqueId: string, cat: { id: string; nom: string }) {
  await sw("categories", { id: cat.id, boutique_id: boutiqueId, nom: cat.nom }, "boutique_id,id");
}

export async function swDeleteCategory(boutiqueId: string, catId: string) {
  await del("categories", { boutique_id: boutiqueId, id: catId });
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function swProduct(
  boutiqueId: string,
  p: { id: number; nom: string; unit?: string; categorie?: string; alertLow?: number; alertOk?: number; actif?: boolean },
  catNomToId: Record<string, string>
) {
  await sw("products", {
    id:                  p.id,
    boutique_id:         boutiqueId,
    nom:                 p.nom,
    unit:                p.unit ?? "unité",
    category_id:         p.categorie ? (catNomToId[p.categorie] ?? null) : null,
    low_stock_threshold: p.alertLow ?? null,
    actif:               p.actif ?? true,
    prix_achat:          0,
    prix_vente:          0,
    stock:               0,
  }, "boutique_id,id");
}

export async function swDeleteProduct(boutiqueId: string, productId: number) {
  await del("products", { boutique_id: boutiqueId, id: productId });
}

// ─── Stock entries ───────────────────────────────────────────────────────────

export async function swStockEntry(
  boutiqueId: string,
  e: { id: number; productId: number; qty: number; montantDu?: number; date?: string; fournisseur?: string }
) {
  const qty = Math.abs(e.qty);
  await sw("stock_entries", {
    id:          e.id,
    boutique_id: boutiqueId,
    product_id:  e.productId,
    type:        e.qty >= 0 ? "achat" : "ajustement",
    qty,
    prix_unit:   qty > 0 && (e.montantDu ?? 0) > 0 ? (e.montantDu! / qty) : null,
    entry_date:  tryDate(e.date) ?? new Date().toISOString(),
    note:        e.fournisseur ?? null,
  }, "boutique_id,id");
}

export async function swDeleteStockEntry(boutiqueId: string, entryId: number) {
  await del("stock_entries", { boutique_id: boutiqueId, id: entryId });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function swSupplier(
  boutiqueId: string,
  s: { id: number; nom: string; ville?: string; tel?: string; email?: string; contact?: string; initials?: string; color?: string; lastDelivery?: string }
) {
  await sw("suppliers", {
    id:               s.id,
    boutique_id:      boutiqueId,
    nom:              s.nom,
    ville:            s.ville ?? null,
    tel:              s.tel ?? null,
    email:            s.email ?? null,
    contact:          s.contact ?? null,
    initials:         s.initials ?? null,
    color:            s.color ?? null,
    last_delivery_at: tryDate(s.lastDelivery),
  }, "boutique_id,id");
}

export async function swDeleteSupplier(boutiqueId: string, supplierId: number) {
  await del("suppliers", { boutique_id: boutiqueId, id: supplierId });
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function swClient(
  boutiqueId: string,
  c: { id: number; nom: string; type?: string; tel?: string; ville?: string; adresse?: string; email?: string; contact?: string; total?: number; last?: string }
) {
  await sw("clients", {
    id:              c.id,
    boutique_id:     boutiqueId,
    nom:             c.nom,
    type:            (c.type === "B2B" || c.type === "Grossiste") ? "B2B" : "B2C",
    tel:             c.tel ?? null,
    email:           c.email ?? null,
    adresse:         c.adresse ?? null,
    ville:           c.ville ?? null,
    contact:         c.contact ?? null,
    total:           c.total ?? 0,
    last_invoice_at: tryDate(c.last),
  }, "boutique_id,id");
}

export async function swDeleteClient(boutiqueId: string, clientId: number) {
  await del("clients", { boutique_id: boutiqueId, id: clientId });
}

// ─── Invoices ────────────────────────────────────────────────────────────────

type InvoiceLine = {
  productId: number; nom: string; qty: number; unit?: string;
  prixUnit: number; sellUnit?: string; sellQty?: number;
};

export async function swInvoice(
  boutiqueId: string,
  inv: {
    id: string; client?: string; clientTel?: string; montant: number; acompte?: number;
    date?: string; dateRaw?: string; status: string; type?: string; paymentMethod?: string;
    lines?: InvoiceLine[];
  },
  clientNomToId: Record<string, number> = {}
) {
  const { error: iErr } = await (supabase.from("invoices") as any).upsert({
    id:             inv.id,
    boutique_id:    boutiqueId,
    client_id:      inv.client ? (clientNomToId[inv.client] ?? null) : null,
    client_nom:     inv.client ?? null,
    client_tel:     inv.clientTel ?? null,
    montant:        inv.montant,
    acompte:        inv.acompte ?? 0,
    invoice_date:   tryDate(inv.dateRaw ?? inv.date) ?? new Date().toISOString(),
    status:         mapInvoiceStatus(inv.status),
    type:           mapInvoiceType(inv.type),
    payment_method: inv.paymentMethod ?? null,
  }, { onConflict: "boutique_id,id" });
  if (iErr) throw new Error(`[sw:invoices] ${iErr.message}`);

  if (inv.lines?.length) {
    await (supabase.from("invoice_lines") as any)
      .delete().eq("boutique_id", boutiqueId).eq("invoice_id", inv.id);
    const lineRows = inv.lines.map(l => ({
      boutique_id: boutiqueId,
      invoice_id:  inv.id,
      product_id:  l.productId > 0 ? l.productId : null,
      nom:         l.nom,
      qty:         l.qty,
      unit:        l.unit ?? null,
      prix_unit:   l.prixUnit,
      sell_unit:   l.sellUnit ?? null,
      sell_qty:    l.sellQty ?? null,
    }));
    const { error: lErr } = await (supabase.from("invoice_lines") as any).insert(lineRows);
    if (lErr) throw new Error(`[sw:invoice_lines] ${lErr.message}`);
  }
}

export async function swInvoiceUpdate(
  boutiqueId: string,
  invoiceId: string,
  updates: { status?: string; acompte?: number; montant?: number }
) {
  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = mapInvoiceStatus(updates.status);
  if (updates.acompte !== undefined) patch.acompte = updates.acompte;
  if (updates.montant !== undefined) patch.montant = updates.montant;
  const { error } = await (supabase.from("invoices") as any)
    .update(patch)
    .eq("boutique_id", boutiqueId)
    .eq("id", invoiceId);
  if (error) throw new Error(`[sw:invoices/update] ${error.message}`);
}

// ─── Charges ─────────────────────────────────────────────────────────────────

export async function swCharge(
  boutiqueId: string,
  c: { id: number; label: string; montant: number; dateRaw?: string; date?: string; categorie?: string; note?: string }
) {
  await sw("charges", {
    id:          c.id,
    boutique_id: boutiqueId,
    label:       c.label,
    montant:     c.montant,
    categorie:   c.categorie ?? null,
    charge_date: tryDate(c.dateRaw ?? c.date) ?? new Date().toISOString(),
    note:        c.note ?? null,
  }, "boutique_id,id");
}

export async function swDeleteCharge(boutiqueId: string, chargeId: number) {
  await del("charges", { boutique_id: boutiqueId, id: chargeId });
}

// ─── Caisse sessions ─────────────────────────────────────────────────────────

export async function swCaisseSession(
  boutiqueId: string,
  s: { id: number; openedAt?: string; fondDeCaisse?: number; closedAt?: string }
) {
  await sw("caisse_sessions", {
    id:             String(s.id),
    boutique_id:    boutiqueId,
    opened_at:      tryDate(s.openedAt) ?? new Date().toISOString(),
    closed_at:      tryDate(s.closedAt ?? null),
    fond_ouverture: s.fondDeCaisse ?? 0,
  }, "boutique_id,id");
}

// ─── Boutique info ────────────────────────────────────────────────────────────

export async function swBoutiqueInfo(
  id: string, nom: string, ville?: string, adresse?: string, tel?: string, email?: string
) {
  const { error } = await (supabase.from("boutiques") as any)
    .update({ nom, ville: ville ?? null, adresse: adresse ?? null, tel: tel ?? null, email: email ?? null })
    .eq("id", id);
  if (error) throw new Error(`[sw:boutiques] ${error.message}`);
}

// ─── Boutique assignments ─────────────────────────────────────────────────────

export async function swBoutiqueAssignment(
  boutiqueId: string,
  userId: string,
  role: string,
  droits: Record<string, boolean>
) {
  await sw("boutique_assignments", {
    boutique_id: boutiqueId,
    user_id:     userId,
    role:        mapRole(role),
    droits,
  }, "boutique_id,user_id");
}

export async function swRemoveBoutiqueAssignment(boutiqueId: string, userId: string) {
  await del("boutique_assignments", { boutique_id: boutiqueId, user_id: userId });
}

// ─── Platform users ────────────────────────────────────────────────────────────

export async function swUpsertPlatformUser(
  id: string,
  phone: string,
  nom: string,
  initials: string,
  color: string
) {
  await sw("platform_users", { id, phone, nom, initials, color, is_super_admin: false }, "id");
}
