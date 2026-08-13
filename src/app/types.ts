// ─── TYPES ────────────────────────────────────────────────────────────────────

export type Screen     = "login" | "superadmin" | "boutique-select" | "app";
export type Tab        = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "pos" | "charges" | "compta" | "admin";
export type CartItem   = { productId: number; nom: string; img: string; unit: string; qty: number; prixUnit: number; sellUnit?: string; sellQty?: number };
export type InvoiceStatus = "payé" | "acompte" | "en attente" | "en retard";
export type PaymentMethod = "Espèces" | "Wave" | "Orange Money" | "Autre";
export type Permission = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "remboursement" | "charges" | "compta" | "vente";
export type ChargeCategorie = "Loyer" | "Salaires" | "Électricité" | "Transport" | "Achat stock" | "Marketing" | "Taxes" | "Autre";
export type CaisseSession = { id: number; openedAt: string; openedBy: string; fondDeCaisse: number; closedAt?: string; closedBy?: string };
export type Charge = { id: number; label: string; montant: number; date: string; dateRaw: string; categorie: ChargeCategorie; recurrence: "unique" | "mensuelle" | "hebdomadaire"; note?: string; fournisseur?: string };
export type ClientType = "B2C" | "B2B" | "Grossiste";

export type InvoiceLine = { productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number };

export type AuditEntry = {
  id: number; userId: string; userNom: string; userColor: string;
  action: string; detail: string; icon: string; timestamp: number; date: string;
};
export type BoutiqueAssignment = { boutiqueId: string; role: string; droits: Record<Permission, boolean> };
export type PlatformUser = {
  id: string; phone: string; password: string; nom: string;
  initials: string; color: string; isSuperAdmin: boolean;
  assignments: BoutiqueAssignment[];
};
export type Product    = { id: number; nom: string; img: string; unit: string; fournisseur: string; categorie?: string; couleur?: string };
export type StockEntry = { id: number; productId: number; qty: number; unit: string; montantDu: number; date: string; fournisseur: string; invoiceId?: string; nbLots?: number; nbPieces?: number; longueurPiece?: number; sku?: string };
export type Supplier   = { id: number; nom: string; ville: string; lastDelivery: string; tel: string; initials: string; color: string };
export type Client     = { id: number; nom: string; type: ClientType; tel: string; total: number; last: string; ville: string; adresse?: string; email?: string; contact?: string };
export type Invoice    = { id: string; client: string; clientTel?: string; lines?: InvoiceLine[]; montant: number; acompte: number; date: string; dateRaw?: string; status: InvoiceStatus; type: string; operatorNom?: string; operatorColor?: string; paymentMethod?: PaymentMethod };
export type ProductParam = { productId: number; nbPiecesParLot: number; longueurParPiece: number; unitVente: string };
export type Category   = { id: string; nom: string; unitVente: string; nbPiecesParLot: number; longueurParPiece: number };
export type Boutique   = {
  id: string; nom: string; ville: string; color: string; initials: string; logo?: string; adresse?: string; email?: string; tel?: string;
  products: Product[]; entries: StockEntry[]; suppliers: Supplier[];
  clients: Client[]; invoices: Invoice[]; auditLog: AuditEntry[]; charges: Charge[];
  productParams?: ProductParam[];
  categories?: Category[];
  printerName?: string; autoPrint?: boolean; autoPrintBon?: boolean; autoPrintTicket?: boolean; printerBon?: string; printerTicket?: string;
  caisseSession?: CaisseSession; caisseHistory?: CaisseSession[];
};

export type StoredSession = { userId: string; boutiqueId: string | null; assignJson: string | null; loginAt?: number };
export type DashPeriod  = "jour" | "semaine" | "mois" | "annee" | "custom";
