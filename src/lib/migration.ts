/**
 * Migration one-shot : backup JSON local → tables Supabase v2
 */
import { supabase } from "./supabaseClient";
import { adminCreateUser } from "./api";
import kvBackup from "../imports/kv-backup-2026-08-02T12-55-46.json";

// ─── Types KV ─────────────────────────────────────────────────────────────────
type KvAssignment = { boutiqueId: string; role: string; droits?: Record<string, boolean> };
type KvUser = { id: string; phone: string; nom: string; initials: string; color: string; isSuperAdmin?: boolean; assignments?: KvAssignment[] };
type KvProduct  = { id: number; nom: string; unit?: string; categorie?: string; alertLow?: number };
type KvEntry    = { id: number; productId: number; qty: number; montantDu?: number; date?: string; fournisseur?: string };
type KvSupplier = { id: number; nom: string; ville?: string; tel?: string; email?: string; contact?: string; initials?: string; color?: string; lastDelivery?: string };
type KvClient   = { id: number; nom: string; type?: string; tel?: string; total?: number; last?: string; ville?: string; adresse?: string; email?: string; contact?: string };
type KvLine     = { productId: number; nom: string; qty: number; unit?: string; prixUnit: number; sellUnit?: string; sellQty?: number };
type KvInvoice  = { id: string; client?: string; clientTel?: string; lines?: KvLine[]; montant: number; acompte?: number; date?: string; dateRaw?: string; status: string; type?: string; paymentMethod?: string };
type KvCharge   = { id: number; label: string; montant: number; date?: string; dateRaw?: string; categorie?: string; note?: string };
type KvCaisse   = { id: number; openedAt?: string; fondDeCaisse?: number; closedAt?: string };
type KvAudit    = { action: string; detail?: string; icon?: string; timestamp?: number };
type KvCategory = { id: string; nom: string };
type KvBoutique = {
  id: string; nom: string; ville?: string; adresse?: string; tel?: string; email?: string;
  products?: KvProduct[]; entries?: KvEntry[]; suppliers?: KvSupplier[];
  clients?: KvClient[]; invoices?: KvInvoice[]; charges?: KvCharge[];
  categories?: KvCategory[]; auditLog?: KvAudit[]; caisseHistory?: KvCaisse[]; caisseSession?: KvCaisse;
};

export interface MigrationReport {
  success: boolean;
  boutiques: number;
  assignments: number;
  usersCreated: number;
  errors: string[];
  details: Record<string, Record<string, number>>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const cleanPhone = (s: string) => s.replace(/\D/g, "");

function mapRole(fr: string): "owner" | "manager" | "employee" {
  if (fr === "Propriétaire") return "owner";
  if (fr === "Manager" || fr === "Gérant") return "manager";
  return "employee";
}

function mapInvoiceType(t?: string): string {
  if (!t) return "vente";
  const low = t.toLowerCase();
  if (low === "retour") return "retour";
  if (low === "devis")  return "devis";
  if (low === "commande" || low.includes("commande")) return "commande";
  return "vente"; // B2B, B2C, Grossiste, Vente, etc.
}

function mapStatus(s: string): string {
  if (s === "payé" || s === "payée") return "payée";
  if (s === "annulé" || s === "annulée") return "annulée";
  if (s === "retour") return "retour";
  return "en_attente";
}

function tryDate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Upsert avec gestion composite PK
async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<{ ok: number; errors: string[] }> {
  if (!rows.length) return { ok: 0, errors: [] };
  let ok = 0; const errors: string[] = [];
  const SIZE = 50;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error, data } = await (supabase.from(table) as any)
      .upsert(batch, { onConflict, ignoreDuplicates: true })
      .select();
    if (error) errors.push(`[${table}] ${error.message}`);
    else ok += data?.length ?? 0;
  }
  return { ok, errors };
}

// Insert sans PK connu (audit_log, invoice_lines)
async function insertRows(
  table: string,
  rows: Record<string, unknown>[]
): Promise<{ ok: number; errors: string[] }> {
  if (!rows.length) return { ok: 0, errors: [] };
  let ok = 0; const errors: string[] = [];
  const SIZE = 50;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error, data } = await (supabase.from(table) as any).insert(batch).select();
    if (error) errors.push(`[${table}] ${error.message}`);
    else ok += data?.length ?? batch.length;
  }
  return { ok, errors };
}

