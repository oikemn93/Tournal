/**
 * Charge les données depuis les tables Supabase et reconstruit
 * les objets Boutique / PlatformUser attendus par l'app.
 */
import { supabase } from "./supabaseClient";

const cleanPhone = (s: string) => s.replace(/\D/g, "");

function reverseRole(r: string): string {
  if (r === "owner")   return "Propriétaire";
  if (r === "manager") return "Manager";
  return "Vendeur";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ─── PlatformUsers ────────────────────────────────────────────────────────────
export async function loadPlatformUsersFromSupabase(): Promise<any[]> {
  const [{ data: users }, { data: assignments }] = await Promise.all([
    supabase.from("platform_users").select("*"),
    supabase.from("boutique_assignments").select("*"),
  ]);

  if (!users?.length) return [];

  return users.map((u: any) => ({
    id:          u.id,
    phone:       u.phone,
    nom:         u.nom,
    initials:    u.initials,
    color:       u.color,
    isSuperAdmin: u.is_super_admin ?? false,
    assignments: (assignments ?? [])
      .filter((a: any) => a.user_id === u.id)
      .map((a: any) => ({
        boutiqueId: a.boutique_id,
        role:       reverseRole(a.role),
        droits:     a.droits ?? {},
      })),
  }));
}

// ─── Boutiques ────────────────────────────────────────────────────────────────
export async function loadBoutiquesFromSupabase(): Promise<any[]> {
  const { data: bRows } = await supabase.from("boutiques").select("*");
  if (!bRows?.length) return [];

  const ids = bRows.map((b: any) => b.id);

  // Fetch toutes les tables en parallèle
  const [
    { data: categories },
    { data: products },
    { data: entries },
    { data: suppliers },
    { data: clients },
    { data: invoices },
    { data: invoiceLines },
    { data: charges },
    { data: caisses },
    { data: auditLog },
  ] = await Promise.all([
    supabase.from("categories").select("*").in("boutique_id", ids),
    supabase.from("products").select("*").in("boutique_id", ids),
    supabase.from("stock_entries").select("*").in("boutique_id", ids),
    supabase.from("suppliers").select("*").in("boutique_id", ids),
    supabase.from("clients").select("*").in("boutique_id", ids),
    supabase.from("invoices").select("*").in("boutique_id", ids),
    supabase.from("invoice_lines").select("*").in("boutique_id", ids),
    supabase.from("charges").select("*").in("boutique_id", ids),
    supabase.from("caisse_sessions").select("*").in("boutique_id", ids),
    supabase.from("audit_log").select("*").in("boutique_id", ids),
  ]);

  return bRows.map((b: any) => {
    const bid = b.id;

    // Catégories pour cette boutique
    const bCats = (categories ?? []).filter((c: any) => c.boutique_id === bid);
    const catIdToNom: Record<string, string> = {};
    for (const c of bCats) catIdToNom[c.id] = c.nom;

    // Produits
    const bProducts = (products ?? [])
      .filter((p: any) => p.boutique_id === bid)
      .map((p: any) => ({
        id:        Number(p.id),
        nom:       p.nom,
        img:       "",
        unit:      p.unit ?? "unité",
        fournisseur: "",
        categorie: p.category_id ? (catIdToNom[p.category_id] ?? p.category_id) : undefined,
        alertLow:  p.low_stock_threshold ?? undefined,
        actif:     p.actif ?? true,
      }));

    // Mouvements de stock
    const bEntries = (entries ?? [])
      .filter((e: any) => e.boutique_id === bid)
      .map((e: any) => {
        const qty = e.type === "ajustement" ? -Math.abs(Number(e.qty)) : Math.abs(Number(e.qty));
        const montantDu = e.prix_unit != null ? Math.abs(Number(e.qty)) * Number(e.prix_unit) : 0;
        return {
          id:          Number(e.id),
          productId:   Number(e.product_id),
          qty,
          unit:        "",
          montantDu,
          date:        fmtDate(e.entry_date),
          fournisseur: e.note ?? "",
        };
      });

    // Fournisseurs
    const bSuppliers = (suppliers ?? [])
      .filter((s: any) => s.boutique_id === bid)
      .map((s: any) => ({
        id:           Number(s.id),
        nom:          s.nom,
        ville:        s.ville ?? "",
        tel:          s.tel ?? "",
        email:        s.email ?? "",
        contact:      s.contact ?? "",
        initials:     s.initials ?? s.nom.slice(0, 2).toUpperCase(),
        color:        s.color ?? "#6b7280",
        lastDelivery: fmtDate(s.last_delivery_at),
      }));

    // Clients
    const bClients = (clients ?? [])
      .filter((c: any) => c.boutique_id === bid)
      .map((c: any) => ({
        id:      Number(c.id),
        nom:     c.nom,
        type:    c.type ?? "B2C",
        tel:     c.tel ?? "",
        total:   Number(c.total ?? 0),
        last:    fmtDate(c.last_invoice_at),
        ville:   c.ville ?? "",
        adresse: c.adresse ?? undefined,
        email:   c.email ?? undefined,
        contact: c.contact ?? undefined,
      }));

    // Factures + lignes
    const bLines = (invoiceLines ?? []).filter((l: any) => l.boutique_id === bid);
    const bInvoices = (invoices ?? [])
      .filter((i: any) => i.boutique_id === bid)
      .map((i: any) => {
        const lines = bLines
          .filter((l: any) => l.invoice_id === i.id)
          .map((l: any) => ({
            productId: Number(l.product_id ?? 0),
            nom:       l.nom ?? "",
            qty:       Number(l.qty),
            unit:      l.unit ?? "",
            prixUnit:  Number(l.prix_unit),
            sellUnit:  l.sell_unit ?? undefined,
            sellQty:   l.sell_qty  ?? undefined,
          }));
        return {
          id:            i.id,
          client:        i.client_nom ?? "",
          clientTel:     i.client_tel ?? undefined,
          montant:       Number(i.montant),
          acompte:       Number(i.acompte ?? 0),
          date:          fmtDate(i.invoice_date),
          dateRaw:       i.invoice_date ?? undefined,
          status:        mapStatusToApp(i.status),
          type:          i.type ?? "vente",
          lines,
        };
      });

    // Charges
    const bCharges = (charges ?? [])
      .filter((c: any) => c.boutique_id === bid)
      .map((c: any) => ({
        id:         Number(c.id),
        label:      c.label,
        montant:    Number(c.montant),
        date:       fmtDate(c.charge_date),
        dateRaw:    c.charge_date ?? "",
        categorie:  c.categorie ?? "Autre",
        recurrence: "unique" as const,
        note:       c.note ?? undefined,
      }));

    // Sessions de caisse
    const bCaisses = (caisses ?? [])
      .filter((s: any) => s.boutique_id === bid)
      .map((s: any) => ({
        id:           Number(s.id),
        openedAt:     s.opened_at ?? "",
        openedBy:     "",
        fondDeCaisse: Number(s.fond_ouverture ?? 0),
        closedAt:     s.closed_at ?? undefined,
      }));
    const openSession = bCaisses.find((s: any) => !s.closedAt);
    const closedSessions = bCaisses.filter((s: any) => s.closedAt);

    // Journal
    const bAudit = (auditLog ?? [])
      .filter((a: any) => a.boutique_id === bid)
      .map((a: any) => ({
        id:        Number(a.id),
        userId:    a.user_id ?? "",
        userNom:   "",
        userColor: "#6b7280",
        action:    a.action,
        detail:    a.detail ?? "",
        icon:      a.icon ?? "📝",
        timestamp: new Date(a.created_at).getTime(),
        date:      fmtDate(a.created_at),
      }));

    // Catégories format app
    const bCategories = bCats.map((c: any) => ({
      id:             c.id,
      nom:            c.nom,
      unitVente:      "",
      nbPiecesParLot: 0,
      longueurParPiece: 0,
    }));

    // Initiales depuis le nom
    const initials = b.nom.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

    return {
      id:       b.id,
      nom:      b.nom,
      ville:    b.ville ?? "",
      color:    "#C9A227",
      initials,
      adresse:  b.adresse ?? undefined,
      email:    b.email   ?? undefined,
      tel:      b.tel     ?? undefined,
      logo_url: b.logo_url ?? undefined,
      categories: bCategories,
      products:   bProducts,
      entries:    bEntries,
      suppliers:  bSuppliers,
      clients:    bClients,
      invoices:   bInvoices,
      charges:    bCharges,
      auditLog:   bAudit,
      caisseSession: openSession,
      caisseHistory: closedSessions,
    };
  });
}

function mapStatusToApp(s: string): string {
  if (s === "payée")      return "payé";
  if (s === "annulée")    return "en attente";
  if (s === "retour")     return "retour";
  return "en attente";
}
