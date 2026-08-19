// ─── TYPES ────────────────────────────────────────────────────────────────────

export type Screen         = "login" | "superadmin" | "boutique-select" | "app";
export type Tab            = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "pos" | "charges" | "compta" | "admin" | "inventaire" | "transferts";
export type CartItem       = { productId: number; nom: string; img: string; unit: string; qty: number; prixUnit: number; sellUnit?: string; sellQty?: number };
export type InvoiceStatus  = "payé" | "acompte" | "en attente" | "en retard";
export type PaymentMethod  = "Espèces" | "Wave" | "Orange Money" | "Autre";
export type Permission     = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "remboursement" | "charges" | "compta" | "vente" | "inventaire" | "marges" | "encaissement_vente";
export type ChargeCategorie = "Loyer" | "Salaires" | "Électricité" | "Transport" | "Achat stock" | "Marketing" | "Taxes" | "Autre";
export type ClientType     = "B2C" | "B2B" | "Grossiste";
export type TransferStatus = "en_attente" | "accepté" | "refusé" | "annulé";
export type DashPeriod     = "jour" | "semaine" | "mois" | "annee" | "custom";

export type CaisseSession = { id: string | number; openedAt: string; openedBy: string; fondDeCaisse: number; closedAt?: string; closedBy?: string };

export type Charge = {
  id: number; label: string; montant: number; date: string; dateRaw: string;
  categorie: ChargeCategorie; recurrence: "unique" | "mensuelle" | "hebdomadaire";
  note?: string; fournisseur?: string;
  isB2BDebt?: boolean; acompte?: number;
  status?: "en_attente" | "partiel" | "payé" | "pending" | "partial" | "paid";
  paidAmount?: number;
  transferId?: string;
  source?: "manual" | "transfer" | "recurrence";
};

export type InvoiceLine = { productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };

export type InvoicePayment = {
  id: number;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  recordedAt?: string;
  operatorId?: string;
  operatorName: string;
  batchId: string;
  source: "invoice" | "client_fifo" | "legacy_backfill";
};

export type PaymentEntry = { method: PaymentMethod; amount: number };

export type AuditEntry = {
  id: number; userId: string; userNom: string; userColor: string;
  action: string; detail: string; icon: string; timestamp: number; date: string; source?: "native" | "legacy_kv";
};

export type BoutiqueAssignment = { boutiqueId: string; role: string; droits: Record<Permission, boolean> };

export type Groupe = { id: string; nom: string };

export type PlatformUser = {
  id: string; phone: string; password: string; nom: string;
  initials: string; color: string; isSuperAdmin: boolean;
  assignments: BoutiqueAssignment[];
  groupeId?: string; isCompteMere?: boolean; mustChangePassword?: boolean;
};

export type Product    = { id: number; nom: string; img: string; unit: string; fournisseur: string; categorie?: string; couleur?: string; prixVente?: number; prixAchat?: number; alertOk?: number; alertLow?: number };
export type StockEntry = { id: number; productId: number; qty: number; unit: string; montantDu: number; date: string; fournisseur: string; invoiceId?: string; nbLots?: number; nbPieces?: number; longueurPiece?: number; sku?: string; isTransfertInterne?: boolean };
export type Supplier   = { id: number; nom: string; ville: string; lastDelivery: string; tel: string; initials: string; color: string; email?: string; contact?: string };
export type Client     = { id: number; nom: string; type: ClientType; tel: string; total: number; last: string; ville: string; adresse?: string; email?: string; contact?: string };

export type Invoice    = {
  id: string; clientId?: number; client: string; clientTel?: string; clientType?: ClientType;
  lines?: InvoiceLine[]; payments?: InvoicePayment[];
  montant: number; acompte: number; date: string; dateRaw?: string;
  status: InvoiceStatus; type: string;
  operatorNom?: string; operatorColor?: string;
  paymentMethod?: PaymentMethod; paymentSplit?: PaymentEntry[];
};

export type ProductParam = { productId: number; nbPiecesParLot: number; longueurParPiece: number; unitVente: string };
export type Category   = { id: string; nom: string; unitVente: string; nbPiecesParLot: number; longueurParPiece: number };

export type TransferItem = { productId: number; nom: string; qty: number; unit: string; montantDu: number; img?: string; prixCession?: number; remise?: number; nbLots?: number; nbPieces?: number };
export type PendingTransfer = { id: string; fromBoutiqueId: string; fromBoutiqueNom: string; invoiceId: string; date: string; items: TransferItem[] };

export type Transfer = {
  id: string; direction: "outbound" | "inbound";
  fromBoutiqueId: string; fromBoutiqueNom: string; fromBoutiqueTel?: string;
  toBoutiqueId: string; toBoutiqueNom: string; toBoutiqueTel?: string;
  date: string; dateRaw: string;
  items: TransferItem[];
  status: TransferStatus;
  montantTotal: number;
  note?: string;
  invoiceId?: string;
};

export type BoutiquePartner = { id: string; phone: string; nom: string; boutiqueIds: string[]; addedAt: string };

export type InventaireLine = { productId: number; nom: string; unit: string; categorie?: string; theorique: number; compte?: number };
export type InventaireSession = {
  id: string; date: string; dateRaw: string; userId: string; userNom: string; userColor: string;
  statut: "en_cours" | "terminé"; perimetre: "tout" | string[];
  lines: InventaireLine[]; valeurEcart?: number; chiffreAffaires?: number; benefice?: number;
};

export type Boutique = {
  id: string; nom: string; ville: string; color: string; initials: string; logo?: string; adresse?: string; email?: string; tel?: string;
  products: Product[]; entries: StockEntry[]; suppliers: Supplier[];
  clients: Client[]; invoices: Invoice[]; auditLog: AuditEntry[]; charges: Charge[];
  productParams?: ProductParam[];
  categories?: Category[];
  pendingTransfers?: PendingTransfer[];
  transfers?: Transfer[];
  inventaires?: InventaireSession[];
  partners?: BoutiquePartner[];
  printerName?: string; autoPrint?: boolean; autoPrintBon?: boolean; autoPrintTicket?: boolean; printerBon?: string; printerTicket?: string;
  caisseSession?: CaisseSession; caisseHistory?: CaisseSession[];
};

export type StoredSession = { userId: string; boutiqueId: string | null; assignJson: string | null; loginAt?: number };