// ─── MIGRATION ────────────────────────────────────────────────────────────────
export async function migrateKvToSupabase(onProgress?: (msg: string) => void): Promise<MigrationReport> {
  const report: MigrationReport = {
    success: true, boutiques: 0, assignments: 0, usersCreated: 0, errors: [], details: {},
  };
  const log = (msg: string) => { onProgress?.(msg); };

  const kvBoutiques = (kvBackup as any).boutiques as KvBoutique[];
  const kvUsers     = (kvBackup as any).platform_users as KvUser[];

  // ── 1. Charger les UUIDs existants dans Supabase ───────────────────────────
  log("Chargement des UUIDs Supabase…");
  const { data: supaUsers } = await supabase.from("platform_users").select("id, phone");
  const phoneToUuid: Record<string, string> = {};
  for (const u of (supaUsers ?? [])) phoneToUuid[cleanPhone(u.phone)] = u.id;
  log(`${Object.keys(phoneToUuid).length} UUID(s) chargés`);

  // ── 2. Signaler les comptes manquants (création manuelle requise) ──────────
  const usersToCreate = kvUsers.filter(u => !u.isSuperAdmin && !phoneToUuid[cleanPhone(u.phone)]);
  if (usersToCreate.length) {
    log(`⚠ ${usersToCreate.length} utilisateur(s) sans compte Supabase :`);
    for (const u of usersToCreate) log(`  - ${u.nom} (${u.phone})`);
    log("→ À créer dans Supabase Auth Dashboard ou via l'Edge Function");
  }

  // ── 3. Boutique_assignments ────────────────────────────────────────────────
  log("Migration des assignments…");
  for (const kvu of kvUsers) {
    const uuid = phoneToUuid[cleanPhone(kvu.phone)];
    if (!uuid) { log(`  ⚠ Pas d'UUID: ${kvu.phone}`); continue; }
    for (const a of (kvu.assignments ?? [])) {
      const { error } = await supabase.from("boutique_assignments").upsert({
        boutique_id: a.boutiqueId,
        user_id:     uuid,
        role:        mapRole(a.role),
        droits:      a.droits ?? {},
      }, { onConflict: "boutique_id,user_id", ignoreDuplicates: false });
      if (error) report.errors.push(`Assignment ${kvu.nom}→${a.boutiqueId}: ${error.message}`);
      else report.assignments++;
    }
  }
  log(`${report.assignments} assignment(s)`);

  // ── 4. Boutiques + données ─────────────────────────────────────────────────
  for (const b of kvBoutiques) {
    log(`\nBoutique: ${b.nom} (${b.id})`);
    const det: Record<string, number> = {};
    report.details[b.id] = det;

    // Créer la boutique si absente
    const { data: existing } = await supabase.from("boutiques").select("id").eq("id", b.id).maybeSingle();
    if (!existing) {
      const { error } = await supabase.rpc("create_boutique", {
        p_id: b.id, p_nom: b.nom,
        p_ville: b.ville ?? null, p_adresse: b.adresse ?? null,
        p_tel: b.tel ?? null, p_email: b.email ?? null,
      });
      if (error) { report.errors.push(`create_boutique ${b.id}: ${error.message}`); continue; }
    }
    report.boutiques++;

    // ── Construire la map categorie-nom → id ──────────────────────────────
    // On fusionne les catégories explicites + celles inférées depuis les produits
    const catNomToId: Record<string, string> = {};

    // Catégories explicites du KV
    for (const c of (b.categories ?? [])) catNomToId[c.nom] = c.id;

    // Catégories implicites (produits référencent un nom sans catégorie déclarée)
    const implicitNoms = new Set<string>();
    for (const p of (b.products ?? [])) {
      if (p.categorie && !catNomToId[p.categorie]) implicitNoms.add(p.categorie);
    }

    // Générer des IDs stables pour les catégories implicites
    for (const nom of implicitNoms) {
      catNomToId[nom] = "cat_" + nom.toLowerCase().replace(/[^a-z0-9]/g, "_");
    }

    // Insérer toutes les catégories (explicites + implicites) — DELETE+INSERT pour idempotence
    const allCats = Object.entries(catNomToId).map(([nom, id]) => ({
      id, boutique_id: b.id, nom,
    }));
    if (allCats.length) {
      await (supabase.from("categories") as any).delete().eq("boutique_id", b.id);
      const r = await insertRows("categories", allCats);
      det.categories = r.ok; report.errors.push(...r.errors);
      log(`  catégories: ${r.ok}/${allCats.length}`);
    }

    // ── Produits ──────────────────────────────────────────────────────────
    if (b.products?.length) {
      await (supabase.from("products") as any).delete().eq("boutique_id", b.id);
      const rows = b.products.map(p => ({
        id: p.id, boutique_id: b.id, nom: p.nom,
        unit:                p.unit ?? "unité",
        category_id:         p.categorie ? (catNomToId[p.categorie] ?? null) : null,
        low_stock_threshold: p.alertLow ?? null,
        prix_achat: 0, prix_vente: 0, stock: 0, actif: true,
      }));
      const r = await insertRows("products", rows);
      det.products = r.ok; report.errors.push(...r.errors);
      log(`  produits: ${r.ok}/${rows.length}`);
    }

    // ── Mouvements de stock ───────────────────────────────────────────────
    if (b.entries?.length) {
      await (supabase.from("stock_entries") as any).delete().eq("boutique_id", b.id);
      const rows = b.entries.map(e => ({
        id: e.id, boutique_id: b.id, product_id: e.productId,
        type:       e.qty >= 0 ? "achat" : "ajustement",
        qty:        Math.abs(e.qty),
        prix_unit:  (e.montantDu ?? 0) > 0 && Math.abs(e.qty) > 0
                    ? (e.montantDu! / Math.abs(e.qty)) : null,
        entry_date: tryDate(e.date) ?? new Date().toISOString(),
        note:       e.fournisseur ?? null,
      }));
      const r = await insertRows("stock_entries", rows);
      det.stock_entries = r.ok; report.errors.push(...r.errors);
      log(`  mouvements: ${r.ok}/${rows.length}`);
    }

    // ── Fournisseurs ──────────────────────────────────────────────────────
    if (b.suppliers?.length) {
      await (supabase.from("suppliers") as any).delete().eq("boutique_id", b.id);
      const rows = b.suppliers.map(s => ({
        id: s.id, boutique_id: b.id, nom: s.nom,
        ville: s.ville ?? null, tel: s.tel ?? null, email: s.email ?? null,
        contact: s.contact ?? null, initials: s.initials ?? null, color: s.color ?? null,
        last_delivery_at: tryDate(s.lastDelivery),
      }));
      const r = await insertRows("suppliers", rows);
      det.suppliers = r.ok; report.errors.push(...r.errors);
      log(`  fournisseurs: ${r.ok}/${rows.length}`);
    }

    // ── Clients ───────────────────────────────────────────────────────────
    const clientNomToId: Record<string, number> = {};
    if (b.clients?.length) {
      await (supabase.from("clients") as any).delete().eq("boutique_id", b.id);
      const rows = b.clients.map(c => {
        clientNomToId[c.nom] = c.id;
        return {
          id: c.id, boutique_id: b.id, nom: c.nom,
          type:    (c.type === "B2B" || c.type === "Grossiste") ? "B2B" : "B2C",
          tel: c.tel ?? null, email: c.email ?? null,
          adresse: c.adresse ?? null, ville: c.ville ?? null, contact: c.contact ?? null,
          total: c.total ?? 0,
          last_invoice_at: tryDate(c.last),
        };
      });
      const r = await insertRows("clients", rows);
      det.clients = r.ok; report.errors.push(...r.errors);
      log(`  clients: ${r.ok}/${rows.length}`);
    }

    // ── Factures ──────────────────────────────────────────────────────────
    if (b.invoices?.length) {
      // DELETE + INSERT to avoid type_check constraint issues with stale data
      await (supabase.from("invoices") as any).delete().eq("boutique_id", b.id);
      const invRows = b.invoices.map(inv => ({
        id:             inv.id,
        boutique_id:    b.id,
        client_id:      clientNomToId[inv.client ?? ""] ?? null,
        client_nom:     inv.client    ?? null,
        client_tel:     inv.clientTel ?? null,
        montant:        inv.montant,
        acompte:        inv.acompte   ?? 0,
        invoice_date:   tryDate(inv.dateRaw ?? inv.date) ?? new Date().toISOString(),
        status:         mapStatus(inv.status),
        type:           mapInvoiceType(inv.type),
        payment_method: inv.paymentMethod ?? null,
      }));
      const r = await insertRows("invoices", invRows);
      det.invoices = r.ok; report.errors.push(...r.errors);
      log(`  factures: ${r.ok}/${invRows.length}`);

      // Lignes (on vide d'abord pour éviter les doublons)
      const lineRows: Record<string, unknown>[] = [];
      for (const inv of b.invoices) {
        for (const l of (inv.lines ?? [])) {
          lineRows.push({
            boutique_id: b.id, invoice_id: inv.id,
            product_id:  l.productId > 0 ? l.productId : null,
            nom: l.nom, qty: l.qty, unit: l.unit ?? null,
            prix_unit: l.prixUnit,
            sell_unit: l.sellUnit ?? null, sell_qty: l.sellQty ?? null,
          });
        }
      }
      if (lineRows.length) {
        // Supprimer les lignes existantes pour ces factures pour éviter les doublons
        const invIds = b.invoices.map(i => i.id);
        await (supabase.from("invoice_lines") as any)
          .delete().eq("boutique_id", b.id).in("invoice_id", invIds);
        const r = await insertRows("invoice_lines", lineRows);
        det.invoice_lines = r.ok; report.errors.push(...r.errors);
        log(`  lignes: ${r.ok}/${lineRows.length}`);
      }
    }

    // ── Charges ───────────────────────────────────────────────────────────
    if (b.charges?.length) {
      await (supabase.from("charges") as any).delete().eq("boutique_id", b.id);
      const rows = b.charges.map(c => ({
        id: c.id, boutique_id: b.id, label: c.label, montant: c.montant,
        categorie:   c.categorie ?? null,
        charge_date: tryDate(c.dateRaw ?? c.date) ?? new Date().toISOString(),
        note: c.note ?? null,
      }));
      const r = await insertRows("charges", rows);
      det.charges = r.ok; report.errors.push(...r.errors);
      log(`  charges: ${r.ok}/${rows.length}`);
    }

    // ── Sessions de caisse ────────────────────────────────────────────────
    const sessions = [...(b.caisseHistory ?? [])];
    if (b.caisseSession) sessions.push(b.caisseSession);
    if (sessions.length) {
      await (supabase.from("caisse_sessions") as any).delete().eq("boutique_id", b.id);
      const rows = sessions.map(s => ({
        id: String(s.id), boutique_id: b.id,
        opened_at:      tryDate(s.openedAt) ?? new Date().toISOString(),
        closed_at:      tryDate(s.closedAt  ?? null),
        fond_ouverture: s.fondDeCaisse ?? 0,
      }));
      const r = await insertRows("caisse_sessions", rows);
      det.caisse_sessions = r.ok; report.errors.push(...r.errors);
      log(`  caisse: ${r.ok}/${rows.length}`);
    }

    // ── Journal d'audit ───────────────────────────────────────────────────
    if (b.auditLog?.length) {
      const rows = b.auditLog.map(a => ({
        boutique_id: b.id, action: a.action,
        detail: a.detail ?? null, icon: a.icon ?? null,
        created_at: a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString(),
      }));
      // Supprimer les anciens logs pour cette boutique avant de réinsérer
      await (supabase.from("audit_log") as any).delete().eq("boutique_id", b.id);
      const r = await insertRows("audit_log", rows);
      det.audit_log = r.ok; report.errors.push(...r.errors);
      log(`  audit: ${r.ok}/${rows.length}`);
    }

    log(`✓ ${b.nom}`);
  }

  report.success = report.errors.length === 0;
  log(report.success
    ? "\n✅ Migration réussie"
    : `\n⚠ Migration avec ${report.errors.length} erreur(s)`);
  return report;
}
