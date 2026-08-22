import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { checkBackend, signQZ, sendInvoiceEmail, storePDFForSMS, getCurrentAuthUser, hasAuthenticatedSession, validateServerSession, refreshSessionIfNeeded, getAuthBootstrap, signInWithPhone, changeOwnPassword, getPinStatus, setQuickPin, verifyQuickPin, startAppSession, validateAppSession, lockAppSession, setAppSessionRecoveryHandler, signOut as signOutFromSupabase, createBoutique, createUser, resetUserPassword, subscribeToBoutiqueChanges, subscribeToBoutiqueSync, isBoutiqueSyncV2Enabled, assignUserToBoutique, unassignUserFromBoutique, upsertAssignmentDirect, deleteAssignmentDirect, recordAuditLog, loadBoutiqueSnapshot, loadBoutiqueSyncPatch, loadPlatformUsers, loadGroupes, saveGroupes, loadAuthSettings as loadStoredAuthSettings, saveAuthSettings, type BoutiqueSyncEvent, type BoutiqueSyncPatch, type LegacyBoutiqueChange } from "../lib/api";
import { getNotifications, markNotificationRead, markAllNotificationsRead, dismissAllNotifications, subscribeToNotifications, getPushState, enableWebPush, disableWebPush, syncWebPushBoutique, type PushState } from "../lib/notifications";
import { toast, Toaster } from "sonner";
import {
  LayoutDashboard, Package, Users, Truck, FileText, ShieldCheck,
  Plus, Search, Bell, ChevronRight, TrendingUp, BarChart2,
  ArrowUpRight, Phone, MapPin, CreditCard, Boxes, X, Camera,
  Edit2, History, ArrowLeft, Delete, LogOut, UserPlus, Store,
  CheckCircle, Eye, EyeOff, MessageCircle, Send, Building2,
  Lock, Smartphone, Shield, MessageSquare, Activity, Trash2,
  ClipboardList, RefreshCw, Tag, Palette, Receipt, ShoppingCart, ShoppingBag, Minus, RotateCcw, AlertCircle,
  Wallet, TrendingDown, PieChart as PieChartIcon, BookOpen, Download, Filter, Calendar, Mail,
  Printer, Settings, Check, ChevronLeft, ClipboardCheck,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from "recharts";
import { StockView as RelationalStockView } from "./screens/StockView";
import { FacturesView as RelationalFacturesView } from "./screens/FacturesView";
import { POSView as RelationalPOSView } from "./screens/POSView";
import { ClientsView as RelationalClientsView } from "./screens/ClientsView";
import { FournisseursView as RelationalFournisseursView } from "./screens/FournisseursView";
import { ChargesView as RelationalChargesView } from "./screens/ChargesView";
import { ComptabiliteView as RelationalComptabiliteView } from "./screens/RapportView";
import { TransfersView as RelationalTransfersView } from "./screens/TransfersView";
import { SuperAdminUserActions } from "./components/SuperAdminUserActions";
import { NotificationCenter } from "./components/NotificationCenter";
import { filterPaymentEventsByPeriod, invoicePaymentEvents, invoiceRemainingAmount } from "./utils/payments";

const ReadOnlyCtx = React.createContext(false);
const useReadOnly = () => React.useContext(ReadOnlyCtx);
// Notification context — consumed by child views to fire notifications
const NotifCtx = React.createContext<(n: Omit<Notif,"id"|"read"|"dateRaw">) => void>(() => {});
const useNotif = () => React.useContext(NotifCtx);

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Screen     = "login" | "password-change" | "pin-setup" | "superadmin" | "boutique-select" | "app";
type Tab        = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "pos" | "charges" | "compta" | "admin" | "inventaire" | "transferts";
type Notif      = { id: number; icon: string; title: string; body: string; dateRaw: string; read: boolean; tab?: Tab; filter?: Record<string,string>; serverId?: number };
type TransferStatus = "en_attente" | "accepté" | "refusé" | "annulé";
type Transfer = {
  id: string; direction: "outbound"|"inbound";
  fromBoutiqueId: string; fromBoutiqueNom: string; fromBoutiqueTel?: string;
  toBoutiqueId: string; toBoutiqueNom: string; toBoutiqueTel?: string;
  date: string; dateRaw: string;
  items: TransferItem[];
  status: TransferStatus;
  montantTotal: number;
  note?: string;
  invoiceId?: string;
};
type BoutiquePartner = { id: string; phone: string; nom: string; boutiqueIds: string[]; addedAt: string };

function RelationalMigrationNotice({ title }: { title: string }) {
  return <div className="min-h-[55vh] flex items-center justify-center px-4">
    <div className="max-w-md text-center rounded-3xl border border-amber-200 bg-amber-50 p-7 space-y-3">
      <Lock size={30} className="mx-auto text-amber-700" />
      <h2 className="text-xl font-black">{title} en migration</h2>
      <p className="text-sm text-amber-900">Cet écran est temporairement en lecture protégée : ses opérations ne seront réactivées qu’avec une sauvegarde transactionnelle dans Supabase.</p>
    </div>
  </div>;
}
type CartItem   = { productId: number; nom: string; img: string; unit: string; qty: number; prixUnit: number; sellUnit?: string; sellQty?: number };
type InvoiceStatus = "payé" | "acompte" | "en attente" | "en retard";
type PaymentMethod = "Espèces" | "Wave" | "Orange Money" | "Autre";
type Permission = "dashboard" | "stock" | "fournisseurs" | "clients" | "factures" | "remboursement" | "charges" | "compta" | "vente" | "encaissement_vente" | "inventaire" | "marges";
type InventaireLine = { productId: number; nom: string; unit: string; categorie?: string; theorique: number; compte?: number };
type InventaireSession = { id: string; date: string; dateRaw: string; userId: string; userNom: string; userColor: string; statut: "en_cours" | "terminé"; perimetre: "tout" | string[]; lines: InventaireLine[]; valeurEcart?: number; chiffreAffaires?: number; benefice?: number };
type ChargeCategorie = "Loyer" | "Salaires" | "Électricité" | "Transport" | "Achat stock" | "Marketing" | "Taxes" | "Autre";
type CaisseSession = { id: number; openedAt: string; openedBy: string; fondDeCaisse: number; closedAt?: string; closedBy?: string };
type Charge = { id: number; label: string; montant: number; date: string; dateRaw: string; categorie: ChargeCategorie; recurrence: "unique" | "mensuelle" | "hebdomadaire"; note?: string; fournisseur?: string; isB2BDebt?: boolean; acompte?: number; status?: "en_attente" | "partiel" | "payé" };
type ClientType = "B2C" | "B2B" | "Grossiste";

type InvoiceLine = { productId: number; nom: string; qty: number; unit: string; prixUnit: number; sellUnit?: string; sellQty?: number; prixAchat?: number };

type AuditEntry = {
  id: number; userId: string; userNom: string; userColor: string;
  action: string; detail: string; icon: string; timestamp: number; date: string; source?: "native";
};
type BoutiqueAssignment = { boutiqueId: string; role: string; droits: Record<Permission, boolean> };
type Groupe = { id: string; nom: string };
type PlatformUser = {
  id: string; phone: string; password: string; nom: string;
  initials: string; color: string; isSuperAdmin: boolean;
  assignments: BoutiqueAssignment[];
  groupeId?: string; isCompteMere?: boolean; mustChangePassword?: boolean;
  isSuspended?: boolean; suspensionReason?: string; suspendedAt?: string;
};
type Product    = { id: number; nom: string; img: string; unit: string; fournisseur: string; categorie?: string; couleur?: string; alertOk?: number; alertLow?: number };
type StockEntry = { id: number; productId: number; qty: number; unit: string; montantDu: number; date: string; fournisseur: string; movementType?: "achat"|"ajustement"|"retour"|"inventaire"|string; invoiceId?: string; nbLots?: number; nbPieces?: number; longueurPiece?: number; sku?: string; isTransfertInterne?: boolean };
type Supplier   = { id: number; nom: string; ville: string; lastDelivery: string; tel: string; initials: string; color: string; email?: string; contact?: string };
type Client     = { id: number; nom: string; type: ClientType; tel: string; total: number; last: string; ville: string; adresse?: string; email?: string; contact?: string };
type PaymentEntry = { method: PaymentMethod; amount: number };
type InvoicePayment = { id:number; amount:number; paymentMethod:PaymentMethod; paidAt:string; recordedAt?:string; operatorId?:string; operatorName:string; batchId:string; source:"invoice"|"client_fifo"|"legacy_backfill" };
type Invoice    = { id: string; clientId?:number; client: string; clientTel?: string; clientType?:ClientType; lines?: InvoiceLine[]; payments?:InvoicePayment[]; montant: number; acompte: number; date: string; dateRaw?: string; status: InvoiceStatus; type: string; operatorNom?: string; operatorColor?: string; paymentMethod?: PaymentMethod; paymentSplit?: PaymentEntry[] };
type ProductParam = { productId: number; nbPiecesParLot: number; longueurParPiece: number; unitVente: string };
type Category   = { id: string; nom: string; unitVente: string; nbPiecesParLot: number; longueurParPiece: number };
type TransferItem = { productId: number; nom: string; qty: number; unit: string; montantDu: number; img?: string; prixCession?: number; remise?: number; nbLots?: number; nbPieces?: number };
type PendingTransfer = { id: string; fromBoutiqueId: string; fromBoutiqueNom: string; invoiceId: string; date: string; items: TransferItem[] };
type Boutique   = {
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

// ─── SESSION STORAGE ─────────────────────────────────────────────────────────

const SESSION_KEY = "tournal_session";
const APP_LOCK_KEY = "tournal_app_locked";
type StoredSession = { userId: string; boutiqueId: string | null; assignJson: string | null; loginAt?: number };
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 60 min idle session default
function saveSession(userId: string, boutiqueId: string | null, assign: BoutiqueAssignment | null) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, boutiqueId, assignJson: assign ? JSON.stringify(assign) : null, loginAt: Date.now() })); } catch {}
}
function loadSession(): StoredSession | null {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (!s) return null;
    return JSON.parse(s) as StoredSession;
  } catch { return null; }
}
function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(APP_LOCK_KEY); } catch {} }

// ─── TECHNICAL LOGGING ───────────────────────────────────────────────────────
type TechLogCat   = "sync"|"email"|"pdf"|"qz"|"session"|"backend";
type TechLogLevel = "error"|"warn"|"info";
type TechLog = { id:string; ts:number; level:TechLogLevel; cat:TechLogCat; msg:string; detail?:string; };
async function logTech(boutiqueId: string, entry: Omit<TechLog,"id"|"ts">) {
  // Browser diagnostics must not become a hidden second persistence system.
  // Durable user-visible activity is written to public.audit_log instead.
  console[entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "info"](
    `[${boutiqueId}] ${entry.cat}: ${entry.msg}`,
    entry.detail,
  );
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MONTHLY = [
  { m: "Jan", v: 420 }, { m: "Fév", v: 380 }, { m: "Mar", v: 510 },
  { m: "Avr", v: 470 }, { m: "Mai", v: 620 }, { m: "Jun", v: 580 }, { m: "Jul", v: 710 },
];
// ─── SEMANTIC COLOR TOKENS ────────────────────────────────────────────────────
// Single source of truth. Use ONLY for conveying state, never for decoration.
const SEM = {
  success: { bg:"#f0fdf4", text:"#166534", accent:"#16a34a" }, // payé / actif / validé
  danger:  { bg:"#fef2f2", text:"#991b1b", accent:"#dc2626" }, // impayé / erreur / retard
  warning: { bg:"#fffbeb", text:"#92400e", accent:"#d97706" }, // acompte / attente / stock bas
  neutral: { bg:"#f3f4f6", text:"#374151", accent:"#6b7280" }, // inactif / brouillon
  role:    { bg:"#eff6ff", text:"#1d4ed8", accent:"#2563eb" }, // badges rôle/permission (pas état)
} as const;

const CHARGE_CATS: ChargeCategorie[] = ["Loyer","Salaires","Électricité","Transport","Achat stock","Marketing","Taxes","Autre"];
const CHARGE_COLORS: Record<ChargeCategorie, string> = {
  "Loyer":"#6366f1","Salaires":"#ec4899","Électricité":"#f59e0b","Transport":"#3b82f6",
  "Achat stock":"#8b5cf6","Marketing":"#10b981","Taxes":"#ef4444","Autre":"#9ca3af"
};
const INIT_CHARGES: Charge[] = [
  { id:1, label:"Loyer boutique",      montant:180000, date:"1 Jul",  dateRaw:"2026-07-01", categorie:"Loyer",      recurrence:"mensuelle"  },
  { id:2, label:"Salaire vendeur",     montant:120000, date:"5 Jul",  dateRaw:"2026-07-05", categorie:"Salaires",   recurrence:"mensuelle"  },
  { id:3, label:"Électricité",         montant:35000,  date:"10 Jul", dateRaw:"2026-07-10", categorie:"Électricité",recurrence:"mensuelle"  },
  { id:4, label:"Transport livraison", montant:25000,  date:"15 Jul", dateRaw:"2026-07-15", categorie:"Transport",  recurrence:"unique"     },
  { id:5, label:"Publicité réseaux",   montant:50000,  date:"12 Jul", dateRaw:"2026-07-12", categorie:"Marketing",  recurrence:"mensuelle"  },
  { id:6, label:"Taxes municipales",   montant:40000,  date:"3 Jul",  dateRaw:"2026-07-03", categorie:"Taxes",      recurrence:"mensuelle"  },
];
const PLACEHOLDER_IMGS = ["photo-1558769132-cb1aea458c5e","photo-1567401893414-76b7b1e5a7a5","photo-1606041008023-472dfb5e530f","photo-1547481887-a26e2cacb5b2"];
const SUP_COLORS  = ["#C9A227","#1E9B1E","#3b82f6","#a855f7","#f97316","#ec4899","#14b8a6","#ef4444"];
const USER_COLORS = ["#C9A227","#3b82f6","#1E9B1E","#a855f7","#f97316","#ec4899","#14b8a6","#ef4444"];
const ROLES       = ["Gérant","Vendeur","Vendeuse","Caissier","Livreur","Autre"];
const ROLE_PRESETS: Record<string, Record<Permission,boolean>> = {
  "Gérant":   { dashboard:true,  stock:true,  fournisseurs:true,  clients:true,  factures:true,  remboursement:true,  charges:true,  compta:true,  vente:true,  inventaire:true,  marges:true,  encaissement_vente:true  },
  "Vendeur":  { dashboard:true,  stock:true,  fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:true,  inventaire:false, marges:false, encaissement_vente:false },
  "Vendeuse": { dashboard:true,  stock:true,  fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:true,  inventaire:false, marges:false, encaissement_vente:false },
  "Caissier": { dashboard:true,  stock:false, fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:true,  inventaire:false, marges:false, encaissement_vente:true  },
  "Livreur":  { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:true,  remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false },
  "Autre":    { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:false, remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false },
};
const COULEURS    = ["","#C9A227","#3b82f6","#1E9B1E","#ef4444","#a855f7","#f97316","#ec4899","#6b7280","#ffffff","#000000","#8B4513"];
const CATEGORIES_DEF = ["Wax","Bazin","Soie","Dentelle","Velours","Coton","Lin","Satin","Kente","Bogolan","Autre"];
const NOW = Date.now();

// ─── SEED DATA ────────────────────────────────────────────────────────────────

const B1_AUDIT: AuditEntry[] = [
  { id: 1, userId: "u1", userNom: "Moussa Konaté",  userColor: "#C9A227", action: "Entrée stock",     detail: "Wax Ankara · +25 yards · 112 500 F", icon: "📦", timestamp: NOW - 7200000,   date: "Aujourd'hui 10:30" },
  { id: 2, userId: "u3", userNom: "Kadiatou Diallo", userColor: "#1E9B1E", action: "Nouvelle facture", detail: "F-047 · Boutique Élégance · 350 000 F", icon: "🧾", timestamp: NOW - 10800000, date: "Aujourd'hui 09:15" },
  { id: 3, userId: "u2", userNom: "Ibrahima Bah",    userColor: "#3b82f6", action: "Nouveau client",   detail: "Mode Africaine SAS (B2B) · Abidjan",   icon: "👥", timestamp: NOW - 86400000,  date: "Hier 16:42" },
];

const INIT_BOUTIQUES: Boutique[] = [
  {
    id: "b1", nom: "Konaté Textiles", ville: "Dakar", color: "#C9A227", initials: "KT",
    auditLog: B1_AUDIT,
    products: [
      { id: 1, nom: "Wax Ankara",       img: "photo-1558769132-cb1aea458c5e",    unit: "yards",  fournisseur: "Ali Textiles",     categorie: "Wax",      couleur: "#C9A227" },
      { id: 2, nom: "Soie Brodée",      img: "photo-1567401893414-76b7b1e5a7a5", unit: "yards",  fournisseur: "Maison Diallo",    categorie: "Soie",     couleur: "#ec4899" },
      { id: 3, nom: "Bazin Riche",      img: "photo-1606041008023-472dfb5e530f", unit: "yards",  fournisseur: "Ali Textiles",     categorie: "Bazin",    couleur: "#3b82f6" },
      { id: 4, nom: "Bazin Brodé Or",   img: "photo-1617118124507-4b5d71ee7be2", unit: "mètres", fournisseur: "Sow & Frères",     categorie: "Bazin",    couleur: "#C9A227" },
      { id: 5, nom: "Velours Rouge",    img: "photo-1519751138087-5bf79df62d5b", unit: "yards",  fournisseur: "Maison Diallo",    categorie: "Velours",  couleur: "#ef4444" },
      { id: 6, nom: "Coton Imprimé",    img: "photo-1547481887-a26e2cacb5b2",    unit: "yards",  fournisseur: "Coulibaly Tissus", categorie: "Coton",    couleur: "#1E9B1E" },
      { id: 7, nom: "Lin Naturel",      img: "photo-1558618666-fcd25c85cd64",    unit: "mètres", fournisseur: "Sow & Frères",     categorie: "Lin",      couleur: "#a78028" },
      { id: 8, nom: "Satin Doré",       img: "photo-1536992266094-82847e1fd431", unit: "yards",  fournisseur: "Coulibaly Tissus", categorie: "Satin",    couleur: "#C9A227" },
    ],
    entries: [
      { id: 1,  productId: 1, qty: 25, unit: "yards",  montantDu: 112500, date: "15 Jul", fournisseur: "Ali Textiles"     },
      { id: 2,  productId: 1, qty: 20, unit: "yards",  montantDu: 96000,  date: "10 Jun", fournisseur: "Ali Textiles"     },
      { id: 3,  productId: 2, qty: 23, unit: "yards",  montantDu: 188600, date: "10 Jul", fournisseur: "Maison Diallo"    },
      { id: 4,  productId: 3, qty: 40, unit: "yards",  montantDu: 272000, date: "18 Jul", fournisseur: "Ali Textiles"     },
      { id: 5,  productId: 3, qty: 27, unit: "yards",  montantDu: 178200, date: "5 Jun",  fournisseur: "Ali Textiles"     },
      { id: 6,  productId: 4, qty: 8,  unit: "mètres", montantDu: 25600,  date: "8 Jul",  fournisseur: "Sow & Frères"     },
      { id: 7,  productId: 5, qty: 4,  unit: "yards",  montantDu: 30000,  date: "10 Jul", fournisseur: "Maison Diallo"    },
      { id: 8,  productId: 6, qty: 60, unit: "yards",  montantDu: 168000, date: "18 Jul", fournisseur: "Coulibaly Tissus" },
      { id: 9,  productId: 6, qty: 42, unit: "yards",  montantDu: 117600, date: "1 Jun",  fournisseur: "Coulibaly Tissus" },
      { id: 10, productId: 7, qty: 34, unit: "mètres", montantDu: 132600, date: "8 Jul",  fournisseur: "Sow & Frères"     },
      { id: 11, productId: 8, qty: 2,  unit: "yards",  montantDu: 18200,  date: "18 Jul", fournisseur: "Coulibaly Tissus" },
    ],
    suppliers: [
      { id: 1, nom: "Ali Textiles",     ville: "Dakar",   lastDelivery: "15 Jul", tel: "+221 77 234 5678", initials: "AT", color: "#f97316" },
      { id: 2, nom: "Maison Diallo",    ville: "Abidjan", lastDelivery: "10 Jul", tel: "+225 07 123 4567", initials: "MD", color: "#3b82f6" },
      { id: 3, nom: "Sow & Frères",     ville: "Dakar",   lastDelivery: "8 Jul",  tel: "+221 76 345 6789", initials: "SF", color:SEM.success.accent },
      { id: 4, nom: "Coulibaly Tissus", ville: "Bamako",  lastDelivery: "18 Jul", tel: "+223 66 456 7890", initials: "CT", color: "#a855f7" },
      { id: 5, nom: "Traoré & Co",      ville: "Conakry", lastDelivery: "2 Jun",  tel: "+224 64 567 8901", initials: "TC", color: "#6b7280" },
    ],
    clients: [
      { id: 1, nom: "Aminata Koné",           type: "B2C",      tel: "+221 77 111 2222", total: 87500,   last: "20 Jul", ville: "Dakar"   },
      { id: 2, nom: "Boutique Élégance SARL", type: "B2B",      tel: "+221 33 456 7890", total: 1450000, last: "19 Jul", ville: "Dakar"   },
      { id: 3, nom: "Fatoumata Diallo",        type: "B2C",      tel: "+221 78 222 3333", total: 54000,   last: "17 Jul", ville: "Thiès"   },
      { id: 4, nom: "Mode Africaine SAS",      type: "B2B",      tel: "+225 27 890 1234", total: 2100000, last: "18 Jul", ville: "Abidjan" },
      { id: 5, nom: "Mariam Traoré",           type: "B2C",      tel: "+224 64 333 4444", total: 42000,   last: "15 Jul", ville: "Conakry" },
      { id: 6, nom: "Tissus du Monde SARL",    type: "Grossiste",tel: "+223 20 234 5678", total: 890000,  last: "12 Jul", ville: "Bamako"  },
      { id: 7, nom: "Coulibaly Distribution",  type: "Grossiste",tel: "+221 77 555 6666", total: 3200000, last: "10 Jul", ville: "Dakar"   },
    ],
    invoices: [
      { id: "F-047", client: "Boutique Élégance",  clientTel: "+221 33 456 7890", lines: [{productId:1,nom:"Wax Ankara",qty:5,unit:"yards",prixUnit:8000},{productId:3,nom:"Bazin Riche",qty:10,unit:"yards",prixUnit:27500}], montant: 315000, acompte: 157500, date: "20 Jul", status: "acompte",    type: "B2B"      },
      { id: "F-046", client: "Aminata Koné",         clientTel: "+221 77 111 2222", lines: [{productId:2,nom:"Soie Brodée",qty:2,unit:"yards",prixUnit:22500}],                                                               montant: 45000,  acompte: 45000,  date: "20 Jul", status: "payé",       type: "B2C"      },
      { id: "F-045", client: "Mode Africaine SAS",   clientTel: "+225 27 890 1234", lines: [{productId:6,nom:"Coton Imprimé",qty:40,unit:"yards",prixUnit:4500},{productId:8,nom:"Satin Doré",qty:8,unit:"yards",prixUnit:35000}], montant: 460000, acompte: 230000, date: "18 Jul", status: "acompte",    type: "B2B"      },
      { id: "F-044", client: "Fatoumata Diallo",      clientTel: "+221 78 222 3333", lines: [{productId:5,nom:"Velours Rouge",qty:2,unit:"yards",prixUnit:14000}],                                                             montant: 28000,  acompte: 0,      date: "17 Jul", status: "en attente", type: "B2C"      },
      { id: "F-043", client: "Tissus du Monde",       clientTel: "+223 20 234 5678", lines: [{productId:1,nom:"Wax Ankara",qty:50,unit:"yards",prixUnit:8000},{productId:6,nom:"Coton Imprimé",qty:50,unit:"yards",prixUnit:4500}], montant: 625000, acompte: 625000, date: "12 Jul", status: "payé",       type: "Grossiste" },
      { id: "F-042", client: "Mariam Traoré",         clientTel: "+224 64 333 4444", lines: [{productId:7,nom:"Lin Naturel",qty:5,unit:"mètres",prixUnit:7000}],                                                              montant: 35000,  acompte: 0,      date: "5 Jul",  status: "en retard",  type: "B2C"      },
    ],
    charges: INIT_CHARGES,
  },
  {
    id: "b2", nom: "Élégance Tissus", ville: "Abidjan", color: "#3b82f6", initials: "ÉT",
    auditLog: [],
    products: [
      { id: 1, nom: "Kente Ghana",     img: "photo-1558769132-cb1aea458c5e",    unit: "yards",  fournisseur: "Ghana Fabrics",    categorie: "Kente",  couleur: "#C9A227" },
      { id: 2, nom: "Bogolan Mali",    img: "photo-1547481887-a26e2cacb5b2",    unit: "mètres", fournisseur: "Diakité Textiles", categorie: "Bogolan",couleur: "#8B4513" },
      { id: 3, nom: "Taffetas Or",     img: "photo-1519751138087-5bf79df62d5b", unit: "yards",  fournisseur: "Ghana Fabrics",    categorie: "Satin",  couleur: "#C9A227" },
      { id: 4, nom: "Mousseline Rose", img: "photo-1606041008023-472dfb5e530f", unit: "mètres", fournisseur: "Diakité Textiles", categorie: "Soie",   couleur: "#ec4899" },
    ],
    entries: [
      { id: 1, productId: 1, qty: 30, unit: "yards",  montantDu: 135000, date: "14 Jul", fournisseur: "Ghana Fabrics"    },
      { id: 2, productId: 2, qty: 20, unit: "mètres", montantDu: 80000,  date: "12 Jul", fournisseur: "Diakité Textiles" },
      { id: 3, productId: 3, qty: 12, unit: "yards",  montantDu: 54000,  date: "14 Jul", fournisseur: "Ghana Fabrics"    },
      { id: 4, productId: 4, qty: 6,  unit: "mètres", montantDu: 18000,  date: "12 Jul", fournisseur: "Diakité Textiles" },
    ],
    suppliers: [
      { id: 1, nom: "Ghana Fabrics",    ville: "Accra",  lastDelivery: "14 Jul", tel: "+233 24 111 2222", initials: "GF", color: "#f97316" },
      { id: 2, nom: "Diakité Textiles", ville: "Bamako", lastDelivery: "12 Jul", tel: "+223 66 333 4444", initials: "DT", color: "#3b82f6" },
    ],
    clients: [
      { id: 1, nom: "Ama Asante",           type: "B2C",       tel: "+233 24 555 6666", total: 65000,  last: "18 Jul", ville: "Accra"   },
      { id: 2, nom: "Couture Prestige SAS", type: "B2B",       tel: "+225 27 777 8888", total: 780000, last: "19 Jul", ville: "Abidjan" },
      { id: 3, nom: "Grace Adjoua",          type: "B2C",       tel: "+225 07 999 0000", total: 42000,  last: "15 Jul", ville: "Abidjan" },
      { id: 4, nom: "Diallo Import-Export",  type: "Grossiste", tel: "+225 07 111 2222", total: 1200000,last: "10 Jul", ville: "Abidjan" },
    ],
    invoices: [
      { id: "F-021", client: "Couture Prestige SAS", clientTel: "+225 27 777 8888", lines: [{productId:1,nom:"Kente Ghana",qty:10,unit:"yards",prixUnit:12000},{productId:3,nom:"Taffetas Or",qty:6,unit:"yards",prixUnit:15000}], montant: 210000, acompte: 105000, date: "19 Jul", status: "acompte", type: "B2B" },
      { id: "F-020", client: "Ama Asante",            clientTel: "+233 24 555 6666", lines: [{productId:4,nom:"Mousseline Rose",qty:3,unit:"mètres",prixUnit:8000}], montant: 24000, acompte: 24000, date: "18 Jul", status: "payé", type: "B2C" },
    ],
    charges: [],
  },
  {
    id: "b3", nom: "Sékou Fabrics", ville: "Bamako", color:SEM.success.accent, initials: "SF",
    auditLog: [],
    products: [
      { id: 1, nom: "Faso Dan Fani", img: "photo-1558618666-fcd25c85cd64",    unit: "yards",  fournisseur: "Artisans Mali", categorie: "Coton",  couleur: "#1E9B1E" },
      { id: 2, nom: "Tissu Batik",   img: "photo-1558769132-cb1aea458c5e",    unit: "mètres", fournisseur: "Artisans Mali", categorie: "Coton",  couleur: "#f97316" },
      { id: 3, nom: "Coton Brodé",   img: "photo-1567401893414-76b7b1e5a7a5", unit: "yards",  fournisseur: "Keita Tissus",  categorie: "Coton",  couleur: "#3b82f6" },
    ],
    entries: [
      { id: 1, productId: 1, qty: 18, unit: "yards",  montantDu: 72000, date: "16 Jul", fournisseur: "Artisans Mali" },
      { id: 2, productId: 2, qty: 25, unit: "mètres", montantDu: 62500, date: "16 Jul", fournisseur: "Artisans Mali" },
      { id: 3, productId: 3, qty: 9,  unit: "yards",  montantDu: 45000, date: "10 Jul", fournisseur: "Keita Tissus"  },
    ],
    suppliers: [
      { id: 1, nom: "Artisans Mali", ville: "Bamako", lastDelivery: "16 Jul", tel: "+223 20 111 2222", initials: "AM", color:SEM.success.accent },
      { id: 2, nom: "Keita Tissus",  ville: "Ségou",  lastDelivery: "10 Jul", tel: "+223 66 333 4444", initials: "KT", color: "#f97316" },
    ],
    clients: [
      { id: 1, nom: "Fatoumata Sissoko", type: "B2C",      tel: "+223 76 555 6666", total: 38000,  last: "17 Jul", ville: "Bamako" },
      { id: 2, nom: "Maison Coulibaly",  type: "Grossiste", tel: "+223 20 777 8888", total: 520000, last: "16 Jul", ville: "Bamako" },
    ],
    invoices: [
      { id: "F-011", client: "Maison Coulibaly",  clientTel: "+223 20 777 8888", lines: [{productId:1,nom:"Faso Dan Fani",qty:20,unit:"yards",prixUnit:9000},{productId:2,nom:"Tissu Batik",qty:15,unit:"mètres",prixUnit:6000}], montant: 270000, acompte: 135000, date: "16 Jul", status: "acompte", type: "Grossiste" },
    ],
    charges: [],
  },
];

const INIT_PLATFORM_USERS: PlatformUser[] = [];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt   = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " F";
const today = () => new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + " · " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const ini   = (n: string) => n.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
const nowStr = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const cleanPhone = (s: string) => s.replace(/[\s\-().]/g, "");

function genInvoiceId(boutique: Boutique, allBoutiques: Boutique[], invoices: Invoice[]): string {
  const bNum = String((allBoutiques.findIndex(b => b.id === boutique.id) + 1) % 10);
  const incr = String(invoices.length + 1).padStart(5, "0");
  return `F${bNum}${incr}`;
}

const _GENERIC_IMGS = ["photo-1523275335684-37898b6baf30","photo-1542291026-7eec264c27ff","photo-1585386959984-a4155224a1ad","photo-1560472354-b33ff0c44a43","photo-1491553895911-0055eca6402d","photo-1441986300917-64674bd600d8","photo-1606041008023-472dfb5e530f","photo-1547481887-a26e2cacb5b2"];
function imgSrc(img: string | undefined | null, w = 400, h = 300, seed?: number): string {
  if (!img) { const i = seed != null ? seed % _GENERIC_IMGS.length : 0; return `https://images.unsplash.com/${_GENERIC_IMGS[i]}?w=${w}&h=${h}&fit=crop&auto=format`; }
  if (img.startsWith("data:") || img.startsWith("http")) return img;
  return `https://images.unsplash.com/${img}?w=${w}&h=${h}&fit=crop&auto=format`;
}

function resizeImage(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.5));
    };
    img.src = url;
  });
}

// Resize + compress a logo file (PNG/JPG/SVG) to max 600px, output as PNG data URL.
// Rejects with a user-facing message if the original file exceeds 2 MB.
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("Le fichier dépasse 2 Mo. Choisissez une image plus légère."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image invalide ou format non supporté.")); };
    img.src = url;
  });
}

function getSiblings(currentId: string, allBoutiques: Boutique[], allUsers: PlatformUser[], groupes?: Groupe[]): Boutique[] {
  const owner = allUsers.find(u => u.assignments.some(a => a.boutiqueId === currentId && a.role === "Propriétaire"));
  if (!owner) return [];
  const ownIds = owner.assignments.filter(a => a.boutiqueId !== currentId && a.role === "Propriétaire").map(a => a.boutiqueId);
  const siblings = allBoutiques.filter(b => ownIds.includes(b.id));
  if (owner.groupeId && groupes?.length) {
    const groupMemberBoutiqueIds = allUsers
      .filter(u => u.groupeId === owner.groupeId && u.id !== owner.id)
      .flatMap(u => u.assignments.filter(a => a.role === "Propriétaire").map(a => a.boutiqueId));
    const groupBoutiques = allBoutiques.filter(b => groupMemberBoutiqueIds.includes(b.id) && b.id !== currentId && !ownIds.includes(b.id));
    return [...siblings, ...groupBoutiques];
  }
  return siblings;
}

function lineDispQty(l: InvoiceLine | CartItem) { return l.sellQty ?? l.qty; }
function lineDispUnit(l: InvoiceLine | CartItem) { return l.sellUnit ?? l.unit; }
function lineTotal(l: InvoiceLine | CartItem) { return (l.sellQty ?? l.qty) * l.prixUnit; }
function invoiceSign(inv: Invoice) { return inv.type === "Retour" ? -1 : 1; }
function signedInvoiceAmount(inv: Invoice) { return invoiceSign(inv) * inv.montant; }
function signedInvoicePaid(inv: Invoice) { return invoiceSign(inv) * inv.acompte; }
function productQty(pid: number, entries: StockEntry[]) { return entries.filter(e => e.productId === pid).reduce((s, e) => s + e.qty, 0); }
function productMontant(pid: number, entries: StockEntry[]) { return entries.filter(e => e.productId === pid && e.qty > 0).reduce((s, e) => s + e.montantDu, 0); }

// FIFO unit cost for a sale of `qty` units, given the current entries state (call BEFORE adding sale entry)
function fifoUnitCost(pid: number, qty: number, entries: StockEntry[]): number {
  if (qty <= 0) return 0;
  const receipts = entries.filter(e => e.productId === pid && e.qty > 0).sort((a,b) => a.id - b.id);
  const alreadyConsumed = entries.filter(e => e.productId === pid && e.qty < 0).reduce((s,e) => s - e.qty, 0);
  // Walk receipts FIFO, skip already-consumed quantities, collect available lots
  let consumed = alreadyConsumed;
  const lots: {qty: number; unitCost: number}[] = [];
  for (const r of receipts) {
    const unitCost = r.qty > 0 ? r.montantDu / r.qty : 0;
    if (consumed >= r.qty) { consumed -= r.qty; continue; }
    lots.push({ qty: r.qty - consumed, unitCost });
    consumed = 0;
  }
  // Pull `qty` units from available lots in FIFO order
  let needed = qty;
  let totalCost = 0;
  for (const lot of lots) {
    if (needed <= 0) break;
    const take = Math.min(needed, lot.qty);
    totalCost += take * lot.unitCost;
    needed -= take;
  }
  // Fallback to last receipt cost if stock tracking is incomplete
  if (needed > 0 && receipts.length > 0) {
    const last = receipts[receipts.length - 1];
    if (last.qty > 0) totalCost += needed * (last.montantDu / last.qty);
  }
  return totalCost / qty;
}

// FIFO stock value of all remaining units for a product
function fifoStockValue(pid: number, entries: StockEntry[]): number {
  const remaining = productQty(pid, entries);
  if (remaining <= 0) return 0;
  const receipts = entries.filter(e => e.productId === pid && e.qty > 0).sort((a,b) => a.id - b.id);
  const alreadyConsumed = entries.filter(e => e.productId === pid && e.qty < 0).reduce((s,e) => s - e.qty, 0);
  let consumed = alreadyConsumed;
  let value = 0;
  let needed = remaining;
  for (const r of receipts) {
    if (needed <= 0) break;
    const unitCost = r.qty > 0 ? r.montantDu / r.qty : 0;
    if (consumed >= r.qty) { consumed -= r.qty; continue; }
    const available = r.qty - consumed;
    consumed = 0;
    const take = Math.min(needed, available);
    value += take * unitCost;
    needed -= take;
  }
  return value;
}
// Net montant after deducting supplier payments proportionally
function productMontantNet(pid: number, entries: StockEntry[], charges: Charge[]) {
  const pEntries = entries.filter(e => e.productId === pid && e.qty > 0);
  const sups = [...new Set(pEntries.map(e => e.fournisseur))];
  let net = 0;
  for (const sup of sups) {
    const prodDû = pEntries.filter(e => e.fournisseur === sup).reduce((s, e) => s + e.montantDu, 0);
    const totalDû = entries.filter(e => e.fournisseur === sup && e.qty > 0).reduce((s, e) => s + e.montantDu, 0);
    const totalPayé = charges.filter(c => c.fournisseur === sup).reduce((s, c) => s + c.montant, 0);
    const ratio = totalDû > 0 ? Math.min(1, totalPayé / totalDû) : 0;
    net += prodDû * (1 - ratio);
  }
  return Math.max(0, Math.round(net));
}
function supplierBalance(nom: string, entries: StockEntry[], charges?: Charge[]) {
  // Regular entries (manual receptions, not internal transfers): montantDu accumulates debt
  const entryDu = entries.filter(e => e.fournisseur === nom && e.qty > 0 && !e.isTransfertInterne).reduce((s, e) => s + e.montantDu, 0);
  // Regular payment charges (not B2B debts): reduce the entry debt
  const regularPayé = (charges ?? []).filter(c => c.fournisseur === nom && !c.isB2BDebt).reduce((s, c) => s + c.montant, 0);
  // B2B debt charges: contribute their unpaid remainder (montant - acompte)
  const b2bDebt = (charges ?? []).filter(c => c.fournisseur === nom && c.isB2BDebt).reduce((s, c) => s + c.montant - (c.acompte ?? 0), 0);
  return Math.max(0, entryDu - regularPayé + b2bDebt);
}
// Quantity input helpers — always 2 decimal places, dot separator
function qtyFmt(val: string | number): string {
  const n = typeof val === "number" ? val : parseFloat(val);
  return isNaN(n) ? "" : n.toFixed(2);
}
function qtyChange(val: string, set: (s: string) => void) {
  // Allow digits, optional dot, max 2 decimal places
  if (val === "" || val === ".") { set(val); return; }
  const m = val.match(/^\d*\.?\d{0,2}$/);
  if (m) set(val);
}
function qtyBlur(val: string, set: (s: string) => void) {
  const n = parseFloat(val);
  if (!isNaN(n) && n > 0) set(n.toFixed(2));
}

// Parses an invoice date robustly.
// inv.date = "15 juil. · 14:30" (display string)
// inv.dateRaw = "2024-07-15" (ISO, present on invoices created after this field was added)
function parseInvoiceDate(inv: Invoice): Date {
  const raw = inv.dateRaw ?? "";
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw + "T00:00:00");
  const dateStr = (inv.date ?? "").split(" · ")[0].trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr + "T00:00:00");
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("/");
    return new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T00:00:00`);
  }
  const FR_MON: Record<string,number> = {jan:0,"fév":1,fev:1,mar:2,avr:3,mai:4,jun:5,jui:6,jul:6,"aoû":7,aou:7,sep:8,oct:9,nov:10,"déc":11,dec:11};
  const parts = dateStr.toLowerCase().split(/[\s.]+/).filter(Boolean);
  const day = parseInt(parts[0]);
  const mon = FR_MON[parts[1]?.slice(0,3)];
  const yr = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
  if (!isNaN(day) && mon !== undefined) return new Date(yr, mon, day);
  return new Date();
}

function stockStatus(qty: number, p?: Product) { const ok = p?.alertOk ?? 20; const low = p?.alertLow ?? 5; return qty > ok ? "ok" : qty > low ? "low" : "critical"; }
function stockDot(s: string) { return s==="ok"?SEM.success.accent:s==="low"?SEM.warning.accent:SEM.danger.accent; }
function invBadge(s: InvoiceStatus): [string,string] {
  return ({
    "payé":       [SEM.success.text, SEM.success.bg],
    "acompte":    [SEM.warning.text, SEM.warning.bg],
    "en attente": [SEM.neutral.text, SEM.neutral.bg],
    "en retard":  [SEM.danger.text,  SEM.danger.bg],
  } as Record<InvoiceStatus,[string,string]>)[s] ?? [SEM.neutral.text, SEM.neutral.bg];
}
function buildInvoiceMessage(inv: Invoice, boutique: Boutique): string {
  const reste = inv.montant - inv.acompte;
  const lines = inv.lines?.map(l => `  • ${l.nom} × ${lineDispQty(l)} ${lineDispUnit(l)} = ${fmt(lineTotal(l))}`).join("\n") ?? "";
  return `*Facture ${inv.id}* — ${boutique.nom}\n📋 Client: ${inv.client}\n` +
    (lines ? `\n${lines}\n` : "") +
    `\n💰 Total: ${fmt(inv.montant)}\n` +
    (inv.acompte > 0 ? `✅ Acompte: ${fmt(inv.acompte)}\n` : "") +
    (reste > 0 ? `⏳ Reste: ${fmt(reste)}\n` : "") +
    `📅 ${inv.date}\nMerci pour votre confiance ! 🙏`;
}


// ─── INVOICE PDF TEMPLATE ─────────────────────────────────────────────────────
function buildInvoicePDFHtml(inv: Invoice, boutique: Boutique, clients: Client[]): string {
  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
  const fmtF = (n: number) => fmtN(n) + " F";
  const clientRecord = clients.find(c => c.nom === inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  // All text/graphics in black/gray only — no accent color anywhere except the logo image
  const statusLabel = reste <= 0 ? "PAYÉ"
    : inv.acompte > 0 ? "ACOMPTE VERSÉ"
    : "IMPAYÉ";

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

  const dateFormatted = parseInvoiceDate(inv).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });

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

  /* HEADER — black/gray only; logo retains its own colors */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8mm; border-bottom: 1.5px solid #1a1a1a; margin-bottom: 8mm; }
  .brand-name { font-size: 18pt; font-weight: 900; color: #1a1a1a; letter-spacing: -0.5px; }
  .brand-meta { font-size: 8pt; color: #555; margin-top: 3px; line-height: 1.6; }
  .inv-meta { text-align: right; }
  .inv-id { font-size: 16pt; font-weight: 900; color: #1a1a1a; letter-spacing: 0.5px; }
  .inv-label { font-size: 7.5pt; font-weight: 700; color: #888; letter-spacing: 1px; text-transform: uppercase; }
  .inv-date { font-size: 8.5pt; color: #444; margin-top: 4px; }

  /* STATUS BADGE — black border, black text, white background */
  .status-badge { display: inline-block; font-size: 8pt; font-weight: 900; letter-spacing: 1.5px; padding: 3px 10px; border-radius: 4px; background: #fff; color: #1a1a1a; border: 1.5px solid #1a1a1a; margin-top: 6px; }

  /* PARTIES */
  .parties { display: flex; gap: 12mm; margin-bottom: 8mm; }
  .party { flex: 1; }
  .party-label { font-size: 7pt; font-weight: 900; letter-spacing: 1.5px; color: #888; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .party-name { font-size: 11pt; font-weight: 800; color: #1a1a1a; margin-bottom: 3px; }
  .party-detail { font-size: 8pt; color: #555; line-height: 1.6; }
  .party-type { display: inline-block; font-size: 7pt; font-weight: 700; color: #555; background: #f0f0f0; border-radius: 3px; padding: 1px 6px; margin-bottom: 3px; }

  /* TABLE */
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  thead tr { background: #1a1a1a; color: #fff; }
  thead th { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 8px; text-align: left; }
  thead th.th-right { text-align: right; }
  thead th.th-center { text-align: center; }
  tbody tr:nth-child(even) { background: #f8f8f8; }
  tbody tr { border-bottom: 1px solid #e8e8e8; }
  .td-name { padding: 6px 8px; font-size: 9pt; font-weight: 500; color: #1a1a1a; }
  .td-center { padding: 6px 8px; text-align: center; font-size: 9pt; color: #333; }
  .td-right { padding: 6px 8px; text-align: right; font-size: 9pt; color: #333; }
  .td-bold { font-weight: 700; color: #1a1a1a !important; }

  /* TOTALS — gray only */
  .totals-block { display: flex; justify-content: flex-end; margin-bottom: 8mm; }
  .totals-inner { width: 72mm; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9pt; color: #555; border-bottom: 1px solid #ebebeb; }
  .totals-row:last-child { border-bottom: none; }
  .totals-total { display: flex; justify-content: space-between; padding: 6px 10px; margin-top: 4px; background: #efefef; border-left: 3px solid #1a1a1a; }
  .totals-total-label { font-size: 10pt; font-weight: 900; color: #1a1a1a; }
  .totals-total-value { font-size: 11pt; font-weight: 900; color: #1a1a1a; }
  .totals-reste { display: flex; justify-content: space-between; padding: 5px 10px; margin-top: 4px; background: #f5f5f5; border-left: 3px solid #555; }
  .totals-reste-label { font-size: 9pt; font-weight: 700; color: #1a1a1a; }
  .totals-reste-value { font-size: 10pt; font-weight: 900; color: #1a1a1a; }

  /* PAYMENT & SIGNATURE */
  .payment-sig { display: flex; gap: 8mm; margin-top: 8mm; }
  .payment-block { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 5mm; }
  .payment-block-title { font-size: 7pt; font-weight: 900; letter-spacing: 1.5px; color: #888; text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px solid #eee; padding-bottom: 3px; }
  .payment-method { display: flex; align-items: center; gap: 6px; font-size: 10pt; font-weight: 800; color: #1a1a1a; margin: 4px 0; }
  .sig-block { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 5mm; min-height: 28mm; display: flex; flex-direction: column; }
  .sig-block-title { font-size: 7pt; font-weight: 900; letter-spacing: 1.5px; color: #888; text-transform: uppercase; margin-bottom: auto; }
  .sig-line { border-bottom: 1px solid #aaa; margin: 0 6px 2px; width: 80%; align-self: center; margin-top: auto; }
  .sig-label { font-size: 7pt; color: #999; text-align: center; }
  .qr-area { width: 22mm; height: 22mm; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 2px; background: #fafafa; }
  .qr-text { font-size: 5.5pt; color: #aaa; text-align: center; line-height: 1.4; }

  /* FOOTER */
  .footer { margin-top: 8mm; padding-top: 5mm; border-top: 1px solid #ccc; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-note { font-size: 7.5pt; color: #888; max-width: 110mm; line-height: 1.6; }
  .footer-thanks { font-size: 8pt; font-weight: 700; color: #555; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div style="text-align:${boutique.logo ? "center" : "left"}">
      ${boutique.logo
        ? `<img src="${boutique.logo}" alt="${boutique.nom}" style="max-height:22mm;max-width:80mm;object-fit:contain;display:block;margin:0 auto 4px;"/><div class="brand-name" style="font-size:12pt;text-align:center">${boutique.nom}</div>`
        : `<div class="brand-name">${boutique.nom}</div>`
      }
      <div class="brand-meta" style="text-align:${boutique.logo ? "center" : "left"}">
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

  <!-- PARTIES -->
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

  <!-- LINE ITEMS TABLE -->
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

  <!-- TOTALS -->
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

  <!-- PAYMENT METHOD + SIGNATURE -->
  <div class="payment-sig">
    <div class="payment-block">
      <div class="payment-block-title">Mode de paiement</div>
      ${(inv as any).paymentSplit ? (inv as any).paymentSplit.map((s: any)=>`<div class="payment-method">✓ ${s.method} — ${new Intl.NumberFormat("fr-FR").format(s.amount)} F</div>`).join("") : inv.paymentMethod ? `<div class="payment-method">✓ ${inv.paymentMethod}</div>` : `<div style="color:#bbb;font-size:8pt;margin-top:4px">Non précisé</div>`}
      <div style="margin-top:8px;font-size:7.5pt;color:#555">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Sous-total</span><span style="font-weight:600">${fmtF(subtotal)}</span></div>
        ${inv.acompte>0?`<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>Acompte versé</span><span style="font-weight:600">- ${fmtF(inv.acompte)}</span></div>`:""}
        <div style="display:flex;justify-content:space-between;font-weight:800;color:#1a1a1a;border-top:1px solid #ddd;padding-top:3px;margin-top:3px"><span>Total</span><span>${fmtF(inv.montant)}</span></div>
        ${reste>0?`<div style="display:flex;justify-content:space-between;font-weight:700;color:#1a1a1a;margin-top:2px"><span>Reste dû</span><span>${fmtF(reste)}</span></div>`:""}
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-block-title">Signature &amp; cachet</div>
      <div class="sig-line"></div>
      <div class="sig-label" style="font-size:6.5pt;color:#bbb;margin-top:3px">Signature autorisée</div>
    </div>
    <div class="qr-area">
      <div style="font-size:18pt;line-height:1;color:#888">◼◻◼<br/>◻◼◻<br/>◼◻◼</div>
      <div class="qr-text">Réf.<br/>${inv.id}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-note">
      Document généré par ${boutique.nom} — ${new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}.<br/>
      Ce document tient lieu de facture officielle. Conservez-le pour vos archives.
    </div>
    <div class="footer-thanks">Merci pour votre confiance.</div>
  </div>

</div>
</body>
</html>`;
}

function openInvoicePDF(inv: Invoice, boutique: Boutique, clients: Client[]) {
  const html = buildInvoicePDFHtml(inv, boutique, clients);
  // Blob URL ensures charset=utf-8 is honored at the browser level,
  // avoiding mojibake from document.write on windows with no charset set.
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) { URL.revokeObjectURL(url); return; }
  w.focus();
  // Revoke after enough time for printing to complete
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Shared HTML→Canvas helper ─────────────────────────────────────────────────
// Loads `html` in a hidden iframe at `designWidth` px, constrains the layout
// so nothing overflows, then captures with html2canvas.
// Using a Blob URL ensures charset=utf-8 is honoured at the browser level.
// Removing the `width` option from html2canvas prevents right-side clipping —
// the capture width is derived from the element's actual constrained scrollWidth.
async function renderHtmlToCanvas(html: string, designWidth: number): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${designWidth}px;height:1px;border:none;background:#fff;`;
  document.body.appendChild(iframe);
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("iframe load failed"));
      iframe.src = blobUrl;
    });
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe contentDocument unavailable");
    // Force layout to exactly designWidth — prevents table/flexbox overflow
    // from inflating scrollWidth beyond the design width.
    doc.documentElement.style.cssText += `;width:${designWidth}px;overflow:hidden;`;
    doc.body.style.cssText += `;width:${designWidth}px;overflow:hidden;`;
    // setTimeout fires regardless of visibility — requestAnimationFrame does not
    // fire in hidden off-screen iframes (left:-9999px) in most browsers.
    await new Promise<void>(r => setTimeout(r, 150));
    iframe.style.height = doc.body.scrollHeight + "px";
    // No explicit `width` → html2canvas measures the element's actual constrained
    // width; nothing is cropped. scale 1.5 is sharp enough on mobile (was 2).
    const canvas = await html2canvas(doc.body, {
      scale: 1.5, useCORS: true, allowTaint: true,
      windowWidth: designWidth, backgroundColor: "#ffffff",
    });
    return canvas;
  } finally {
    document.body.removeChild(iframe);
    URL.revokeObjectURL(blobUrl);
  }
}

// ── Shared jsPDF pagination helper ───────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPdfFromCanvas(jsPDFClass: any, canvas: HTMLCanvasElement): any {
  const pdf = new jsPDFClass({ orientation: "portrait", unit: "mm", format: "a4" });
  const imgData = canvas.toDataURL("image/jpeg", 0.85); // 0.85 quality (was 0.92)
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height / canvas.width) * pdfW;
  let yOff = 0;
  while (yOff < imgH) {
    if (yOff > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, -yOff, pdfW, imgH);
    yOff += pdfH;
  }
  return pdf;
}

// ── Native jsPDF invoice builder — no html2canvas, no clipping ───────────────
async function buildInvoicePDFNative(inv: Invoice, boutique: Boutique, clients: Client[]): Promise<any> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const ML = 14, MR = 14;
  const RX = 210 - MR;
  const CW = RX - ML;

  const hexRgb = (h: string): [number,number,number] => {
    const s = (h||"#888888").replace("#","").trim();
    if (s.length === 3) return [parseInt(s[0]+s[0],16),parseInt(s[1]+s[1],16),parseInt(s[2]+s[2],16)];
    return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
  };
  const lightHex = (h: string, t = 0.92): [number,number,number] => {
    const [r,g,b] = hexRgb(h);
    return [Math.round(r+(255-r)*t), Math.round(g+(255-g)*t), Math.round(b+(255-b)*t)];
  };
  // jsPDF Helvetica only covers Latin-1 — strip the narrow/regular non-breaking
  // spaces that fr-FR locale inserts as thousands separators (U+202F & U+00A0).
  const fmtN = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/[  ]/g, " ");
  const fmtF = (n: number) => fmtN(n) + " F";

  const accent = boutique.color || "#f97316";
  const [ar,ag,ab] = hexRgb(accent);
  const clientRecord = clients.find(c => c.nom === inv.client);
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const subtotal = lines.reduce((s,l) => s + lineTotal(l), 0);
  const statusHex = reste <= 0 ? "#16a34a" : inv.acompte > 0 ? "#d97706" : "#dc2626";
  const statusBgHex = reste <= 0 ? "#f0fdf4" : inv.acompte > 0 ? "#fffbeb" : "#fef2f2";
  const statusLabel = reste <= 0 ? "PAYÉ" : inv.acompte > 0 ? "ACOMPTE VERSÉ" : "IMPAYÉ";
  const [sr,sg,sb2] = hexRgb(statusHex);
  const [sbr,sbg,sbb] = hexRgb(statusBgHex);
  const dateFormatted = parseInvoiceDate(inv).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });

  // Helper: load image dimensions from a data URL (needed for aspect-ratio-correct placement)
  const imgAspect = (dataUrl: string): Promise<number> => new Promise(res => {
    const img = new Image();
    img.onload = () => res(img.width / Math.max(img.height, 1));
    img.onerror = () => res(2); // safe fallback
    img.src = dataUrl;
  });
  const imgFmt = (dataUrl: string) => dataUrl.includes("image/png") ? "PNG" : dataUrl.includes("image/webp") ? "WEBP" : "JPEG";

  let y = 14;

  // HEADER — left side differs depending on whether a logo is configured
  let brandY: number;

  if (boutique.logo) {
    // Logo centered horizontally, max 22mm tall and 80mm wide — kept in full color
    const aspect = await imgAspect(boutique.logo);
    const maxH = 22, maxW = 80;
    const logoH = Math.min(maxH, maxW / aspect);
    const logoW = logoH * aspect;
    const logoX = (210 - logoW) / 2;
    pdf.addImage(boutique.logo, imgFmt(boutique.logo), logoX, y, logoW, logoH);
    // Boutique name centered below logo in dark gray (not accent)
    pdf.setFont("helvetica","bold"); pdf.setFontSize(11); pdf.setTextColor(26,26,26);
    pdf.text(boutique.nom, 105, y + logoH + 5, { align:"center" });
    pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(100,100,100);
    brandY = y + logoH + 11;
    if (boutique.adresse) { pdf.text(boutique.adresse, ML, brandY); brandY+=4.5; }
    if (boutique.tel) { pdf.text("Tél : "+boutique.tel, ML, brandY); brandY+=4.5; }
    if (boutique.email) { pdf.text(boutique.email, ML, brandY); brandY+=4.5; }
  } else {
    // No logo — dark text-only header (no accent color)
    pdf.setFont("helvetica","bold"); pdf.setFontSize(20); pdf.setTextColor(26,26,26);
    pdf.text(boutique.nom, ML, y+7);
    pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(100,100,100);
    brandY = y+13;
    if (boutique.adresse) { pdf.text(boutique.adresse, ML, brandY); brandY+=4.5; }
    if (boutique.tel) { pdf.text("Tél : "+boutique.tel, ML, brandY); brandY+=4.5; }
    if (boutique.email) { pdf.text(boutique.email, ML, brandY); brandY+=4.5; }
  }

  // Right side: FACTURE label, invoice ID, date, status badge (unchanged regardless of logo)
  pdf.setFont("helvetica","bold"); pdf.setFontSize(7); pdf.setTextColor(160,160,160);
  pdf.text("FACTURE", RX, y+3, { align:"right" });
  pdf.setFont("helvetica","bold"); pdf.setFontSize(18); pdf.setTextColor(26,26,26);
  pdf.text(inv.id, RX, y+11, { align:"right" });
  pdf.setFont("helvetica","normal"); pdf.setFontSize(8.5); pdf.setTextColor(80,80,80);
  pdf.text(dateFormatted, RX, y+17, { align:"right" });

  pdf.setFont("helvetica","bold"); pdf.setFontSize(7.5);
  const badgeW = Math.max(18, pdf.getTextWidth(statusLabel)+8);
  const badgeX = RX-badgeW, badgeY = y+20;
  // Sober badge: white fill, dark border, dark text (no color)
  pdf.setFillColor(255,255,255); pdf.setDrawColor(40,40,40); pdf.setLineWidth(0.5);
  pdf.roundedRect(badgeX, badgeY, badgeW, 5.5, 1.2, 1.2, "FD");
  pdf.setTextColor(26,26,26);
  pdf.text(statusLabel, RX-badgeW/2, badgeY+3.8, { align:"center" });

  y = Math.max(brandY+3, badgeY+9);
  pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.4);
  pdf.line(ML, y, RX, y);
  y += 7;

  // PARTIES
  const halfW = CW/2-4;
  const R2 = ML+halfW+8;
  pdf.setFont("helvetica","bold"); pdf.setFontSize(7); pdf.setTextColor(160,160,160);
  pdf.text("ÉMETTEUR", ML, y);
  pdf.text("DESTINATAIRE", R2, y);
  pdf.setDrawColor(220,220,220); pdf.setLineWidth(0.2);
  pdf.line(ML, y+1.2, ML+halfW, y+1.2);
  pdf.line(R2, y+1.2, R2+halfW, y+1.2);
  y += 5;

  const clientTypeLabel = clientRecord?.type === "B2B" ? "Client B2B (Grossiste)"
    : clientRecord?.type === "Intergroupe" ? "Client Intergroupe"
    : "Client B2C (Particulier)";
  pdf.setFont("helvetica","normal"); pdf.setFontSize(7); pdf.setTextColor(120,120,120);
  const pillW = pdf.getTextWidth(clientTypeLabel)+6;
  pdf.setFillColor(243,244,246);
  pdf.roundedRect(R2, y-3.5, pillW, 4.5, 0.8, 0.8, "F");
  pdf.text(clientTypeLabel, R2+3, y);

  pdf.setFont("helvetica","bold"); pdf.setFontSize(11); pdf.setTextColor(26,26,26);
  pdf.text(boutique.nom, ML, y+2);
  y += 7;

  pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(80,80,80);
  let emY = y;
  if (boutique.adresse) { pdf.text(boutique.adresse, ML, emY); emY+=4.5; }
  if (boutique.tel) { pdf.text("Tél : "+boutique.tel, ML, emY); emY+=4.5; }
  if (boutique.email) { pdf.text(boutique.email, ML, emY); emY+=4.5; }

  pdf.setFont("helvetica","bold"); pdf.setFontSize(11); pdf.setTextColor(26,26,26);
  pdf.text(inv.client, R2, y);
  let clY = y+5;
  pdf.setFont("helvetica","normal"); pdf.setFontSize(8); pdf.setTextColor(80,80,80);
  if (inv.clientTel) { pdf.text("Tél : "+inv.clientTel, R2, clY); clY+=4.5; }
  if (clientRecord?.adresse) { pdf.text(clientRecord.adresse, R2, clY); clY+=4.5; }
  if (clientRecord?.email) { pdf.text(clientRecord.email, R2, clY); clY+=4.5; }

  y = Math.max(emY, clY)+7;

  // TABLE
  const colW = [CW*0.42, CW*0.12, CW*0.14, CW*0.16, CW*0.16];
  const colX = [ML, ML+colW[0], ML+colW[0]+colW[1], ML+colW[0]+colW[1]+colW[2], ML+colW[0]+colW[1]+colW[2]+colW[3]];
  const rowH = 7;
  pdf.setFillColor(26,26,26);
  pdf.rect(ML, y, CW, rowH, "F");
  pdf.setFont("helvetica","bold"); pdf.setFontSize(7); pdf.setTextColor(255,255,255);
  pdf.text("DÉSIGNATION", colX[0]+2, y+4.8);
  pdf.text("QTÉ", colX[1]+colW[1]/2, y+4.8, { align:"center" });
  pdf.text("UNITÉ", colX[2]+colW[2]/2, y+4.8, { align:"center" });
  pdf.text("PRIX UNIT.", colX[3]+colW[3]-2, y+4.8, { align:"right" });
  pdf.text("TOTAL", colX[4]+colW[4]-2, y+4.8, { align:"right" });
  y += rowH;

  lines.forEach((l, i) => {
    if (y+rowH > 270) { pdf.addPage(); y = 14; }
    if (i%2===1) { pdf.setFillColor(250,250,250); pdf.rect(ML, y, CW, rowH, "F"); }
    pdf.setDrawColor(238,238,238); pdf.setLineWidth(0.15);
    pdf.line(ML, y+rowH, RX, y+rowH);
    // Truncate name to fit column
    pdf.setFont("helvetica","normal"); pdf.setFontSize(9);
    let nom = l.nom;
    while (nom.length>3 && pdf.getTextWidth(nom) > colW[0]-4) nom = nom.slice(0,-1);
    if (nom!==l.nom) nom = nom.slice(0,-1)+"…";
    pdf.setTextColor(26,26,26);
    pdf.text(nom, colX[0]+2, y+4.8);
    pdf.setTextColor(80,80,80);
    pdf.text(fmtN(l.sellQty??l.qty), colX[1]+colW[1]/2, y+4.8, { align:"center" });
    pdf.text(l.sellUnit??l.unit, colX[2]+colW[2]/2, y+4.8, { align:"center" });
    pdf.text(fmtN(l.prixUnit)+" F", colX[3]+colW[3]-2, y+4.8, { align:"right" });
    pdf.setFont("helvetica","bold"); pdf.setTextColor(26,26,26);
    pdf.text(fmtN(lineTotal(l))+" F", colX[4]+colW[4]-2, y+4.8, { align:"right" });
    y += rowH;
  });
  y += 6;

  // TOTALS
  const totW = 74, totX = RX-totW;
  const drawTotRow = (label: string, value: string) => {
    pdf.setFont("helvetica","normal"); pdf.setFontSize(9); pdf.setTextColor(80,80,80);
    pdf.text(label, totX, y+4);
    pdf.text(value, RX, y+4, { align:"right" });
    pdf.setDrawColor(240,240,240); pdf.setLineWidth(0.15);
    pdf.line(totX, y+5.5, RX, y+5.5);
    y += 6.5;
  };
  if (lines.length>1) drawTotRow("Sous-total", fmtF(subtotal));
  if (inv.acompte>0) drawTotRow("Acompte versé", "- "+fmtF(inv.acompte));

  // Total à payer — dark gray, no accent color
  pdf.setFillColor(240,240,240); pdf.rect(totX, y, totW, 8, "F");
  pdf.setFillColor(26,26,26); pdf.rect(totX, y, 2.5, 8, "F");
  pdf.setFont("helvetica","bold"); pdf.setFontSize(10); pdf.setTextColor(26,26,26);
  pdf.text("Total à payer", totX+5, y+5.3);
  pdf.setFontSize(11);
  pdf.text(fmtF(inv.montant), RX, y+5.3, { align:"right" });
  y += 11;

  if (reste>0) {
    pdf.setFillColor(248,248,248); pdf.rect(totX, y, totW, 7.5, "F");
    pdf.setFillColor(80,80,80); pdf.rect(totX, y, 2.5, 7.5, "F");
    pdf.setFont("helvetica","bold"); pdf.setFontSize(9); pdf.setTextColor(40,40,40);
    pdf.text(inv.acompte>0 ? "Reste dû" : "Montant impayé", totX+5, y+4.8);
    pdf.setFontSize(10);
    pdf.text(fmtF(reste), RX, y+4.8, { align:"right" });
  }

  // FOOTER
  const footerY = 297-MR-14;
  pdf.setDrawColor(200,200,200); pdf.setLineWidth(0.2);
  pdf.line(ML, footerY, RX, footerY);
  pdf.setFont("helvetica","normal"); pdf.setFontSize(7.5); pdf.setTextColor(160,160,160);
  const docDate = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });
  pdf.text("Document généré par "+boutique.nom+" — "+docDate+".", ML, footerY+5);
  pdf.text("Ce document tient lieu de facture. Conservez-le pour vos archives.", ML, footerY+9.5);
  pdf.setFont("helvetica","bold"); pdf.setTextColor(120,120,120);
  pdf.text("Merci pour votre confiance.", RX, footerY+5, { align:"right" });

  return pdf;
}

async function downloadInvoicePDF(inv: Invoice, boutique: Boutique, clients: Client[]): Promise<void> {
  const pdf = await buildInvoicePDFNative(inv, boutique, clients);
  pdf.save(`Facture-${inv.id}.pdf`);
}

// Returns base64 PDF bytes for SMS / WhatsApp sharing.
async function generateInvoicePDFBase64(inv: Invoice, boutique: Boutique, clients: Client[]): Promise<string> {
  const pdf = await buildInvoicePDFNative(inv, boutique, clients);
  const buf = pdf.output("arraybuffer") as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}


// ─── SHARED UI ────────────────────────────────────────────────────────────────

const inputCls = "w-full bg-muted border border-border rounded-xl px-4 py-3.5 text-base focus:outline-none";

function Modal({ title, color, onClose, children }: { title: string; color: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background:"rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-x border-border"
        style={{ boxShadow:`0 -8px 40px ${color}22`, marginBottom:"60px" }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif", color }}>{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"#EEE9D8" }}>
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 overflow-y-auto pb-4" style={{ maxHeight:"65vh", scrollbarWidth:"none" }}>{children}</div>
      </div>
    </div>
  );
}
function Field({ label, color = "#374151", children }: { label: string; color?: string; children: React.ReactNode }) {
  return <div><label className="text-sm font-black mb-2 block tracking-wide" style={{ color }}>{label}</label>{children}</div>;
}
function SubmitBtn({ color = "#C9A227", label, onClick, disabled }: { color?: string; label: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="w-full py-5 rounded-2xl text-lg font-black active:scale-95 mt-2"
    style={{ background:disabled?"#c7bfa0":color, color:"#fff", fontFamily:"'Nunito', sans-serif", opacity:disabled?0.5:1 }}>✓ {label}</button>;
}

// ─── SCREEN: LOGIN ────────────────────────────────────────────────────────────

const LOGIN_MAX_ATTEMPTS = 5;      // failed tries before the device locks
const LOGIN_LOCK_MS = 2 * 60_000;  // lockout duration (mirrors auth_settings.lock_minutes default)
const LOGIN_LOCK_KEY = "tournal:login_lock";

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void | Promise<void> }) {
  const [phone, setPhone] = useState("+221 ");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(() => {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LOGIN_LOCK_KEY) : null;
    const ts = raw ? Number(raw) : 0;
    return ts > Date.now() ? ts : 0;
  });
  const [now, setNow] = useState(Date.now());
  const isLocked = lockedUntil > now;
  const remainingSec = Math.max(0, Math.ceil((lockedUntil-now)/1000));
  useEffect(()=>{
    if (!isLocked) return;
    const id = setInterval(()=>setNow(Date.now()), 1000);
    return ()=>clearInterval(id);
  },[isLocked]);

  async function login() {
    if (isLocked || loading) return;
    if (!phone.trim() || !pwd) { setErr("Numéro de téléphone et mot de passe requis."); return; }
    setLoading(true);
    try {
      await signInWithPhone(phone, pwd);
      setErr(""); setAttempts(0); setLockedUntil(0);
      if (typeof localStorage !== "undefined") localStorage.removeItem(LOGIN_LOCK_KEY);
      await onAuthenticated();
    } catch (error) {
      const next = attempts + 1;
      setAttempts(next); setPwd("");
      if (next >= LOGIN_MAX_ATTEMPTS) {
        const until = Date.now() + LOGIN_LOCK_MS;
        setLockedUntil(until);
        if (typeof localStorage !== "undefined") localStorage.setItem(LOGIN_LOCK_KEY, String(until));
        setErr(`Trop de tentatives. Connexion bloquée pendant ${Math.round(LOGIN_LOCK_MS/60000)} minutes.`);
      } else {
        const left = LOGIN_MAX_ATTEMPTS-next;
        setErr((error instanceof Error ? error.message : "Identifiants incorrects") + ` · ${left} tentative${left>1?"s":""} restante${left>1?"s":""}`);
      }
    } finally { setLoading(false); }
  }

  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><ShieldCheck size={32} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Connexion Tournal</h1><p className="text-sm text-muted-foreground mt-2">Utilisez votre mot de passe. Le PIN sert uniquement au déverrouillage rapide d’une session déjà ouverte.</p></div>
      <div><label className="text-xs font-black mb-2 block tracking-wider" style={{color:"#C9A227"}}>NUMÉRO DE TÉLÉPHONE</label>
        <div className="relative"><Smartphone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={phone} onChange={e=>{const v=e.target.value;setPhone(v.startsWith("+221 ")?v:"+221 ");setErr("");}} placeholder="+221 77 000 0000" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" disabled={isLocked||loading} className={inputCls+" pl-11"} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();passwordRef.current?.focus();}}}/></div>
      </div>
      <div><label className="text-xs font-black mb-2 block tracking-wider" style={{color:"#C9A227"}}>MOT DE PASSE</label>
        <div className="relative"><Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input ref={passwordRef} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="••••••••••••" type={show?"text":"password"} autoComplete="current-password" enterKeyHint="go" disabled={isLocked||loading} className={inputCls+" pl-11 pr-12"} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void login();}}}/><button type="button" aria-label={show?"Masquer le mot de passe":"Afficher le mot de passe"} onClick={()=>setShow(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{show?<EyeOff size={18} className="text-muted-foreground"/>:<Eye size={18} className="text-muted-foreground"/>}</button></div>
      </div>
      {err&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{background:"#ef444415"}}><X size={14} style={{color:"#ef4444"}}/><p className="text-sm font-semibold" style={{color:"#ef4444"}}>{err}</p></div>}
      {isLocked&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{background:"#ef444415"}}><Lock size={14} style={{color:"#ef4444"}}/><p className="text-sm font-semibold" style={{color:"#ef4444"}}>Réessayez dans {Math.floor(remainingSec/60)}:{String(remainingSec%60).padStart(2,"0")}</p></div>}
      <button onClick={()=>void login()} disabled={loading||isLocked||!pwd} className="w-full py-4 rounded-2xl text-base font-black active:scale-95 disabled:opacity-60 transition-all" style={{background:"#C9A227",color:"#fff",fontFamily:"'Nunito', sans-serif"}}>{loading?"Vérification du compte…":isLocked?"Connexion bloquée":"Se connecter →"}</button>
    </div>
  </div>;
}

function RequiredPasswordChangeScreen({ onComplete }: { onComplete: () => void | Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (password.length < 12) { setError("Le mot de passe doit comporter au moins 12 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    try { await changeOwnPassword(password); await onComplete(); }
    catch (e) { setError(e instanceof Error ? e.message : "Modification impossible"); }
    finally { setLoading(false); }
  }

  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><ShieldCheck size={32} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Créez votre mot de passe</h1><p className="text-sm text-muted-foreground mt-2">Le mot de passe transmis lors de la création du compte est temporaire. Remplacez-le avant de configurer votre PIN rapide.</p></div>
      <Field label="NOUVEAU MOT DE PASSE (12 CARACTÈRES MIN.)" color="#C9A227"><input value={password} onChange={e=>{setPassword(e.target.value);setError("");}} type={show?"text":"password"} className={inputCls} autoComplete="new-password" autoFocus/></Field>
      <Field label="CONFIRMER LE MOT DE PASSE" color="#C9A227"><input value={confirm} onChange={e=>{setConfirm(e.target.value);setError("");}} type={show?"text":"password"} className={inputCls} autoComplete="new-password" onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Afficher le mot de passe</label>
      {error&&<div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{background:"#ef444415",color:"#ef4444"}}>{error}</div>}
      <SubmitBtn label={loading?"Modification…":"Enregistrer le mot de passe"} onClick={submit} disabled={loading}/>
    </div>
  </div>;
}

function PinSetupScreen({ onComplete }: { onComplete: () => void | Promise<void> }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const onlyDigits = (v:string)=>v.replace(/\D/g,"").slice(0,6);
  async function submit() {
    if (!/^\d{6}$/.test(pin)) { setError("Le PIN doit comporter exactement 6 chiffres."); return; }
    if (pin !== confirm) { setError("Les deux PIN ne correspondent pas."); return; }
    setLoading(true);
    try { await setQuickPin(pin); await onComplete(); }
    catch(e) { setError(e instanceof Error ? e.message : "Configuration du PIN impossible"); }
    finally { setLoading(false); }
  }
  return <div className="bg-background text-foreground min-h-screen flex items-center justify-center px-6" style={{fontFamily:"'Inter', sans-serif"}}>
    <div className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5 shadow-sm">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:"#C9A22722"}}><Lock size={30} style={{color:"#C9A227"}}/></div>
      <div className="text-center"><h1 className="text-2xl font-black">Créez votre PIN rapide</h1><p className="text-sm text-muted-foreground mt-2">Choisissez 6 chiffres faciles à retenir pour déverrouiller rapidement cette session. Ce PIN ne remplace pas votre mot de passe.</p></div>
      <Field label="PIN (6 CHIFFRES)" color="#C9A227"><input value={pin} onChange={e=>{setPin(onlyDigits(e.target.value));setError("");}} type="password" inputMode="numeric" maxLength={6} className={inputCls+" text-center tracking-[0.5em] text-xl font-black"} autoFocus/></Field>
      <Field label="CONFIRMER LE PIN" color="#C9A227"><input value={confirm} onChange={e=>{setConfirm(onlyDigits(e.target.value));setError("");}} type="password" inputMode="numeric" maxLength={6} className={inputCls+" text-center tracking-[0.5em] text-xl font-black"} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
      {error&&<div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{background:"#ef444415",color:"#ef4444"}}>{error}</div>}
      <SubmitBtn label={loading?"Configuration…":"Activer mon PIN"} onClick={submit} disabled={loading}/>
    </div>
  </div>;
}

// ─── SCREEN: SUPER ADMIN ──────────────────────────────────────────────────────

function SuperAdminScreen({ boutiques, platformUsers, groupes, onEnterBoutique, onCreateBoutique, onUpdateBoutique, onDeleteBoutique, onCreateUser, onUpdateUser, onCreateGroupe, onUpdateGroupe, onDeleteGroupe, onResetPassword, onLogout, backendOk, saveState }: {
  boutiques: Boutique[]; platformUsers: PlatformUser[]; groupes: Groupe[];
  onEnterBoutique: (b: Boutique) => void;
  onCreateBoutique: (nom: string, ville: string, ownerId: string, logo?: string) => void;
  onUpdateBoutique: (id: string, nom: string, ville: string) => void;
  onDeleteBoutique: (id: string) => void;
  onCreateUser: (u: Omit<PlatformUser,"id">) => Promise<PlatformUser|null>;
  onUpdateUser: (uid: string, updates: Partial<Pick<PlatformUser,"groupeId"|"isCompteMere">>) => void;
  onCreateGroupe: (nom: string) => void;
  onUpdateGroupe: (gid: string, nom: string) => void;
  onDeleteGroupe: (gid: string) => void;
  onResetPassword: (uid: string, pwd: string) => void;
  onLogout: () => void;
  backendOk: boolean | null;
  saveState: "idle"|"saving"|"saved"|"error";
}) {
  const [tab, setTab] = useState<"boutiques"|"users"|"groupes">("boutiques");
  const [bSearch, setBSearch] = useState("");
  const [uSearch, setUSearch] = useState("");
  const [newB, setNewB] = useState(false);
  const [editB, setEditB] = useState<Boutique|null>(null);
  const [deleteB, setDeleteB] = useState<Boutique|null>(null);
  const [newU, setNewU] = useState(false);
  const [resetTarget, setResetTarget] = useState<PlatformUser|null>(null);
  const [bNom,setBNom]=useState(""); const [bVille,setBVille]=useState(""); const [bOwner,setBOwner]=useState(""); const [bLogo,setBLogo]=useState<string|null>(null);
  const bLogoRef = useRef<HTMLInputElement>(null);
  const [eBNom,setEBNom]=useState(""); const [eBVille,setEBVille]=useState("");
  const [uNom,setUNom]=useState(""); const [uPhone,setUPhone]=useState("+221 "); const [uPwd,setUPwd]=useState("");
  const [creatingUser,setCreatingUser]=useState(false);
  const [newPwd,setNewPwd]=useState(""); const [showP,setShowP]=useState(false); const [resetDone,setResetDone]=useState(false);
  const [uGroupe,setUGroupe]=useState(""); const [uCompteMere,setUCompteMere]=useState(false);
  const [editU,setEditU]=useState<PlatformUser|null>(null); const [editUGroupe,setEditUGroupe]=useState(""); const [editUCompteMere,setEditUCompteMere]=useState(false);
  const [newG,setNewG]=useState(false); const [gNom,setGNom]=useState("");
  const [editG,setEditG]=useState<Groupe|null>(null); const [editGNom,setEditGNom]=useState("");
  const [deleteG,setDeleteG]=useState<Groupe|null>(null);
  const [manageGId,setManageGId]=useState<string|null>(null); const [addMemberUid,setAddMemberUid]=useState("");

  const nonAdmin = platformUsers.filter(u=>!u.isSuperAdmin);
  const unassigned = platformUsers.filter(u=>u.assignments.length===0);

  const filteredBoutiques = boutiques.filter(b=>b.nom.toLowerCase().includes(bSearch.toLowerCase())||b.ville.toLowerCase().includes(bSearch.toLowerCase()));
  const filteredUsers = nonAdmin.filter(u=>u.nom.toLowerCase().includes(uSearch.toLowerCase())||u.phone.includes(uSearch));

  function submitBoutique() {
    if (!bNom.trim()||!bOwner) return;
    onCreateBoutique(bNom.trim(), bVille.trim(), bOwner, bLogo??undefined);
    setBNom(""); setBVille(""); setBOwner(""); setBLogo(null); setNewB(false);
  }
  async function handleBLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBLogo(await resizeImage(f));
  }
  function submitEditBoutique() {
    if (!editB||!eBNom.trim()) return;
    onUpdateBoutique(editB.id, eBNom.trim(), eBVille.trim());
    setEditB(null);
  }
  async function submitUser() {
    if (creatingUser || !uNom.trim()||!uPhone.trim()||uPwd.length<12) return;
    setCreatingUser(true);
    try {
      const color = USER_COLORS[platformUsers.length%USER_COLORS.length];
      const user = await onCreateUser({ phone:uPhone.trim(), password:uPwd, nom:uNom.trim(), initials:ini(uNom.trim()), color, isSuperAdmin:false, assignments:[], groupeId:uGroupe||undefined, isCompteMere:uCompteMere||undefined });
      if (!user) return;
      setUNom(""); setUPhone("+221 "); setUPwd(""); setUGroupe(""); setUCompteMere(false); setNewU(false);
    } finally {
      setCreatingUser(false);
    }
  }
  function submitReset() {
    if (!resetTarget||newPwd.length<12) return;
    onResetPassword(resetTarget.id,newPwd); setResetDone(true);
    setTimeout(()=>{ setResetTarget(null); setNewPwd(""); setResetDone(false); setShowP(false); },1200);
  }

  return (
    <div className="bg-background text-foreground h-screen flex flex-col overflow-hidden" style={{ fontFamily:"'Inter', sans-serif" }}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div><div className="flex items-center gap-2 mb-0.5"><Shield size={14} style={{ color:"#C9A227" }}/><span className="text-xs text-muted-foreground font-semibold">Super Admin</span></div>
          <h1 className="text-2xl font-black" style={{ fontFamily:"'Nunito', sans-serif", color:"#C9A227" }}>Tournal</h1></div>
        <div className="flex items-center gap-2">
          <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#EEE9D8" }}>
            <LogOut size={16} className="text-muted-foreground"/><span className="text-sm text-muted-foreground">Quitter</span></button>
        </div>
      </header>
      <div className="flex bg-card border-b border-border px-4 flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
        {([{id:"boutiques" as const,label:`🏪 Boutiques (${boutiques.length})`},{id:"users" as const,label:`👥 Utilisateurs (${nonAdmin.length})`},{id:"groupes" as const,label:`🔗 Groupes (${groupes.length})`}]).map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="px-4 py-3 text-sm font-bold relative flex-shrink-0" style={{ color:tab===t.id?"#C9A227":"#6b7280" }}>
            {t.label}{tab===t.id&&<span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background:"#C9A227" }}/>}
          </button>
        ))}
      </div>
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8" style={{ scrollbarWidth:"none" }}>
        {tab==="boutiques"&&(
          <>
            <div className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={bSearch} onChange={e=>setBSearch(e.target.value)} placeholder="Chercher un tenant…" className={inputCls+" pl-10 py-3"}/></div>
            {filteredBoutiques.map(b=>{
              const owner=platformUsers.find(u=>u.assignments.some(a=>a.boutiqueId===b.id&&a.role==="Propriétaire"));
              const uc=platformUsers.filter(u=>u.assignments.some(a=>a.boutiqueId===b.id)).length;
              return (
                <div key={b.id} className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow:`inset 3px 0 0 ${b.color}` }}>
                  <button className="w-full p-5 text-left flex items-center gap-4 active:scale-[0.98]" onClick={()=>onEnterBoutique(b)}>
                    <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black overflow-hidden" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.logo?<img src={b.logo} alt={b.nom} className="w-full h-full object-contain p-1"/>:b.initials}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black leading-tight" style={{ fontFamily:"'Nunito', sans-serif" }}>{b.nom}</p>
                      <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                      {owner&&<p className="text-xs mt-1" style={{ color:b.color }}>Propriétaire : {owner.nom}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{uc} user{uc>1?"s":""} · {b.products.length} produits</p>
                    </div>
                    <ChevronRight size={20} style={{ color:b.color }}/>
                  </button>
                  <div className="flex border-t border-border">
                    <button onClick={()=>{ setEditB(b); setEBNom(b.nom); setEBVille(b.ville); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#3b82f6" }}>
                      <Edit2 size={13}/> Modifier
                    </button>
                    <div className="w-px bg-border"/>
                    <button onClick={()=>setDeleteB(b)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#ef4444" }}>
                      <Trash2 size={13}/> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
            <button onClick={()=>setNewB(true)} className="w-full rounded-2xl p-5 border-2 border-dashed border-border flex items-center gap-4 active:scale-[0.98]">
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center"><Plus size={26} className="text-muted-foreground"/></div>
              <div className="text-left"><p className="text-base font-bold text-muted-foreground">Nouveau tenant</p><p className="text-xs text-muted-foreground mt-0.5">Assigner un propriétaire existant</p></div>
            </button>
          </>
        )}
        {tab==="users"&&(
          <>
            <div className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={uSearch} onChange={e=>setUSearch(e.target.value)} placeholder="Chercher un utilisateur…" className={inputCls+" pl-10 py-3"}/></div>
            {filteredUsers.map(u=>{
              const isOwner=u.assignments.some(a=>a.role==="Propriétaire");
              const grp=u.groupeId?groupes.find(g=>g.id===u.groupeId):null;
              return (
                <div key={u.id} className="bg-card rounded-2xl p-4 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:u.color+"22", color:u.color, fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{u.nom}</p>
                        {isOwner&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.role.bg, color:SEM.role.text }}>Propriétaire</span>}
                        {u.isSuspended&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:SEM.danger.bg, color:SEM.danger.text }}>Suspendu</span>}
                        {u.isCompteMere&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#7c3aed22", color:"#7c3aed" }}>Compte mère</span>}
                        {grp&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#0891b222", color:"#0891b2" }}>🔗 {grp.nom}</span>}
                      </div>
                      <div className="flex items-center gap-1.5"><Smartphone size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{u.phone}</span></div>
                    </div>
                    <button onClick={()=>{setEditU(u);setEditUGroupe(u.groupeId??"");setEditUCompteMere(u.isCompteMere??false);}} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{ background:"#3b82f622", color:"#3b82f6" }}>
                      <Edit2 size={13}/>
                    </button>
                    <button onClick={()=>{setResetTarget(u);setNewPwd("");setResetDone(false);}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{ background:"#C9A22722", color:"#C9A227" }}>
                      <RefreshCw size={13}/> MDP
                    </button>
                    <SuperAdminUserActions user={u} boutiques={boutiques} onChanged={()=>window.location.reload()}/>
                  </div>
                  {u.assignments.length>0&&<div className="flex flex-wrap gap-2 mt-3">{u.assignments.map((a,i)=>{const b=boutiques.find(x=>x.id===a.boutiqueId);return b?<span key={i} className="text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5" style={{ background:b.color+"22", color:b.color }}><Building2 size={11}/>{b.nom} · {a.role}</span>:null;})}</div>}
                  {u.assignments.length===0&&<p className="text-xs text-muted-foreground mt-2">Aucun tenant assigné</p>}
                </div>
              );
            })}
            <button onClick={()=>setNewU(true)} className="w-full rounded-2xl p-4 border-2 border-dashed border-border flex items-center gap-3 active:scale-[0.98]">
              <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><UserPlus size={22} className="text-muted-foreground"/></div>
              <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Créer un utilisateur</p><p className="text-xs text-muted-foreground mt-0.5">Puis l'assigner à un tenant</p></div>
            </button>
          </>
        )}
        {tab==="groupes"&&(
          <>
            {groupes.map(g=>{
              const members=platformUsers.filter(u=>u.groupeId===g.id&&!u.isSuperAdmin);
              const isOpen=manageGId===g.id;
              const available=nonAdmin.filter(u=>u.groupeId!==g.id);
              return (
                <div key={g.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-lg" style={{ background:"#0891b222" }}>🔗</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{g.nom}</p>
                      <p className="text-xs text-muted-foreground">{members.length} membre{members.length!==1?"s":""}</p>
                    </div>
                    <button onClick={()=>setManageGId(isOpen?null:g.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background:"#0891b222", color:"#0891b2" }}>
                      {isOpen?"Fermer":"Gérer"}
                    </button>
                  </div>
                  {/* Expanded member management */}
                  {isOpen&&(
                    <div className="border-t border-border">
                      {/* Existing members */}
                      {members.length>0&&(
                        <div className="p-3 space-y-2">
                          {members.map(u=>{
                            const ownedB=boutiques.filter(b=>u.assignments.some(a=>a.boutiqueId===b.id&&a.role==="Propriétaire"));
                            return (
                              <div key={u.id} className="flex items-center gap-2 p-2 rounded-xl" style={{ background:u.color+"11" }}>
                                <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black" style={{ background:u.color+"22", color:u.color, fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">{u.nom}{u.isCompteMere?" · Compte mère":""}</p>
                                  {ownedB.length>0&&<p className="text-xs text-muted-foreground truncate">{ownedB.map(b=>b.nom).join(", ")}</p>}
                                </div>
                                <button onClick={()=>{ onUpdateUser(u.id,{ groupeId:undefined, isCompteMere:undefined }); }} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:"#ef444415" }}>
                                  <X size={13} style={{ color:"#ef4444" }}/>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Add member */}
                      {available.length>0&&(
                        <div className="flex gap-2 p-3 border-t border-border">
                          <select value={addMemberUid} onChange={e=>setAddMemberUid(e.target.value)} className={inputCls+" flex-1 py-2 text-sm"} style={{ appearance:"none" }}>
                            <option value="">-- Ajouter un compte --</option>
                            {available.map(u=><option key={u.id} value={u.id}>{u.nom} ({u.phone})</option>)}
                          </select>
                          <button onClick={()=>{ if(!addMemberUid) return; onUpdateUser(addMemberUid,{ groupeId:g.id }); setAddMemberUid(""); }} disabled={!addMemberUid} className="px-4 py-2 rounded-xl text-sm font-black text-white flex-shrink-0 disabled:opacity-40" style={{ background:"#0891b2" }}>
                            Ajouter
                          </button>
                        </div>
                      )}
                      {/* Edit / Delete actions */}
                      <div className="flex border-t border-border">
                        <button onClick={()=>{ setEditG(g); setEditGNom(g.nom); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#3b82f6" }}>
                          <Edit2 size={13}/> Renommer
                        </button>
                        <div className="w-px bg-border"/>
                        <button onClick={()=>setDeleteG(g)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold" style={{ color:"#ef4444" }}>
                          <Trash2 size={13}/> Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {groupes.length===0&&<div className="flex flex-col items-center gap-3 py-12 text-center px-8"><div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background:"#0891b222" }}>🔗</div><p className="font-black text-base" style={{ fontFamily:"'Nunito', sans-serif", color:"#0891b2" }}>Aucun groupe créé</p><p className="text-sm text-muted-foreground">Créez un groupe pour relier des boutiques de propriétaires différents.</p></div>}
            <button onClick={()=>setNewG(true)} className="w-full rounded-2xl p-4 border-2 border-dashed border-border flex items-center gap-3 active:scale-[0.98]">
              <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0 text-xl">🔗</div>
              <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Créer un groupe</p><p className="text-xs text-muted-foreground mt-0.5">Relier des boutiques de propriétaires différents</p></div>
            </button>
          </>
        )}
      </main>

      {/* Create boutique modal */}
      {newB&&<Modal title="Nouveau tenant" color="#C9A227" onClose={()=>{setNewB(false);setBLogo(null);}}>
        <Field label="NOM DE LA BOUTIQUE" color="#C9A227"><input value={bNom} onChange={e=>setBNom(e.target.value)} placeholder="Ex: Diallo Textiles" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitBoutique()}/></Field>
        <Field label="VILLE" color="#C9A227"><input value={bVille} onChange={e=>setBVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitBoutique()}/></Field>
        <Field label="LOGO (optionnel)" color="#C9A227">
          <input ref={bLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBLogoFile}/>
          <button type="button" onClick={()=>bLogoRef.current?.click()} className="w-full flex items-center gap-4 p-3 rounded-2xl border-2 border-dashed active:scale-[0.98]" style={{ borderColor:bLogo?"#C9A227":"rgba(0,0,0,0.12)" }}>
            {bLogo
              ? <><img src={bLogo} alt="logo" className="w-14 h-14 rounded-xl object-contain bg-white border border-border flex-shrink-0"/>
                  <div className="flex-1 text-left"><p className="text-sm font-bold" style={{color:"#C9A227"}}>Logo sélectionné</p><p className="text-xs text-muted-foreground">Cliquer pour changer</p></div>
                  <button type="button" onClick={e=>{e.stopPropagation();setBLogo(null);}} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:"#ef444415"}}><X size={14} style={{color:"#ef4444"}}/></button></>
              : <><div className="w-14 h-14 rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><Camera size={22} className="text-muted-foreground"/></div>
                  <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Ajouter un logo</p><p className="text-xs text-muted-foreground">PNG, JPG — optionnel</p></div></>}
          </button>
        </Field>
        <Field label="PROPRIÉTAIRE (utilisateur existant)" color="#ef4444">
          {nonAdmin.length===0
            ? <div className="p-3 rounded-xl text-sm" style={{ background:"#ef444415", color:"#ef4444" }}>Aucun utilisateur — créez d'abord un compte dans l'onglet Utilisateurs</div>
            : <select value={bOwner} onChange={e=>setBOwner(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
                <option value="">-- Sélectionner --</option>
                {nonAdmin.map(u=><option key={u.id} value={u.id}>{u.nom} ({u.phone})</option>)}
              </select>
          }
        </Field>
        {bOwner&&nonAdmin.find(u=>u.id===bOwner)&&(
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"#C9A22715" }}>
            <CheckCircle size={15} style={{ color:"#C9A227" }}/>
            <p className="text-xs" style={{ color:"#C9A227" }}>Ce compte sera Propriétaire avec accès total au tenant</p>
          </div>
        )}
        <SubmitBtn color="#C9A227" label="Créer le tenant" onClick={submitBoutique} disabled={!bNom.trim()||!bOwner}/>
      </Modal>}

      {/* Edit boutique modal */}
      {editB&&<Modal title="Modifier le tenant" color="#3b82f6" onClose={()=>setEditB(null)}>
        <Field label="NOM DE LA BOUTIQUE" color="#3b82f6"><input value={eBNom} onChange={e=>setEBNom(e.target.value)} placeholder="Nom de la boutique" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitEditBoutique()}/></Field>
        <Field label="VILLE" color="#3b82f6"><input value={eBVille} onChange={e=>setEBVille(e.target.value)} placeholder="Ville" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitEditBoutique()}/></Field>
        <SubmitBtn color="#3b82f6" label="Enregistrer les modifications" onClick={submitEditBoutique} disabled={!eBNom.trim()}/>
      </Modal>}

      {/* Delete boutique confirmation */}
      {deleteB&&<Modal title="Supprimer le tenant" color="#ef4444" onClose={()=>setDeleteB(null)}>
        <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background:deleteB.color+"15" }}>
          <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black" style={{ background:deleteB.color+"22", color:deleteB.color, fontFamily:"'Nunito', sans-serif" }}>{deleteB.initials}</div>
          <div><p className="font-bold">{deleteB.nom}</p><p className="text-xs text-muted-foreground">{deleteB.ville}</p></div>
        </div>
        <div className="p-4 rounded-2xl" style={{ background:"#ef444415" }}>
          <p className="text-sm font-bold" style={{ color:"#ef4444" }}>⚠️ Cette action est irréversible</p>
          <p className="text-xs text-muted-foreground mt-1">Tous les produits, factures et données de ce tenant seront supprimés définitivement.</p>
        </div>
        <SubmitBtn color="#ef4444" label="Confirmer la suppression" onClick={()=>{ onDeleteBoutique(deleteB.id); setDeleteB(null); }}/>
      </Modal>}

      {/* Create user modal */}
      {newU&&<Modal title="Créer un utilisateur" color="#ef4444" onClose={()=>setNewU(false)}>
        <div className="p-3 rounded-xl text-xs" style={{ background:"#3b82f611", color:"#3b82f6" }}>
          💡 Créez d'abord le compte, puis assignez-le à un tenant depuis la vue Admin de chaque boutique.
        </div>
        <Field label="NOM COMPLET" color="#ef4444"><input value={uNom} onChange={e=>setUNom(e.target.value)} placeholder="Ex: Kadiatou Bah" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitUser()}/></Field>
        <Field label="NUMÉRO DE TÉLÉPHONE (identifiant unique)" color="#ef4444">
          <div className="relative"><Smartphone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input value={uPhone} onChange={e=>{const v=e.target.value;setUPhone(v.startsWith("+221 ")?v:"+221 ");}} placeholder="+221 77 000 0000" type="tel" className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&submitUser()}/>
          </div>
        </Field>
        <Field label="MOT DE PASSE" color="#ef4444"><input value={uPwd} onChange={e=>setUPwd(e.target.value)} placeholder="12 caractères minimum" minLength={12} type="password" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitUser()}/></Field>
        {groupes.length>0&&<Field label="GROUPE (optionnel)" color="#0891b2">
          <select value={uGroupe} onChange={e=>setUGroupe(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            <option value="">-- Aucun groupe --</option>
            {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}</option>)}
          </select>
        </Field>}
        {uGroupe&&<button type="button" onClick={()=>setUCompteMere(v=>!v)} className="flex items-center gap-3 w-full p-3 rounded-xl border border-border text-left" style={{ background:uCompteMere?"#7c3aed15":"transparent" }}>
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2" style={{ borderColor:"#7c3aed", background:uCompteMere?"#7c3aed":"transparent" }}>
            {uCompteMere&&<span className="text-white text-xs font-black">✓</span>}
          </div>
          <div><p className="text-sm font-bold" style={{ color:"#7c3aed" }}>Compte mère</p><p className="text-xs text-muted-foreground">Accès lecture à toutes les boutiques du groupe</p></div>
        </button>}
        <SubmitBtn color="#ef4444" label={creatingUser?"Création…":"Créer le compte"} onClick={submitUser} disabled={creatingUser||!uNom.trim()||!uPhone.trim()||!uPwd.trim()}/>
      </Modal>}

      {/* Reset password modal */}
      {resetTarget&&<Modal title="Réinitialiser le mot de passe" color="#C9A227" onClose={()=>{setResetTarget(null);setNewPwd("");setResetDone(false);}}>
        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background:resetTarget.color+"15" }}>
          <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:resetTarget.color+"22", color:resetTarget.color, fontFamily:"'Nunito', sans-serif" }}>{resetTarget.initials}</div>
          <div><p className="font-bold text-sm">{resetTarget.nom}</p><p className="text-xs text-muted-foreground">{resetTarget.phone}</p></div>
        </div>
        {resetDone
          ? <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background:SEM.success.bg }}><CheckCircle size={22} style={{ color:SEM.success.accent }}/><p className="font-bold text-sm" style={{ color:SEM.success.accent }}>Mot de passe réinitialisé ✓</p></div>
          : <>
            <Field label="NOUVEAU MOT DE PASSE" color="#C9A227">
              <div className="relative"><Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="12 caractères minimum" minLength={12} type={showP?"text":"password"} className={inputCls+" pl-11 pr-12"} autoFocus onKeyDown={e=>e.key==="Enter"&&submitReset()}/>
                <button onClick={()=>setShowP(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2">{showP?<EyeOff size={16} className="text-muted-foreground"/>:<Eye size={16} className="text-muted-foreground"/>}</button>
              </div>
            </Field>
            <SubmitBtn color="#C9A227" label="Confirmer" onClick={submitReset} disabled={newPwd.length<4}/>
          </>
        }
      </Modal>}

      {/* Edit user groupe / compte mère */}
      {editU&&<Modal title="Modifier le compte" color="#3b82f6" onClose={()=>setEditU(null)}>
        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background:editU.color+"15" }}>
          <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:editU.color+"22", color:editU.color, fontFamily:"'Nunito', sans-serif" }}>{editU.initials}</div>
          <div><p className="font-bold text-sm">{editU.nom}</p><p className="text-xs text-muted-foreground">{editU.phone}</p></div>
        </div>
        <Field label="GROUPE" color="#0891b2">
          <select value={editUGroupe} onChange={e=>setEditUGroupe(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            <option value="">-- Aucun groupe --</option>
            {groupes.map(g=><option key={g.id} value={g.id}>{g.nom}</option>)}
          </select>
        </Field>
        {editUGroupe&&<button type="button" onClick={()=>setEditUCompteMere(v=>!v)} className="flex items-center gap-3 w-full p-3 rounded-xl border border-border text-left" style={{ background:editUCompteMere?"#7c3aed15":"transparent" }}>
          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2" style={{ borderColor:"#7c3aed", background:editUCompteMere?"#7c3aed":"transparent" }}>
            {editUCompteMere&&<span className="text-white text-xs font-black">✓</span>}
          </div>
          <div><p className="text-sm font-bold" style={{ color:"#7c3aed" }}>Compte mère</p><p className="text-xs text-muted-foreground">Accès lecture à toutes les boutiques du groupe</p></div>
        </button>}
        <SubmitBtn color="#3b82f6" label="Enregistrer" onClick={()=>{ onUpdateUser(editU.id,{ groupeId:editUGroupe||undefined, isCompteMere:editUCompteMere||undefined }); setEditU(null); }}/>
      </Modal>}

      {/* Create group modal */}
      {newG&&<Modal title="Créer un groupe" color="#0891b2" onClose={()=>{setNewG(false);setGNom("");}}>
        <Field label="NOM DU GROUPE" color="#0891b2"><input value={gNom} onChange={e=>setGNom(e.target.value)} placeholder="Ex: Groupe Diallo" className={inputCls} autoFocus onKeyDown={e=>{ if(e.key==="Enter"&&gNom.trim()){ onCreateGroupe(gNom.trim()); setGNom(""); setNewG(false); }}}/></Field>
        <SubmitBtn color="#0891b2" label="Créer le groupe" onClick={()=>{ if(!gNom.trim()) return; onCreateGroupe(gNom.trim()); setGNom(""); setNewG(false); }} disabled={!gNom.trim()}/>
      </Modal>}

      {/* Rename group modal */}
      {editG&&<Modal title="Renommer le groupe" color="#3b82f6" onClose={()=>setEditG(null)}>
        <Field label="NOM DU GROUPE" color="#3b82f6"><input value={editGNom} onChange={e=>setEditGNom(e.target.value)} placeholder="Nom du groupe" className={inputCls} autoFocus onKeyDown={e=>{ if(e.key==="Enter"&&editGNom.trim()){ onUpdateGroupe(editG.id,editGNom.trim()); setEditG(null); }}}/></Field>
        <SubmitBtn color="#3b82f6" label="Enregistrer" onClick={()=>{ if(!editGNom.trim()) return; onUpdateGroupe(editG.id,editGNom.trim()); setEditG(null); }} disabled={!editGNom.trim()}/>
      </Modal>}

      {/* Delete group confirmation */}
      {deleteG&&<Modal title="Supprimer le groupe" color="#ef4444" onClose={()=>setDeleteG(null)}>
        <div className="p-4 rounded-2xl" style={{ background:"#0891b215" }}>
          <p className="font-bold text-sm">🔗 {deleteG.nom}</p>
          <p className="text-xs text-muted-foreground mt-1">{platformUsers.filter(u=>u.groupeId===deleteG.id).length} membre(s) seront retirés du groupe</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background:"#ef444415" }}>
          <p className="text-sm font-bold" style={{ color:"#ef4444" }}>⚠️ Cette action est irréversible</p>
          <p className="text-xs text-muted-foreground mt-1">Les comptes membres resteront actifs mais perdront leur appartenance au groupe.</p>
        </div>
        <SubmitBtn color="#ef4444" label="Confirmer la suppression" onClick={()=>{ onDeleteGroupe(deleteG.id); setDeleteG(null); setManageGId(null); }}/>
      </Modal>}
    </div>
  );
}

// ─── SCREEN: BOUTIQUE SELECT ──────────────────────────────────────────────────

function BoutiqueSelectScreen({ user, boutiques, assignments, groupes, allUsers, onSelect, onLogout, onBack }: {
  user: PlatformUser; boutiques: Boutique[]; assignments: BoutiqueAssignment[];
  groupes: Groupe[]; allUsers: PlatformUser[];
  onSelect: (b: Boutique, a: BoutiqueAssignment) => void; onLogout: () => void;
  onBack?: () => void;
}) {
  const available = assignments.map(a=>({ boutique:boutiques.find(b=>b.id===a.boutiqueId)!, a })).filter(x=>x.boutique);
  const groupeBoutiques: Boutique[] = (user.isCompteMere && user.groupeId)
    ? allUsers
        .filter(u => u.groupeId === user.groupeId && u.id !== user.id)
        .flatMap(u => u.assignments.filter(a => a.role === "Propriétaire").map(a => boutiques.find(b => b.id === a.boutiqueId)).filter(Boolean) as Boutique[])
    : [];
  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col" style={{ fontFamily:"'Inter', sans-serif" }}>
      <div className="flex items-center justify-between px-4 pt-10 pb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:"#EEE9D8" }}>
              <ArrowLeft size={18} className="text-muted-foreground"/>
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:user.color+"22", color:user.color, fontFamily:"'Nunito', sans-serif" }}>{user.initials}</div>
          <div><p className="font-bold">{user.nom}</p><p className="text-xs text-muted-foreground">{onBack ? "Changer de boutique" : "Choisissez votre boutique"}</p></div>
        </div>
        <button onClick={onLogout} className="p-2.5 rounded-xl" style={{ background:"#EEE9D8" }}><LogOut size={18} className="text-muted-foreground"/></button>
      </div>
      <div className="flex-1 px-4 space-y-3 pb-6">
        {available.length === 0 && groupeBoutiques.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background:"#C9A22722" }}><Store size={32} style={{ color:"#C9A227" }}/></div>
            <p className="font-black text-base" style={{ fontFamily:"'Nunito', sans-serif", color:"#C9A227" }}>Aucune boutique assignée</p>
            <p className="text-sm text-muted-foreground">Contactez votre administrateur pour être ajouté à une boutique.</p>
          </div>
        )}
        {available.length > 0 && (
          <>
            {groupeBoutiques.length > 0 && <p className="text-xs font-black text-muted-foreground uppercase tracking-widest px-1 pt-1">Ma boutique</p>}
            {available.map(({ boutique:b, a })=>(
              <button key={b.id} onClick={()=>onSelect(b,a)} className="w-full bg-card rounded-2xl p-5 border border-border text-left flex items-center gap-4 active:scale-[0.98]" style={{ boxShadow:`inset 3px 0 0 ${b.color}` }}>
                <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{b.nom}</p>
                  <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1.5 inline-block" style={{ background:user.color+"22", color:user.color }}>{a.role}</span>
                </div>
                <ChevronRight size={20} style={{ color:b.color }}/>
              </button>
            ))}
          </>
        )}
        {groupeBoutiques.length > 0 && (
          <>
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest px-1 pt-2">Boutiques du groupe</p>
            {groupeBoutiques.map(b=>{
              const readAssign: BoutiqueAssignment = { boutiqueId:b.id, role:"Compte Mère", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:false, charges:true, compta:true, vente:false, inventaire:false, marges:false } };
              return (
                <button key={b.id} onClick={()=>onSelect(b,readAssign)} className="w-full bg-card rounded-2xl p-5 border border-border text-left flex items-center gap-4 active:scale-[0.98]" style={{ boxShadow:`inset 3px 0 0 ${b.color}` }}>
                  <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.initials}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{b.nom}</p>
                    <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1.5 inline-block" style={{ background:"#7c3aed22", color:"#7c3aed" }}>Compte mère · Lecture</span>
                  </div>
                  <ChevronRight size={20} style={{ color:b.color }}/>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

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

  const inputCls = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring";

  const [downloading, setDownloading] = useState(false);

  function doPreview() {
    setGenerating(true);
    setTimeout(() => { openInvoicePDF(inv, boutique, clients); setGenerating(false); }, 100);
  }

  async function doDownload() {
    setDownloading(true);
    try { await downloadInvoicePDF(inv, boutique, clients); } catch { doPreview(); } finally { setDownloading(false); }
  }

  // ── Email ────────────────────────────────────────────────────────────────────
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailMailtoUrl, setEmailMailtoUrl] = useState(""); // shown as fallback button, not auto-redirected

  async function doEmail() {
    if (!emailAddr.trim()) return;
    setEmailSending(true); setEmailError(""); setEmailMailtoUrl("");
    const fmtN2 = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    const subject = `Facture ${inv.id} — ${boutique.nom}`;
    const html = buildInvoicePDFHtml(inv, boutique, clients);
    try {
      await sendInvoiceEmail({ to: emailAddr.trim(), subject, html, fromName: boutique.nom, fromEmail: boutique.email });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    } catch (e: any) {
      // Build the mailto URL but do NOT auto-redirect — show it as a fallback button
      const bodyText = `Bonjour ${inv.client},\n\nVeuillez trouver ci-joint votre facture N° ${inv.id} d'un montant de ${fmtN2(inv.montant)} F.`
        + (reste > 0 ? `\nMontant restant dû : ${fmtN2(reste)} F.` : `\nStatut : Payé.`)
        + `\n\nCordialement,\n${boutique.nom}`;
      const fallback = `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      setEmailMailtoUrl(fallback);
      // Extract a clean error message (strip internal stack noise)
      const raw = e?.message ?? "";
      const msg = raw.includes("503") ? "RESEND_API_KEY non configurée — envoi automatique indisponible."
        : raw.includes("413") || (raw.includes("422") && raw.toLowerCase().includes("too large")) ? "Le contenu de la facture est trop volumineux pour l'API e-mail."
        : raw.includes("422") ? `Expéditeur non vérifié sur Resend — vérifiez le domaine d'envoi dans votre tableau de bord Resend. (${raw})`
        : `Erreur d'envoi : ${raw || "inconnue"}`;
      setEmailError(msg);
    } finally {
      setEmailSending(false);
    }
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────────
  const [waSending, setWaSending] = useState(false);
  const [waError, setWaError] = useState("");

  async function doWhatsApp() {
    const rawPhone = (waPhone||phone).replace(/[\s\-().+]/g,"");
    if (!rawPhone) return;
    setWaSending(true); setWaError("");
    const fmtN2 = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    const statusLine = reste<=0 ? "Statut : Payé"
      : inv.acompte>0 ? `Acompte de ${fmtN2(inv.acompte)} F versé — reste dû : ${fmtN2(reste)} F`
      : "Statut : Impayé";
    let pdfUrl = "";
    try {
      const pdfBase64 = await generateInvoicePDFBase64(inv, boutique, clients);
      pdfUrl = await storePDFForSMS({ invoiceId: inv.id, boutiqueId: boutique.id, pdfBase64 });
    } catch (e: any) {
      const isStorage = e?.message?.includes("Bucket") || e?.message?.includes("invoice-pdfs");
      setWaError(isStorage
        ? "Lien PDF indisponible — bucket Supabase Storage non créé. Configurer dans Dashboard → Storage."
        : `Lien PDF non généré (${e?.message ?? "erreur inconnue"}) — le message WhatsApp sera envoyé sans lien.`
      );
    } finally {
      setWaSending(false);
    }
    const text = encodeURIComponent(
      `Bonjour ${inv.client}\n\nVoici votre facture *${inv.id}* de *${boutique.nom}* :\n` +
      `Total : *${fmtN2(inv.montant)} F*\n${statusLine}\nDate : ${inv.date}` +
      (pdfUrl ? `\n\nTélécharger le PDF (48h) : ${pdfUrl}` : "") +
      `\n\nMerci pour votre confiance`
    );
    window.open(`https://wa.me/${rawPhone}?text=${text}`, "_blank");
  }

  // ── SMS ──────────────────────────────────────────────────────────────────────
  const [smsSending, setSmsSending] = useState(false);
  const [smsLink, setSmsLink] = useState("");
  const [smsError, setSmsError] = useState("");

  async function doSMS() {
    const rawPhone = (smsPhone||phone).replace(/[\s\-()]/g,"");
    if (!rawPhone) return;
    const fmtN2 = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
    setSmsSending(true); setSmsLink(""); setSmsError("");
    let pdfUrl = "";
    try {
      const pdfBase64 = await generateInvoicePDFBase64(inv, boutique, clients);
      pdfUrl = await storePDFForSMS({ invoiceId: inv.id, boutiqueId: boutique.id, pdfBase64 });
      setSmsLink(pdfUrl);
    } catch (e: any) {
      const isStorage = e?.message?.includes("Bucket") || e?.message?.includes("invoice-pdfs");
      setSmsError(isStorage
        ? "Lien PDF indisponible — bucket Supabase Storage « invoice-pdfs » non créé. Le SMS sera envoyé sans lien."
        : `Génération du lien échouée (${e?.message ?? "erreur inconnue"}) — SMS envoyé sans lien PDF.`
      );
    } finally {
      setSmsSending(false); }
    const text = encodeURIComponent(
      `Facture ${inv.id} - ${boutique.nom} : ${fmtN2(inv.montant)} F`
      + (reste > 0 ? ` (reste: ${fmtN2(reste)} F)` : " (Payé)")
      + (pdfUrl ? ` PDF (48h): ${pdfUrl}` : "")
    );
    window.open(`sms:${rawPhone}?body=${text}`, "_self");
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
          <button onClick={doDownload} disabled={downloading||generating}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background:"#374151", color:"#fff" }}>
            {downloading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Génération PDF...</span></>
              : <><Download size={16}/><span>Télécharger le PDF</span></>}
          </button>
          <button onClick={doPreview} disabled={generating||downloading}
            className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#37415115", color:"#374151" }}>
            <Eye size={15}/><span>Aperçu dans le navigateur</span>
          </button>
        </div>
      )}

      {channel==="email"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#0ea5e910", border:"1px solid #0ea5e930" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#0284c7" }}>
              La facture est envoyée automatiquement via Resend. Nécessite la configuration du secret <strong>RESEND_API_KEY</strong> dans Supabase.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">ADRESSE E-MAIL DU CLIENT</label>
            <input value={emailAddr} onChange={e=>setEmailAddr(e.target.value)} placeholder="client@exemple.com" type="email" className={inputCls} autoFocus/>
            {boutique.email&&<p className="text-xs text-muted-foreground mt-1.5">Expéditeur : {boutique.email || "notifications@resend.dev"}</p>}
          </div>
          {emailError && (
            <div className="px-3 py-2.5 rounded-xl space-y-2" style={{ background:"#fef3c7", border:"1px solid #fcd34d" }}>
              <p className="text-xs font-bold" style={{ color:"#92400e" }}>{emailError}</p>
              {emailMailtoUrl && (
                <a href={emailMailtoUrl} className="flex items-center gap-1.5 text-xs font-black underline" style={{ color:"#b45309" }}>
                  <Mail size={12}/> Ouvrir le client e-mail manuellement
                </a>
              )}
            </div>
          )}
          <button onClick={doEmail} disabled={!emailAddr.trim()||emailSending}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background: emailSent ? "#16a34a" : "#0ea5e9", color:"#fff" }}>
            {emailSending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Envoi en cours…</span></> : emailSent ? <><CheckCircle size={16}/><span>Envoyé avec succès !</span></> : <><Mail size={16}/><span>Envoyer par e-mail</span></>}
          </button>
        </div>
      )}

      {channel==="whatsapp"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#16a34a10", border:"1px solid #16a34a30" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#15803d" }}>
              Un lien PDF hébergé (48h) est généré et inclus dans le message WhatsApp. Nécessite le bucket <strong>invoice-pdfs</strong> dans Supabase Storage.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">NUMÉRO WHATSAPP DU CLIENT</label>
            <input value={waPhone} onChange={e=>setWaPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls}/>
          </div>
          {waError && (
            <div className="px-3 py-2 rounded-xl" style={{ background:"#fef3c7", border:"1px solid #fcd34d" }}>
              <p className="text-xs font-bold" style={{ color:"#92400e" }}>{waError}</p>
            </div>
          )}
          <div className="px-3 py-3 rounded-xl text-xs leading-relaxed" style={{ background:"#f0fdf4", color:"#166534", border:"1px solid #bbf7d0", fontFamily:"monospace", whiteSpace:"pre-wrap" }}>{waPreview}</div>
          <button onClick={doWhatsApp} disabled={!(waPhone||phone).trim()||waSending}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#16a34a", color:"#fff" }}>
            {waSending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Génération du lien…</span></> : <><MessageCircle size={16}/><span>Envoyer via WhatsApp</span></>}
          </button>
        </div>
      )}

      {channel==="sms"&&(
        <div className="space-y-3">
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#7c3aed10", border:"1px solid #7c3aed30" }}>
            <p className="text-xs leading-relaxed" style={{ color:"#6d28d9" }}>
              Un lien de téléchargement temporaire (48h) est généré et inclus dans le SMS. Nécessite le bucket <strong>invoice-pdfs</strong> dans Supabase Storage.
            </p>
          </div>
          <div>
            <label className="text-xs font-black mb-2 block tracking-wider text-muted-foreground">NUMÉRO DE TÉLÉPHONE DU CLIENT</label>
            <input value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls}/>
          </div>
          {smsError && (
            <div className="px-3 py-2 rounded-xl" style={{ background:"#fef3c7", border:"1px solid #fcd34d" }}>
              <p className="text-xs font-bold" style={{ color:"#92400e" }}>{smsError}</p>
            </div>
          )}
          {smsLink && <div className="px-3 py-2 rounded-xl text-xs flex items-start gap-2" style={{ background:"#f0fdf4", color:"#166534", border:"1px solid #bbf7d0" }}><CheckCircle size={12} className="flex-shrink-0 mt-0.5"/><span>Lien PDF généré (48h) : <a href={smsLink} target="_blank" rel="noreferrer" className="underline break-all">{smsLink.slice(0,55)}…</a></span></div>}
          <button onClick={doSMS} disabled={!(smsPhone||phone).trim()||smsSending}
            className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
            style={{ background:"#7c3aed", color:"#fff" }}>
            {smsSending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Génération du lien…</span></> : <><Smartphone size={16}/><span>Envoyer par SMS</span></>}
          </button>
        </div>
      )}
    </Modal>
  );
}


function ChargesView({ boutique, onUpdate, logAction }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const readOnly = useReadOnly();
  const charges = boutique.charges ?? [];
  const suppliers = boutique.suppliers;
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<ChargeCategorie|"all">("all");
  const [label, setLabel] = useState("");
  const [montant, setMontant] = useState("");
  const [cat, setCat] = useState<ChargeCategorie>("Loyer");
  const [recurrence, setRecurrence] = useState<Charge["recurrence"]>("unique");
  const [note, setNote] = useState("");
  const [fourn, setFourn] = useState<string>("");
  const [editCharge, setEditCharge] = useState<Charge|null>(null);
  const [eLabel,setELabel]=useState(""); const [eMontant,setEMontant]=useState(""); const [eCat,setECat]=useState<ChargeCategorie>("Loyer"); const [eRecurrence,setERecurrence]=useState<Charge["recurrence"]>("unique"); const [eNote,setENote]=useState(""); const [eFourn,setEFourn]=useState("");
  // B2B debt payment state (mirrors FournisseursView)
  const [b2bPayChargeCv,setB2bPayChargeCv]=useState<Charge|null>(null);
  const [b2bPayAmtCv,setB2bPayAmtCv]=useState("");
  const [b2bPayDoneCv,setB2bPayDoneCv]=useState(false);

  function submitB2BPaymentCv() {
    if (!b2bPayChargeCv) return;
    const montant = Number(b2bPayAmtCv);
    if (!montant || montant <= 0) return;
    const reste = b2bPayChargeCv.montant - (b2bPayChargeCv.acompte ?? 0);
    const paid = Math.min(montant, reste);
    const newAcompte = (b2bPayChargeCv.acompte ?? 0) + paid;
    const newStatus: Charge["status"] = newAcompte >= b2bPayChargeCv.montant ? "payé" : "partiel";
    onUpdate({ charges: charges.map(c => c.id!==b2bPayChargeCv.id ? c : { ...c, acompte:newAcompte, status:newStatus }) });
    logAction("Paiement B2B (Charges)", `${b2bPayChargeCv.fournisseur} — ${fmt(paid)}`, "💰");
    setB2bPayDoneCv(true);
    setTimeout(() => { setB2bPayChargeCv(null); setB2bPayAmtCv(""); setB2bPayDoneCv(false); }, 1800);
  }

  function openEditCharge(c: Charge) {
    setELabel(c.label); setEMontant(String(c.montant)); setECat(c.categorie); setERecurrence(c.recurrence); setENote(c.note??""); setEFourn(c.fournisseur??"");
    setEditCharge(c);
  }
  function saveEditCharge() {
    if (!editCharge||!eLabel.trim()||!eMontant) return;
    onUpdate({ charges: charges.map(x=>x.id!==editCharge.id?x:{ ...x, label:eLabel.trim(), montant:Number(eMontant), categorie:eCat, recurrence:eRecurrence, note:eNote.trim()||undefined, fournisseur:(eCat==="Achat stock"&&eFourn)?eFourn:undefined }) });
    logAction("Charge modifiée",eLabel.trim(),"✏️");
    setEditCharge(null);
  }

  const filtered = charges.filter(c =>
    (catFilter === "all" || c.categorie === catFilter) &&
    c.label.toLowerCase().includes(search.toLowerCase())
  ).sort((a,b) => b.id - a.id);

  const totalMois = charges.reduce((s,c) => s + (c.isB2BDebt ? (c.acompte??0) : c.montant), 0);
  const byCategorie = CHARGE_CATS.map(cat => ({
    name: cat, value: charges.filter(c=>c.categorie===cat).reduce((s,c)=>s+(c.isB2BDebt?(c.acompte??0):c.montant),0), color: CHARGE_COLORS[cat]
  })).filter(c=>c.value>0);

  function submit() {
    if (!label.trim() || !montant) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
    const dateRaw = now.toISOString().split("T")[0];
    const linkedFourn = (cat === "Achat stock" && fourn) ? fourn : undefined;
    const newCharge: Charge = { id: Date.now(), label: label.trim(), montant: Number(montant), date: dateStr, dateRaw, categorie: cat, recurrence, note: note.trim()||undefined, fournisseur: linkedFourn };
    onUpdate({ charges: [...charges, newCharge] });
    logAction("Nouvelle charge", `${label.trim()} · ${fmt(Number(montant))}${linkedFourn?" → "+linkedFourn:""}`, "💸");
    setLabel(""); setMontant(""); setNote(""); setFourn(""); setModal(false);
  }
  function deleteCharge(id: number) {
    onUpdate({ charges: charges.filter(c=>c.id!==id) });
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2"><Wallet size={18} style={{color:"#ef4444"}}/><span className="text-xs font-bold text-muted-foreground">TOTAL CHARGES</span></div>
          <p className="text-2xl font-black" style={{fontFamily:"'Nunito',sans-serif",color:"#ef4444"}}>{fmt(totalMois)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{charges.length} entrées</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2"><RefreshCw size={18} style={{color:"#6366f1"}}/><span className="text-xs font-bold text-muted-foreground">RÉCURRENTES</span></div>
          <p className="text-2xl font-black" style={{fontFamily:"'Nunito',sans-serif",color:"#6366f1"}}>{fmt(charges.filter(c=>c.recurrence!=="unique").reduce((s,c)=>s+c.montant,0))}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{charges.filter(c=>c.recurrence!=="unique").length} charges fixes</p>
        </div>
      </div>

      {/* Pie chart */}
      {byCategorie.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-sm font-bold mb-3">Répartition des charges</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={byCategorie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                {byCategorie.map((entry,i) => <Cell key={`charges-cell-${i}`} fill={entry.color}/>)}
              </Pie>
              <Tooltip formatter={(v:number) => fmt(v)} contentStyle={{borderRadius:12,border:"1px solid var(--border)",fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {byCategorie.map((entry,i)=>(
              <div key={`charges-legend-${i}`} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:entry.color}}/>
                <span className="text-xs text-muted-foreground">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher une charge…" className={inputCls+" pl-11"}/></div>
      <div className="flex gap-2" style={{overflowX:"auto",scrollbarWidth:"none"}}>
        <button onClick={()=>setCatFilter("all")} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{background:catFilter==="all"?"#1f2937":"#f3f4f6",color:catFilter==="all"?"#fff":"#374151"}}>Tout</button>
        {CHARGE_CATS.map(c=>(
          <button key={c} onClick={()=>setCatFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{background:catFilter===c?"#1f2937":"#f3f4f6",color:catFilter===c?"#fff":"#374151"}}>{c}</button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">Aucune charge enregistrée</div>}
        {filtered.map(c => {
          const isDebt = c.isB2BDebt;
          const debtReste = isDebt ? c.montant - (c.acompte ?? 0) : 0;
          const debtStatus = c.status;
          const debtPaid = debtStatus === "payé";
          const debtPartiel = debtStatus === "partiel";
          const statusBg = debtPaid ? "#f0fdf4" : debtPartiel ? "#fffbeb" : "#fef2f2";
          const statusColor = debtPaid ? "#16a34a" : debtPartiel ? "#d97706" : "#ef4444";
          const statusLabel = debtPaid ? "PAYÉ" : debtPartiel ? "PARTIEL" : "EN ATTENTE";
          return (
          <div key={c.id} className="bg-card rounded-2xl border border-border overflow-hidden" style={isDebt&&!debtPaid?{borderColor:statusColor+"40"}:{}}>
            <div className="flex items-center gap-3 px-4 py-3" style={isDebt?{background:statusBg}:{}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:CHARGE_COLORS[c.categorie]+"22"}}>
                <Wallet size={18} style={{color:CHARGE_COLORS[c.categorie]}}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm truncate">{c.label}</p>
                  {isDebt && <span className="text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{background:statusColor+"20",color:statusColor}}>{statusLabel}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:CHARGE_COLORS[c.categorie]+"22",color:CHARGE_COLORS[c.categorie]}}>{c.categorie}</span>
                  {!isDebt && c.recurrence !== "unique" && <span className="text-xs text-muted-foreground">↺ {c.recurrence}</span>}
                  {c.fournisseur && <span className="text-xs font-bold" style={{color:SEM.neutral.accent}}>→ {c.fournisseur}</span>}
                  <span className="text-xs text-muted-foreground">{c.date}</span>
                  {isDebt && c.note && <span className="text-xs text-muted-foreground truncate">{c.note}</span>}
                </div>
                {isDebt && debtPartiel && <p className="text-xs font-bold mt-0.5" style={{color:"#d97706"}}>Payé: {fmt(c.acompte??0)} · Reste: {fmt(debtReste)}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-base" style={{color:isDebt?statusColor:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(c.montant)}</p>
                <div className="flex gap-1 mt-1 justify-end">
                  {isDebt && !debtPaid && !readOnly ? (
                    <button onClick={()=>{setB2bPayChargeCv(c);setB2bPayAmtCv(String(debtReste));setB2bPayDoneCv(false);}} className="px-2 py-1 rounded-lg text-xs font-bold" style={{background:"#1a1a1a",color:"#fff"}}>Payer</button>
                  ) : !isDebt ? (
                    <>
                      <button onClick={()=>openEditCharge(c)} className="p-1 rounded-lg active:scale-90" style={{background:"#37415115"}}><Edit2 size={13} style={{color:"#374151"}}/></button>
                      <button onClick={()=>deleteCharge(c.id)} className="p-1 rounded-lg active:scale-90" style={{background:"#ef444415"}}><Trash2 size={13} style={{color:"#ef4444"}}/></button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {!readOnly && <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{background:"#ef4444",boxShadow:"0 0 24px #ef444460"}}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>}

      {modal && <Modal title="Nouvelle charge" color="#374151" onClose={()=>setModal(false)}>
        <Field label="LIBELLÉ"><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ex: Loyer boutique" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="MONTANT (F CFA)"><input value={montant} onChange={e=>setMontant(e.target.value)} type="number" placeholder="Ex: 150 000" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="CATÉGORIE">
          <div className="flex flex-wrap gap-2">
            {CHARGE_CATS.map(c=><button key={c} type="button" onClick={()=>setCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{background:cat===c?"#1f2937":"#f3f4f6",color:cat===c?"#fff":"#374151"}}>{c}</button>)}
          </div>
        </Field>
        <Field label="RÉCURRENCE">
          <div className="flex gap-2">
            {(["unique","mensuelle","hebdomadaire"] as Charge["recurrence"][]).map(r=>(
              <button key={r} type="button" onClick={()=>setRecurrence(r)} className="flex-1 py-3 rounded-xl text-xs font-bold capitalize" style={{background:recurrence===r?"#ef4444":"#EEE9D8",color:recurrence===r?"#fff":"#6b7280"}}>{r}</button>
            ))}
          </div>
        </Field>
        {cat === "Achat stock" && suppliers.length > 0 && (
          <Field label="VERSEMENT AU FOURNISSEUR">
            <div className="flex flex-col gap-2">
              <button type="button" onClick={()=>setFourn("")} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium" style={{background:!fourn?"#f3f4f6":"transparent",color:!fourn?"#374151":"#6b7280",fontWeight:!fourn?700:400}}>Aucun lien fournisseur</button>
              {suppliers.map(s => {
                const bal = supplierBalance(s.nom, boutique.entries, boutique.charges);
                return (
                  <button key={s.id} type="button" onClick={()=>setFourn(s.nom)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{background:fourn===s.nom?s.color+"22":"#EEE9D8",border:fourn===s.nom?`2px solid ${s.color}`:"2px solid transparent"}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{background:s.color}}>{s.initials}</div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold">{s.nom}</p>
                      {bal > 0 && <p className="text-xs font-bold" style={{color:"#ef4444"}}>Solde dû : {fmt(bal)}</p>}
                      {bal === 0 && <p className="text-xs text-muted-foreground">Soldé ✓</p>}
                    </div>
                    {fourn===s.nom && <CheckCircle size={16} style={{color:s.color}}/>}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="NOTE (optionnel)"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Remarque…" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <SubmitBtn color={boutique.color} label="Enregistrer la charge" onClick={submit}/>
      </Modal>}
      {editCharge&&<Modal title="Modifier la charge" color="#374151" onClose={()=>setEditCharge(null)}>
        <Field label="LIBELLÉ"><input value={eLabel} onChange={e=>setELabel(e.target.value)} className={inputCls} autoFocus/></Field>
        <Field label="MONTANT (F CFA)"><input value={eMontant} onChange={e=>setEMontant(e.target.value)} type="number" min="0" className={inputCls}/></Field>
        <Field label="CATÉGORIE">
          <div className="grid grid-cols-2 gap-2">{CHARGE_CATS.map(cc=><button key={cc} onClick={()=>setECat(cc)} className="py-2.5 rounded-xl text-xs font-bold text-left px-3" style={{background:eCat===cc?boutique.color:"#EEE9D8",color:eCat===cc?"#fff":"#6b7280"}}>{cc}</button>)}</div>
        </Field>
        <Field label="RÉCURRENCE">
          <div className="grid grid-cols-3 gap-2">{(["unique","mensuelle","hebdomadaire"] as const).map(r=><button key={r} onClick={()=>setERecurrence(r)} className="py-2.5 rounded-xl text-xs font-bold capitalize" style={{background:eRecurrence===r?"#1f2937":"#EEE9D8",color:eRecurrence===r?"#fff":"#6b7280"}}>{r}</button>)}</div>
        </Field>
        {eCat==="Achat stock"&&<Field label="FOURNISSEUR"><select value={eFourn} onChange={e=>setEFourn(e.target.value)} className={inputCls}><option value="">— aucun —</option>{suppliers.map(s=><option key={s.id} value={s.nom}>{s.nom}</option>)}</select></Field>}
        <Field label="NOTE (optionnel)"><input value={eNote} onChange={e=>setENote(e.target.value)} className={inputCls} placeholder="Remarque…"/></Field>
        <SubmitBtn color={boutique.color} label="Enregistrer" onClick={saveEditCharge} disabled={!eLabel.trim()||!eMontant}/>
      </Modal>}

      {/* B2B debt payment modal from ChargesView */}
      {b2bPayChargeCv&&<Modal title="Régler la dette B2B" color="#d97706" onClose={()=>{setB2bPayChargeCv(null);setB2bPayAmtCv("");setB2bPayDoneCv(false);}}>
        <div className="px-4 py-3 rounded-2xl mb-2" style={{ background:"#fffbeb", border:"1px solid #d9770640" }}>
          <p className="text-sm font-bold">{b2bPayChargeCv.label}</p>
          {b2bPayChargeCv.note&&<p className="text-xs text-muted-foreground mt-0.5">{b2bPayChargeCv.note}</p>}
          <div className="flex justify-between mt-2"><span className="text-xs font-bold text-muted-foreground">Total</span><span className="text-sm font-black">{fmt(b2bPayChargeCv.montant)}</span></div>
          <div className="flex justify-between"><span className="text-xs font-bold text-muted-foreground">Déjà payé</span><span className="text-sm font-black" style={{color:SEM.success.text}}>{fmt(b2bPayChargeCv.acompte??0)}</span></div>
          <div className="flex justify-between border-t border-amber-200 mt-1 pt-1"><span className="text-xs font-black" style={{color:"#d97706"}}>Reste dû</span><span className="text-sm font-black" style={{color:"#d97706"}}>{fmt(b2bPayChargeCv.montant-(b2bPayChargeCv.acompte??0))}</span></div>
        </div>
        {b2bPayDoneCv ? (
          <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:SEM.success.bg}}>
            <span className="text-xl">✅</span><span className="font-black" style={{color:SEM.success.text}}>Paiement enregistré</span>
          </div>
        ) : (
          <>
            <Field label="MONTANT DU PAIEMENT">
              <div className="relative"><input type="number" value={b2bPayAmtCv} onChange={e=>setB2bPayAmtCv(e.target.value)} className={inputCls+" pr-10"} placeholder="0"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">F</span></div>
            </Field>
            <SubmitBtn color="#d97706" label="Confirmer le paiement" onClick={submitB2BPaymentCv} disabled={!Number(b2bPayAmtCv)||Number(b2bPayAmtCv)<=0}/>
          </>
        )}
      </Modal>}
    </div>
  );
}

// ─── VIEW: DASHBOARD ─────────────────────────────────────────────────────────

type DashPeriod = "jour" | "semaine" | "mois" | "annee" | "custom";

function filterByPeriod<T extends { dateRaw?: string; date?: string }>(items: T[], period: DashPeriod, customFrom: string, customTo: string): T[] {
  const now = new Date();
  const toDate = (d: string) => new Date(d);
  return items.filter(item => {
    const raw = (item as any).dateRaw ?? (item as any).date ?? "";
    if (!raw) return true;
    // Try parsing raw date (YYYY-MM-DD preferred, else French short like "20 Jul")
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) { d = toDate(raw); }
    else {
      const months: Record<string,number> = {jan:0,fév:1,fev:1,mar:2,avr:3,mai:4,jun:5,jui:6,jul:6,aoû:7,aou:7,sep:8,oct:9,nov:10,déc:11,dec:11};
      const parts = raw.toLowerCase().replace(" · ", " ").split(" ");
      const day = parseInt(parts[0]); const mon = months[parts[1]?.slice(0,3)] ?? now.getMonth();
      d = new Date(now.getFullYear(), mon, day);
    }
    if (isNaN(d.getTime())) return true;
    if (period === "jour") { return d.toDateString() === now.toDateString(); }
    if (period === "semaine") { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
    if (period === "mois") { return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); }
    if (period === "annee") { return d.getFullYear()===now.getFullYear(); }
    if (period === "custom" && customFrom && customTo) { return d >= toDate(customFrom) && d <= toDate(customTo); }
    return true;
  });
}

function DashboardView({ boutique, onNavigate }: { boutique: Boutique; onNavigate: (tab: Tab, filter?: Record<string,string>) => void }) {
  const { products, entries, clients, invoices } = boutique;
  const charges = boutique.charges ?? [];
  const [period, setPeriod] = useState<DashPeriod>("jour");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const paymentEvents = invoicePaymentEvents(invoices);
  const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo)
    .filter(payment => payment.invoiceType !== "Transfert interne" && payment.invoiceType !== "B2B Achat");
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);

  // ── Robust date parser ────────────────────────────────────────────────────────
  function parseInvDate(inv: Invoice): Date {
    const raw = (inv as any).dateRaw ?? inv.date ?? "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw);
    const FR_MON: Record<string,number> = {jan:0,fév:1,fev:1,mar:2,avr:3,mai:4,jun:5,jui:6,jul:6,aoû:7,aou:7,sep:8,oct:9,nov:10,déc:11,dec:11};
    const parts = raw.toLowerCase().replace(" · "," ").split(" ");
    const day = parseInt(parts[0]); const mon = FR_MON[parts[1]?.slice(0,3)] ?? new Date().getMonth();
    const yr = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
    return new Date(yr, mon, isNaN(day) ? 1 : day);
  }

  // Previous period for comparison
  const prevInv = (() => {
    const now = new Date();
    if (period === "jour") {
      const y = new Date(now); y.setDate(now.getDate()-1);
      return invoices.filter(inv => { const d = parseInvDate(inv); return d.toDateString() === y.toDateString(); });
    }
    if (period === "semaine") {
      const w0 = new Date(now); w0.setDate(now.getDate()-14);
      const w1 = new Date(now); w1.setDate(now.getDate()-7);
      return invoices.filter(inv => { const d = parseInvDate(inv); return d >= w0 && d < w1; });
    }
    if (period === "mois") {
      const pm = now.getMonth() === 0 ? 11 : now.getMonth()-1;
      const py = now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear();
      return invoices.filter(inv => { const d = parseInvDate(inv); return d.getMonth()===pm && d.getFullYear()===py; });
    }
    if (period === "annee") {
      return invoices.filter(inv => { const d = parseInvDate(inv); return d.getFullYear()===now.getFullYear()-1; });
    }
    return [];
  })();
  const prevPayments = (() => {
    const now = new Date();
    return paymentEvents.filter(payment => {
      if (payment.invoiceType === "Transfert interne" || payment.invoiceType === "B2B Achat") return false;
      const d = new Date(payment.paidAt);
      if (period === "jour") { const y=new Date(now); y.setDate(now.getDate()-1); return d.toDateString()===y.toDateString(); }
      if (period === "semaine") { const w0=new Date(now); w0.setDate(now.getDate()-14); const w1=new Date(now); w1.setDate(now.getDate()-7); return d>=w0&&d<w1; }
      if (period === "mois") { const pm=now.getMonth()===0?11:now.getMonth()-1; const py=now.getMonth()===0?now.getFullYear()-1:now.getFullYear(); return d.getMonth()===pm&&d.getFullYear()===py; }
      if (period === "annee") return d.getFullYear()===now.getFullYear()-1;
      return false;
    });
  })();
  function trend(curr: number, prev: number): { delta: number; pct: string; up: boolean } | null {
    if (prev === 0) return null;
    const delta = curr - prev;
    const pct = Math.round(Math.abs(delta/prev)*100);
    return { delta, pct: pct + "%", up: delta >= 0 };
  }

  const caInv       = filtInv.filter(i => i.type !== "Transfert interne" && i.type !== "B2B Achat");
  const ca          = filtPayments.reduce((sum,payment) => sum + payment.signedAmount, 0);
  const caTotal     = caInv.reduce((s,i) => s + signedInvoiceAmount(i), 0);
  // B2B debt charges count only their paid portion (acompte); regular charges count fully
  const totalCharges= filtCh.reduce((s,c) => s + (c.isB2BDebt ? (c.acompte ?? 0) : c.montant), 0);
  const margeBrute  = ca - totalCharges;
  const prevCa      = prevPayments.reduce((sum,payment) => sum + payment.signedAmount, 0);
  const prevTotal   = prevInv.filter(i => i.type !== "Transfert interne" && i.type !== "B2B Achat").reduce((s,i) => s + signedInvoiceAmount(i), 0);
  const trendCa     = trend(ca, prevCa);
  const trendTotal  = trend(caTotal, prevTotal);
  const margeNette  = margeBrute; // can extend with taxes
  const tauxMarge   = ca > 0 ? Math.round((margeBrute/ca)*100) : 0;
  const impayées    = caInv.filter(i=>i.status!=="payé");
  const totalImpayé = impayées.reduce((s,i)=>s+invoiceRemainingAmount(i),0);
  const totalQty    = products.reduce((s,p)=>s+productQty(p.id,entries),0);
  const rupture     = products.filter(p=>productQty(p.id,entries)<=0).length;
  const grossistes  = clients.filter(c=>c.type==="Grossiste").length;

  // Pie: CA vs Charges vs Marge
  const pieData = [
    { name:"Encaissé", value:ca, color:"#475569" },
    { name:"Charges",  value:totalCharges, color:"#ef4444" },
  ].filter(d=>d.value>0);

  // Bar chart: group invoices by label depending on period
  const barData = (() => {
    if (period === "annee") {
      // Dynamic: sum encaissé by month for current year
      const now = new Date();
      const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
      const yearPayments = paymentEvents.filter(payment => new Date(payment.paidAt).getFullYear() === now.getFullYear());
      return MONTHS.map((m, idx) => ({
        m,
        v: Math.round(yearPayments.filter(payment => new Date(payment.paidAt).getMonth() === idx).reduce((sum,payment)=>sum+payment.signedAmount,0) / 1000)
      }));
    }
    // group by day of week for semaine (robust parsing)
    if (period === "semaine") {
      const days = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      return days.map((d,i) => ({
        m: d,
        v: Math.round(filtPayments.filter(payment => (new Date(payment.paidAt).getDay()+6)%7 === i).reduce((sum,payment)=>sum+payment.signedAmount,0) / 1000)
      }));
    }
    // group by date for mois/jour/custom
    const map = new Map<string,number>();
    filtPayments.forEach(payment => { const k = new Date(payment.paidAt).toLocaleDateString("fr-FR"); map.set(k,(map.get(k)??0)+payment.signedAmount); });
    return Array.from(map.entries()).slice(-10).map(([m,v])=>({ m, v:Math.round(v/1000) }));
  })();

  const kpis: Array<{ label:string; value:string; icon:React.ElementType; color:string; sub:string; tab:Tab; filter?:Record<string,string> }> = [
    { label:"Stock",   value:`${totalQty} pcs`, icon:Boxes,       color:SEM.neutral.accent, sub:`${rupture} en rupture`,        tab:"stock",    filter:{ stockFilter:"critical" } },
    { label:"Clients", value:`${clients.length}`,icon:Users,       color:SEM.neutral.accent, sub:`${grossistes} grossistes`,     tab:"clients",  filter:{ clientTab:"Grossiste" } },
    { label:"Impayés", value:fmt(totalImpayé),   icon:CreditCard,  color:SEM.danger.accent,  sub:`${impayées.length} factures`,  tab:"factures", filter:{ statusFilter:"impayé" } },
    { label:"Charges", value:fmt(totalCharges),  icon:TrendingDown,color:SEM.neutral.accent, sub:`${filtCh.length} entrées`,     tab:"charges" },
  ];

  const periodBtns: Array<{id:DashPeriod;label:string}> = [
    {id:"jour",label:"Jour"},{id:"semaine",label:"Sem."},{id:"mois",label:"Mois"},{id:"annee",label:"An"},{id:"custom",label:"📅"},
  ];

  return (
    <div className="space-y-4 pb-4">
      {/* Period selector */}
      <div className="flex gap-1.5 bg-card rounded-2xl p-1.5 border border-border">
        {periodBtns.map(p=>(
          <button key={p.id} onClick={()=>setPeriod(p.id)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{background:period===p.id?"#1f2937":"transparent",color:period===p.id?"#fff":"#6b7280"}}>
            {p.label}
          </button>
        ))}
      </div>
      {period==="custom" && (
        <div className="flex gap-2">
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">DU</label><input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className={inputCls}/></div>
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">AU</label><input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className={inputCls}/></div>
        </div>
      )}

      {/* Margin summary */}
      <div className="bg-card rounded-2xl p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-sm">Résultat de la période</p>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{background:margeBrute>=0?SEM.success.bg:"#ef444422",color:margeBrute>=0?SEM.success.accent:SEM.danger.accent}}>{tauxMarge}% marge</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {label:"CA encaissé · paiements", value:ca, color:"#1f2937", t:trendCa},
            {label:"CA facturé · factures",  value:caTotal, color:"#475569", t:trendTotal},
            {label:"Marge nette", value:margeBrute, color:margeBrute>=0?SEM.success.accent:SEM.danger.accent, t:null},
          ].map(m=>(
            <div key={m.label} className="rounded-xl p-2.5 text-center" style={{background:m.color+"11"}}>
              <p className="text-base font-black leading-tight" style={{color:m.color,fontFamily:"'Nunito',sans-serif"}}>{fmt(m.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
              {m.t && (
                <p className="text-xs font-bold mt-0.5" style={{color:m.t.up?"#16a34a":"#dc2626"}}>
                  {m.t.up?"↑":"↓"} {m.t.pct}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k=>{
          const isSemantic = k.color===SEM.danger.accent||k.color===SEM.success.accent||k.color===SEM.warning.accent;
          return (
          <button key={k.label} onClick={()=>onNavigate(k.tab, k.filter)}
            className="bg-card rounded-2xl p-4 border text-left active:scale-[0.97] transition-transform"
            style={{ borderColor: isSemantic ? k.color+"44" : "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:isSemantic?k.color+"15":"#f3f4f6"}}>
                <k.icon size={22} style={{color:isSemantic?k.color:"#374151"}}/>
              </div>
              <ArrowUpRight size={14} style={{color:isSemantic?k.color:"#9ca3af"}}/>
            </div>
            <p className="text-lg font-black leading-tight" style={{fontFamily:"'Nunito',sans-serif",color:isSemantic?k.color:"#1f2937"}}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
            <p className="text-xs font-bold mt-1" style={{color:isSemantic?k.color:"#6b7280"}}>{k.sub}</p>
          </button>);
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Bar: ventes */}
        {barData.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-sm">Ventes <span className="text-muted-foreground font-normal text-xs">(×1 000 F)</span></p><BarChart2 size={16} className="text-muted-foreground"/></div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart key={`bar-${period}`} data={barData} barSize={20} margin={{top:4,right:0,left:0,bottom:0}}>
                <XAxis dataKey="m" tick={{fill:"#6b7280",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip cursor={{fill:"rgba(0,0,0,0.04)"}} content={({active,payload})=>active&&payload?.length?<div className="bg-popover border border-border rounded-xl px-3 py-1.5 text-xs font-bold" style={{color:"#1f2937"}}>{payload[0].value}k F</div>:null}/>
                <Bar dataKey="v" radius={[4,4,0,0]}>
                  {barData.map((_d,i)=><Cell key={`bar-cell-${i}`} fill={i===barData.length-1?"#1f2937":"#cbd5e1"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Pie: CA vs Charges */}
        {pieData.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-sm">Répartition</p><PieChartIcon size={16} className="text-muted-foreground"/></div>
            <ResponsiveContainer width="100%" height={110}>
              <PieChart key={`pie-${period}`}>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={52} paddingAngle={3}>
                  {pieData.map((e,i)=><Cell key={`pie-cell-${period}-${i}`} fill={e.color}/>)}
                </Pie>
                <Tooltip formatter={(v:number)=>fmt(v)} contentStyle={{borderRadius:12,border:"1px solid var(--border)",fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
              {pieData.map((e,i)=>(
                <div key={`pie-legend-${period}-${i}`} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:e.color}}/>
                  <span className="text-xs text-muted-foreground">{e.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent invoices */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3"><p className="font-bold text-sm">Factures récentes</p><button onClick={()=>onNavigate("factures")} className="text-xs font-bold" style={{color:SEM.neutral.accent}}>Voir tout →</button></div>
        {[...invoices].reverse().slice(0,4).map(inv=>{const [tc,bc]=invBadge(inv.status);return(
          <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p></div>
            <div className="text-right"><p className="text-sm font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(inv.montant)}</p><span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize" style={{background:bc,color:tc}}>{inv.status}</span></div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── VIEW: TRANSFERTS B2B ────────────────────────────────────────────────────

function TransfertsView({ boutique, allBoutiques, platformUsers, groupes, currentUser, onUpdate, onUpdateOtherBoutique, logAction }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[]; groupes: Groupe[];
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  onUpdateOtherBoutique: (boutiqueId: string, u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const readOnly = useReadOnly();
  const sendNotif = useNotif();
  type MainPanel = "annuaire"|"entrants"|"sortants"|"historique";
  type CrStep = "partner"|"boutique_dest"|"items"|"confirm";
  type CrItem = { productId:number; nom:string; unit:string; stockQty:number; qty:number; prixCession:number; remise:number };
  const [panel, setPanel] = useState<MainPanel>("entrants");
  // Annuaire
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addPhoneResult, setAddPhoneResult] = useState<{found:Boutique[];nom:string}|null>(null);
  // Création
  const [crStep, setCrStep] = useState<CrStep>("partner");
  const [crPartner, setCrPartner] = useState<BoutiquePartner|null>(null);
  const [crDestBoutique, setCrDestBoutique] = useState<Boutique|null>(null);
  const [crItems, setCrItems] = useState<CrItem[]>([]);
  const [crNote, setCrNote] = useState("");
  const [crSearch, setCrSearch] = useState("");
  // Modals
  const [viewTransfer, setViewTransfer] = useState<Transfer|null>(null);
  // History filters
  const [hPeriod, setHPeriod] = useState("");
  const [hPartner, setHPartner] = useState("");
  const [hStatus, setHStatus] = useState<TransferStatus|"">("");
  const [hInvoice, setHInvoice] = useState("");
  // Création overlay toggle
  const [showCreer, setShowCreer] = useState(false);

  const transfers = boutique.transfers ?? [];
  const partners  = boutique.partners ?? [];
  const inbound   = transfers.filter(t => t.direction === "inbound");
  const outbound  = transfers.filter(t => t.direction === "outbound");

  // Legacy pendingTransfers bridged to new format
  const legacyPending = (boutique.pendingTransfers ?? []).map(pt => ({
    id: pt.id, direction: "inbound" as const,
    fromBoutiqueId: pt.fromBoutiqueId, fromBoutiqueNom: pt.fromBoutiqueNom,
    toBoutiqueId: boutique.id, toBoutiqueNom: boutique.nom,
    date: pt.date, dateRaw: pt.date,
    items: pt.items, status: "en_attente" as TransferStatus,
    montantTotal: pt.items.reduce((s, i) => s + i.montantDu, 0),
  }));
  const allInbound  = [...legacyPending, ...inbound].sort((a,b) => b.dateRaw.localeCompare(a.dateRaw));
  const allOutbound = [...outbound].sort((a,b) => b.dateRaw.localeCompare(a.dateRaw));
  const pendingInCount = allInbound.filter(t => t.status === "en_attente").length;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function cleanPhone(p: string) { return p.replace(/\D/g,""); }
  // Flexible match: compare last min(9, len) digits to handle country-code prefixes
  function phoneMatch(a: string, b: string) {
    const ca = cleanPhone(a); const cb = cleanPhone(b);
    if (!ca || !cb) return false;
    const len = Math.min(ca.length, cb.length, 9);
    return ca.slice(-len) === cb.slice(-len);
  }

  function statusBadge(s: TransferStatus) {
    const map: Record<TransferStatus, string> = {
      en_attente: "bg-amber-100 text-amber-700",
      accepté:    "bg-green-100 text-green-700",
      refusé:     "bg-red-100 text-red-700",
      annulé:     "bg-gray-100 text-gray-500",
    };
    const labels: Record<TransferStatus, string> = { en_attente:"En attente", accepté:"Accepté", refusé:"Refusé", annulé:"Annulé" };
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${map[s]}`}>{labels[s]}</span>;
  }

  function defaultPrixCession(productId: number): number {
    // use latest invoice line price for this product
    const allInv = [...(boutique.invoices ?? [])].reverse();
    for (const inv of allInv) {
      const line = inv.lines?.find(l => l.productId === productId);
      if (line) return line.prixUnit;
    }
    const qty = productQty(productId, boutique.entries);
    return qty > 0 ? productMontant(productId, boutique.entries) / qty : 0;
  }

  // ── Annuaire actions ──────────────────────────────────────────────────────────
  function searchByPhone() {
    const clean = cleanPhone(addPhone);
    if (!clean) return;
    const found = allBoutiques.filter(b => b.id !== boutique.id && phoneMatch(b.tel ?? "", addPhone));
    // Take nom from first found boutique owner or phone itself
    const ownerUser = found.length > 0
      ? platformUsers.find(u => u.assignments.some(a => a.boutiqueId === found[0].id && a.role === "Propriétaire"))
      : undefined;
    const nom = ownerUser?.nom ?? (found[0]?.nom ?? addPhone);
    setAddPhoneResult({ found, nom });
  }

  function confirmAddPartner() {
    if (!addPhoneResult) return;
    const existing = partners.find(p => phoneMatch(p.phone, addPhone));
    if (existing) { toast.error("Ce numéro est déjà dans votre annuaire"); return; }
    const partner: BoutiquePartner = {
      id: "p" + Date.now(),
      phone: addPhone.trim(),
      nom: addPhoneResult.nom,
      boutiqueIds: addPhoneResult.found.map(b => b.id),
      addedAt: new Date().toISOString(),
    };
    onUpdate({ partners: [...partners, partner] });
    setShowAddPartner(false); setAddPhone(""); setAddPhoneResult(null);
    toast.success(`Partenaire ajouté : ${partner.nom}`);
    logAction("Partenaire B2B ajouté", partner.nom, "🤝");
  }

  function removePartner(id: string) {
    onUpdate({ partners: partners.filter(p => p.id !== id) });
    toast.success("Partenaire supprimé");
  }

  // ── Transfer actions ──────────────────────────────────────────────────────────
  function acceptTransferById(t: Transfer) {
    const senderB = allBoutiques.find(b => b.id === t.fromBoutiqueId);
    if (senderB) {
      const insufficient = t.items.filter(item => productQty(item.productId, senderB.entries) - item.qty < 0);
      if (insufficient.length > 0) {
        toast.error(`Stock insuffisant chez ${t.fromBoutiqueNom} : ${insufficient.map(i=>i.nom).join(", ")}`);
        return;
      }
    }
    // Determine if both boutiques share the same owner (same Propriétaire user)
    const getOwnerId = (bid: string) => platformUsers.find(u => u.assignments.some(a => a.boutiqueId === bid && a.role === "Propriétaire"))?.id ?? null;
    const isSameOwner = senderB ? getOwnerId(boutique.id) === getOwnerId(senderB.id) && getOwnerId(boutique.id) !== null : false;
    // Same owner = internal stock movement (no CA/margin impact); different = real commercial sale
    const senderInvoiceType = isSameOwner ? "Transfert interne" : "B2B Transfert";

    const invId = `B2B-${t.id}`;
    const baseInvoice = {
      id: invId,
      client: boutique.nom,
      clientTel: boutique.tel,
      lines: t.items.map(item => ({
        productId: item.productId,
        nom: item.nom,
        qty: item.qty,
        unit: item.unit,
        prixUnit: item.prixCession ?? (item.qty > 0 ? item.montantDu / item.qty : 0),
      })),
      montant: t.montantTotal,
      acompte: 0,
      date: today(),
      dateRaw: new Date().toISOString(),
      status: "en attente" as InvoiceStatus,
      operatorNom: currentUser.nom,
      operatorColor: currentUser.color,
    };
    const senderInvoice: Invoice = { ...baseInvoice, type: senderInvoiceType };

    // Auto-create supplier account for sender boutique A in receiver B, if not already present
    const existingSupplier = boutique.suppliers.find(s => s.nom === t.fromBoutiqueNom);
    const updatedSuppliers = existingSupplier
      ? boutique.suppliers
      : [...boutique.suppliers, {
          id: Date.now() + 8000,
          nom: t.fromBoutiqueNom,
          ville: senderB?.ville ?? "",
          lastDelivery: today(),
          tel: senderB?.tel ?? "",
          initials: ini(t.fromBoutiqueNom),
          color: senderB?.color ?? SUP_COLORS[boutique.suppliers.length % SUP_COLORS.length],
          ...(senderB?.email ? { email: senderB.email } : {}),
        }];

    // Receiver: add products/entries, mark transfer accepted
    const rcvProducts = [...boutique.products];
    const rcvEntries  = [...boutique.entries];
    t.items.forEach((item, i) => {
      let pid = rcvProducts.find(p => p.nom === item.nom)?.id;
      if (!pid) {
        pid = Date.now() + 1000 + i;
        rcvProducts.push({ id:pid, nom:item.nom, img:PLACEHOLDER_IMGS[0], unit:item.unit, fournisseur:t.fromBoutiqueNom, categorie:undefined, couleur:undefined });
      }
      // montantDu:0 — cost tracked via Charge for cross-owner, pure trace for same-owner
      rcvEntries.push({ id:Date.now()+i, productId:pid, qty:item.qty, unit:item.unit, montantDu:0, date:today(), fournisseur:t.fromBoutiqueNom, isTransfertInterne:isSameOwner });
    });
    const newTransfers = transfers.map(x => x.id === t.id ? { ...x, status:"accepté" as TransferStatus, invoiceId:invId } : x);

    if (isSameOwner) {
      // Same owner: pure traceability — internal invoice + supplier trace entry, no financial impact
      const receiverInvoice: Invoice = { ...baseInvoice, type: "Transfert interne" };
      onUpdate({ suppliers:updatedSuppliers, products:rcvProducts, entries:rcvEntries, transfers:newTransfers, pendingTransfers:(boutique.pendingTransfers??[]).filter(p=>p.id!==t.id), invoices:[...(boutique.invoices??[]), receiverInvoice] });
    } else {
      // Different owners: B2B debt charge with "en_attente" status — unpaid until settlement
      const rcvCharge: Charge = {
        id: Date.now() + 9000,
        label: `Achat stock — ${t.fromBoutiqueNom}`,
        montant: t.montantTotal,
        date: today(),
        dateRaw: new Date().toISOString(),
        categorie: "Achat stock",
        recurrence: "unique",
        fournisseur: t.fromBoutiqueNom,
        note: `B2B ${invId} — ${t.items.length} article(s)`,
        isB2BDebt: true,
        acompte: 0,
        status: "en_attente",
      };
      onUpdate({ suppliers:updatedSuppliers, products:rcvProducts, entries:rcvEntries, transfers:newTransfers, pendingTransfers:(boutique.pendingTransfers??[]).filter(p=>p.id!==t.id), charges:[...(boutique.charges??[]), rcvCharge] });
    }
    // Sender: deduct stock, add invoice, mark outbound accepted
    if (senderB) {
      const deductEntries = t.items.map((item,i) => ({ id:Date.now()+5000+i, productId:item.productId, qty:-item.qty, unit:item.unit, montantDu:0, date:today(), fournisseur:`Transfert → ${boutique.nom}` }));
      const senderTransfers = (senderB.transfers??[]).map(x => x.id === t.id ? { ...x, status:"accepté" as TransferStatus, invoiceId:invId } : x);
      onUpdateOtherBoutique(senderB.id, {
        entries: [...senderB.entries, ...deductEntries],
        transfers: senderTransfers,
        invoices: [...(senderB.invoices??[]), senderInvoice],
      });
    }
    const typeLabel = isSameOwner ? "interne" : "commercial";
    logAction("Transfert B2B accepté", `${t.id} · ${t.fromBoutiqueNom} → ${boutique.nom} · Facture ${invId} (${typeLabel})`, "✅");
    sendNotif({ icon:"📦", title:"Transfert reçu", body:`${t.items.length} article(s) de ${t.fromBoutiqueNom} · ${fmt(t.montantTotal)}`, tab:"transferts" });
    toast.success(`Transfert accepté — ${isSameOwner ? "Mouvement interne enregistré" : `Charge B2B ${invId} créée (en attente de paiement)`}`);
  }

  function refuseTransferById(t: Transfer) {
    const newTransfers = transfers.map(x => x.id === t.id ? { ...x, status:"refusé" as TransferStatus } : x);
    onUpdate({ transfers:newTransfers, pendingTransfers:(boutique.pendingTransfers??[]).filter(p=>p.id!==t.id) });
    const senderB = allBoutiques.find(b => b.id === t.fromBoutiqueId);
    if (senderB) {
      const senderTransfers = (senderB.transfers??[]).map(x => x.id === t.id ? { ...x, status:"refusé" as TransferStatus } : x);
      onUpdateOtherBoutique(senderB.id, { transfers:senderTransfers });
    }
    logAction("Transfert refusé", `${t.id} · ${t.fromBoutiqueNom}`, "❌");
    toast.success("Transfert refusé");
  }

  function cancelTransferById(t: Transfer) {
    const newTransfers = transfers.map(x => x.id === t.id ? { ...x, status:"annulé" as TransferStatus } : x);
    onUpdate({ transfers:newTransfers });
    const destB = allBoutiques.find(b => b.id === t.toBoutiqueId);
    if (destB) {
      const destTransfers = (destB.transfers??[]).map(x => x.id === t.id ? { ...x, status:"annulé" as TransferStatus } : x);
      onUpdateOtherBoutique(destB.id, { transfers:destTransfers });
    }
    logAction("Transfert annulé", `${t.id} → ${t.toBoutiqueNom}`, "🚫");
    toast.success("Transfert annulé");
  }

  function doCreateTransfer() {
    if (!crDestBoutique || crItems.filter(i=>i.qty>0).length === 0) return;
    const id = "tr" + Date.now();
    const activeItems = crItems.filter(i => i.qty > 0);
    const items: TransferItem[] = activeItems.map(i => ({
      productId: i.productId, nom: i.nom, qty: i.qty, unit: i.unit,
      prixCession: i.prixCession,
      remise: i.remise || undefined,
      montantDu: i.qty * i.prixCession * (1 - (i.remise||0)/100),
    }));
    const montantTotal = items.reduce((s, i) => s + i.montantDu, 0);
    const outT: Transfer = { id, direction:"outbound", fromBoutiqueId:boutique.id, fromBoutiqueNom:boutique.nom, fromBoutiqueTel:boutique.tel, toBoutiqueId:crDestBoutique.id, toBoutiqueNom:crDestBoutique.nom, toBoutiqueTel:crDestBoutique.tel, date:today(), dateRaw:new Date().toISOString(), items, status:"en_attente", montantTotal, note:crNote||undefined };
    const inT: Transfer = { ...outT, direction:"inbound" };
    onUpdate({ transfers:[...transfers, outT] });
    onUpdateOtherBoutique(crDestBoutique.id, { transfers:[...(crDestBoutique.transfers??[]), inT] });
    logAction("Transfert B2B créé", `${id} → ${crDestBoutique.nom} · ${fmt(montantTotal)}`, "📦");
    sendNotif({ icon:"🚚", title:"Transfert envoyé", body:`${items.length} article(s) → ${crDestBoutique.nom} · ${fmt(montantTotal)}`, tab:"transferts" });
    toast.success(`Transfert envoyé à ${crDestBoutique.nom}`);
    setPanel("sortants");
    setCrStep("partner"); setCrPartner(null); setCrDestBoutique(null); setCrItems([]); setCrNote("");
  }

  // ── History filtered ──────────────────────────────────────────────────────────
  const allHistory = [...allInbound, ...allOutbound].sort((a,b) => b.dateRaw.localeCompare(a.dateRaw));
  const filteredHistory = allHistory.filter(t => {
    if (hStatus && t.status !== hStatus) return false;
    if (hInvoice && !(t.invoiceId?.toLowerCase().includes(hInvoice.toLowerCase()))) return false;
    if (hPartner) {
      const pName = hPartner.toLowerCase();
      if (!t.fromBoutiqueNom.toLowerCase().includes(pName) && !t.toBoutiqueNom.toLowerCase().includes(pName)) return false;
    }
    if (hPeriod) {
      const [y,m] = hPeriod.split("-");
      if (!t.date.includes(`${m}/${y}`) && !t.dateRaw?.startsWith(`${y}-${m}`)) return false;
    }
    return true;
  });

  // ── Tab nav ───────────────────────────────────────────────────────────────────
  const navTabs = (
    <div className="flex gap-1 border-b border-border pb-3 overflow-x-auto">
      {([["annuaire","Annuaire"],["entrants",`Entrants${pendingInCount>0?` (${pendingInCount})`:""}`],["sortants","Sortants"],["historique","Historique"]] as [MainPanel,string][]).map(([id, label]) => (
        <button key={id} onClick={()=>setPanel(id)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${panel===id?"text-white":"text-muted-foreground hover:bg-muted"}`}
          style={{ background: panel===id ? "#f97316" : "transparent" }}>
          {label}
        </button>
      ))}
      {!readOnly && (
        <button onClick={openCreer}
          className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold text-white whitespace-nowrap" style={{background:"#1f2937"}}>
          + Créer
        </button>
      )}
    </div>
  );

  // ── PANEL: ANNUAIRE ───────────────────────────────────────────────────────────
  if (panel === "annuaire") return (
    <div className="space-y-4 pb-24">
      {readOnly && <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-semibold">Mode lecture seule</div>}
      {navTabs}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Partenaires B2B ({partners.length})</p>
        {!readOnly && <button onClick={()=>{setShowAddPartner(true);setAddPhone("");setAddPhoneResult(null);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{background:"#f97316"}}><Plus size={12}/>Ajouter</button>}
      </div>
      {partners.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Users size={32} className="mx-auto mb-3 opacity-30"/>
          <p className="font-semibold text-sm">Aucun partenaire</p>
          <p className="text-xs mt-1">Ajoutez un partenaire via son numéro de téléphone</p>
        </div>
      ) : (
        <div className="space-y-2">
          {partners.map(p => {
            const linkedBoutiques = allBoutiques.filter(b => p.boutiqueIds.includes(b.id));
            return (
              <div key={p.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0" style={{background:"#f9731622", color:"#f97316"}}>
                  {p.nom.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{p.nom}</p>
                  <p className="text-xs text-muted-foreground">{p.phone}</p>
                  {linkedBoutiques.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {linkedBoutiques.map(b => (
                        <span key={b.id} className="text-xs px-2 py-0.5 rounded-full" style={{background:b.color+"22", color:b.color}}>{b.nom}</span>
                      ))}
                    </div>
                  )}
                  {linkedBoutiques.length === 0 && <p className="text-xs text-muted-foreground italic">Boutique non répertoriée sur la plateforme</p>}
                </div>
                <button onClick={()=>removePartner(p.id)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 shrink-0"><Trash2 size={14}/></button>
              </div>
            );
          })}
        </div>
      )}
      {/* Add Partner Modal */}
      {showAddPartner && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="font-bold text-base">Ajouter un partenaire</p>
              <button onClick={()=>{setShowAddPartner(false);setAddPhone("");setAddPhoneResult(null);}} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={16}/></button>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Numéro de téléphone</label>
              <div className="flex gap-2">
                <input value={addPhone} onChange={e=>{setAddPhone(e.target.value);setAddPhoneResult(null);}} placeholder="+221 77 xxx xx xx"
                  className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm outline-none" onKeyDown={e=>e.key==="Enter"&&searchByPhone()}/>
                <button onClick={searchByPhone} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{background:"#1f2937"}}>Rechercher</button>
              </div>
            </div>
            {addPhoneResult && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nom du contact</label>
                  <input value={addPhoneResult.nom} onChange={e=>setAddPhoneResult({...addPhoneResult,nom:e.target.value})}
                    className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none"/>
                </div>
                {addPhoneResult.found.length > 0 ? (
                  <div>
                    <p className="text-xs font-bold text-green-700 mb-2">{addPhoneResult.found.length} boutique(s) trouvée(s) :</p>
                    {addPhoneResult.found.map(b => (
                      <div key={b.id} className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-green-50 mb-1">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style={{background:b.color+"33",color:b.color}}>{b.initials}</div>
                        <span className="text-sm font-semibold">{b.nom}</span>
                        {b.ville && <span className="text-xs text-muted-foreground">· {b.ville}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                    Aucune boutique trouvée pour ce numéro — le partenaire sera ajouté sans boutique liée
                  </div>
                )}
                <button onClick={confirmAddPartner} className="w-full py-3 rounded-2xl font-bold text-white" style={{background:"#f97316"}}>
                  Confirmer l'ajout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ── PANEL: CRÉATION (inline flow, shown as overlay) ───────────────────────────
  function openCreer() { setShowCreer(true); setCrStep("partner"); setCrPartner(null); setCrDestBoutique(null); setCrItems([]); setCrNote(""); }
  function closeCreer() { setShowCreer(false); }

  const creationOverlay = showCreer && !readOnly && (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={()=>{
          if (crStep==="partner") closeCreer();
          else if (crStep==="boutique_dest") setCrStep("partner");
          else if (crStep==="items") setCrStep(crPartner && crPartner.boutiqueIds.length<=1?"partner":"boutique_dest");
          else setCrStep("items");
        }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><ChevronLeft size={18}/></button>
        <div className="flex-1">
          <p className="font-bold text-sm">Nouveau transfert B2B</p>
          <p className="text-xs text-muted-foreground">
            {crStep==="partner"?"1. Sélectionner un partenaire":crStep==="boutique_dest"?"2. Choisir la boutique":crStep==="items"?"3. Composer les articles":"4. Confirmer"}
          </p>
        </div>
        <button onClick={closeCreer} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* Step 1: Partner */}
        {crStep === "partner" && (
          <>
            {partners.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users size={32} className="mx-auto mb-3 opacity-30"/>
                <p className="font-semibold text-sm">Aucun partenaire dans l'annuaire</p>
                <p className="text-xs mt-1">Allez dans l'onglet Annuaire pour en ajouter un</p>
                <button onClick={()=>{closeCreer();setPanel("annuaire");}} className="mt-4 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{background:"#f97316"}}>Aller à l'annuaire</button>
              </div>
            ) : (
              <div className="space-y-2">
                {partners.map(p => {
                  const linked = allBoutiques.filter(b => p.boutiqueIds.includes(b.id));
                  return (
                    <button key={p.id} onClick={()=>{
                      setCrPartner(p);
                      if (linked.length === 1) { setCrDestBoutique(linked[0]); setCrStep("items"); setCrItems(boutique.products.filter(pr=>productQty(pr.id,boutique.entries)>0).map(pr=>({productId:pr.id,nom:pr.nom,unit:pr.unit,stockQty:productQty(pr.id,boutique.entries),qty:0,prixCession:defaultPrixCession(pr.id),remise:0}))); }
                      else if (linked.length > 1) setCrStep("boutique_dest");
                      else { toast.error("Ce partenaire n'a pas de boutique liée sur la plateforme"); }
                    }} className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-orange-300 text-left transition-colors">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0" style={{background:"#f9731622",color:"#f97316"}}>{p.nom.slice(0,2).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{p.nom}</p>
                        <p className="text-xs text-muted-foreground">{p.phone} · {linked.length} boutique(s)</p>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0"/>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {/* Step 2: Choose destination boutique */}
        {crStep === "boutique_dest" && crPartner && (
          <div className="space-y-2">
            {allBoutiques.filter(b => crPartner.boutiqueIds.includes(b.id)).map(b => (
              <button key={b.id} onClick={()=>{setCrDestBoutique(b);setCrStep("items");setCrItems(boutique.products.filter(pr=>productQty(pr.id,boutique.entries)>0).map(pr=>({productId:pr.id,nom:pr.nom,unit:pr.unit,stockQty:productQty(pr.id,boutique.entries),qty:0,prixCession:defaultPrixCession(pr.id),remise:0})));}}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-orange-300 text-left transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0" style={{background:b.color+"22",color:b.color}}>{b.initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{b.nom}</p>
                  <p className="text-xs text-muted-foreground">{b.ville ?? ""}{b.tel ? ` · ${b.tel}` : ""}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0"/>
              </button>
            ))}
          </div>
        )}
        {/* Step 3: Items with prixCession + remise */}
        {crStep === "items" && (
          <>
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700">
              <span className="font-bold">Vers :</span> {crDestBoutique?.nom}
            </div>
            <input value={crSearch} onChange={e=>setCrSearch(e.target.value)} placeholder="Filtrer les produits…"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none"/>
            <div className="space-y-3">
              {crItems.filter(i => i.nom.toLowerCase().includes(crSearch.toLowerCase())).map((item) => {
                const realIdx = crItems.findIndex(x => x.productId === item.productId);
                const montant = item.qty * item.prixCession * (1 - (item.remise||0)/100);
                const isActive = item.qty > 0;
                return (
                  <div key={item.productId} className={`rounded-2xl border p-4 space-y-3 transition-colors ${isActive?"border-orange-300 bg-orange-50/30":"border-border bg-card"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{item.nom}</p>
                        <p className="text-xs text-muted-foreground">Stock dispo : {item.stockQty} {item.unit}</p>
                      </div>
                      {isActive && <span className="text-xs font-bold text-orange-600">{fmt(montant)}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Qté</label>
                        <input type="number" min="0" max={item.stockQty} value={item.qty||""} placeholder="0"
                          onChange={e=>setCrItems(prev=>prev.map((x,i)=>i===realIdx?{...x,qty:Math.min(item.stockQty,Math.max(0,Number(e.target.value)||0))}:x))}
                          className="w-full bg-muted rounded-lg px-2 py-1.5 text-sm font-bold text-center outline-none"/>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Prix cession</label>
                        <input type="number" min="0" value={item.prixCession||""} placeholder="0"
                          onChange={e=>setCrItems(prev=>prev.map((x,i)=>i===realIdx?{...x,prixCession:Math.max(0,Number(e.target.value)||0)}:x))}
                          className="w-full bg-muted rounded-lg px-2 py-1.5 text-sm font-bold text-center outline-none"/>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Remise %</label>
                        <input type="number" min="0" max="100" value={item.remise||""} placeholder="0"
                          onChange={e=>setCrItems(prev=>prev.map((x,i)=>i===realIdx?{...x,remise:Math.min(100,Math.max(0,Number(e.target.value)||0))}:x))}
                          className="w-full bg-muted rounded-lg px-2 py-1.5 text-sm font-bold text-center outline-none"/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <textarea value={crNote} onChange={e=>setCrNote(e.target.value)} placeholder="Note (optionnel)…" rows={2}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none resize-none"/>
          </>
        )}
        {/* Step 4: Confirm */}
        {crStep === "confirm" && (
          <>
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Vers</span><span className="font-bold">{crDestBoutique?.nom}</span></div>
              <div className="divide-y divide-border">
                {crItems.filter(i=>i.qty>0).map(i => (
                  <div key={i.productId} className="py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{i.nom}</span>
                      <span className="font-bold">{i.qty} {i.unit}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                      <span>Prix cession : {fmt(i.prixCession)}{i.remise ? ` · Remise ${i.remise}%` : ""}</span>
                      <span className="font-semibold text-foreground">{fmt(i.qty * i.prixCession * (1-(i.remise||0)/100))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                <span>Total</span>
                <span>{fmt(crItems.filter(i=>i.qty>0).reduce((s,i)=>s+i.qty*i.prixCession*(1-(i.remise||0)/100),0))}</span>
              </div>
              {crNote && <p className="text-xs text-muted-foreground italic">Note : {crNote}</p>}
            </div>
            <p className="text-xs text-muted-foreground text-center">Le stock ne sera décrémenté qu'après acceptation par le destinataire.</p>
          </>
        )}
      </div>
      {/* Bottom CTA */}
      {crStep === "items" && (
        <div className="shrink-0 p-4 border-t border-border">
          <button onClick={()=>{if(crItems.some(i=>i.qty>0))setCrStep("confirm");else toast.error("Ajoutez au moins un article");}}
            className="w-full py-3 rounded-2xl font-bold text-white" style={{background:"#1f2937"}}>
            Continuer ({crItems.filter(i=>i.qty>0).length} article{crItems.filter(i=>i.qty>0).length!==1?"s":""})
          </button>
        </div>
      )}
      {crStep === "confirm" && (
        <div className="shrink-0 p-4 border-t border-border">
          <button onClick={()=>{doCreateTransfer();closeCreer();}}
            className="w-full py-3 rounded-2xl font-bold text-white" style={{background:"#f97316"}}>
            Envoyer le transfert →
          </button>
        </div>
      )}
    </div>
  );

  // ── Transfer list card ────────────────────────────────────────────────────────
  function TransferCard({ t, dir }: { t: Transfer; dir: "in"|"out" }) {
    const senderB = dir === "in" ? allBoutiques.find(b => b.id === t.fromBoutiqueId) : null;
    const invObj = (boutique.invoices??[]).find(inv => inv.id === t.invoiceId)
      ?? (senderB ? (senderB.invoices??[]).find(inv => inv.id === t.invoiceId) : undefined);
    return (
      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dir==="in"?"bg-blue-100 text-blue-700":"bg-purple-100 text-purple-700"}`}>{dir==="in"?"Entrée":"Sortie"}</span>
              <span className="text-xs text-muted-foreground">{t.date}</span>
            </div>
            <p className="font-bold text-sm truncate">{dir==="in"?`De : ${t.fromBoutiqueNom}`:`Vers : ${t.toBoutiqueNom}`}</p>
          </div>
          <div className="shrink-0 text-right space-y-1">
            {statusBadge(t.status)}
            <p className="text-xs font-bold">{fmt(t.montantTotal)}</p>
          </div>
        </div>
        <div className="space-y-0.5">
          {t.items.slice(0,2).map((item,i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate">{item.nom}</span><span className="font-medium shrink-0 ml-2">{item.qty} {item.unit}</span>
            </div>
          ))}
          {t.items.length > 2 && <p className="text-xs text-muted-foreground">+{t.items.length-2} article(s)…</p>}
        </div>
        <div className="flex gap-2 pt-1 flex-wrap">
          <button onClick={()=>setViewTransfer(t)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-border">Voir</button>
          {!readOnly && dir === "in" && t.status === "en_attente" && (
            <>
              <button onClick={()=>acceptTransferById(t)} className="px-3 py-1.5 text-xs font-bold rounded-xl text-white" style={{background:"#16a34a"}}>Accepter</button>
              <button onClick={()=>refuseTransferById(t)} className="px-3 py-1.5 text-xs font-bold rounded-xl text-white" style={{background:"#dc2626"}}>Refuser</button>
            </>
          )}
          {!readOnly && dir === "out" && t.status === "en_attente" && (
            <button onClick={()=>cancelTransferById(t)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-red-200 text-red-600">Annuler</button>
          )}
          {t.invoiceId && invObj && (
            <button onClick={()=>openInvoicePDF(invObj, senderB??boutique, [])} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-border flex items-center gap-1 text-blue-600">
              <FileText size={11}/>Facture
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-24">
      {readOnly && <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-semibold">Mode lecture seule</div>}
      {navTabs}
      <div className="flex justify-end">
        {!readOnly && <button onClick={openCreer} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{background:"#f97316"}}><Plus size={14}/>Nouveau transfert</button>}
      </div>

      {/* ENTRANTS */}
      {panel === "entrants" && (
        allInbound.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><RefreshCw size={32} className="mx-auto mb-3 opacity-30"/><p className="font-semibold">Aucun transfert entrant</p></div>
        ) : (
          <div className="space-y-3">
            {allInbound.map(t=><TransferCard key={t.id} t={t} dir="in"/>)}
          </div>
        )
      )}

      {/* SORTANTS */}
      {panel === "sortants" && (
        allOutbound.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><RefreshCw size={32} className="mx-auto mb-3 opacity-30"/><p className="font-semibold">Aucun transfert sortant</p></div>
        ) : (
          <div className="space-y-3">
            {allOutbound.map(t=><TransferCard key={t.id} t={t} dir="out"/>)}
          </div>
        )
      )}

      {/* HISTORIQUE */}
      {panel === "historique" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-2">
            <input type="month" value={hPeriod} onChange={e=>setHPeriod(e.target.value)} className="bg-muted rounded-xl px-3 py-2 text-sm outline-none col-span-1"/>
            <select value={hStatus} onChange={e=>setHStatus(e.target.value as any)} className="bg-muted rounded-xl px-3 py-2 text-sm outline-none">
              <option value="">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="accepté">Accepté</option>
              <option value="refusé">Refusé</option>
              <option value="annulé">Annulé</option>
            </select>
            <input value={hPartner} onChange={e=>setHPartner(e.target.value)} placeholder="Partenaire…" className="bg-muted rounded-xl px-3 py-2 text-sm outline-none"/>
            <input value={hInvoice} onChange={e=>setHInvoice(e.target.value)} placeholder="N° facture…" className="bg-muted rounded-xl px-3 py-2 text-sm outline-none"/>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Aucun transfert trouvé</div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map(t => {
                const isIn = t.direction === "inbound";
                const senderB2 = isIn ? allBoutiques.find(b => b.id === t.fromBoutiqueId) : null;
                const invObj2 = (boutique.invoices??[]).find(inv => inv.id === t.invoiceId)
                  ?? (senderB2 ? (senderB2.invoices??[]).find(inv => inv.id === t.invoiceId) : undefined);
                return (
                  <div key={t.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${isIn?"bg-blue-100 text-blue-700":"bg-purple-100 text-purple-700"}`}>{isIn?"→":"←"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate">{isIn?t.fromBoutiqueNom:t.toBoutiqueNom}</p>
                      <p className="text-xs text-muted-foreground">{t.date} · {t.items.length} art.</p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {statusBadge(t.status)}
                      <p className="text-xs font-bold">{fmt(t.montantTotal)}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={()=>setViewTransfer(t)} className="px-2 py-1 text-xs font-bold rounded-lg border border-border">Voir</button>
                      {t.invoiceId && invObj2 && (
                        <button onClick={()=>openInvoicePDF(invObj2, senderB2??boutique, [])} className="px-2 py-1 text-xs font-bold rounded-lg border border-border text-blue-600 flex items-center gap-1"><FileText size={10}/>PDF</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Création overlay */}
      {creationOverlay}

      {/* Transfer detail modal */}
      {viewTransfer && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{viewTransfer.direction==="inbound"?`De : ${viewTransfer.fromBoutiqueNom}`:`Vers : ${viewTransfer.toBoutiqueNom}`}</p>
                  {statusBadge(viewTransfer.status)}
                </div>
                <p className="text-xs text-muted-foreground">{viewTransfer.date}{viewTransfer.invoiceId ? ` · Facture ${viewTransfer.invoiceId}` : ""}</p>
              </div>
              <button onClick={()=>setViewTransfer(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={16}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {viewTransfer.items.map((item,i) => (
                <div key={i} className="py-2 border-b border-border last:border-0 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{item.nom}</span>
                    <span className="font-bold">{item.qty} {item.unit}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>{item.prixCession ? `Prix cession : ${fmt(item.prixCession)}${item.remise ? ` · Remise ${item.remise}%` : ""}` : ""}</span>
                    <span>{fmt(item.montantDu)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-border">
                <span>Total</span><span>{fmt(viewTransfer.montantTotal)}</span>
              </div>
              {viewTransfer.note && <p className="text-xs text-muted-foreground italic mt-2">Note : {viewTransfer.note}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VIEW: INVENTAIRE PHYSIQUE ───────────────────────────────────────────────

function InventaireView({ boutique, currentUser, onUpdate, logAction, onClose }: {
  boutique: Boutique;
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  onClose: () => void;
}) {
  const { products, entries } = boutique;
  const inventaires = boutique.inventaires ?? [];
  const [screen, setScreen] = useState<"list"|"scope"|"count"|"rapport"|"confirm">("list");
  const [session, setSession] = useState<InventaireSession|null>(null);
  const [scopeAll, setScopeAll] = useState(true);
  const [scopeCats, setScopeCats] = useState<string[]>([]);
  const [countVals, setCountVals] = useState<Record<number,string>>({});
  const [search, setSearch] = useState("");
  const [blindMode, setBlindMode] = useState(false);
  const [viewSession, setViewSession] = useState<InventaireSession|null>(null);

  const allCats = [...new Set(products.map(p => p.categorie ?? "Sans catégorie"))];
  const inProgressSession = inventaires.find(s => s.statut === "en_cours");

  function startSession() {
    const perimetre: "tout"|string[] = scopeAll ? "tout" : scopeCats;
    const filteredProds = products.filter(p => scopeAll || scopeCats.includes(p.categorie ?? "Sans catégorie"));
    const lines: InventaireLine[] = filteredProds.map(p => ({
      productId: p.id, nom: p.nom, unit: p.unit, categorie: p.categorie,
      theorique: productQty(p.id, entries),
    }));
    const sess: InventaireSession = {
      id: "inv" + Date.now(), date: today(), dateRaw: new Date().toISOString(),
      userId: currentUser.id, userNom: currentUser.nom, userColor: currentUser.color,
      statut: "en_cours", perimetre, lines,
    };
    const newInventaires = inventaires.filter(s => s.id !== inProgressSession?.id);
    onUpdate({ inventaires: [...newInventaires, sess] });
    setSession(sess); setCountVals({}); setSearch(""); setScreen("count");
  }

  function resumeSession() {
    if (!inProgressSession) return;
    setSession(inProgressSession);
    const vals: Record<number,string> = {};
    inProgressSession.lines.forEach(l => { if (l.compte !== undefined) vals[l.productId] = String(l.compte); });
    setCountVals(vals); setScreen("count");
  }

  function saveProgress() {
    if (!session) return;
    const updatedLines = session.lines.map(l => ({ ...l, compte: countVals[l.productId] !== undefined ? Number(countVals[l.productId]) : l.compte }));
    const updatedSess = { ...session, lines: updatedLines };
    const newInventaires = inventaires.filter(s => s.id !== session.id);
    onUpdate({ inventaires: [...newInventaires, updatedSess] });
    toast.success("Progression sauvegardée");
  }

  function goToRapport() {
    if (!session) return;
    const updatedLines = session.lines.map(l => ({ ...l, compte: countVals[l.productId] !== undefined ? Number(countVals[l.productId]) : (l.compte ?? l.theorique) }));
    setSession({ ...session, lines: updatedLines }); setScreen("rapport");
  }

  function validate() {
    if (!session) return;
    const adjustEntries: StockEntry[] = [];
    session.lines.forEach((l, i) => {
      const compte = l.compte ?? l.theorique;
      const ecart = compte - l.theorique;
      if (ecart !== 0) {
        adjustEntries.push({ id: Date.now() + i, productId: l.productId, qty: ecart, unit: l.unit, montantDu: 0, date: today(), fournisseur: "Ajustement d'inventaire", invoiceId: session.id });
      }
    });
    const totalEcartVal = session.lines.reduce((sum, l) => {
      const posQty = entries.filter(e => e.productId === l.productId && e.qty > 0).reduce((s, e) => s + e.qty, 0);
      const unitCost = posQty > 0 ? productMontant(l.productId, entries) / posQty : 0;
      return sum + Math.abs((l.compte ?? l.theorique) - l.theorique) * unitCost;
    }, 0);
    // Snapshot profit/loss at validation time
    const snapCA = (boutique.invoices ?? [])
      .filter(inv => (inv.dateRaw ?? "") >= session.dateRaw && inv.type !== "Transfert interne" && inv.type !== "B2B Achat")
      .reduce((s, inv) => s + signedInvoicePaid(inv), 0);
    const snapCOGS = (boutique.invoices ?? [])
      .filter(inv => (inv.dateRaw ?? "") >= session.dateRaw && inv.type !== "Transfert interne" && inv.type !== "B2B Achat")
      .reduce((s, inv) => s + (inv.lines ?? []).reduce((ls, l) => l.prixAchat != null ? ls + l.prixAchat * l.qty : ls, 0), 0);
    const terminee: InventaireSession = { ...session, statut: "terminé", valeurEcart: totalEcartVal, chiffreAffaires: snapCA, benefice: snapCA - snapCOGS };
    const newInventaires = inventaires.filter(s => s.id !== session.id);
    onUpdate({ inventaires: [...newInventaires, terminee], entries: [...entries, ...adjustEntries] });
    logAction("Inventaire physique", `Session · ${adjustEntries.length} ajustement(s) · ${fmt(totalEcartVal)}`, "📋");
    toast.success("Inventaire validé — stock ajusté");
    setScreen("list"); setSession(null);
  }

  function rapportLines() {
    if (!session) return [];
    return session.lines.map(l => {
      const compte = l.compte ?? l.theorique;
      const ecart = compte - l.theorique;
      const posQty = entries.filter(e => e.productId === l.productId && e.qty > 0).reduce((s, e) => s + e.qty, 0);
      const unitCost = posQty > 0 ? productMontant(l.productId, entries) / posQty : 0;
      return { ...l, compte, ecart, valEcart: Math.abs(ecart) * unitCost };
    });
  }

  const filteredCountLines = (session?.lines ?? []).filter(l => l.nom.toLowerCase().includes(search.toLowerCase()));

  if (screen === "list") return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={18}/></button>
        <h2 className="font-bold text-base flex-1">Inventaire physique</h2>
        <button onClick={()=>setScreen("scope")} className="text-sm font-bold px-4 py-2 rounded-xl text-white" style={{background:"#1f2937"}}>+ Nouvel inventaire</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {inProgressSession && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-sm text-amber-800">Inventaire en cours</p>
                <p className="text-xs text-amber-600">{inProgressSession.date} · {inProgressSession.userNom}</p>
                <p className="text-xs text-amber-600 mt-0.5">{inProgressSession.lines.filter(l=>l.compte!==undefined).length}/{inProgressSession.lines.length} produits comptés</p>
              </div>
              <button onClick={resumeSession} className="shrink-0 text-sm font-bold px-4 py-2 rounded-xl bg-amber-700 text-white">Reprendre</button>
            </div>
          </div>
        )}
        {inventaires.filter(s => s.statut === "terminé").length === 0 && !inProgressSession && (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck size={40} className="mx-auto mb-3 opacity-30"/>
            <p className="font-semibold">Aucun inventaire réalisé</p>
            <p className="text-sm mt-1">Commencez votre premier inventaire physique</p>
          </div>
        )}
        {[...inventaires].filter(s=>s.statut==="terminé").sort((a,b)=>b.dateRaw.localeCompare(a.dateRaw)).map(sess => (
          <button key={sess.id} onClick={()=>setViewSession(sess)} className="w-full bg-card border border-border rounded-2xl p-4 text-left hover:border-gray-400 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-sm">{sess.date}</p>
                <p className="text-xs text-muted-foreground">{sess.userNom}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {typeof sess.perimetre === "string" ? "Tout le catalogue" : sess.perimetre.join(", ")} · {sess.lines.length} produits
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">Terminé</span>
                {sess.valeurEcart !== undefined && <p className="text-xs text-muted-foreground">Écart: {fmt(sess.valeurEcart)}</p>}
                {sess.benefice !== undefined && (
                  <p className={`text-xs font-bold ${sess.benefice >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {sess.benefice >= 0 ? "+" : ""}{fmt(sess.benefice)}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
      {viewSession && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="font-bold text-sm">{viewSession.date}</p>
                <p className="text-xs text-muted-foreground">{viewSession.userNom} · {viewSession.lines.filter(l=>l.ecart!==undefined&&(l.compte??l.theorique)!==l.theorique).length} écart(s)</p>
              </div>
              <button onClick={()=>setViewSession(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={16}/></button>
            </div>
            <div className="px-4 py-2 bg-gray-50 border-b border-border">
              <div className="flex text-xs text-muted-foreground font-semibold">
                <span className="flex-1">Produit</span>
                <span className="w-16 text-center">Théor.</span>
                <span className="w-16 text-center">Compté</span>
                <span className="w-14 text-center">Écart</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {viewSession.lines.map(l => {
                const compte = l.compte ?? l.theorique;
                const ecart = compte - l.theorique;
                const ecartColor = ecart === 0 ? "#16a34a" : ecart > 0 ? "#d97706" : "#dc2626";
                return (
                  <div key={l.productId} className={`flex items-center px-4 py-2.5 ${ecart<0?"bg-red-50":ecart>0?"bg-amber-50":""}`}>
                    <span className="text-sm flex-1 truncate">{l.nom}</span>
                    <span className="w-16 text-center text-sm text-muted-foreground">{l.theorique}</span>
                    <span className="w-16 text-center text-sm font-bold">{compte}</span>
                    <span className="w-14 text-center text-sm font-bold" style={{color:ecartColor}}>{ecart>0?"+":""}{ecart}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (screen === "scope") return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={()=>setScreen("list")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><ChevronLeft size={18}/></button>
        <h2 className="font-bold text-base">Périmètre de l'inventaire</h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {[{val:true,label:"Tout le catalogue",sub:`${products.length} produits`},{val:false,label:"Par catégorie",sub:"Sélectionner des catégories"}].map(opt => (
          <button key={String(opt.val)} onClick={()=>setScopeAll(opt.val)}
            className={`w-full p-4 rounded-2xl border-2 text-left flex items-center gap-3 transition-colors ${scopeAll===opt.val?"border-gray-800 bg-gray-50":"border-border"}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${scopeAll===opt.val?"border-gray-800":"border-gray-400"}`}>
              {scopeAll===opt.val && <div className="w-2.5 h-2.5 rounded-full bg-gray-800"/>}
            </div>
            <div>
              <p className="font-bold text-sm">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.sub}</p>
            </div>
          </button>
        ))}
        {!scopeAll && (
          <div className="space-y-2 mt-1">
            {allCats.map(cat => (
              <button key={cat} onClick={()=>setScopeCats(prev=>prev.includes(cat)?prev.filter(c=>c!==cat):[...prev,cat])}
                className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${scopeCats.includes(cat)?"border-gray-800 bg-gray-50":"border-border"}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${scopeCats.includes(cat)?"border-gray-800 bg-gray-800":"border-gray-400"}`}>
                  {scopeCats.includes(cat) && <Check size={10} className="text-white"/>}
                </div>
                <span className="text-sm flex-1">{cat}</span>
                <span className="text-xs text-muted-foreground">{products.filter(p=>(p.categorie??"Sans catégorie")===cat).length} produits</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 p-4 border-t border-border">
        <button onClick={startSession} disabled={!scopeAll && scopeCats.length === 0}
          className="w-full py-3 rounded-2xl font-bold text-white disabled:opacity-40 transition-opacity" style={{background:"#1f2937"}}>
          Démarrer l'inventaire
        </button>
      </div>
    </div>
  );

  if (screen === "count") return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={()=>{saveProgress();setScreen("list");}} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><ChevronLeft size={18}/></button>
        <h2 className="font-bold text-base flex-1">Comptage</h2>
        <button onClick={()=>setBlindMode(b=>!b)}
          className={`text-xs px-3 py-1.5 rounded-full border font-bold transition-colors ${blindMode?"bg-gray-800 text-white border-gray-800":"border-border text-muted-foreground"}`}>
          {blindMode ? "Masqué" : "Affiché"}
        </button>
        <button onClick={saveProgress} className="text-xs px-3 py-1.5 rounded-full border border-border font-bold">Sauver</button>
      </header>
      <div className="shrink-0 px-4 py-2 border-b border-border">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…" className="w-full bg-muted rounded-xl px-3 py-2 text-sm outline-none"/>
      </div>
      <div className="shrink-0 px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex text-xs text-muted-foreground font-semibold">
          <span className="flex-1">Produit</span>
          {!blindMode && <span className="w-16 text-center">Théorique</span>}
          <span className="w-20 text-center">Compté</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {filteredCountLines.map(l => (
          <div key={l.productId} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{l.nom}</p>
              <p className="text-xs text-muted-foreground">{l.unit}{l.categorie ? ` · ${l.categorie}` : ""}</p>
            </div>
            {!blindMode && <span className="w-16 text-center text-sm text-muted-foreground tabular-nums">{l.theorique}</span>}
            <input type="number" min="0"
              value={countVals[l.productId] ?? ""}
              onChange={e=>setCountVals(prev=>({...prev,[l.productId]:e.target.value}))}
              placeholder="—"
              className={`w-20 text-center rounded-xl border py-1.5 text-sm font-bold outline-none transition-colors ${countVals[l.productId]!==undefined?"border-gray-800 bg-gray-50":"border-border"}`}
            />
          </div>
        ))}
      </div>
      <div className="shrink-0 p-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3 text-center">
          {Object.keys(countVals).length}/{session?.lines.length ?? 0} produits comptés
        </p>
        <button onClick={goToRapport} className="w-full py-3 rounded-2xl font-bold text-white" style={{background:"#1f2937"}}>
          Voir le rapport d'écarts →
        </button>
      </div>
    </div>
  );

  // rapport + confirm share the same screen
  const rLines = rapportLines();
  const withEcart = rLines.filter(l => l.ecart !== 0);
  const totalEcartVal = rLines.reduce((sum, l) => sum + l.valEcart, 0);

  // Profit/loss calculations — FIFO-based
  const stockAchatTotal = products.reduce((sum, p) => sum + fifoStockValue(p.id, entries), 0);
  const sessionDateRaw = session?.dateRaw ?? new Date(0).toISOString();
  const chiffreAffaires = (boutique.invoices ?? [])
    .filter(inv => (inv.dateRaw ?? "") >= sessionDateRaw && inv.type !== "Transfert interne" && inv.type !== "B2B Achat")
    .reduce((sum, inv) => sum + signedInvoicePaid(inv), 0);
  const coutVentes = (boutique.invoices ?? [])
    .filter(inv => (inv.dateRaw ?? "") >= sessionDateRaw && inv.type !== "Transfert interne" && inv.type !== "B2B Achat")
    .reduce((sum, inv) => {
      return sum + (inv.lines ?? []).reduce((ls, l) => l.prixAchat != null ? ls + l.prixAchat * l.qty : ls, 0);
    }, 0);
  const benefice = chiffreAffaires - coutVentes;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={()=>setScreen("count")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><ChevronLeft size={18}/></button>
        <h2 className="font-bold text-base flex-1">Rapport d'inventaire</h2>
      </header>
      {/* Summary bar */}
      <div className="shrink-0 px-4 py-2.5 bg-muted/30 border-b border-border flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span><span className="text-muted-foreground">Produits: </span><span className="font-bold">{rLines.length}</span></span>
        <span><span className="text-muted-foreground">Écarts: </span><span className="font-bold text-red-600">{withEcart.length}</span></span>
        <span><span className="text-muted-foreground">Val. écart: </span><span className="font-bold">{fmt(totalEcartVal)}</span></span>
      </div>
      {/* Profit/loss summary cards */}
      <div className="shrink-0 grid grid-cols-3 gap-2 px-4 py-3 border-b border-border bg-background">
        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-blue-600 font-semibold">Stock actuel</p>
          <p className="text-sm font-black text-blue-800">{fmt(stockAchatTotal)}</p>
          <p className="text-xs text-blue-500">valeur coût</p>
        </div>
        <div className="bg-green-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-green-600 font-semibold">Ventes période</p>
          <p className="text-sm font-black text-green-800">{fmt(chiffreAffaires)}</p>
          <p className="text-xs text-green-500">CA encaissé</p>
        </div>
        <div className={`${benefice >= 0 ? "bg-emerald-50" : "bg-red-50"} rounded-xl p-2.5 text-center`}>
          <p className={`text-xs font-semibold ${benefice >= 0 ? "text-emerald-600" : "text-red-600"}`}>Bénéfice net</p>
          <p className={`text-sm font-black ${benefice >= 0 ? "text-emerald-800" : "text-red-800"}`}>{benefice >= 0 ? "+" : ""}{fmt(benefice)}</p>
          <p className={`text-xs ${benefice >= 0 ? "text-emerald-500" : "text-red-400"}`}>CA − coûts</p>
        </div>
      </div>
      {/* Column headers */}
      <div className="shrink-0 px-4 py-2 border-b border-border bg-gray-50">
        <div className="flex text-xs text-muted-foreground font-semibold">
          <span className="flex-1">Produit</span>
          <span className="w-14 text-center">Théor.</span>
          <span className="w-14 text-center">Compté</span>
          <span className="w-14 text-center">Écart</span>
          <span className="w-20 text-right">Valeur</span>
        </div>
      </div>
      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {rLines.map(l => {
          const ecartColor = l.ecart === 0 ? "#16a34a" : l.ecart > 0 ? "#d97706" : "#dc2626";
          return (
            <div key={l.productId} className={`flex items-center px-4 py-3 ${l.ecart<0?"bg-red-50":l.ecart>0?"bg-amber-50":""}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.nom}</p>
                <p className="text-xs text-muted-foreground">{l.unit}</p>
              </div>
              <span className="w-14 text-center text-sm text-muted-foreground">{l.theorique}</span>
              <span className="w-14 text-center text-sm font-bold">{l.compte}</span>
              <span className="w-14 text-center text-sm font-bold" style={{color:ecartColor}}>{l.ecart>0?"+":""}{l.ecart}</span>
              <span className="w-20 text-right text-xs text-muted-foreground">{l.valEcart>0?fmt(l.valEcart):"-"}</span>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 p-4 border-t border-border">
        <button onClick={()=>setScreen("confirm")} className="w-full py-3 rounded-2xl font-bold text-white" style={{background:"#1f2937"}}>
          Valider et appliquer les ajustements
        </button>
      </div>
      {screen === "confirm" && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm p-5">
            <p className="font-bold text-base mb-2">Confirmer l'ajustement</p>
            <p className="text-sm text-muted-foreground mb-4">
              {withEcart.length === 0
                ? "Aucun écart détecté. L'inventaire sera marqué terminé sans modification du stock."
                : `${withEcart.length} produit(s) avec écart. Le stock sera ajusté et tracé dans l'historique.`}
            </p>
            {totalEcartVal > 0 && <p className="text-sm font-bold mb-5">Valeur totale des écarts : {fmt(totalEcartVal)}</p>}
            <div className="flex gap-3">
              <button onClick={()=>setScreen("rapport")} className="flex-1 py-2.5 rounded-xl border border-border font-bold text-sm">Annuler</button>
              <button onClick={validate} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm" style={{background:"#1f2937"}}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VIEW: STOCK ─────────────────────────────────────────────────────────────

function StockView({ boutique, onUpdate, logAction, initialFilter, allBoutiques, onUpdateOtherBoutique, currentUser }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialFilter?: string;
  allBoutiques?: Boutique[];
  onUpdateOtherBoutique?: (boutiqueId: string, u: Partial<Boutique>) => void;
  currentUser?: PlatformUser | null;
} 
  ) {
  const readOnly = useReadOnly();
  const { products, entries, suppliers } = boutique;
  const charges = boutique.charges ?? [];
  const cats = boutique.categories ?? [];
  const activeAssignSv = currentUser?.assignments.find(a => a.boutiqueId === boutique.id);
  const canSeeMarginSv = activeAssignSv?.role === "Propriétaire" || !!(activeAssignSv?.droits?.marges);

  function acceptTransfer(pt: PendingTransfer) {
    const senderB = allBoutiques?.find(b => b.id === pt.fromBoutiqueId);
    // Check sender has enough stock before accepting
    if (senderB) {
      const insufficient = pt.items.filter(item => productQty(item.productId, senderB.entries) - item.qty < 0);
      if (insufficient.length > 0) {
        toast.error(`Stock insuffisant chez ${pt.fromBoutiqueNom} : ${insufficient.map(i=>i.nom).join(", ")}`, { duration: 5000 });
        return;
      }
    }
    // Add products + entries to receiver
    const sbProducts = [...products];
    const sbEntries  = [...entries];
    pt.items.forEach((item, i) => {
      let pid = sbProducts.find(p => p.nom === item.nom)?.id;
      if (!pid) {
        pid = Date.now() + 1000 + i;
        sbProducts.push({ id:pid, nom:item.nom, img:item.img??PLACEHOLDER_IMGS[0], unit:item.unit, fournisseur:pt.fromBoutiqueNom, categorie:undefined, couleur:undefined });
      }
      sbEntries.push({ id:Date.now()+500+i, productId:pid, qty:item.qty, unit:item.unit, montantDu:item.montantDu, date:today(), fournisseur:pt.fromBoutiqueNom });
    });
    // Deduct from sender + mark invoice as payé
    if (senderB && onUpdateOtherBoutique) {
      const deductEntries: StockEntry[] = pt.items.map((item, i) => ({
        id:Date.now()+2000+i, productId:item.productId, qty:-item.qty, unit:item.unit, montantDu:0,
        date:today(), fournisseur:`Transfert → ${boutique.nom}`,
      }));
      const updatedInvoices = senderB.invoices.map(inv => inv.id===pt.invoiceId ? { ...inv, status:"en attente" as InvoiceStatus } : inv);
      onUpdateOtherBoutique(pt.fromBoutiqueId, { entries:[...senderB.entries, ...deductEntries], invoices:updatedInvoices });
    }
    const newPending = (boutique.pendingTransfers??[]).filter(p=>p.id!==pt.id);
    onUpdate({ products:sbProducts, entries:sbEntries, pendingTransfers:newPending });
    logAction("Transfert accepté", `${pt.invoiceId} · ${pt.fromBoutiqueNom}`, "✅");
  }

  function rejectTransfer(pt: PendingTransfer) {
    // Sender stock was never touched — just remove the pending record
    const newPending = (boutique.pendingTransfers??[]).filter(p=>p.id!==pt.id);
    onUpdate({ pendingTransfers:newPending });
    logAction("Transfert refusé", `${pt.invoiceId} · ${pt.fromBoutiqueNom}`, "❌");
  }

  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState(initialFilter ?? "all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"nom"|"qty"|"valeur">("nom");
  const [showRenta, setShowRenta] = useState(false);
  const [rentaSort, setRentaSort] = useState<"marge"|"ca"|"pct">("marge");
  const [detail, setDetail]   = useState<Product | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Entry form
  const [dUnit, setDUnit] = useState("yards");
  const [dQty, setDQty]   = useState("");
  const [dMontant, setDMontant] = useState("");
  const [dPrixUnit, setDPrixUnit] = useState("");
  const [dFourn, setDFourn] = useState(suppliers[0]?.nom ?? "");
  const [dLotMode, setDLotMode] = useState(false);
  const [dLots, setDLots]     = useState("1");
  const [dPieces, setDPieces] = useState("");
  const [dLongueur, setDLongueur] = useState("");
  const [dSku, setDSku] = useState("");
  const dLotQty = dUnit === "pièces"
    ? (Number(dLots) || 1) * (Number(dPieces) || 0)
    : (Number(dLots) || 1) * (Number(dPieces) || 0) * (Number(dLongueur) || 0);

  // New product form
  const [nNom, setNNom]     = useState("");
  const [nUnit, setNUnit]   = useState("yards");
  const [nQty, setNQty]     = useState("");
  const [nMontant, setNMontant] = useState("");
  const [nPrixUnit, setNPrixUnit] = useState("");
  const [nFourn, setNFourn] = useState(suppliers[0]?.nom ?? "");
  const [nCat, setNCat]     = useState("");
  const [nImg, setNImg]     = useState<string | null>(null);
  const [nCatNew, setNCatNew] = useState("");
  const [nCatMode, setNCatMode] = useState<"select" | "new">("select");
  const [nLotMode, setNLotMode] = useState(false);
  const [nLots, setNLots]     = useState("1");
  const [nPieces, setNPieces] = useState("");
  const [nLongueur, setNLongueur] = useState("");
  const nLotQty = nUnit === "pièces"
    ? (Number(nLots) || 1) * (Number(nPieces) || 0)
    : (Number(nLots) || 1) * (Number(nPieces) || 0) * (Number(nLongueur) || 0);

  function selectNewCat(c: string) {
    setNCat(c);
    const catConfig = cats.find(cat => cat.nom === c);
    if (catConfig) {
      setNUnit(catConfig.unitVente);
      if (catConfig.nbPiecesParLot > 0) {
        setNLotMode(true);
        setNLots("1");
        setNPieces(String(catConfig.nbPiecesParLot));
        setNLongueur(catConfig.longueurParPiece > 0 ? String(catConfig.longueurParPiece) : "");
      } else {
        setNLotMode(false); setNPieces(""); setNLongueur("");
      }
    } else {
      setNLotMode(false);
    }
  }

  // Edit product
  const [editNom, setEditNom] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editAlertOk, setEditAlertOk] = useState<string>("");
  const [editAlertLow, setEditAlertLow] = useState<string>("");

  const photoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoRef  = useRef<HTMLInputElement>(null);

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setNImg(await resizeImage(f));
  }
  async function handleEditPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !detail) return;
    const img = await resizeImage(f);
    onUpdate({ products: products.map(p => p.id === detail.id ? { ...p, img } : p) });
    setDetail({ ...detail, img });
  }

  const catNames = Array.from(new Set([
    ...cats.map(c => c.nom),
    ...products.map(p => p.categorie).filter(Boolean) as string[],
  ]));

  function openDetail(p: Product) {
    const cat = cats.find(c => c.nom === p.categorie);
    const param = (boutique.productParams ?? []).find(x => x.productId === p.id);
    const eff = param ?? (cat && cat.nbPiecesParLot > 0 ? { nbPiecesParLot: cat.nbPiecesParLot, longueurParPiece: cat.longueurParPiece, unitVente: cat.unitVente } : null);
    setDetail(p); setAddMode(false); setEditingProduct(false);
    setDQty(""); setDMontant(""); setDPrixUnit("");
    setDUnit(eff?.unitVente ?? p.unit);
    setDFourn(p.fournisseur || (suppliers[0]?.nom ?? ""));
    if (eff && eff.nbPiecesParLot > 0) {
      setDLotMode(true); setDLots("1");
      setDPieces(String(eff.nbPiecesParLot));
      setDLongueur(eff.longueurParPiece > 0 ? String(eff.longueurParPiece) : "");
    } else {
      setDLotMode(false); setDLots("1"); setDPieces(""); setDLongueur("");
    }
  }

  function submitEntry() {
    if (!detail) return;
    const qty = dLotMode ? dLotQty : Number(dQty);
    if (!qty || qty <= 0) return;
    const isPieces = dUnit === "pièces";
    const lotExtra = dLotMode ? { nbLots: Number(dLots) || 1, nbPieces: Number(dPieces) || 0, ...(isPieces ? {} : { longueurPiece: Number(dLongueur) || 0 }) } : {};
    onUpdate({ entries: [...entries, { id: Date.now(), productId: detail.id, qty, unit: dUnit, montantDu: Number(dMontant) || 0, date: today(), fournisseur: dFourn, ...lotExtra, ...(dSku.trim() ? { sku: dSku.trim() } : {}) }] });
    const lab = dLotMode
      ? (isPieces ? `${dLots}lot×${dPieces}p=+${qty}p` : `${dLots}lot×${dPieces}p×${dLongueur}${dUnit}=+${qty}${dUnit}`)
      : `+${qty} ${dUnit}`;
    logAction("Entrée stock", `${detail.nom} · ${lab} · ${fmt(Number(dMontant) || 0)}`, "📦");
    setAddMode(false); setDQty(""); setDMontant(""); setDPrixUnit(""); setDSku("");
    setDLotMode(false); setDLots("1"); setDPieces(""); setDLongueur("");
  }

  function submitNew() {
    if (!nNom.trim()) return;
    const finalCat = nCatMode === "new" ? nCatNew.trim() : nCat;
    const pid = Date.now();
    let updatedCats = cats;
    if (nCatMode === "new" && nCatNew.trim() && !cats.find(c => c.nom === nCatNew.trim())) {
      updatedCats = [...cats, { id: "cat" + pid, nom: nCatNew.trim(), unitVente: nUnit, nbPiecesParLot: 0, longueurParPiece: 0 }];
    }
    const initQty = nLotMode ? nLotQty : Number(nQty);
    const lotExtra = nLotMode ? { nbLots: Number(nLots)||1, nbPieces: Number(nPieces)||0, ...(nUnit !== "pièces" ? { longueurPiece: Number(nLongueur)||0 } : {}) } : {};
    const newEntries = initQty > 0 ? [...entries, { id: pid + 1, productId: pid, qty: initQty, unit: nUnit, montantDu: Number(nMontant) || 0, date: today(), fournisseur: nFourn, ...lotExtra }] : entries;
    onUpdate({
      products: [...products, { id: pid, nom: nNom.trim(), img: nImg ?? PLACEHOLDER_IMGS[Math.floor(Math.random() * 4)], unit: nUnit, fournisseur: nFourn, categorie: finalCat || undefined }],
      entries: newEntries, categories: updatedCats,
    });
    logAction("Nouveau produit", `${nNom.trim()}${finalCat ? " · " + finalCat : ""}`, "🆕");
    setNNom(""); setNQty(""); setNMontant(""); setNPrixUnit(""); setNCat(""); setNCatNew(""); setNImg(null); setNCatMode("select");
    setNLotMode(false); setNLots("1"); setNPieces(""); setNLongueur(""); setShowNew(false);
  }

  function saveProductEdit() {
    if (!detail || !editNom.trim()) return;
    const alertOk = editAlertOk !== "" ? Number(editAlertOk) : undefined;
    const alertLow = editAlertLow !== "" ? Number(editAlertLow) : undefined;
    const updated = { ...detail, nom: editNom.trim(), categorie: editCat || undefined, ...(alertOk !== undefined ? { alertOk } : {}), ...(alertLow !== undefined ? { alertLow } : {}) };
    onUpdate({ products: products.map(p => p.id === detail.id ? updated : p) });
    setDetail(updated);
    setEditingProduct(false);
    logAction("Produit modifié", editNom.trim(), "✏️");
  }

  // Stock correction — edit/delete today's entries
  const [editingEntryId, setEditingEntryId] = useState<number|null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [editEntryMontant, setEditEntryMontant] = useState("");
  const todayRaw = new Date().toISOString().split("T")[0];

  function saveEntryEdit(entryId: number) {
    const qty = Number(editEntryQty);
    if (!qty || qty <= 0) return;
    onUpdate({ entries: entries.map(e => e.id === entryId ? { ...e, qty, montantDu: Number(editEntryMontant) || 0 } : e) });
    logAction("Correction stock", `Entrée #${entryId} modifiée`, "✏️");
    setEditingEntryId(null);
  }

  function deleteEntry(entryId: number) {
    onUpdate({ entries: entries.filter(e => e.id !== entryId) });
    logAction("Suppression entrée", `Entrée #${entryId} supprimée`, "🗑️");
  }

  const filtered = products.filter(p => {
    const qty = productQty(p.id, entries);
    return p.nom.toLowerCase().includes(search.toLowerCase())
      && (filter === "all" || stockStatus(qty, p) === filter)
      && (catFilter === "all" || p.categorie === catFilter);
  }).sort((a, b) => {
    if (sortBy === "qty") return productQty(b.id, entries) - productQty(a.id, entries);
    if (sortBy === "valeur") return productMontant(b.id, entries) - productMontant(a.id, entries);
    return a.nom.localeCompare(b.nom);
  });

  return (
    <div className="space-y-4 pb-24">

      {/* Pending transfers notice */}
      {((boutique.pendingTransfers??[]).length > 0 || (boutique.transfers??[]).filter(t=>t.direction==="inbound"&&t.status==="en_attente").length > 0) && (
        <div className="rounded-2xl border-2 flex items-center justify-between px-4 py-3 gap-3" style={{ borderColor:"#f97316", background:"#f9731608" }}>
          <div className="flex items-center gap-2">
            <span>📦</span>
            <p className="text-sm font-black" style={{ color:"#f97316" }}>
              {(boutique.pendingTransfers??[]).length + (boutique.transfers??[]).filter(t=>t.direction==="inbound"&&t.status==="en_attente").length} transfert(s) en attente
            </p>
          </div>
          <RefreshCw size={16} style={{ color:"#f97316" }}/>
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Chercher un produit…" className={inputCls + " pl-11"}/>
      </div>

      <div className="flex gap-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        {[{ id: "all", label: "Tout", c: "#7A7055" }, { id: "ok", label: "✓ OK", c: SEM.success.accent }, { id: "low", label: "⚠ Bas", c: "#C9A227" }, { id: "critical", label: "! Critique", c: "#ef4444" }].map(s => (
          <button key={s.id} onClick={() => setFilter(s.id)} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={{ background: filter === s.id ? s.c : s.c + "22", color: filter === s.id ? "#fff" : s.c }}>{s.label}</button>
        ))}
      </div>

      {catNames.length > 0 && (
        <div className="flex gap-2" style={{ overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setCatFilter("all")} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={{ background: catFilter === "all" ? "#1f2937" : "#f3f4f6", color: catFilter === "all" ? "#fff" : "#374151" }}>Toutes</button>
          {catNames.map(c => {
            const cnt = products.filter(p => p.categorie === c).length;
            return (
              <button key={c} onClick={() => setCatFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 flex items-center gap-1"
                style={{ background: catFilter === c ? "#1f2937" : "#f3f4f6", color: catFilter === c ? "#fff" : "#374151" }}>
                {c} <span style={{ opacity: 0.6 }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sort bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-bold">Trier :</span>
        {([{ id:"nom" as const, label:"A→Z" }, { id:"qty" as const, label:"Quantité" }, { id:"valeur" as const, label:"Valeur" }]).map(s => (
          <button key={s.id} onClick={() => setSortBy(s.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: sortBy === s.id ? "#1f2937" : "#f3f4f6", color: sortBy === s.id ? "#fff" : "#374151" }}>{s.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map(p => {
          const qty = productQty(p.id, entries);
          const montant = productMontantNet(p.id, entries, charges);
          const dot = stockDot(stockStatus(qty, p));
          return (
            <button key={p.id} onClick={() => openDetail(p)} className="bg-card rounded-2xl overflow-hidden border border-border text-left active:scale-[0.97] transition-transform">
              <div className="relative h-36 bg-muted">
                <img src={imgSrc(p.img)} alt={p.nom} className="w-full h-full object-cover"/>
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(22,27,36,.75) 0%,transparent 55%)" }}/>
                <div className="absolute top-2 right-2">
                  <div className="w-3 h-3 rounded-full border-2 border-card" style={{ background: dot }}/>
                </div>
                <div className="absolute bottom-2 left-3 right-3">
                  <p className="text-white font-black text-base leading-tight" style={{ fontFamily: "'Nunito', sans-serif" }}>{p.nom}</p>
                  {p.categorie && <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ background: "rgba(255,255,255,0.75)", color: "#1C1A10" }}>{p.categorie}</span>}
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black leading-none" style={{ color: dot, fontFamily: "'Nunito', sans-serif" }}>{qty}</span>
                  <span className="text-sm font-bold text-muted-foreground">{p.unit}</span>
                  <Edit2 size={14} className="ml-auto text-muted-foreground"/>
                </div>
                <p className="text-sm font-semibold text-muted-foreground mt-1">{fmt(productMontant(p.id, entries))} dû</p>
              </div>
            </button>
          );
        })}
      </div>

      {!readOnly && <button onClick={() => setShowNew(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background: "#3b82f6", boxShadow: "0 0 24px #3b82f660" }}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>}

      {detail && (
        <Modal title={editingProduct ? "Modifier le produit" : addMode ? "Recevoir du stock" : detail.nom} color="#374151" onClose={() => { setDetail(null); setAddMode(false); setEditingProduct(false); }}>
          {!addMode && !editingProduct && (
            <>
              <div className="flex gap-3">
                <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleEditPhoto}/>
                <button type="button" onClick={() => editPhotoRef.current?.click()} className="w-20 h-20 rounded-2xl overflow-hidden bg-muted flex-shrink-0 relative group active:scale-95">
                  <img src={imgSrc(detail.img, 160, 160)} alt={detail.nom} className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.45)" }}><Camera size={18} color="white"/></div>
                </button>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted rounded-xl p-3 text-center">
                      <p className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{productQty(detail.id, entries)}</p>
                      <p className="text-xs text-muted-foreground">{detail.unit}</p>
                    </div>
                    <div className="flex-1 bg-muted rounded-xl p-3 text-center">
                      <p className="text-sm font-black" style={{ color: "#C9A227", fontFamily: "'Nunito', sans-serif" }}>{fmt(productMontantNet(detail.id, entries, charges))}</p>
                      <p className="text-xs text-muted-foreground">dû fourn.</p>
                    </div>
                  </div>
                  {detail.categorie && <span className="text-xs px-2 py-0.5 rounded-full font-bold inline-block" style={{ background: "#3b82f622", color: "#3b82f6" }}>{detail.categorie}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingProduct(true); setEditNom(detail.nom); setEditCat(detail.categorie ?? ""); setEditAlertOk(detail.alertOk !== undefined ? String(detail.alertOk) : ""); setEditAlertLow(detail.alertLow !== undefined ? String(detail.alertLow) : ""); }}
                  className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-left" style={{ background: "#EEE9D8", color: "#7A7055" }}>
                  <Edit2 size={13}/> Modifier
                </button>
                <button onClick={() => setAddMode(true)} className="flex-1 py-2.5 rounded-xl text-xs font-black active:scale-95" style={{ background: "#3b82f6", color: "#fff" }}>
                  + Recevoir
                </button>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3"><History size={15} style={{ color: "#3b82f6" }}/><p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>HISTORIQUE</p></div>
                <div className="space-y-2">
                  {entries.filter(e => e.productId === detail.id).sort((a, b) => b.id - a.id).map(e => {
                    const isSale = e.qty < 0;
                    const sc = suppliers.find(s => s.nom === e.fournisseur)?.color ?? "#6b7280";
                    const entryDate = new Date(e.id).toISOString().split("T")[0];
                    const isToday = entryDate === todayRaw || e.date.startsWith(new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"short" }));
                    const isEditing = editingEntryId === e.id;
                    if (isEditing) return (
                      <div key={e.id} className="rounded-xl px-3 py-3 space-y-2 border-2" style={{ borderColor:"#3b82f6", background:"#3b82f608" }}>
                        <p className="text-xs font-bold" style={{ color:"#3b82f6" }}>Modifier l'entrée</p>
                        <div className="flex gap-2">
                          <input value={editEntryQty} onChange={e2=>qtyChange(e2.target.value,setEditEntryQty)} onBlur={e2=>qtyBlur(e2.target.value,setEditEntryQty)} placeholder="0.00" type="number" step="0.01" min="0" className={inputCls+" flex-1"} autoFocus onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                          <input value={editEntryMontant} onChange={e2=>setEditEntryMontant(e2.target.value)} placeholder="Montant dû" type="number" className={inputCls+" flex-1"} onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>setEditingEntryId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background:"#EEE9D8", color:"#7A7055" }}>Annuler</button>
                          <button onClick={()=>saveEntryEdit(e.id)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background:"#3b82f6" }}>Enregistrer</button>
                        </div>
                      </div>
                    );
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: isSale ? "#ef444410" : "#EEE9D8" }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isSale ? "#ef4444" : sc }}/>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: isSale ? "#ef4444" : "inherit" }}>
                            {isSale ? "−" : "+"}{Math.abs(e.qty)} <span className="text-muted-foreground font-normal">{e.unit}</span>
                            {e.nbPieces ? <span className="text-xs text-muted-foreground font-normal ml-1">({e.nbLots && e.nbLots > 1 ? `${e.nbLots}lots×` : ""}{e.nbPieces}p{e.longueurPiece ? `×${e.longueurPiece}` : ""})</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{isSale ? "Vente" : e.nbPieces ? "Lot reçu" : "Achat"} · {e.fournisseur.replace("Vente → ", "")} · {e.date}{e.sku ? ` · SKU: ${e.sku}` : ""}</p>
                        </div>
                        {!isSale && <p className="text-sm font-black" style={{ color: "#C9A227", fontFamily: "'Nunito', sans-serif" }}>{fmt(e.montantDu)}</p>}
                        {!isSale && isToday && (
                          <div className="flex gap-1 ml-1">
                            <button onClick={()=>{ setEditingEntryId(e.id); setEditEntryQty(qtyFmt(e.qty)); setEditEntryMontant(String(e.montantDu)); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#3b82f615" }}><Edit2 size={12} style={{ color:"#3b82f6" }}/></button>
                            <button onClick={()=>deleteEntry(e.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={12} style={{ color:"#ef4444" }}/></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {entries.filter(e => e.productId === detail.id).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun mouvement enregistré</p>
                  )}
                </div>
              </div>

            </>
          )}

          {editingProduct && (
            <>
              <button onClick={() => setEditingProduct(false)} className="flex items-center gap-2 text-muted-foreground mb-1"><ArrowLeft size={16}/><span className="text-sm">Retour</span></button>
              <Field label="NOM DU PRODUIT">
                <input value={editNom} onChange={e => setEditNom(e.target.value)} className={inputCls} autoFocus onKeyDown={e => e.key === "Enter" && saveProductEdit()}/>
              </Field>
              <Field label="CATÉGORIE">
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setEditCat("")} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: !editCat ? "#3b82f6" : "#EEE9D8", color: !editCat ? "#fff" : "#6b7280" }}>Aucune</button>
                  {catNames.map(c => (
                    <button key={c} onClick={() => setEditCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: editCat === c ? "#3b82f6" : "#EEE9D8", color: editCat === c ? "#fff" : "#6b7280" }}>{c}</button>
                  ))}
                </div>
              </Field>
              <div className="p-3 rounded-2xl space-y-3" style={{ background: "#3b82f608", border: "1.5px dashed #3b82f633" }}>
                <p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>SEUILS D'ALERTE STOCK</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SEUIL NORMAL (défaut 20)">
                    <input value={editAlertOk} onChange={e => setEditAlertOk(e.target.value)} placeholder="20" type="number" min="0" className={inputCls + " text-center"}/>
                  </Field>
                  <Field label="SEUIL CRITIQUE (défaut 5)">
                    <input value={editAlertLow} onChange={e => setEditAlertLow(e.target.value)} placeholder="5" type="number" min="0" className={inputCls + " text-center"}/>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Laisser vide pour utiliser les valeurs par défaut (20 / 5).</p>
              </div>
              <SubmitBtn color={boutique.color} label="Enregistrer les modifications" onClick={saveProductEdit} disabled={!editNom.trim()}/>
            </>
          )}

          {addMode && (
            <>
              <button onClick={() => setAddMode(false)} className="flex items-center gap-2 text-muted-foreground"><ArrowLeft size={16}/><span className="text-sm">Retour</span></button>

              {/* Unit from catalogue — info only */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#3b82f618" }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3b82f6" }}/>
                <span className="text-xs font-black tracking-wider flex-1" style={{ color: "#3b82f6" }}>UNITÉ DE VENTE</span>
                <span className="font-black text-sm" style={{ color: "#3b82f6" }}>{dUnit}</span>
              </div>

              {dLotMode ? (
                <div className="p-4 rounded-2xl space-y-3" style={{ background: "#3b82f608", border: "2px dashed #3b82f633" }}>
                  <p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>RÉCEPTION PAR LOTS</p>
                  <div className={`grid gap-2 ${dUnit !== "pièces" ? "grid-cols-3" : "grid-cols-2"}`}>
                    <Field label="NB LOTS">
                      <input value={dLots} onChange={e => {
                        setDLots(e.target.value);
                        if (dPrixUnit) {
                          const newQty = dUnit === "pièces"
                            ? (Number(e.target.value)||1)*(Number(dPieces)||0)
                            : (Number(e.target.value)||1)*(Number(dPieces)||0)*(Number(dLongueur)||0);
                          if (newQty > 0) setDMontant(String(Math.round(newQty * Number(dPrixUnit))));
                        }
                      }} placeholder="1" type="number" min="1" className={inputCls + " text-center font-black text-lg"} autoFocus/>
                    </Field>
                    <Field label="PIÈCES / LOT">
                      <input value={dPieces} onChange={e => setDPieces(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                    </Field>
                    {dUnit !== "pièces" && (
                      <Field label={`${dUnit.toUpperCase()} / PIÈCE`}>
                        <input value={dLongueur} onChange={e => setDLongueur(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                      </Field>
                    )}
                  </div>
                  {dLotQty > 0 && (
                    <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#3b82f615" }}>
                      <span className="text-xs text-muted-foreground">Total reçu</span>
                      <span className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{dLotQty} {dUnit}</span>
                    </div>
                  )}
                </div>
              ) : (
                <Field label={`QUANTITÉ (${dUnit})`}>
                  <input value={dQty} onChange={e => {
                    qtyChange(e.target.value, v => {
                      setDQty(v);
                      if (dPrixUnit && Number(v) > 0) setDMontant(String(Math.round(Number(v) * Number(dPrixUnit))));
                    });
                  }} onBlur={e=>qtyBlur(e.target.value,setDQty)} placeholder="0.00" type="number" step="0.01" min="0" className={inputCls + " text-center font-black text-lg"} autoFocus onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
              )}

              {/* Dual price fields — user fills either one */}
              <div className="grid grid-cols-2 gap-2">
                <Field label={`PRIX / ${dUnit.toUpperCase()}`} color="#C9A227">
                  <input value={dPrixUnit} onChange={e => {
                    setDPrixUnit(e.target.value);
                    const qty = dLotMode ? dLotQty : Number(dQty);
                    if (qty > 0 && Number(e.target.value) > 0) setDMontant(String(Math.round(qty * Number(e.target.value))));
                    else if (!e.target.value) setDMontant("");
                  }} placeholder="0" type="number" className={inputCls + " text-center font-black"} onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
                <Field label="TOTAL DÛ (F CFA)" color="#C9A227">
                  <input value={dMontant} onChange={e => {
                    setDMontant(e.target.value);
                    const qty = dLotMode ? dLotQty : Number(dQty);
                    if (qty > 0 && Number(e.target.value) > 0) setDPrixUnit(String(Math.round(Number(e.target.value) / qty)));
                    else if (!e.target.value) setDPrixUnit("");
                  }} placeholder="0" type="number" className={inputCls + " text-center font-black"} onKeyDown={e => e.key === "Enter" && submitEntry()}/>
                </Field>
              </div>

              {suppliers.length > 0 && (
                <Field label="FOURNISSEUR">
                  <select value={dFourn} onChange={e => setDFourn(e.target.value)} className={inputCls} style={{ appearance: "none" }}>
                    {suppliers.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                  </select>
                </Field>
              )}
              <Field label="RÉFÉRENCE / SKU (optionnel)"><input value={dSku} onChange={e => setDSku(e.target.value)} placeholder="Ex: WAX-001 ou code interne" className={inputCls}/></Field>
              <SubmitBtn color={boutique.color} label="Enregistrer la réception" onClick={submitEntry} disabled={dLotMode ? dLotQty <= 0 : !dQty || Number(dQty) <= 0}/>
            </>
          )}
        </Modal>
      )}

      {showNew && (
        <Modal title="Nouveau produit" color="#374151" onClose={() => setShowNew(false)}>
          <Field label="NOM DU PRODUIT">
            <input value={nNom} onChange={e => setNNom(e.target.value)} placeholder="Ex: Bazin Riche Bleu Royal" className={inputCls} autoFocus/>
          </Field>

          <Field label="CATÉGORIE">
            {nCatMode === "select" ? (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setNCat(""); setNLotMode(false); }} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: !nCat ? "#3b82f6" : "#EEE9D8", color: !nCat ? "#fff" : "#6b7280" }}>Aucune</button>
                {catNames.map(c => (
                  <button key={c} onClick={() => selectNewCat(c)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: nCat === c ? "#3b82f6" : "#EEE9D8", color: nCat === c ? "#fff" : "#6b7280" }}>{c}</button>
                ))}
                <button onClick={() => { setNCatMode("new"); setNCatNew(""); }} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1" style={{ background: "#EEE9D8", color: "#3b82f6" }}><Plus size={11}/> Nouvelle catégorie</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={nCatNew} onChange={e => setNCatNew(e.target.value)} placeholder="Nom de la catégorie" className={inputCls + " flex-1"} autoFocus onKeyDown={e => { if (e.key === "Enter") { setNCatMode("select"); selectNewCat(nCatNew.trim()); }}}/>
                <button onClick={() => { setNCatMode("select"); selectNewCat(nCatNew.trim()); }} className="px-4 py-3 rounded-xl text-sm font-bold" style={{ background: "#3b82f6", color: "#fff" }}>OK</button>
              </div>
            )}
          </Field>

          {/* Unit: auto-filled from category or manually chosen */}
          {nCat && cats.find(c => c.nom === nCat) ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#3b82f618" }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#3b82f6" }}/>
              <span className="text-xs font-black tracking-wider flex-1" style={{ color: "#3b82f6" }}>UNITÉ DE VENTE</span>
              <span className="font-black text-sm" style={{ color: "#3b82f6" }}>{nUnit}</span>
            </div>
          ) : (
            <Field label="UNITÉ DE VENTE">
              <div className="flex gap-2">
                {["yards", "mètres", "pièces"].map(u => (
                  <button key={u} onClick={() => setNUnit(u)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: nUnit === u ? "#3b82f6" : "#EEE9D8", color: nUnit === u ? "#fff" : "#6b7280" }}>{u}</button>
                ))}
              </div>
            </Field>
          )}

          {/* Initial stock — same logic as stock reception */}
          {nLotMode ? (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: "#3b82f608", border: "2px dashed #3b82f633" }}>
              <p className="text-xs font-black tracking-wider" style={{ color: "#3b82f6" }}>STOCK INITIAL (PAR LOTS)</p>
              <div className={`grid gap-2 ${nUnit !== "pièces" ? "grid-cols-3" : "grid-cols-2"}`}>
                <Field label="NB LOTS">
                  <input value={nLots} onChange={e => {
                    setNLots(e.target.value);
                    if (nPrixUnit) {
                      const q = nUnit === "pièces"
                        ? (Number(e.target.value)||1)*(Number(nPieces)||0)
                        : (Number(e.target.value)||1)*(Number(nPieces)||0)*(Number(nLongueur)||0);
                      if (q > 0) setNMontant(String(Math.round(q * Number(nPrixUnit))));
                    }
                  }} placeholder="1" type="number" min="1" className={inputCls + " text-center font-black text-lg"}/>
                </Field>
                <Field label="PIÈCES / LOT">
                  <input value={nPieces} onChange={e => setNPieces(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                </Field>
                {nUnit !== "pièces" && (
                  <Field label={`${nUnit.toUpperCase()} / PIÈCE`}>
                    <input value={nLongueur} onChange={e => setNLongueur(e.target.value)} placeholder="—" type="number" className={inputCls + " text-center font-black text-lg"}/>
                  </Field>
                )}
              </div>
              {nLotQty > 0 && (
                <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#3b82f615" }}>
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-2xl font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>{nLotQty} {nUnit}</span>
                </div>
              )}
            </div>
          ) : (
            <Field label={`STOCK INITIAL (${nUnit}) — optionnel`}>
              <input value={nQty} onChange={e => {
                qtyChange(e.target.value, v => {
                  setNQty(v);
                  if (nPrixUnit && Number(v) > 0) setNMontant(String(Math.round(Number(v) * Number(nPrixUnit))));
                });
              }} onBlur={e=>qtyBlur(e.target.value,setNQty)} placeholder="0.00" type="number" step="0.01" min="0" className={inputCls + " text-center font-black text-lg"}/>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label={`PRIX / ${nUnit.toUpperCase()}`} color="#C9A227">
              <input value={nPrixUnit} onChange={e => {
                setNPrixUnit(e.target.value);
                const qty = nLotMode ? nLotQty : Number(nQty);
                if (qty > 0 && Number(e.target.value) > 0) setNMontant(String(Math.round(qty * Number(e.target.value))));
                else if (!e.target.value) setNMontant("");
              }} placeholder="0" type="number" className={inputCls + " text-center font-black"}/>
            </Field>
            <Field label="TOTAL DÛ (F CFA)" color="#C9A227">
              <input value={nMontant} onChange={e => {
                setNMontant(e.target.value);
                const qty = nLotMode ? nLotQty : Number(nQty);
                if (qty > 0 && Number(e.target.value) > 0) setNPrixUnit(String(Math.round(Number(e.target.value) / qty)));
                else if (!e.target.value) setNPrixUnit("");
              }} placeholder="0" type="number" className={inputCls + " text-center font-black"}/>
            </Field>
          </div>

          {suppliers.length > 0 && (
            <Field label="FOURNISSEUR">
              <select value={nFourn} onChange={e => setNFourn(e.target.value)} className={inputCls} style={{ appearance: "none" }}>
                {suppliers.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
              </select>
            </Field>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile}/>
          <button type="button" onClick={() => photoInputRef.current?.click()} className="w-full border-2 border-dashed rounded-2xl overflow-hidden active:scale-[0.98]" style={{ borderColor: nImg ? "#3b82f6" : "rgba(0,0,0,0.12)", background: "#3b82f608" }}>
            {nImg
              ? <img src={nImg} alt="preview" className="w-full h-40 object-cover"/>
              : <div className="p-5 flex flex-col items-center gap-2"><Camera size={28} style={{ color: "#3b82f6" }}/><p className="text-sm font-bold" style={{ color: "#3b82f6" }}>Ajouter une photo (optionnel)</p></div>}
          </button>
          <SubmitBtn color={boutique.color} label="Créer le produit" onClick={submitNew} disabled={!nNom.trim()}/>
        </Modal>
      )}

      {/* ── Rentabilité section (compta-gated) ──────────────────────────────── */}
      {canSeeMarginSv && (
        <div className="border border-border rounded-2xl overflow-hidden">
          <button onClick={()=>setShowRenta(r=>!r)} className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600"/>
              <span className="text-sm font-bold">Rentabilité par produit</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Privé</span>
            </div>
            <ChevronRight size={16} className={`text-muted-foreground transition-transform ${showRenta?"rotate-90":""}`}/>
          </button>
          {showRenta && (() => {
            // Compute per-product margin from invoices with prixAchat stored
            const invoices = boutique.invoices ?? [];
            type ProdRenta = { id:number; nom:string; nbVentes:number; ca:number; cout:number; marge:number; margePct:number };
            const map: Record<number, ProdRenta> = {};
            for (const inv of invoices) {
              if (inv.type === "Transfert interne" || inv.type === "B2B Achat" || inv.type === "Retour") continue;
              for (const l of (inv.lines ?? [])) {
                if (!l.productId || l.prixAchat == null) continue;
                if (!map[l.productId]) {
                  const p = products.find(pr => pr.id === l.productId);
                  map[l.productId] = { id:l.productId, nom:p?.nom ?? l.nom, nbVentes:0, ca:0, cout:0, marge:0, margePct:0 };
                }
                const lineCA = lineTotal(l);
                const lineCout = l.prixAchat * l.qty;
                map[l.productId].nbVentes++;
                map[l.productId].ca += lineCA;
                map[l.productId].cout += lineCout;
                map[l.productId].marge += lineCA - lineCout;
              }
            }
            let rows = Object.values(map).map(r => ({ ...r, margePct: r.ca > 0 ? Math.round(r.marge / r.ca * 100) : 0 }));
            if (rows.length === 0) return (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">Aucune donnée de marge disponible — les marges sont calculées sur les ventes enregistrées avec FIFO.</div>
            );
            rows.sort((a,b) => rentaSort==="pct" ? b.margePct-a.margePct : rentaSort==="ca" ? b.ca-a.ca : b.marge-a.marge);
            return (
              <div>
                <div className="flex gap-2 px-4 py-2 border-t border-border bg-background">
                  {([["marge","Marge ↓"],["ca","CA ↓"],["pct","% ↓"]] as [typeof rentaSort, string][]).map(([id,label])=>(
                    <button key={id} onClick={()=>setRentaSort(id)} className="px-2.5 py-1 rounded-lg text-xs font-bold"
                      style={{background:rentaSort===id?"#1f2937":"#f3f4f6",color:rentaSort===id?"#fff":"#374151"}}>{label}</button>
                  ))}
                </div>
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 text-xs font-bold text-muted-foreground">
                    <span className="col-span-1">Produit</span>
                    <span className="text-right">CA</span>
                    <span className="text-right">Marge</span>
                    <span className="text-right">%</span>
                  </div>
                  {rows.map(r => (
                    <div key={r.id} className="grid grid-cols-4 gap-2 px-4 py-2.5 items-center text-sm">
                      <div className="col-span-1 min-w-0">
                        <p className="font-medium truncate text-xs">{r.nom}</p>
                        <p className="text-xs text-muted-foreground">{r.nbVentes} vente(s)</p>
                      </div>
                      <span className="text-right text-xs font-bold">{fmt(r.ca)}</span>
                      <span className={`text-right text-xs font-bold ${r.marge>=0?"text-emerald-600":"text-red-600"}`}>{r.marge>=0?"+":""}{fmt(r.marge)}</span>
                      <span className={`text-right text-xs font-black px-1.5 py-0.5 rounded-full justify-self-end ${r.margePct>=30?"bg-emerald-100 text-emerald-700":r.margePct>=10?"bg-amber-100 text-amber-700":"bg-red-100 text-red-600"}`}>{r.margePct}%</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-gray-50 text-sm font-black">
                    <span className="col-span-1 text-xs">Total</span>
                    <span className="text-right text-xs">{fmt(rows.reduce((s,r)=>s+r.ca,0))}</span>
                    <span className={`text-right text-xs ${rows.reduce((s,r)=>s+r.marge,0)>=0?"text-emerald-600":"text-red-600"}`}>{fmt(rows.reduce((s,r)=>s+r.marge,0))}</span>
                    <span className="text-right text-xs">{rows.reduce((s,r)=>s+r.ca,0)>0?Math.round(rows.reduce((s,r)=>s+r.marge,0)/rows.reduce((s,r)=>s+r.ca,0)*100):0}%</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── VIEW: FOURNISSEURS ───────────────────────────────────────────────────────

function FournisseursView({ boutique, onUpdate, logAction }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const readOnly = useReadOnly();
  const { suppliers, products, entries } = boutique;
  const [search,setSearch]=useState("");
  const [expanded,setExpanded]=useState<number|null>(null); const [modal,setModal]=useState(false);
  const [nom,setNom]=useState(""); const [ville,setVille]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState("");
  const [fEmail,setFEmail]=useState(""); const [fContact,setFContact]=useState("");

  // Edit supplier state
  const [editSupplier,setEditSupplier]=useState<Supplier|null>(null);
  const [eNom,setENom]=useState(""); const [eVille,setEVille]=useState("");
  const [eEmail,setEEmail]=useState(""); const [eContact,setEContact]=useState("");
  const [eDialCode,setEDialCode]=useState("+221"); const [eTel,setETel]=useState("");
  const [deleteSupplierId,setDeleteSupplierId]=useState<number|null>(null);
  // B2B debt payment state
  const [b2bPayCharge,setB2bPayCharge]=useState<Charge|null>(null);
  const [b2bPayAmt,setB2bPayAmt]=useState("");
  const [b2bPayDone,setB2bPayDone]=useState(false);

  function submitB2BPayment() {
    if (!b2bPayCharge) return;
    const montant = Number(b2bPayAmt);
    if (!montant || montant <= 0) return;
    const reste = b2bPayCharge.montant - (b2bPayCharge.acompte ?? 0);
    const paid = Math.min(montant, reste);
    const newAcompte = (b2bPayCharge.acompte ?? 0) + paid;
    const newStatus: Charge["status"] = newAcompte >= b2bPayCharge.montant ? "payé" : "partiel";
    onUpdate({ charges: (boutique.charges??[]).map(c => c.id!==b2bPayCharge.id ? c : { ...c, acompte:newAcompte, status:newStatus }) });
    logAction("Paiement B2B enregistré", `${b2bPayCharge.fournisseur} — ${fmt(paid)}`, "💰");
    setB2bPayDone(true);
    setTimeout(() => { setB2bPayCharge(null); setB2bPayAmt(""); setB2bPayDone(false); }, 1800);
  }

  function openEditSupplier(s: Supplier) {
    setEditSupplier(s);
    setENom(s.nom); setEVille(s.ville); setEEmail(s.email??""); setEContact(s.contact??"");
    const parts = s.tel?.split(" ")??[];
    setEDialCode(parts[0]&&parts[0].startsWith("+")?parts[0]:"+221");
    setETel(parts.length>1?parts.slice(1).join(" "):s.tel??"");
  }
  function saveEditSupplier() {
    if (!editSupplier||!eNom.trim()) return;
    const fullTel = eTel.trim()?eDialCode+" "+eTel.trim():"";
    onUpdate({ suppliers: suppliers.map(x=>x.id!==editSupplier.id?x:{ ...x, nom:eNom.trim(), ville:eVille.trim(), tel:fullTel, ...(eEmail.trim()?{email:eEmail.trim()}:{email:undefined}), ...(eContact.trim()?{contact:eContact.trim()}:{contact:undefined}) }) });
    logAction("Fournisseur modifié",eNom.trim(),"✏️");
    setEditSupplier(null);
  }
  function doDeleteSupplier(sid: number) {
    onUpdate({ suppliers: suppliers.filter(x=>x.id!==sid) });
    logAction("Fournisseur supprimé",`#${sid}`,"🗑️");
    setDeleteSupplierId(null);
  }

  function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim()?dialCode+" "+tel.trim():"";
    onUpdate({ suppliers:[...suppliers,{ id:Date.now(), nom:nom.trim(), ville:ville.trim(), lastDelivery:today(), tel:fullTel, initials:ini(nom.trim()), color:SUP_COLORS[suppliers.length%SUP_COLORS.length], ...(fEmail.trim()?{email:fEmail.trim()}:{}), ...(fContact.trim()?{contact:fContact.trim()}:{}) }] });
    logAction("Nouveau fournisseur",`${nom.trim()} · ${ville.trim()}`,"🚛");
    setNom(""); setVille(""); setTel("+221 "); setFEmail(""); setFContact(""); setModal(false);
  }
  const filteredSuppliers = suppliers.filter(s=>s.nom.toLowerCase().includes(search.toLowerCase())||s.ville.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un fournisseur…" className={inputCls+" pl-11"}/></div>
      {filteredSuppliers.map(s=>{
        const isOpen=expanded===s.id;
        const balance=supplierBalance(s.nom,entries,boutique.charges);
        const allEntries=entries.filter(e=>e.fournisseur===s.nom&&e.qty>0).sort((a,b)=>b.id-a.id);
        const internalEntries=allEntries.filter(e=>e.isTransfertInterne);
        const realEntries=allEntries.filter(e=>!e.isTransfertInterne);
        const b2bDebts=(boutique.charges??[]).filter(c=>c.fournisseur===s.nom&&c.isB2BDebt).sort((a,b)=>b.id-a.id);
        const regularPays=(boutique.charges??[]).filter(c=>c.fournisseur===s.nom&&!c.isB2BDebt).sort((a,b)=>b.id-a.id);
        const hasMixed=internalEntries.length>0&&(realEntries.length>0||b2bDebts.length>0);
        return (
          <div key={s.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <button className="w-full flex items-center gap-3 p-4 text-left" onClick={()=>setExpanded(isOpen?null:s.id)}>
              <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:s.color+"22", color:s.color, fontFamily:"'Nunito', sans-serif" }}>{s.initials}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">{s.nom}</p>
                <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{s.ville||"—"}</span></div>
                {hasMixed&&<span className="text-xs font-bold px-1.5 py-0.5 rounded-md mt-1 inline-block" style={{ background:"#3b82f615", color:"#3b82f6" }}>Réseau + tiers</span>}
              </div>
              <div className="text-right mr-1">
                <p className="text-sm font-black" style={{ color:balance>0?"#ef4444":"#6b7280", fontFamily:"'Nunito', sans-serif" }}>{balance>0?fmt(balance):"—"}</p>
                <p className="text-xs text-muted-foreground">{allEntries.length} entrées</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground transition-transform duration-200" style={{ transform:isOpen?"rotate(90deg)":"rotate(0deg)" }}/>
            </button>
            {isOpen&&<div className="border-t border-border">
              <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border">
                <button onClick={e=>{e.stopPropagation();openEditSupplier(s);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background:"#37415115", color:"#374151" }}><Edit2 size={12}/> Modifier</button>
                <button onClick={e=>{e.stopPropagation();setDeleteSupplierId(s.id);}} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background:"#ef444415", color:"#ef4444" }}><Trash2 size={12}/> Supprimer</button>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:s.color+"22" }}><Phone size={14} style={{ color:s.color }}/></div>
                <span className="text-sm font-semibold" style={{ color:s.color }}>{s.tel||"—"}</span>
                {s.email&&<a href={`mailto:${s.email}`} className="ml-2 text-xs text-muted-foreground underline">{s.email}</a>}
                {s.contact&&<span className="ml-2 text-xs text-muted-foreground">· {s.contact}</span>}
                {balance>0&&<div className="ml-auto px-3 py-1.5 rounded-xl" style={{ background:"#ef444422" }}><span className="text-xs font-black" style={{ color:"#ef4444" }}>DOIT: {fmt(balance)}</span></div>}
              </div>

              {/* B2B debt charges — with payment status and action */}
              {b2bDebts.length>0&&<div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-black tracking-wider mb-3" style={{ color:"#d97706" }}>DETTES B2B — TRANSFERTS INTER-BOUTIQUES</p>
                <div className="space-y-2">
                  {b2bDebts.map(c=>{
                    const reste=c.montant-(c.acompte??0);
                    const isPaid=c.status==="payé";
                    const isPartiel=c.status==="partiel";
                    return (
                      <div key={c.id} className="rounded-xl overflow-hidden border" style={{ borderColor:isPaid?"#16a34a30":isPartiel?"#d9770640":"#ef444430" }}>
                        <div className="flex items-center gap-3 px-3 py-2.5" style={{ background:isPaid?"#f0fdf4":isPartiel?"#fffbeb":"#fef2f2" }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold">{c.label}</p>
                              <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background:isPaid?"#16a34a20":isPartiel?"#d9770620":"#ef444420", color:isPaid?"#16a34a":isPartiel?"#d97706":"#ef4444" }}>
                                {isPaid?"PAYÉ":isPartiel?"PARTIEL":"EN ATTENTE"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.date} · {c.note}</p>
                            {isPartiel&&<p className="text-xs font-bold mt-0.5" style={{ color:"#d97706" }}>Payé: {fmt(c.acompte??0)} — Reste: {fmt(reste)}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color:"#1a1a1a", fontFamily:"'Nunito',sans-serif" }}>{fmt(c.montant)}</p>
                            {!isPaid&&!readOnly&&<button onClick={()=>{setB2bPayCharge(c);setB2bPayAmt(String(reste));setB2bPayDone(false);}} className="mt-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#1a1a1a", color:"#fff" }}>Payer</button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Stock entries: real purchases */}
              {realEntries.length>0&&<div className="px-4 py-3" style={internalEntries.length>0?{borderBottom:"1px solid var(--border)"}:{}}>
                <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">LIVRAISONS ACHAT</p>
                <div className="space-y-2">
                  {realEntries.map(e=>{
                    const prod=products.find(p=>p.id===e.productId);
                    return (
                      <div key={e.id} className="flex items-center gap-3 bg-muted rounded-xl px-3 py-2.5">
                        {prod&&<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,80,80)} alt={prod.nom} className="w-full h-full object-cover"/></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{prod?prod.nom:"Produit"}</p>
                          <p className="text-xs text-muted-foreground">{e.qty} {e.unit} · {e.date}</p>
                        </div>
                        <p className="text-sm font-black" style={{ color:"#C9A227", fontFamily:"'Nunito',sans-serif" }}>{fmt(e.montantDu)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Internal transfer entries — traceability only, no financial impact */}
              {internalEntries.length>0&&<div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-black tracking-wider text-muted-foreground">TRANSFERTS RÉSEAU</p>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background:"#3b82f615", color:"#3b82f6" }}>Même propriétaire · sans impact financier</span>
                </div>
                <div className="space-y-2">
                  {internalEntries.map(e=>{
                    const prod=products.find(p=>p.id===e.productId);
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background:"#3b82f608", border:"1px solid #3b82f620" }}>
                        {prod&&<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 opacity-70"><img src={imgSrc(prod.img,80,80)} alt={prod.nom} className="w-full h-full object-cover"/></div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color:"#374151" }}>{prod?prod.nom:"Produit"}</p>
                          <p className="text-xs" style={{ color:"#6b7280" }}>{e.qty} {e.unit} · {e.date}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background:"#3b82f615", color:"#3b82f6" }}>interne</span>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {allEntries.length===0&&b2bDebts.length===0&&<div className="px-4 py-3"><p className="text-sm text-muted-foreground">Aucune entrée</p></div>}

              {/* Regular payment charges */}
              {regularPays.length>0&&<div className="px-4 pb-3 border-t border-border">
                <p className="text-xs font-black tracking-wider mb-3 mt-3" style={{ color:SEM.success.text }}>PAIEMENTS EFFECTUÉS</p>
                <div className="space-y-2">
                  {regularPays.map(c=>(
                    <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background:SEM.success.bg }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:SEM.success.accent }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.date}</p>
                      </div>
                      <p className="text-sm font-black" style={{ color:SEM.success.text, fontFamily:"'Nunito',sans-serif" }}>−{fmt(c.montant)}</p>
                    </div>
                  ))}
                </div>
              </div>}
            </div>}
          </div>
        );
      })}
      {!readOnly && <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:boutique.color, boxShadow:"0 0 24px "+boutique.color+"60" }}><Plus size={28} color="white" strokeWidth={2.5}/></button>}

      {/* Edit supplier modal */}
      {editSupplier&&<Modal title="Modifier le fournisseur" color="#374151" onClose={()=>setEditSupplier(null)}>
        <Field label="NOM"><input value={eNom} onChange={e=>setENom(e.target.value)} className={inputCls} autoFocus/></Field>
        <Field label="VILLE"><input value={eVille} onChange={e=>setEVille(e.target.value)} className={inputCls}/></Field>
        <Field label="E-MAIL (optionnel)"><input value={eEmail} onChange={e=>setEEmail(e.target.value)} className={inputCls} type="email" placeholder="contact@fournisseur.com"/></Field>
        <Field label="PERSONNE DE CONTACT (optionnel)"><input value={eContact} onChange={e=>setEContact(e.target.value)} className={inputCls} placeholder="Nom du responsable"/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={eDialCode} setDialCode={setEDialCode} phone={eTel} setPhone={setETel} inputCls={inputCls}/>
        <SubmitBtn color="#374151" label="Enregistrer" onClick={saveEditSupplier} disabled={!eNom.trim()}/>
      </Modal>}

      {/* Delete supplier confirm */}
      {deleteSupplierId!==null&&(
        <Modal title="Supprimer le fournisseur" color="#ef4444" onClose={()=>setDeleteSupplierId(null)}>
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#fef2f2", border:"1px solid #ef444430" }}>
            <p className="text-sm font-bold" style={{ color:"#991b1b" }}>Confirmer la suppression ?</p>
            <p className="text-xs text-muted-foreground mt-1">Les entrées de stock liées à ce fournisseur seront conservées.</p>
          </div>
          <button onClick={()=>doDeleteSupplier(deleteSupplierId)} className="w-full py-4 rounded-2xl font-black text-sm active:scale-95" style={{ background:"#ef4444", color:"#fff" }}>Confirmer</button>
        </Modal>
      )}
      {modal&&<Modal title="Nouveau fournisseur" color="#374151" onClose={()=>setModal(false)}>
        <Field label="NOM"><input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Konaté Tissus" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <Field label="E-MAIL (optionnel)"><input value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="contact@fournisseur.com" type="email" className={inputCls}/></Field>
        <Field label="PERSONNE DE CONTACT (optionnel)"><input value={fContact} onChange={e=>setFContact(e.target.value)} placeholder="Nom du responsable" className={inputCls}/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/>
        <SubmitBtn color={boutique.color} label="Enregistrer le fournisseur" onClick={submit}/>
      </Modal>}

      {/* B2B debt payment modal */}
      {b2bPayCharge&&<Modal title="Enregistrer un paiement B2B" color="#d97706" onClose={()=>{setB2bPayCharge(null);setB2bPayAmt("");setB2bPayDone(false);}}>
        <div className="px-4 py-3 rounded-2xl mb-2" style={{ background:"#fffbeb", border:"1px solid #d9770640" }}>
          <p className="text-sm font-bold">{b2bPayCharge.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{b2bPayCharge.note}</p>
          <div className="flex justify-between mt-2">
            <span className="text-xs font-bold text-muted-foreground">Montant total</span>
            <span className="text-sm font-black">{fmt(b2bPayCharge.montant)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs font-bold text-muted-foreground">Déjà payé</span>
            <span className="text-sm font-black" style={{ color:SEM.success.text }}>{fmt(b2bPayCharge.acompte??0)}</span>
          </div>
          <div className="flex justify-between border-t border-amber-200 mt-1 pt-1">
            <span className="text-xs font-black" style={{ color:"#d97706" }}>Reste dû</span>
            <span className="text-sm font-black" style={{ color:"#d97706" }}>{fmt(b2bPayCharge.montant-(b2bPayCharge.acompte??0))}</span>
          </div>
        </div>
        {b2bPayDone ? (
          <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{ background:SEM.success.bg }}>
            <span className="text-xl">✅</span>
            <span className="font-black" style={{ color:SEM.success.text }}>Paiement enregistré</span>
          </div>
        ) : (
          <>
            <Field label="MONTANT DU PAIEMENT">
              <div className="relative">
                <input type="number" value={b2bPayAmt} onChange={e=>setB2bPayAmt(e.target.value)} className={inputCls+" pr-10"} placeholder="0"/>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">F</span>
              </div>
            </Field>
            <SubmitBtn color="#d97706" label="Confirmer le paiement" onClick={submitB2BPayment} disabled={!Number(b2bPayAmt)||Number(b2bPayAmt)<=0}/>
          </>
        )}
      </Modal>}
    </div>
  );
}

const PAYMENT_METHODS: PaymentMethod[] = ["Espèces", "Wave", "Orange Money", "Autre"];
const PM_ICON: Record<PaymentMethod, string> = { "Espèces":"💵", "Wave":"📱", "Orange Money":"🔶", "Autre":"💳" };
const PM_COLOR: Record<PaymentMethod, string> = { "Espèces":"#1E9B1E", "Wave":"#3b82f6", "Orange Money":"#f97316", "Autre":"#a855f7" };

// ─── VIEW: CLIENTS ────────────────────────────────────────────────────────────


// ─── PHONE PREFIX SELECTOR ───────────────────────────────────────────────────
const DIAL_CODES = [
  { code: "+221", flag: "🇸🇳", name: "Sénégal" },
  { code: "+225", flag: "🇨🇮", name: "Côte d'Ivoire" },
  { code: "+223", flag: "🇲🇱", name: "Mali" },
  { code: "+224", flag: "🇬🇳", name: "Guinée" },
  { code: "+233", flag: "🇬🇭", name: "Ghana" },
  { code: "+226", flag: "🇧🇫", name: "Burkina Faso" },
  { code: "+228", flag: "🇹🇬", name: "Togo" },
  { code: "+229", flag: "🇧🇯", name: "Bénin" },
  { code: "+227", flag: "🇳🇪", name: "Niger" },
  { code: "+212", flag: "🇲🇦", name: "Maroc" },
  { code: "+213", flag: "🇩🇿", name: "Algérie" },
  { code: "+216", flag: "🇹🇳", name: "Tunisie" },
  { code: "+33",  flag: "🇫🇷", name: "France" },
  { code: "+32",  flag: "🇧🇪", name: "Belgique" },
  { code: "+41",  flag: "🇨🇭", name: "Suisse" },
  { code: "+1",   flag: "🇺🇸", name: "USA/Canada" },
];
function PhoneField({ label, dialCode, setDialCode, phone, setPhone, inputCls }: { label: string; dialCode: string; setDialCode: (v: string) => void; phone: string; setPhone: (v: string) => void; inputCls: string }) {
  return (
    <div>
      <label className="text-sm font-black mb-2 block tracking-wide" style={{ color: "#374151" }}>{label}</label>
      <div className="flex gap-2">
        <select value={dialCode} onChange={e => setDialCode(e.target.value)} className={inputCls} style={{ width: "90px", appearance: "none", flexShrink: 0 }}>
          {DIAL_CODES.map(d => <option key={d.code} value={d.code}>{d.flag} {d.code}</option>)}
        </select>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="77 000 0000" type="tel" className={inputCls + " flex-1"}/>
      </div>
    </div>
  );
}
function ClientsView({ boutique, allBoutiques, platformUsers, currentUser, onUpdate, logAction, initialTab }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[];
  currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialTab?: ClientType;
}) {
  const readOnly = useReadOnly();
  const { clients } = boutique;
  const canCreateB2B = currentUser.isSuperAdmin;
  const [tab, setTab] = useState<ClientType>(initialTab ?? "B2C");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [nom,setNom]=useState(""); const [dialCode,setDialCode]=useState("+221"); const [tel,setTel]=useState(""); const [ville,setVille]=useState(""); const [type,setType]=useState<ClientType>("B2C");
  const [adresse,setAdresse]=useState(""); const [email,setEmail]=useState(""); const [contact,setContact]=useState("");
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers);
  const filtered = clients.filter(c=>c.type===tab&&(c.nom.toLowerCase().includes(search.toLowerCase())||c.tel.includes(search)||c.ville.toLowerCase().includes(search.toLowerCase())));
  const counts = { "B2C":clients.filter(c=>c.type==="B2C").length, "B2B":clients.filter(c=>c.type==="B2B").length, "Grossiste":clients.filter(c=>c.type==="Grossiste").length };
  function submit() {
    if (!nom.trim()) return;
    const fullTel = tel.trim() ? dialCode + " " + tel.trim() : "";
    onUpdate({ clients:[...clients,{ id:Date.now(), nom:nom.trim(), type, tel:fullTel, total:0, last:today(), ville:ville.trim(), adresse:adresse.trim()||undefined, email:email.trim()||undefined, contact:contact.trim()||undefined }] });
    logAction("Nouveau client",`${nom.trim()} (${type}) · ${ville.trim()}`,"👥");
    setNom(""); setDialCode("+221"); setTel(""); setVille(""); setAdresse(""); setEmail(""); setContact(""); setModal(false);
  }
  const [detailClient, setDetailClient] = useState<Client|null>(null);
  const [editClient, setEditClient] = useState<Client|null>(null);
  const [deleteClientId, setDeleteClientId] = useState<number|null>(null);
  // edit form state (reuses creation form fields)
  const [eNom,setENom]=useState(""); const [eDialCode,setEDialCode]=useState("+221"); const [eTel,setETel]=useState("");
  const [eVille,setEVille]=useState(""); const [eAdresse,setEAdresse]=useState(""); const [eEmail,setEEmail]=useState(""); const [eContact,setEContact]=useState("");

  function openEditClient(c: Client) {
    const parts = c.tel?.split(" ") ?? [];
    const dc = parts[0]?.startsWith("+") ? parts[0] : "+221";
    const ph = parts[0]?.startsWith("+") ? parts.slice(1).join(" ") : c.tel ?? "";
    setENom(c.nom); setEDialCode(dc); setETel(ph); setEVille(c.ville??""); setEAdresse(c.adresse??""); setEEmail(c.email??""); setEContact(c.contact??"");
    setEditClient(c);
  }
  function saveEditClient() {
    if (!editClient||!eNom.trim()) return;
    const fullTel = eTel.trim() ? eDialCode+" "+eTel.trim() : "";
    onUpdate({ clients: clients.map(x=>x.id!==editClient.id?x:{ ...x, nom:eNom.trim(), tel:fullTel, ville:eVille.trim(), adresse:eAdresse.trim()||undefined, email:eEmail.trim()||undefined, contact:eContact.trim()||undefined }) });
    logAction("Client modifié", eNom.trim(), "✏️");
    setEditClient(null);
  }
  function confirmDeleteClient(cid: number) {
    const hasInvoices = boutique.invoices.some(i=>i.client===(clients.find(x=>x.id===cid)?.nom??""));
    setDeleteClientId(cid);
    if (!hasInvoices) doDeleteClient(cid);
  }
  function doDeleteClient(cid: number) {
    const c = clients.find(x=>x.id===cid);
    onUpdate({ clients: clients.filter(x=>x.id!==cid) });
    logAction("Client supprimé", c?.nom??"", "🗑️");
    setDeleteClientId(null);
    if (detailClient?.id===cid) setDetailClient(null);
  }
  const tabDefs: Array<{id:ClientType;label:string;color:string}> = [
    {id:"B2C",      label:"👤 Particuliers", color:"#374151"},
    {id:"B2B",      label:"🏢 Entreprises",  color:"#0e7490"},
    {id:"Grossiste",label:"📦 Grossistes",   color:"#6d28d9"},
  ];
  const clientColor = (t: ClientType) => t==="Grossiste"?"#6d28d9":t==="B2B"?"#0e7490":"#374151";

  // Client accounting detail modal
  if (detailClient) {
    const c = detailClient;
    const CC = clientColor(c.type);
    const clientInvoices = boutique.invoices.filter(inv => inv.client === c.nom).sort((a,b)=>(b.dateRaw??b.date).localeCompare(a.dateRaw??a.date));
    const totalFacturé  = clientInvoices.reduce((s,i)=>s+i.montant,0);
    const totalEncaissé = clientInvoices.reduce((s,i)=>s+i.acompte,0);
    const totalImpayé   = totalFacturé - totalEncaissé;
    const nbVentes = clientInvoices.filter(i=>i.acompte>0).length;
    const panierMoyen = nbVentes>0?totalEncaissé/nbVentes:0;
    const retours = clientInvoices.filter(i=>i.type==="Retour");
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);

    // Monthly breakdown
    const byMonth: Record<string,{facturé:number;encaissé:number}> = {};
    clientInvoices.forEach(inv=>{
      const m = (inv.dateRaw??"").slice(0,7) || inv.date.slice(-7);
      if (!byMonth[m]) byMonth[m]={facturé:0,encaissé:0};
      byMonth[m].facturé += inv.montant;
      byMonth[m].encaissé += inv.acompte;
    });
    const months = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);

    return (
      <div className="space-y-4 pb-24">
        <button onClick={()=>setDetailClient(null)} className="flex items-center gap-2 text-muted-foreground active:opacity-70">
          <ArrowLeft size={18}/><span className="text-sm font-bold">Retour</span>
        </button>
        {/* Header card */}
        <div className="rounded-2xl p-4 border" style={{ borderColor:CC+"33", background:CC+"08" }}>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg font-black" style={{ background:CC+"22",color:CC,fontFamily:"'Nunito',sans-serif" }}>{ini(c.nom)}</div>
            <div className="flex-1">
              <p className="font-black text-lg leading-tight" style={{ fontFamily:"'Nunito',sans-serif" }}>{c.nom}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {c.tel&&<div className="flex items-center gap-1"><Phone size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.tel}</span></div>}
                {c.ville&&<div className="flex items-center gap-1"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.ville}</span></div>}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1 inline-block" style={{ background:CC+"22",color:CC }}>{c.type}</span>
            </div>
          </div>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {label:"CA Facturé",val:fmt(totalFacturé),color:CC,sub:`${clientInvoices.length} factures`},
            {label:"Encaissé",val:fmt(totalEncaissé),color:SEM.success.accent,sub:`${nbVentes} ventes`},
            {label:"Impayé",val:fmt(totalImpayé),color:totalImpayé>0?SEM.warning.accent:SEM.neutral.accent,sub:totalImpayé>0?"⚠ En attente":"✓ Soldé"},
            {label:"Panier moyen",val:fmt(panierMoyen),color:"#a855f7",sub:"par vente"},
          ].map(k=>(
            <div key={k.label} className="bg-card rounded-2xl p-3.5 border border-border">
              <p className="text-xs font-bold text-muted-foreground">{k.label}</p>
              <p className="text-xl font-black mt-0.5" style={{ color:k.color,fontFamily:"'Nunito',sans-serif" }}>{k.val}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
        {/* Monthly chart */}
        {months.length>0&&<div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-3">HISTORIQUE MENSUEL</p>
          <div className="space-y-2">
            {months.map(([m,v])=>{
              const pct = totalFacturé>0?v.encaissé/totalFacturé*100:0;
              return <div key={m}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold">{m}</span>
                  <span className="text-muted-foreground">{fmt(v.encaissé)} / {fmt(v.facturé)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width:`${Math.min(100,pct)}%`,background:CC }}/>
                </div>
              </div>;
            })}
          </div>
        </div>}
        {/* Returns */}
        {retours.length>0&&<div className="rounded-2xl p-3.5 border" style={{ borderColor:"#ef444425",background:"#ef444408" }}>
          <p className="text-xs font-black tracking-wider mb-2" style={{ color:"#ef4444" }}>RETOURS ({retours.length})</p>
          <p className="text-xl font-black" style={{ color:"#ef4444",fontFamily:"'Nunito',sans-serif" }}>{fmt(totalRetours)}</p>
        </div>}
        {/* All invoices */}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">TOUTES LES TRANSACTIONS</p>
          <div className="space-y-2">
            {clientInvoices.length===0&&<p className="text-sm text-muted-foreground text-center py-6">Aucune transaction</p>}
            {clientInvoices.map(inv=>{
              const [tc,bc]=invBadge(inv.status);
              const isReturn=inv.type==="Retour";
              return <div key={inv.id} className="bg-card rounded-2xl p-3.5 border border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-muted-foreground">{inv.id}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold capitalize" style={{ background:bc,color:tc }}>{inv.status}</span>
                    {isReturn&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#ef444415",color:"#ef4444" }}>Retour</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{inv.date} · {inv.type}</p>
                  {inv.paymentMethod&&<p className="text-xs text-muted-foreground">{PM_ICON[inv.paymentMethod]} {inv.paymentMethod}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-sm" style={{ fontFamily:"'Nunito',sans-serif" }}>{fmt(inv.montant)}</p>
                  {inv.acompte>0&&<p className="text-xs font-semibold" style={{ color:SEM.success.accent }}>✓ {fmt(inv.acompte)}</p>}
                  {inv.montant-inv.acompte>0&&<p className="text-xs font-semibold" style={{ color:SEM.warning.accent }}>⏳ {fmt(inv.montant-inv.acompte)}</p>}
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un client…" className={inputCls+" pl-11"}/></div>
      <div className="flex bg-card rounded-2xl p-1 border border-border gap-1">
        {tabDefs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className="flex-1 py-2.5 rounded-xl text-xs font-bold relative" style={{ background:tab===t.id?t.color:"transparent", color:tab===t.id?"#fff":"#6b7280" }}>
            {t.label.split(" ").slice(1).join(" ")}
            <span className="ml-1 text-xs opacity-70">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      {/* B2B: boutiques grouped by owner — only same-owner siblings */}
      {tab==="B2B" && (() => {
        // Only show boutiques that share the same Propriétaire (siblings), never other tenants
        const visibleBoutiques = siblings; // getSiblings already excludes current boutique
        const ownerMap = new Map<string, { owner: PlatformUser; boutiques: Boutique[] }>();
        visibleBoutiques.forEach(b => {
          const owner = platformUsers.find(u => u.assignments.some(a => a.boutiqueId === b.id && a.role === "Propriétaire"));
          if (!owner) return;
          if (!ownerMap.has(owner.id)) ownerMap.set(owner.id, { owner, boutiques: [] });
          ownerMap.get(owner.id)!.boutiques.push(b);
        });
        const groups = Array.from(ownerMap.values());
        const isSelf = (ownerId: string) => platformUsers.find(u => u.id === ownerId)?.assignments.some(a => a.boutiqueId === boutique.id && a.role === "Propriétaire");
        if (groups.length === 0) return null;
        return (
          <div className="space-y-4">
            {groups.map(({ owner, boutiques: bouts }) => {
              const self = isSelf(owner.id);
              const color = self ? "#a855f7" : "#3b82f6";
              const totalCA = bouts.reduce((s, b) => s + boutique.invoices.filter(inv => inv.client === b.nom).reduce((ss, inv) => ss + inv.montant, 0), 0);
              const lastInv = boutique.invoices.filter(inv => bouts.some(b => b.nom === inv.client)).sort((a,b) => b.date.localeCompare(a.date))[0];
              return (
                <div key={owner.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: color+"33" }}>
                  {/* Owner header */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: color+"0f" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: owner.color }}>
                      {owner.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{owner.nom}</p>
                      <p className="text-xs" style={{ color }}>{bouts.length} boutique{bouts.length>1?"s":""} · {self?"Mon réseau":"Réseau externe"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-base" style={{ color, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalCA)}</p>
                      {lastInv && <p className="text-xs text-muted-foreground">{lastInv.date}</p>}
                    </div>
                  </div>
                  {/* Each boutique row */}
                  <div className="divide-y" style={{ borderColor: color+"1a" }}>
                    {bouts.map(b => {
                      const ca = boutique.invoices.filter(inv=>inv.client===b.nom).reduce((s,inv)=>s+inv.montant,0);
                      const invCount = boutique.invoices.filter(inv=>inv.client===b.nom).length;
                      const lastB = boutique.invoices.filter(inv=>inv.client===b.nom).sort((a,x)=>x.date.localeCompare(a.date))[0];
                      return (
                        <div key={b.id} className="flex items-center gap-3 px-4 py-3 bg-card">
                          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{b.nom}</p>
                            <div className="flex items-center gap-1.5"><MapPin size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-sm" style={{ color, fontFamily:"'Nunito', sans-serif" }}>{fmt(ca)}</p>
                            <p className="text-xs text-muted-foreground">{invCount} facture{invCount!==1?"s":""}{lastB ? " · " + lastB.date.split(" · ")[0] : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {self && (
                    <div className="flex items-center gap-1.5 px-4 py-2" style={{ background:color+"0a" }}>
                      <Store size={11} style={{ color }}/>
                      <span className="text-xs" style={{ color }}>Transferts inter-tenant disponibles via Factures</span>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1" style={{ background:"rgba(0,0,0,0.08)" }}/>
                <p className="text-xs font-black tracking-wider text-muted-foreground">CLIENTS EXTERNES</p>
                <div className="h-px flex-1" style={{ background:"rgba(0,0,0,0.08)" }}/>
              </div>
            )}
          </div>
        );
      })()}

      <div className="space-y-2">
        {filtered.map(c=>{
          const CC = clientColor(c.type);
          const invCount = boutique.invoices.filter(i=>i.client===c.nom).length;
          return (
          <div key={c.id} className="w-full bg-card rounded-2xl border border-border overflow-hidden">
            <button onClick={()=>setDetailClient(c)} className="w-full p-3.5 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:CC+"22",color:CC,fontFamily:"'Nunito',sans-serif" }}>{ini(c.nom)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{c.nom}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {c.tel&&<div className="flex items-center gap-1"><Phone size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.tel}</span></div>}
                  {c.ville&&<div className="flex items-center gap-1"><MapPin size={10} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{c.ville}</span></div>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-sm" style={{ color:CC,fontFamily:"'Nunito',sans-serif" }}>{fmt(c.total)}</p>
                <p className="text-xs text-muted-foreground">{invCount} fact.</p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground flex-shrink-0"/>
            </div>
            </button>
            <div className="flex border-t border-border divide-x divide-border">
              <button onClick={e=>{e.stopPropagation();openEditClient(c);}} className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground active:bg-muted">
                <Edit2 size={12}/> Modifier
              </button>
              <button onClick={e=>{e.stopPropagation();confirmDeleteClient(c.id);}} className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold active:bg-muted" style={{ color:"#ef4444" }}>
                <Trash2 size={12}/> Supprimer
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {/* Edit client modal */}
      {editClient&&<Modal title="Modifier le client" color={boutique.color} onClose={()=>setEditClient(null)}>
        <Field label="NOM COMPLET"><input value={eNom} onChange={e=>setENom(e.target.value)} className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&saveEditClient()}/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={eDialCode} setDialCode={setEDialCode} phone={eTel} setPhone={setETel} inputCls={inputCls}/>
        <Field label="VILLE"><input value={eVille} onChange={e=>setEVille(e.target.value)} className={inputCls} placeholder="Dakar, Thiès…"/></Field>
        <Field label="ADRESSE (optionnel)"><input value={eAdresse} onChange={e=>setEAdresse(e.target.value)} className={inputCls} placeholder="Rue, quartier…"/></Field>
        <Field label="E-MAIL (optionnel)"><input value={eEmail} onChange={e=>setEEmail(e.target.value)} className={inputCls} type="email" placeholder="client@exemple.com"/></Field>
        {(editClient.type==="Grossiste"||editClient.type==="B2B")&&<Field label="CONTACT (optionnel)"><input value={eContact} onChange={e=>setEContact(e.target.value)} className={inputCls} placeholder="Nom du responsable"/></Field>}
        <SubmitBtn color={boutique.color} label="Enregistrer les modifications" onClick={saveEditClient} disabled={!eNom.trim()}/>
      </Modal>}

      {/* Delete confirm modal (when client has invoices) */}
      {deleteClientId!==null&&boutique.invoices.some(i=>i.client===clients.find(x=>x.id===deleteClientId)?.nom)&&(
        <Modal title="Supprimer le client" color="#ef4444" onClose={()=>setDeleteClientId(null)}>
          <div className="px-4 py-3 rounded-2xl" style={{ background:"#fef2f2", border:"1px solid #ef444430" }}>
            <p className="text-sm font-bold" style={{ color:"#991b1b" }}>Ce client a des factures associées.</p>
            <p className="text-xs text-muted-foreground mt-1">La suppression retirera uniquement la fiche client. Les factures resteront dans le système.</p>
          </div>
          <button onClick={()=>doDeleteClient(deleteClientId)} className="w-full py-4 rounded-2xl font-black text-sm active:scale-95" style={{ background:"#ef4444", color:"#fff" }}>
            Confirmer la suppression
          </button>
        </Modal>
      )}

      {!readOnly && (tab !== "B2B" || canCreateB2B) && (
        <button onClick={()=>{ setType(tab); setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:boutique.color, boxShadow:"0 0 24px "+boutique.color+"60" }}><Plus size={28} color="white" strokeWidth={2.5}/></button>
      )}
      {tab === "B2B" && !canCreateB2B && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted text-xs text-muted-foreground">
          <Lock size={13}/> Seul le Super Admin peut créer des entreprises B2B.
        </div>
      )}
      {modal&&<Modal title="Nouveau client" color="#374151" onClose={()=>setModal(false)}>
        <Field label="TYPE">
          <div className="grid grid-cols-3 gap-2">{tabDefs.filter(t => t.id !== "B2B" || canCreateB2B).map(t=><button key={t.id} onClick={()=>setType(t.id)} className="py-3 rounded-xl text-xs font-bold" style={{ background:type===t.id?t.color:"#EEE9D8", color:type===t.id?"#fff":"#6b7280" }}>{t.label}</button>)}</div>
        </Field>
        <Field label="NOM"><input value={nom} onChange={e=>setNom(e.target.value)} placeholder={type==="B2C"?"Ex: Aminata Koné":type==="Grossiste"?"Ex: Diallo Distribution":"Ex: Boutique SARL"} className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/></Field>
        <PhoneField label="TÉLÉPHONE" dialCode={dialCode} setDialCode={setDialCode} phone={tel} setPhone={setTel} inputCls={inputCls}/>
        <Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls}/></Field>
        <Field label="ADRESSE (optionnel)"><input value={adresse} onChange={e=>setAdresse(e.target.value)} placeholder="Ex: 12 Rue Vincens" className={inputCls}/></Field>
        <Field label="E-MAIL (optionnel)"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="exemple@email.com" type="email" className={inputCls}/></Field>
        {type==="Grossiste"&&<Field label="PERSONNE DE CONTACT (optionnel)"><input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Nom du contact chez le grossiste" className={inputCls}/></Field>}
        <SubmitBtn color={boutique.color} label="Enregistrer le client" onClick={submit}/>
      </Modal>}
    </div>
  );
}

// ─── PRINT RECEIPT ────────────────────────────────────────────────────────────

// ─── SILENT PRINT (hidden iframe — no new tab, browser dialog stays in current window) ──
function silentPrint(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();
  // Give the iframe time to render before printing
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
  }, 350);
}

// ─── QZ TRAY CERTIFICATE (embedded — avoids fetch failures in proxy environments)
const QZ_CERT_ROTATED = `-----BEGIN CERTIFICATE-----
MIIDOTCCAiGgAwIBAgIUOa1/7AYJL6pGwXwojhWAcAD/vpIwDQYJKoZIhvcNAQEL
BQAwLDEYMBYGA1UEAwwPVG91cm5hbCBRWiBUcmF5MRAwDgYDVQQKDAdUb3VybmFs
MB4XDTI2MDgxMzA0MDgzOVoXDTM2MDgxMDA0MDgzOVowLDEYMBYGA1UEAwwPVG91
cm5hbCBRWiBUcmF5MRAwDgYDVQQKDAdUb3VybmFsMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAjlZwFiIgOmFPoanG7TkBdfoFA3pNpUirEyJJSF2T6au3
1azLUdgVx/ZA1ltmWdsLbJpa3AEycJFPiYHk2aSMY0AQReo9+sj/5j8TE4j4S/wv
58trY2UaButOs4PcnAbwTx37JudzLsywWJSeJX4zI1EON/wB4DrieB4M2Yvsr+u/
GA8J1dzczPLbnZixit7gb72gr3q9jZATh6/YRbs35tYYC71jTY/ZxJVmxMRuzmO6
AXVHMWOCF7ZT5RWF2r369OnqOsvCJXN2G5wmG6s2jPQaUrGT0+OgWvX6Pe8njMyj
A9BwBC0QRlnwCLSrXvPeXpVc09pm35QkJDr6S/KUqQIDAQABo1MwUTAdBgNVHQ4E
FgQUupyVz7ptI255R/D2yPjL7iiAEmQwHwYDVR0jBBgwFoAUupyVz7ptI255R/D2
yPjL7iiAEmQwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAcTA1
djMmBRrhRtTjCPGrSvq43Tp7VPNzKVLU7CFIBRfBRKnFEm82v1ihLJexKzGLTQmp
LTM4CbEybjXaFuhzMUE9GokNqIgXQN68T+jMC8hA7R0DPxYK8c9kxYEVlyPulhHx
WnQ894KcB2v4WkjnNzOInfgAsY4u1fi29UETS1OJNWRSWrdnnD1Gkz/+2cpAZT/h
mTNgQI0C6bB051yZcvKyYrP7ASoFUlj1xLf7qQFOyOS3XGKkcv5RRLcuzvJGp9tI
lFVACAKPBsq9w6fXa/BtZlsmYfYTi9mxRCFGjyV/zBSKW9jRlEQuIYtaZKu0P82X
29No9wIhTQ7U/067jg==
-----END CERTIFICATE-----`;

// ─── PRINT AGENT (QZ Tray WebSocket) ─────────────────────────────────────────

const PA: {
  status: "idle"|"loading"|"connected"|"disconnected";
  qz: any; printers: string[]; printer: string; lastError: string|null;
  listeners: Set<()=>void>;
} = { status:"idle", qz:null, printers:[], printer:"", lastError:null, listeners: new Set() };

function onPAChange(cb: ()=>void) { PA.listeners.add(cb); return ()=>PA.listeners.delete(cb); }
function notifyPA() { PA.listeners.forEach(cb=>cb()); }

function usePAStatus() {
  const [, tick] = useState(0);
  useEffect(()=>{ const unsub = onPAChange(()=>tick(t=>t+1)); return unsub; }, []);
  return PA;
}

function qzErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.replace(/\s+/g, " ").trim();
  if (!message || message === "load failed") return "Le module QZ Tray n’a pas pu être chargé. Vérifiez la connexion Internet puis réessayez.";
  if (/connection|websocket|refused|closed|failed to connect/i.test(message)) {
    return "QZ Tray ne répond pas. Vérifiez qu’il est lancé sur ce poste, puis réessayez.";
  }
  return message.slice(0, 240);
}

async function connectQZ(savedPrinter?: string): Promise<void> {
  if (PA.status === "loading" || PA.status === "connected") return;
  PA.status = "loading"; PA.lastError = null; notifyPA();
  try {
    if (!(window as any).qz) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        const timeout = window.setTimeout(() => {
          s.remove();
          reject(new Error("Le chargement de QZ Tray a dépassé 10 secondes"));
        }, 10_000);
        s.src = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";
        s.onload = ()=>{ window.clearTimeout(timeout); resolve(); };
        s.onerror = ()=>{ window.clearTimeout(timeout); reject(new Error("load failed")); };
        document.head.appendChild(s);
      });
    }
    const qz = (window as any).qz;
    if (!qz) throw new Error("qz unavailable");

    // Load the self-signed certificate from the static asset
    qz.security.setCertificatePromise((res: any) => { res(QZ_CERT_ROTATED); });
    // Sign each print request server-side (SHA512withRSA — private key never leaves the server)
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign: string) => (res: any, rej: any) => {
      signQZ(toSign).then(res).catch(rej);
    });

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({
        host:"localhost",
        // Tournal is served over HTTPS. A ws:// connection is mixed content
        // and is commonly blocked by browsers. QZ Tray exposes secure ports
        // in pairs so keep the documented fallback range as well.
        port:{ secure:[8181,8282,8383,8484] },
        usingSecure: true, keepAlive: 60, retries: 2,
      });
    }
    PA.qz = qz; PA.status = "connected";
    qz.websocket.setClosedCallbacks(()=>{
      PA.status="disconnected"; PA.qz=null; PA.printers=[];
      PA.lastError = "La connexion à QZ Tray a été fermée.";
      notifyPA();
    });

    const found = await qz.printers.find();
    PA.printers = Array.isArray(found) ? found : (found ? [found] : []);
    if (savedPrinter && PA.printers.includes(savedPrinter)) PA.printer = savedPrinter;
    else if (!PA.printer && PA.printers.length > 0) PA.printer = PA.printers[0];
    notifyPA();
  } catch (error) {
    PA.status = "disconnected"; PA.qz = null; PA.printers = [];
    PA.lastError = qzErrorMessage(error);
    notifyPA();
  }
}

async function agentPrint(html: string, printer?: string): Promise<"ok"|"fail"|"fallback"> {
  const target = printer || PA.printer;
  if (PA.status === "connected" && PA.qz && target) {
    try {
      const cfg = PA.qz.configs.create(target, { size:{width:72,height:null}, units:"mm", copies:1 });
      await PA.qz.print(cfg, [{ type:"pixel", format:"html", flavor:"plain", data:html }]);
      return "ok";
    } catch (error) {
      PA.lastError = qzErrorMessage(error);
      notifyPA();
      return "fail";
    }
  }
  silentPrint(html);
  return "fallback";
}

// ─────────────────────────────────────────────────────────────────────────────

function buildReceiptHtml(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean): string {
  const reste = Math.max(0, inv.montant - inv.acompte);
  const lines = inv.lines ?? [];
  const operator = inv.operatorNom ?? fallbackOperator ?? "—";

  // Fixed-width columns for monospace alignment (72mm printable ≈ 32 chars at 9pt)
  const COL = 32;
  function pad(left: string, right: string, total = COL): string {
    const space = total - left.length - right.length;
    return left + (space > 0 ? " ".repeat(space) : " ") + right;
  }
  function fnum(n: number): string { return n.toLocaleString("fr-FR"); }
  function sep(char = "-"): string { return char.repeat(COL); }

  const lineRows = lines.map(l => {
    const desc = l.nom.length > COL ? l.nom.slice(0, COL) : l.nom;
    const detail = `  ${fnum(lineDispQty(l))} ${lineDispUnit(l)} x ${fnum(l.prixUnit)} F`;
    const total = `${fnum(lineTotal(l))} F`;
    const detailPadded = pad(detail, total);
    return `<div>${desc}</div><div>${detailPadded}</div>`;
  }).join("<br/>");

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<title>Ticket ${inv.id}</title>
<style>
  @page {
    size: 80mm auto;
    margin: 4mm 4mm 8mm 4mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 72mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    line-height: 1.45;
    color: #000;
    background: #fff;
  }
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
  ${(inv as any).paymentSplit ? (inv as any).paymentSplit.map((s: any)=>`<div class="row"><span class="label">Paiement ${s.method}</span><span class="value">${new Intl.NumberFormat("fr-FR").format(s.amount)} F</span></div>`).join("") : inv.paymentMethod ? `<div class="row"><span class="label">Mode de paiement</span><span class="value">${inv.paymentMethod}</span></div>` : ""}
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
function printReceipt(inv: Invoice, boutique: Boutique, fallbackOperator?: string, isDuplicate?: boolean) {
  silentPrint(buildReceiptHtml(inv, boutique, fallbackOperator, isDuplicate));
}

// ─── VIEW: FACTURES ───────────────────────────────────────────────────────────

function FacturesView({ boutique, allBoutiques, platformUsers, groupes, currentUser, canReturn, onUpdate, onUpdateOtherBoutique, logAction, initialStatus }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[]; groupes?: Groupe[]; currentUser: PlatformUser;
  canReturn: boolean;
  onUpdate: (u: Partial<Boutique>) => void;
  onUpdateOtherBoutique: (boutiqueId: string, u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialStatus?: InvoiceStatus | "all" | "impayé";
}) {
  const readOnly = useReadOnly();
  const sendNotif = useNotif();
  const { invoices, clients, products, entries } = boutique;
  const siblings = getSiblings(boutique.id, allBoutiques, platformUsers, groupes);
  const activeAssignFv = currentUser?.assignments.find(a => a.boutiqueId === boutique.id);
  const canSeeMargin = activeAssignFv?.role === "Propriétaire" || !!(activeAssignFv?.droits?.marges);
  const [statusFilter,setStatusFilter] = useState<InvoiceStatus|"all"|"impayé">(initialStatus ?? "all");
  const [invSearch, setInvSearch] = useState("");
  const [invoiceSort, setInvoiceSort] = useState<"date_desc"|"date_asc"|"number_asc"|"number_desc">("date_desc");
  const [modal,setModal]   = useState(false);
  const [shareInv,setShareInv]   = useState<Invoice|null>(null);
  const [detailInv,setDetailInv] = useState<Invoice|null>(null);
  const [soldeMode,setSoldeMode] = useState(false);
  const [soldeAmount,setSoldeAmount] = useState("");
  const [soldeDone,setSoldeDone] = useState(false);
  const [encaissInv,setEncaissInv] = useState<Invoice|null>(null);
  const [encaissSplit,setEncaissSplit] = useState<{method:PaymentMethod;amount:string}[]>([{method:"Espèces",amount:""}]);
  const [encaissDone,setEncaissDone] = useState(false);
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

  function invConditioning(pid: number): ProductParam | Category | undefined {
    const prod = products.find(p => p.id === pid);
    if (!prod) return undefined;
    return (boutique.productParams ?? []).find(x => x.productId === pid)
      ?? (boutique.categories ?? []).find(c => c.nom === prod.categorie);
  }

  // Sell options for the invoice line form — mirrors getSellOptions in POS
  function getInvSellOptions(pid: number): string[] {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return [];
    const cat = invConditioning(pid);
    if (!cat || cat.nbPiecesParLot<=0) return [prod.unit];
    const opts: string[] = ["Lot"];
    if (cat.unitVente !== "pièces") opts.push("Pièce");
    opts.push(cat.unitVente);
    return opts;
  }
  function invToBaseQty(sellQty: number, sellUnit: string, pid: number): number {
    const prod = products.find(p=>p.id===pid);
    if (!prod) return sellQty;
    const cat = invConditioning(pid);
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
    const cat = invConditioning(pid);
    const base = cat?.unitVente ?? prod?.unit ?? "";
    if (opts.includes(base)) return base;
    if (opts.includes("Pièce")) return "Pièce";
    return opts[0];
  }

  const montant = lines.reduce((s,l)=>s+lineTotal(l),0);
  const aNum = Number(acompte)||0;
  const pct  = montant>0?Math.min(100,Math.round(aNum/montant*100)):0;
  const siblingClient = siblings.find(s=>s.nom===client);

  function addLine() {
    const prod = products.find(p=>p.id===lPid); if (!prod||!lQty) return;
    const cat = invConditioning(lPid);
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

  function submitSolde(inv: Invoice) {
    const montantSolde = Number(soldeAmount) || 0;
    if (montantSolde <= 0) return;
    const reste = inv.montant - inv.acompte;
    const newAcompte = Math.min(inv.acompte + montantSolde, inv.montant);
    const newStatus: InvoiceStatus = newAcompte >= inv.montant ? "payé" : "acompte";
    onUpdate({ invoices: invoices.map(i => i.id === inv.id ? { ...i, acompte: newAcompte, status: newStatus } : i) });
    logAction("Solde reçu", `${inv.id} · +${fmt(montantSolde)} · reste: ${fmt(Math.max(0, reste - montantSolde))}`, "💰");
    setSoldeDone(true);
    setTimeout(() => { setSoldeMode(false); setSoldeAmount(""); setSoldeDone(false); setDetailInv(prev => prev ? { ...prev, acompte: newAcompte, status: newStatus } : null); }, 1200);
  }
  function submitEncaiss() {
    if (!encaissInv) return;
    const splitParsed = encaissSplit.filter(s => Number(s.amount) > 0).map(s => ({ method: s.method, amount: Number(s.amount) }));
    const montantEncaiss = splitParsed.reduce((a, s) => a + s.amount, 0);
    if (montantEncaiss <= 0) return;
    const resteDu = encaissInv.montant - encaissInv.acompte;
    if (Math.abs(montantEncaiss - resteDu) > 1 && montantEncaiss > resteDu) {
      toast.error("Le montant saisi dépasse le reste dû"); return;
    }
    const newAcompte = Math.min(encaissInv.acompte + montantEncaiss, encaissInv.montant);
    const newStatus: InvoiceStatus = newAcompte >= encaissInv.montant ? "payé" : "acompte";
    const primaryMethod = splitParsed[0]?.method ?? "Espèces";
    const updatedInv: Invoice = { ...encaissInv, acompte: newAcompte, status: newStatus, paymentMethod: primaryMethod, paymentSplit: splitParsed.length > 1 ? splitParsed : undefined };

    // Deduct stock on FIRST encaissement (acompte was 0 before); also stamp FIFO cost on lines
    let updatedEntries = entries;
    let finalInv = updatedInv;
    if (encaissInv.acompte === 0 && encaissInv.lines && encaissInv.lines.length > 0) {
      const linesWithCost: InvoiceLine[] = encaissInv.lines.map(l => ({
        ...l,
        prixAchat: l.prixAchat ?? (l.productId > 0 ? fifoUnitCost(l.productId, l.qty, entries) : undefined),
      }));
      const saleEntries: StockEntry[] = linesWithCost.map((l, i) => ({
        id: Date.now() + i, productId: l.productId, qty: -l.qty, unit: l.unit,
        montantDu: 0, date: today(), fournisseur: `Vente → ${encaissInv.client}`, invoiceId: encaissInv.id,
      }));
      updatedEntries = [...entries, ...saleEntries];
      finalInv = { ...updatedInv, lines: linesWithCost };
    }

    onUpdate({ invoices: invoices.map(i => i.id === encaissInv.id ? finalInv : i), entries: updatedEntries });
    const splitLabel = splitParsed.map(s => `${s.method} ${fmt(s.amount)}`).join(" + ");
    logAction("Encaissement", `${encaissInv.id} · +${fmt(montantEncaiss)} · ${splitLabel}`, "💵");
    sendNotif({ icon:"💵", title:"Paiement encaissé", body:`${encaissInv.id} · ${encaissInv.client} · +${fmt(montantEncaiss)}`, tab:"factures", filter:{statusFilter:"payé"} });
    setTimeout(() => agentPrint(buildReceiptHtml(updatedInv, boutique, currentUser.nom)), 200);
    setEncaissDone(true);
    setTimeout(() => { setEncaissInv(null); setEncaissSplit([{method:"Espèces",amount:""}]); setEncaissDone(false); }, 1400);
  }

  function openReturn(inv: Invoice) {
    if (!inv.lines || inv.lines.length === 0) return;
    const initQtys: Record<number,number> = {};
    inv.lines.forEach((l,i) => { initQtys[i] = l.qty; });
    setReturnQtys(initQtys);
    setReturnDone(false);
    setReturnInv(inv);
    setDetailInv(null);
  }

  function submitReturn() {
    if (!returnInv || !returnInv.lines) return;
    const lines = returnInv.lines;
    const returnLines = lines.map((l,i) => ({ ...l, qty: returnQtys[i] ?? 0 })).filter(l => l.qty > 0);
    if (returnLines.length === 0) return;
    const refundTotal = returnLines.reduce((s, l) => s + l.qty * l.prixUnit, 0);
    const retId = "R-" + String(Date.now()).slice(-5);
    const retInv: Invoice = {
      id: retId, client: returnInv.client, clientTel: returnInv.clientTel,
      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw: new Date().toISOString().split("T")[0], status: "payé", type: "Retour",
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

  function submit() {
    if (!client||lines.length===0) return;
    const isSiblingTransfer = !!siblingClient;
    const ct  = isSiblingTransfer ? "Inter-tenant" : (clients.find(c=>c.nom===client)?.type??"B2C");
    const cTel = clients.find(c=>c.nom===client)?.tel;
    const id  = genInvoiceId(boutique, allBoutiques, invoices);
    const s: InvoiceStatus = aNum>=montant&&montant>0?"payé":aNum>0?"acompte":status;

    if (isSiblingTransfer && siblingClient) {
      // Inter-tenant transfer: don't touch sender stock yet — deduct only when receiver validates
      const transferItems: TransferItem[] = lines.map(l => {
        const srcProd = products.find(p => p.id === l.productId);
        return { productId:l.productId, nom:l.nom, qty:l.qty, unit:l.unit, montantDu:lineTotal(l), img:srcProd?.img };
      });
      const pending: PendingTransfer = { id:"tr"+Date.now(), fromBoutiqueId:boutique.id, fromBoutiqueNom:boutique.nom, invoiceId:id, date:today(), items:transferItems };
      const newInv: Invoice = { id, client, clientTel:cTel, lines, montant, acompte:aNum, date:today(), dateRaw:new Date().toISOString().split("T")[0], status:"en attente", type:ct, operatorNom:currentUser.nom, operatorColor:currentUser.color };
      onUpdate({ invoices:[...invoices, newInv] });
      onUpdateOtherBoutique(siblingClient.id, { pendingTransfers:[...(siblingClient.pendingTransfers??[]), pending] });
      logAction("Transfert en attente de validation", `${id} · ${client} · ${fmt(montant)}`, "🕐");
    } else {
      // Regular sale: block if any product would go negative
      const insufficient = lines.filter(l => l.productId > 0 && productQty(l.productId, entries) - l.qty < 0);
      if (insufficient.length > 0) {
        toast.error(`Stock insuffisant : ${insufficient.map(l => l.nom).join(", ")}`, { duration: 4000 });
        return;
      }
      // Compute FIFO cost per line BEFORE deducting stock
      const linesWithCost: InvoiceLine[] = lines.map(l => ({
        ...l,
        prixAchat: l.productId > 0 ? fifoUnitCost(l.productId, l.qty, entries) : undefined,
      }));
      const saleEntries: StockEntry[] = linesWithCost.map((l,i)=>({ id:Date.now()+i, productId:l.productId, qty:-l.qty, unit:l.unit, montantDu:0, date:today(), fournisseur:`Vente → ${client}` }));
      const newInv: Invoice = { id, client, clientTel:cTel, lines:linesWithCost, montant, acompte:aNum, date:today(), dateRaw:new Date().toISOString().split("T")[0], status:s, type:ct, operatorNom:currentUser.nom, operatorColor:currentUser.color };
      onUpdate({ invoices:[...invoices, newInv], entries:[...entries,...saleEntries] });
      logAction("Nouvelle facture", `${id} · ${client} · ${fmt(montant)}`, "🧾");
      sendNotif({ icon:"🧾", title:"Nouvelle facture créée", body:`${client} · ${fmt(montant)} · ${id}`, tab:"factures" });
    }
    setLines([]); setAcompte(""); setModal(false);
  }

  const UNPAID: InvoiceStatus[] = ["en attente","acompte","en retard"];
  const invoiceDateKey = (inv: Invoice) => {
    const date = new Date(inv.dateRaw ?? inv.date);
    if (!Number.isNaN(date.getTime())) return date.getTime();
    const numericId = Number(inv.id);
    return Number.isFinite(numericId) ? numericId : 0;
  };
  const compareInvoiceNumbers = (a: Invoice, b: Invoice) =>
    a.id.localeCompare(b.id, "fr", { numeric: true, sensitivity: "base" });
  const filtered = invoices
    .filter(i => (statusFilter==="all"||statusFilter==="impayé" ? statusFilter==="impayé" ? UNPAID.includes(i.status) : true : i.status===statusFilter)
      && (i.client.toLowerCase().includes(invSearch.toLowerCase()) || i.id.toLowerCase().includes(invSearch.toLowerCase())))
    .sort((a, b) => {
      if (invoiceSort === "number_asc") return compareInvoiceNumbers(a, b);
      if (invoiceSort === "number_desc") return compareInvoiceNumbers(b, a);
      const byDate = invoiceDateKey(a) - invoiceDateKey(b);
      return invoiceSort === "date_asc" ? byDate || compareInvoiceNumbers(a, b) : -byDate || compareInvoiceNumbers(b, a);
    });
  const returnIds = new Set(invoices.filter(i=>i.type==="Retour").map(i=>i.id));
  const hasReturn = (invId: string) => invoices.some(i => i.type === "Retour" && i.lines && invoices.find(o=>o.id===invId)?.lines?.some(ol=>i.lines!.some(rl=>rl.productId===ol.productId)));
  const pills: Array<{id:InvoiceStatus|"all"|"impayé";label:string;color:string}> = [
    {id:"all",      label:"Tout",     color:SEM.neutral.accent},
    {id:"impayé",   label:"Impayés",  color:SEM.danger.accent},
    {id:"acompte",  label:"Acompte",  color:SEM.warning.accent},
    {id:"payé",     label:"Payé ✓",   color:SEM.success.accent},
    {id:"en attente",label:"Attente", color:SEM.neutral.accent},
    {id:"en retard",label:"Retard",   color:SEM.danger.accent},
  ];

  return (
    <div className="space-y-4 pb-24">
      <div className="relative"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={invSearch} onChange={e=>setInvSearch(e.target.value)} placeholder="Chercher une facture ou un client…" className={inputCls+" pl-11"}/></div>
      <div className="flex gap-2" style={{ overflowX:"auto", scrollbarWidth:"none" }}>
        {pills.map(s=><button key={s.id} onClick={()=>setStatusFilter(s.id as InvoiceStatus|"all"|"impayé")}className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{ background:statusFilter===s.id?s.color:s.color+"22", color:statusFilter===s.id?"#fff":s.color }}>{s.label}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="invoice-sort" className="text-xs font-bold text-muted-foreground whitespace-nowrap">Trier par</label>
        <select id="invoice-sort" value={invoiceSort} onChange={e=>setInvoiceSort(e.target.value as typeof invoiceSort)} className={inputCls+" py-2 text-sm"}>
          <option value="date_desc">Date : récent d'abord</option>
          <option value="date_asc">Date : ancien d'abord</option>
          <option value="number_asc">N° : croissant</option>
          <option value="number_desc">N° : décroissant</option>
        </select>
      </div>
      <div className="space-y-3">
        {filtered.map(inv=>{
          const [tc,bc]=invBadge(inv.status); const p=inv.montant>0?Math.round(inv.acompte/inv.montant*100):0;
          const isReturn = inv.type === "Retour";
          return (
            <div key={inv.id} className="bg-card rounded-2xl p-4 border border-border" style={isReturn?{borderColor:"#ef444433"}:{}}>
              <div className="w-full text-left cursor-pointer" onClick={()=>{ if (!isReturn && inv.status !== "payé") { setEncaissInv(inv); setEncaissSplit([{method:"Espèces",amount:String(inv.montant-inv.acompte)}]); } else { setDetailInv(inv); } }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm">{inv.client}</p>
                      {isReturn && <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background:SEM.danger.bg, color:SEM.danger.text }}><RotateCcw size={9}/> Retour</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{inv.id} · {inv.date} · {inv.type}</p>
                    {inv.lines&&inv.lines.length>0&&<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><ShoppingCart size={10}/> {inv.lines.length} produit{inv.lines.length>1?"s":""}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <div className="text-right"><p className="text-base font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p><span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize inline-block mt-0.5" style={{ background:bc,color:tc }}>{inv.status}</span></div>
                    {!isReturn && inv.status !== "payé" && (
                      <button onClick={e=>{e.stopPropagation();setEncaissInv(inv);setEncaissAmt(String(inv.montant-inv.acompte));}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.success.bg }} title="Encaisser">
                        <Wallet size={15} style={{ color:SEM.success.text }}/>
                      </button>
                    )}
                    <button onClick={e=>{e.stopPropagation();setShareInv(inv);}} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.neutral.bg }}>
                      <Send size={15} style={{ color:SEM.neutral.accent }}/>
                    </button>
                  </div>
                </div>
                {inv.acompte>0&&inv.acompte<inv.montant&&<p className="text-xs text-muted-foreground mt-2">Acompte versé : <span className="font-semibold text-foreground">{fmt(inv.acompte)}</span></p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoice detail modal */}
      {detailInv&&<Modal title={detailInv.id} color="#374151" onClose={()=>{ setDetailInv(null); setSoldeMode(false); setSoldeAmount(""); setSoldeDone(false); }}>
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
                const totalVente = lineTotal(l);
                const totalAchat = l.prixAchat != null ? l.prixAchat * l.qty : null;
                const marge = totalAchat != null ? totalVente - totalAchat : null;
                const margePct = marge != null && totalVente > 0 ? Math.round(marge / totalVente * 100) : null;
                return <div key={i} className="bg-muted rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    {prod&&<div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,80,80)} alt={l.nom} className="w-full h-full object-cover"/></div>}
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{l.nom}</p><p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} × {fmt(l.prixUnit)}</p></div>
                    <p className="text-sm font-black flex-shrink-0" style={{ color:"#a855f7", fontFamily:"'Nunito', sans-serif" }}>{fmt(totalVente)}</p>
                  </div>
                  {canSeeMargin && l.prixAchat != null && marge !== null && (
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">PA unitaire: {fmt(l.prixAchat)} · Coût total: {fmt(totalAchat!)}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${marge >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {marge >= 0 ? "+" : ""}{fmt(marge)} ({margePct}%)
                      </span>
                    </div>
                  )}
                </div>;
              })}
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(detailInv.montant)}</p>
            </div>
            {canSeeMargin && detailInv.lines && detailInv.lines.some(l => l.prixAchat != null) && (() => {
              const totalCA = detailInv.montant;
              const totalCout = detailInv.lines.reduce((s,l) => s + (l.prixAchat != null ? l.prixAchat * l.qty : 0), 0);
              const totalMarge = totalCA - totalCout;
              const pct = totalCA > 0 ? Math.round(totalMarge / totalCA * 100) : 0;
              return (
                <div className="mt-2 flex items-center justify-between px-1 py-2 bg-gray-50 rounded-xl border border-border">
                  <span className="text-xs font-bold text-muted-foreground">Marge brute</span>
                  <span className={`text-sm font-black ${totalMarge >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {totalMarge >= 0 ? "+" : ""}{fmt(totalMarge)} ({pct}%)
                  </span>
                </div>
              );
            })()}
          </div>
        )}
        <div>
          <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">PAIEMENT</p>
          <div className="space-y-2">
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Acompte versé</span>
              <span className="text-sm font-bold" style={{ color:"#C9A227" }}>{fmt(detailInv.acompte)}</span>
            </div>
            <div className="flex justify-between bg-muted rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Reste à payer</span>
              <span className="text-sm font-bold" style={{ color:detailInv.montant-detailInv.acompte>0?SEM.danger.accent:SEM.success.accent }}>{fmt(Math.max(0,detailInv.montant-detailInv.acompte))}</span>
            </div>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width:`${detailInv.montant>0?Math.round(detailInv.acompte/detailInv.montant*100):0}%`, background:invBadge(detailInv.status)[0] }}/>
          </div>
        </div>

        {/* Solde section — only for acompte / en attente / en retard */}
        {detailInv.status !== "payé" && (
          <div>
            {!soldeMode ? (
              <button onClick={()=>{ setSoldeMode(true); setSoldeAmount(String(detailInv.montant - detailInv.acompte)); }}
                className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
                style={{ background:SEM.success.accent, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
                <CreditCard size={18}/> Enregistrer un paiement
              </button>
            ) : soldeDone ? (
              <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{ background:SEM.success.bg }}>
                <CheckCircle size={22} style={{ color:SEM.success.accent }}/>
                <p className="font-black text-sm" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>Paiement enregistré ✓</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black tracking-wider" style={{ color:SEM.success.accent }}>MONTANT REÇU (F CFA)</p>
                  <button onClick={()=>setSoldeMode(false)} className="text-xs text-muted-foreground underline">Annuler</button>
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-2">
                  {[
                    { label:"Solde total", val: detailInv.montant - detailInv.acompte },
                    { label:"50%", val: Math.round((detailInv.montant - detailInv.acompte) * 0.5) },
                  ].map(opt=>(
                    <button key={opt.label} onClick={()=>setSoldeAmount(String(opt.val))}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                      style={{ background:Number(soldeAmount)===opt.val?SEM.success.accent:SEM.success.bg, color:Number(soldeAmount)===opt.val?"#fff":SEM.success.accent }}>
                      {opt.label}<br/><span className="opacity-80">{fmt(opt.val)}</span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input
                    value={soldeAmount}
                    onChange={e=>setSoldeAmount(e.target.value)}
                    placeholder="Montant personnalisé"
                    type="number"
                    className={inputCls}
                    autoFocus
                    onKeyDown={e=>e.key==="Enter"&&submitSolde(detailInv)}
                  />
                </div>
                {Number(soldeAmount)>0&&(
                  <div className="flex justify-between text-xs px-1">
                    <span className="text-muted-foreground">Nouveau reste :</span>
                    <span className="font-bold" style={{ color: Math.max(0, detailInv.montant - detailInv.acompte - Number(soldeAmount)) === 0 ? SEM.success.accent : SEM.warning.accent }}>
                      {fmt(Math.max(0, detailInv.montant - detailInv.acompte - Number(soldeAmount)))}
                    </span>
                  </div>
                )}
                <button onClick={()=>submitSolde(detailInv)} disabled={!Number(soldeAmount)||Number(soldeAmount)<=0}
                  className="w-full py-4 rounded-2xl font-black text-base active:scale-95"
                  style={{ background:Number(soldeAmount)>0?SEM.success.accent:"#c7bfa0", color:"#fff", fontFamily:"'Nunito', sans-serif", opacity:Number(soldeAmount)>0?1:0.5 }}>
                  ✓ Confirmer {Number(soldeAmount)>0?fmt(Number(soldeAmount)):""}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={()=>{setDetailInv(null);setSoldeMode(false);setSoldeAmount("");setShareInv(detailInv);}} className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#a855f722", color:"#a855f7" }}>
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
        {canReturn && detailInv.acompte > 0 && detailInv.type !== "Retour" && detailInv.lines && detailInv.lines.length > 0 && (
          <button onClick={()=>openReturn(detailInv)} className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95" style={{ background:"#ef444415", color:"#ef4444" }}>
            <RotateCcw size={16}/> Retour articles
          </button>
        )}
      </Modal>}

      {!readOnly && <button onClick={()=>{ setLines([]); setAcompte(""); setLQty(""); setLPrix(""); setModal(true); }} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95" style={{ background:"#a855f7", boxShadow:"0 0 24px #a855f760" }}>
        <Plus size={28} color="white" strokeWidth={2.5}/>
      </button>}

      {modal&&<Modal title="Nouvelle facture" color="#374151" onClose={()=>setModal(false)}>
        <Field label="CLIENT">
          <select value={client} onChange={e=>setClient(e.target.value)} className={inputCls} style={{ appearance:"none" }}>
            {siblings.length>0&&<optgroup label="🏪 Mes autres boutiques">{siblings.map(sb=><option key={sb.id} value={sb.nom}>{sb.nom} — {sb.ville} (inter-tenant)</option>)}</optgroup>}
            <optgroup label="Clients">{clients.map(c=><option key={c.id} value={c.nom}>{c.nom} ({c.type})</option>)}</optgroup>
          </select>
          {siblingClient&&<div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:"#a855f715" }}>
            <Store size={14} style={{ color:"#a855f7" }}/>
            <p className="text-xs font-bold" style={{ color:"#a855f7" }}>Transfert inter-tenant · le stock est déduit ici, le destinataire devra valider la réception dans son Stock</p>
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
              const cat2=invConditioning(lPid);
              const effUnit=lSellUnit||invDefaultUnit(lPid);
              return(<div className="flex gap-2 flex-wrap">{getInvSellOptions(lPid).map(u=>{
                const lbl=u==="Lot"?(cat2?'Lot ('+cat2.nbPiecesParLot+'p)':'Lot'):u==="Pièce"?"Pièce":u;
                return(<button key={u} onClick={()=>setLSellUnit(u)} className="flex-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                  style={{ background:effUnit===u?"#1f2937":"#EEE9D8", color:effUnit===u?"#fff":"#374151" }}>{lbl}</button>);
              })}</div>);
            })()}
            <div className="flex gap-2">
              <input value={lQty} onChange={e=>qtyChange(e.target.value,setLQty)} onBlur={e=>qtyBlur(e.target.value,setLQty)} placeholder="0.00" type="number" step="0.01" min="0" className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.nextElementSibling as HTMLInputElement|null)?.focus();}}}/>
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
        <SubmitBtn color={boutique.color} label="Créer la facture" onClick={submit} disabled={!client||lines.length===0}/>
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
            {returnInv.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-3 bg-muted rounded-2xl p-3">
                {(() => { const prod = products.find(p=>p.id===l.productId); return prod ? <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0"><img src={imgSrc(prod.img,96,96)} alt={l.nom} className="w-full h-full object-cover"/></div> : null; })()}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">{lineDispQty(l)} {lineDispUnit(l)} vendus · {fmt(l.prixUnit)} / {lineDispUnit(l)}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={()=>setReturnQtys(q=>({...q,[i]:Math.max(0,(q[i]??0)-1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#ef444422" }}><Minus size={12} style={{ color:"#ef4444" }}/></button>
                  <span className="w-8 text-center font-black text-sm" style={{ color:"#ef4444" }}>{returnQtys[i] ?? 0}</span>
                  <button onClick={()=>setReturnQtys(q=>({...q,[i]:Math.min(l.qty,(q[i]??0)+1)}))} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#ef444422" }}><Plus size={12} style={{ color:"#ef4444" }}/></button>
                </div>
              </div>
            ))}
          </div>
          {(() => {
            const total = returnInv.lines.reduce((s,l,i)=>s+(returnQtys[i]??0)*l.prixUnit,0);
            const hasItems = Object.values(returnQtys).some(q=>q>0);
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
        <Modal title={`Encaisser · ${encaissInv.id}`} color={SEM.success.accent} onClose={()=>{setEncaissInv(null);setEncaissSplit([{method:"Espèces",amount:""}]);setEncaissDone(false);}}>
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
              <span className="font-bold text-sm" style={{color:SEM.success.accent}}>{fmt(encaissInv.acompte)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-1 pt-2 border-t border-border">
              <span className="text-xs font-bold">Reste dû</span>
              <span className="font-black text-base" style={{color:"#ef4444",fontFamily:"'Nunito',sans-serif"}}>{fmt(encaissInv.montant - encaissInv.acompte)}</span>
            </div>
          </div>
          {/* Multi-mode payment split */}
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-wide">Modes de paiement</p>
            {encaissSplit.map((row, idx) => {
              const resteDu = encaissInv.montant - encaissInv.acompte;
              return (
                <div key={idx} className="flex gap-2 items-center">
                  <select value={row.method} onChange={e=>setEncaissSplit(prev=>prev.map((r,i)=>i===idx?{...r,method:e.target.value as PaymentMethod}:r))}
                    className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-xs font-bold outline-none">
                    {PAYMENT_METHODS.map(m=><option key={m} value={m}>{PM_ICON[m]} {m}</option>)}
                  </select>
                  <input type="number" placeholder="0" value={row.amount}
                    onChange={e=>setEncaissSplit(prev=>prev.map((r,i)=>i===idx?{...r,amount:e.target.value}:r))}
                    className={inputCls+" w-28 text-center font-black"} autoFocus={idx===0}/>
                  {encaissSplit.length > 1 && (
                    <button onClick={()=>setEncaissSplit(prev=>prev.filter((_,i)=>i!==idx))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 shrink-0"><X size={14}/></button>
                  )}
                </div>
              );
            })}
            <div className="flex gap-2">
              {encaissSplit.length < PAYMENT_METHODS.length && (
                <button onClick={()=>setEncaissSplit(prev=>[...prev,{method:PAYMENT_METHODS.find(m=>!prev.some(r=>r.method===m))??"Espèces",amount:""}])}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border border-dashed border-border text-muted-foreground hover:border-foreground/40">
                  + Ajouter un mode
                </button>
              )}
              <button type="button" onClick={()=>setEncaissSplit([{method:encaissSplit[0]?.method??"Espèces",amount:String(encaissInv.montant-encaissInv.acompte)}])}
                className="flex-1 py-2 rounded-xl text-xs font-bold" style={{background:SEM.success.bg,color:SEM.success.accent}}>Solde total</button>
            </div>
            {(() => {
              const total = encaissSplit.reduce((s,r)=>s+Number(r.amount||0),0);
              const reste = encaissInv.montant - encaissInv.acompte;
              const ok = total > 0 && Math.abs(total - reste) <= 1;
              const over = total > reste + 1;
              return total > 0 ? (
                <div className={`flex justify-between items-center px-3 py-2 rounded-xl text-sm font-bold ${over?"bg-red-50 text-red-600":ok?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>
                  <span>Total saisi</span>
                  <span style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(total)} / {fmt(reste)}</span>
                </div>
              ) : null;
            })()}
          </div>
          {encaissDone ? (
            <div className="flex items-center justify-center gap-3 py-4 rounded-2xl" style={{background:SEM.success.bg}}>
              <CheckCircle size={22} style={{color:SEM.success.accent}}/>
              <p className="font-black text-sm" style={{color:SEM.success.accent,fontFamily:"'Nunito',sans-serif"}}>Encaissement enregistré ✓</p>
            </div>
          ) : (
            <SubmitBtn color={boutique.color} label="Confirmer l'encaissement" onClick={submitEncaiss}
              disabled={encaissSplit.reduce((s,r)=>s+Number(r.amount||0),0)<=0}/>
          )}
        </Modal>
      )}
    </div>
  );
}

function CatalogueSection({ boutique, onUpdate, logAction }: {
  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const { products } = boutique;
  const cats = boutique.categories ?? [];

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [showNew, setShowNew]       = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [eNom, setENom]         = useState("");
  const [eUnit, setEUnit]       = useState("yards");
  const [ePieces, setEPieces]   = useState("");
  const [eLongueur, setELongueur] = useState("");

  const [nNom, setNNom]         = useState("");
  const [nUnit, setNUnit]       = useState("yards");
  const [nPieces, setNPieces]   = useState("");
  const [nLongueur, setNLongueur] = useState("");

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setENom(cat.nom); setEUnit(cat.unitVente);
    setEPieces(String(cat.nbPiecesParLot || "")); setELongueur(String(cat.longueurParPiece || ""));
  }

  function saveEdit(catId: string) {
    const old = cats.find(c => c.id === catId);
    const updated = cats.map(c => c.id !== catId ? c : { ...c, nom: eNom.trim() || c.nom, unitVente: eUnit, nbPiecesParLot: Number(ePieces) || 0, longueurParPiece: Number(eLongueur) || 0 });
    let updatedProds = products;
    if (old && eNom.trim() && eNom.trim() !== old.nom) updatedProds = products.map(p => p.categorie === old.nom ? { ...p, categorie: eNom.trim() } : p);
    onUpdate({ categories: updated, products: updatedProds });
    logAction("Catégorie modifiée", eNom.trim(), "📦");
    setEditingId(null);
  }

  function deleteCat(cat: Category) {
    const updatedProds = products.map(p => p.categorie === cat.nom ? { ...p, categorie: undefined } : p);
    onUpdate({ categories: cats.filter(c => c.id !== cat.id), products: updatedProds });
    logAction("Catégorie supprimée", cat.nom, "🗑️");
    if (expandedId === cat.id) setExpandedId(null);
  }

  function createCat() {
    if (!nNom.trim()) return;
    const nc: Category = { id: "cat" + Date.now(), nom: nNom.trim(), unitVente: nUnit, nbPiecesParLot: Number(nPieces) || 0, longueurParPiece: Number(nLongueur) || 0 };
    onUpdate({ categories: [...cats, nc] });
    logAction("Nouvelle catégorie", nNom.trim(), "📂");
    setNNom(""); setNUnit("yards"); setNPieces(""); setNLongueur(""); setShowNew(false);
  }

  const productsWithoutCat = products.filter(p => !p.categorie);

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-2xl text-sm" style={{ background: "#3b82f611", color: "#3b82f6" }}>
        💡 Organisez vos produits par catégorie. Chaque catégorie définit l'unité et le conditionnement par défaut lors d'une réception.
      </div>

      {cats.map(cat => {
        const catProds = products.filter(p => p.categorie === cat.nom);
        const isEd = editingId === cat.id;
        const isExp = expandedId === cat.id;
        const uEdit = isEd ? eUnit : cat.unitVente;

        return (
          <div key={cat.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "#3b82f618" }}>📦</div>
              <div className="flex-1 min-w-0">
                {isEd
                  ? <input value={eNom} onChange={e => setENom(e.target.value)} className={inputCls + " py-1 text-sm font-bold h-9"} autoFocus/>
                  : <p className="font-bold text-sm">{cat.nom}</p>
                }
                <p className="text-xs text-muted-foreground mt-0.5">
                  {catProds.length} produit{catProds.length !== 1 ? "s" : ""} · {cat.unitVente}
                  {cat.nbPiecesParLot > 0 ? ` · ${cat.nbPiecesParLot}p/lot` : ""}
                  {cat.longueurParPiece > 0 ? ` × ${cat.longueurParPiece} ${cat.unitVente}` : ""}
                </p>
              </div>
              {isEd ? (
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(cat.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "#1E9B1E22", color:SEM.success.accent }}>Sauver</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "#ef444415", color: "#ef4444" }}>✕</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(cat)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#3b82f618" }}><Edit2 size={13} style={{ color: "#3b82f6" }}/></button>
                  <button onClick={() => deleteCat(cat)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#ef444415" }}><Trash2 size={13} style={{ color: "#ef4444" }}/></button>
                  <button onClick={() => setExpandedId(isExp ? null : cat.id)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#EEE9D8" }}>
                    <ChevronRight size={13} className="text-muted-foreground" style={{ transform: isExp ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}/>
                  </button>
                </div>
              )}
            </div>

            {isEd && (
              <div className="border-t border-border px-4 py-4 space-y-3">
                <div>
                  <p className="text-xs font-black tracking-wider mb-2" style={{ color: "#3b82f6" }}>UNITÉ DE VENTE</p>
                  <div className="flex gap-2">
                    {["yards", "mètres", "pièces"].map(u => (
                      <button key={u} onClick={() => setEUnit(u)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: eUnit === u ? "#3b82f6" : "#EEE9D8", color: eUnit === u ? "#fff" : "#6b7280" }}>{u}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground px-1">Conditionnement par défaut à la réception (peut être modifié à chaque entrée)</p>
                <div className={`grid gap-3 ${uEdit === "pièces" ? "grid-cols-1" : "grid-cols-2"}`}>
                  <div>
                    <p className="text-xs font-black tracking-wider mb-2" style={{ color: "#3b82f6" }}>PIÈCES PAR LOT</p>
                    <input value={ePieces} onChange={e => setEPieces(e.target.value)} type="number" placeholder="0 = pas de lot" className={inputCls + " text-center font-black"}/>
                  </div>
                  {uEdit !== "pièces" && (
                    <div>
                      <p className="text-xs font-black tracking-wider mb-2" style={{ color: "#3b82f6" }}>{eUnit.toUpperCase()} PAR PIÈCE</p>
                      <input value={eLongueur} onChange={e => setELongueur(e.target.value)} type="number" placeholder="0 = libre" className={inputCls + " text-center font-black"}/>
                    </div>
                  )}
                </div>
                {Number(ePieces) > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "#3b82f615" }}>
                    <span className="text-xs font-bold" style={{ color: "#3b82f6" }}>
                      1 lot = {ePieces} pièce(s){uEdit !== "pièces" && Number(eLongueur) > 0 ? ` × ${eLongueur} ${eUnit}` : ""}
                    </span>
                    {uEdit !== "pièces" && Number(eLongueur) > 0 && (
                      <span className="text-base font-black" style={{ color: "#3b82f6", fontFamily: "'Nunito', sans-serif" }}>= {Number(ePieces) * Number(eLongueur)} {eUnit}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {isExp && !isEd && catProds.length > 0 && (
              <div className="border-t border-border">
                {catProds.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                    <img src={imgSrc(p.img, 60, 60)} alt={p.nom} className="w-10 h-10 rounded-xl object-cover flex-shrink-0"/>
                    <p className="text-sm font-semibold flex-1">{p.nom}</p>
                    <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {productsWithoutCat.length > 0 && (
        <div className="bg-card rounded-2xl border border-dashed border-border overflow-hidden">
          <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpandedId(expandedId === "none" ? null : "none")}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "#EEE9D8" }}>📁</div>
            <div className="flex-1">
              <p className="font-bold text-sm text-muted-foreground">Sans catégorie</p>
              <p className="text-xs text-muted-foreground">{productsWithoutCat.length} produit{productsWithoutCat.length !== 1 ? "s" : ""}</p>
            </div>
            <ChevronRight size={13} className="text-muted-foreground" style={{ transform: expandedId === "none" ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}/>
          </button>
          {expandedId === "none" && (
            <div className="border-t border-border">
              {productsWithoutCat.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                  <img src={imgSrc(p.img, 60, 60)} alt={p.nom} className="w-10 h-10 rounded-xl object-cover flex-shrink-0"/>
                  <p className="text-sm font-semibold flex-1">{p.nom}</p>
                  <span className="text-xs text-muted-foreground">{p.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showNew ? (
        <div className="bg-card rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: "#3b82f6" }}>
          <p className="text-sm font-black" style={{ color: "#3b82f6" }}>Nouvelle catégorie</p>
          <Field label="NOM">
            <input value={nNom} onChange={e => setNNom(e.target.value)} placeholder="Ex: Bazin Riche" className={inputCls} autoFocus onKeyDown={e => e.key === "Enter" && createCat()}/>
          </Field>
          <Field label="UNITÉ DE VENTE">
            <div className="flex gap-2">
              {["yards", "mètres", "pièces"].map(u => (
                <button key={u} onClick={() => setNUnit(u)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: nUnit === u ? "#3b82f6" : "#EEE9D8", color: nUnit === u ? "#fff" : "#6b7280" }}>{u}</button>
              ))}
            </div>
          </Field>
          <div className={`grid gap-3 ${nUnit === "pièces" ? "grid-cols-1" : "grid-cols-2"}`}>
            <Field label="PIÈCES PAR LOT (optionnel)">
              <input value={nPieces} onChange={e => setNPieces(e.target.value)} type="number" placeholder="0" className={inputCls + " text-center font-black"}/>
            </Field>
            {nUnit !== "pièces" && (
              <Field label={`${nUnit.toUpperCase()} PAR PIÈCE`}>
                <input value={nLongueur} onChange={e => setNLongueur(e.target.value)} type="number" placeholder="0" className={inputCls + " text-center font-black"}/>
              </Field>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowNew(false); setNNom(""); }} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: "#EEE9D8", color: "#6b7280" }}>Annuler</button>
            <button onClick={createCat} disabled={!nNom.trim()} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: nNom.trim() ? "#3b82f6" : "#c4b89a", color: "#fff" }}>Créer la catégorie</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNew(true)} className="w-full rounded-2xl p-4 border-2 border-dashed border-border flex items-center gap-3 active:scale-[0.98]">
          <div className="w-10 h-10 rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><Plus size={20} className="text-muted-foreground"/></div>
          <div className="text-left">
            <p className="text-sm font-bold text-muted-foreground">Nouvelle catégorie</p>
            <p className="text-xs text-muted-foreground">Unité, conditionnement par défaut</p>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── PRINTER SECTION ─────────────────────────────────────────────────────────

function BoutiqueInfoSection({ boutique, onUpdate }: { boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void }) {
  const [nom, setNom] = useState(boutique.nom);
  const [ville, setVille] = useState(boutique.ville ?? "");
  const [adresse, setAdresse] = useState(boutique.adresse ?? "");
  const [email, setEmail] = useState(boutique.email ?? "");
  const [tel, setTel] = useState(boutique.tel ?? "");
  const [logo, setLogo] = useState<string | undefined>(boutique.logo);
  const [logoError, setLogoError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function save() {
    if (!nom.trim()) return;
    onUpdate({ nom: nom.trim(), ville: ville.trim(), adresse: adresse.trim()||undefined, email: email.trim()||undefined, tel: tel.trim()||undefined, logo: logo ?? undefined });
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(""); setLogoUploading(true);
    try {
      const dataUrl = await resizeLogo(file);
      setLogo(dataUrl);
    } catch (err: any) {
      setLogoError(err?.message ?? "Erreur lors du chargement du logo.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  const inputCls = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4">
      {/* LOGO */}
      <Field label="LOGO DE LA BOUTIQUE">
        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoFile}/>
        {logo ? (
          <div className="flex items-center gap-4 p-3 rounded-xl border border-border bg-background">
            <div className="flex-shrink-0 h-16 flex items-center justify-center rounded-lg overflow-hidden bg-muted px-2">
              <img src={logo} alt="Logo boutique" className="max-h-16 max-w-[140px] object-contain"/>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <button onClick={()=>logoInputRef.current?.click()} disabled={logoUploading}
                className="px-3 py-2 rounded-lg text-xs font-bold border border-border bg-muted hover:bg-border transition-colors text-left">
                {logoUploading ? "Chargement…" : "Remplacer le logo"}
              </button>
              <button onClick={()=>{ setLogo(undefined); setLogoError(""); }}
                className="px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-left">
                Supprimer le logo
              </button>
            </div>
          </div>
        ) : (
          <button onClick={()=>logoInputRef.current?.click()} disabled={logoUploading}
            className="w-full flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-border bg-muted hover:bg-border/40 transition-colors">
            <Camera size={22} className="text-muted-foreground"/>
            <span className="text-xs font-semibold text-muted-foreground">
              {logoUploading ? "Chargement…" : "Ajouter un logo (PNG, JPG, SVG · max 2 Mo)"}
            </span>
          </button>
        )}
        {logoError && <p className="mt-1 text-xs font-semibold text-red-600">{logoError}</p>}
      </Field>
      <Field label="NOM DE LA BOUTIQUE"><input value={nom} onChange={e=>setNom(e.target.value)} className={inputCls}/></Field>
      <Field label="VILLE"><input value={ville} onChange={e=>setVille(e.target.value)} placeholder="Ex: Dakar" className={inputCls}/></Field>
      <Field label="ADRESSE"><input value={adresse} onChange={e=>setAdresse(e.target.value)} placeholder="Ex: 12 Rue Vincens, Plateau" className={inputCls}/></Field>
      <Field label="E-MAIL (expéditeur factures)"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="boutique@email.com" type="email" className={inputCls}/></Field>
      <Field label="TÉLÉPHONE"><input value={tel} onChange={e=>setTel(e.target.value)} placeholder="+221 77 000 0000" type="tel" className={inputCls}/></Field>
      <button onClick={save} className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition-all" style={{ background: saved ? SEM.success.accent : boutique.color, color:"#fff", fontFamily:"'Nunito',sans-serif" }}>
        {saved ? "✓ Enregistré" : "Enregistrer les informations"}
      </button>
    </div>
  );
}

function PrinterSection({ boutique, onUpdate }: { boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void }) {
  const PC = boutique.color;
  const pa = usePAStatus();
  const [autoPrint, setAutoPrint] = useState(boutique.autoPrint ?? false);
  const [autoPrintBon, setAutoPrintBon] = useState(boutique.autoPrintBon ?? false);
  const [saved, setSaved] = useState(false);
  const [testJob, setTestJob] = useState<"idle"|"running"|"ok"|"fail">("idle");

  // Auto-connect when section mounts if boutique has a saved printer
  useEffect(() => {
    connectQZ(boutique.printerName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPrinter(name: string) {
    PA.printer = name;
    onUpdate({ printerName: name });
  }

  function save() {
    onUpdate({ printerName: PA.printer || boutique.printerName, autoPrint, autoPrintBon });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function testPrint() {
    setTestJob("running");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page{size:80mm auto;margin:4mm 4mm 8mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:9.5pt;width:72mm;margin:0 auto;color:#000;background:#fff}
.c{text-align:center}.b{font-weight:700}.big{font-size:14pt;font-weight:900;letter-spacing:2px}
.sep{border-top:1.5px dashed #555;margin:3mm 0}
</style></head><body>
<div class="c big">${boutique.nom.toUpperCase()}</div>
<div class="c" style="font-size:8pt;color:#555">${boutique.ville}</div>
<div class="sep"></div>
<div class="c b" style="font-size:11pt">TEST D'IMPRESSION</div>
<div class="sep"></div>
<div class="c" style="font-size:8.5pt">${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
${PA.printer ? `<div class="c" style="font-size:8pt;margin-top:2mm">Imprimante : ${PA.printer}</div>` : ""}
<div class="sep"></div>
<div class="c b" style="color:SEM.success.accent">Connexion réussie ✓</div>
<div class="c" style="font-size:8pt;margin-top:2mm">Agent QZ Tray actif · Tournal</div>
</body></html>`;
    const result = await agentPrint(html);
    setTestJob(result === "fail" ? "fail" : "ok");
    setTimeout(() => setTestJob("idle"), 5000);
  }

  const statusColors = {
    idle:        { bg:"#f3f4f6", dot:"#9ca3af", text:"Appuyer sur Connecter pour détecter l'agent", label:"Non initialisé" },
    loading:     { bg:"#fffbeb", dot:"#f59e0b", text:"Connexion à l'agent local en cours…", label:"Connexion…" },
    connected:   { bg:"#f0fdf4", dot:"#22c55e", text:`Agent QZ Tray actif · ${pa.printers.length} imprimante(s) détectée(s)`, label:"Agent détecté" },
    disconnected:{ bg:"#fef2f2", dot:"#ef4444", text:"Agent non détecté — installez le connecteur ci-dessous", label:"Agent non détecté" },
  };
  const sc = statusColors[pa.status];
  const canAutoprint = pa.status === "connected" && !!PA.printer;

  return (
    <div className="space-y-4 pb-4">

      {/* Agent status banner */}
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl" style={{ background:sc.bg, border:`1.5px solid ${sc.dot}44` }}>
        <div className="relative flex-shrink-0">
          <span className="text-2xl">🖨️</span>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ background:sc.dot }}>
            {pa.status === "loading" && <div className="w-full h-full rounded-full animate-ping" style={{ background:sc.dot }}/>}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm" style={{ color: pa.status==="connected"?"#166534":pa.status==="disconnected"?"#991b1b":pa.status==="loading"?"#92400e":"#374151" }}>
            {sc.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sc.text}</p>
          {pa.status === "disconnected" && pa.lastError && <p className="text-xs mt-1 leading-snug" style={{ color:"#b91c1c" }}>{pa.lastError}</p>}
        </div>
        <button onClick={()=>{ PA.status="idle"; notifyPA(); connectQZ(boutique.printerName); }} disabled={pa.status==="loading"}
          className="px-3 py-1.5 rounded-xl text-xs font-black active:scale-95 flex-shrink-0"
          style={{ background:PC+"18", color:PC, opacity:pa.status==="loading"?0.5:1 }}>
          {pa.status==="loading" ? "…" : pa.status==="connected" ? "Reconnecter" : "Connecter"}
        </button>
      </div>

      {/* Download link when agent not found */}
      {pa.status === "disconnected" && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl" style={{ background:"#fffbeb", border:"1.5px solid #fde68a" }}>
          <span className="text-lg flex-shrink-0 mt-0.5">⬇️</span>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color:"#92400e" }}>Installer l'agent QZ Tray</p>
            <p className="text-xs mt-0.5" style={{ color:"#a16207" }}>L'agent local permet à Tournal d'envoyer les tickets directement à l'imprimante sans fenêtre système.</p>
            <a href="https://qz.io/download/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-xl text-xs font-black text-white active:scale-95"
              style={{ background:"#f59e0b" }}>
              Télécharger QZ Tray →
            </a>
          </div>
        </div>
      )}

      {/* Printer selector */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Imprimante active</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sélectionnez l'imprimante détectée automatiquement par l'agent</p>
          </div>
          {pa.status === "connected" && (
            <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:"#dcfce7", color:"#166534" }}>{pa.printers.length} détectée(s)</span>
          )}
        </div>
        <div className="px-4 py-4">
          {pa.status !== "connected" ? (
            <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-muted">
              <span className="text-muted-foreground text-sm">
                {pa.status === "loading" ? "Récupération des imprimantes…" : "Connectez l'agent pour voir les imprimantes disponibles"}
              </span>
            </div>
          ) : pa.printers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Aucune imprimante trouvée. Vérifiez que votre imprimante est branchée et allumée.</p>
          ) : (
            <div className="space-y-2">
              {pa.printers.map(p => (
                <button key={p} onClick={()=>selectPrinter(p)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:scale-[0.98] transition-all"
                  style={{ background: PA.printer===p ? PC+"15" : "var(--muted)", border: PA.printer===p ? `2px solid ${PC}44` : "2px solid transparent" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: PA.printer===p ? PC+"25":"#e5e7eb" }}>
                    <span className="text-base">🖨️</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{p}</p>
                    {p.toLowerCase().includes("xp") || p.toLowerCase().includes("epson") || p.toLowerCase().includes("star") || p.toLowerCase().includes("thermal") ? (
                      <p className="text-xs" style={{ color:PC }}>Imprimante thermique détectée</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Imprimante générique</p>
                    )}
                  </div>
                  {PA.printer === p && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background:PC }}>
                      <span className="text-white text-xs font-black">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-print sections per document type */}
      {[
        { key:"ticket" as const, label:"Ticket de caisse", desc:"Reçu court format thermique, remis au client après encaissement.", icon:"🧾" },
        { key:"bon"    as const, label:"Bon de commande",  desc:"Document détaillé produits/quantités, généré à chaque nouvelle commande.", icon:"📋" },
      ].map(({ key, label, desc, icon }) => {
        const isOn = key==="ticket" ? (autoPrint&&canAutoprint) : (autoPrintBon&&canAutoprint);
        return (
          <div key={key} className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span>{icon}</span>
              <div>
                <p className="font-bold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
            <div className="px-4 py-4">
              <button onClick={()=>{if(!canAutoprint)return;if(key==="ticket")setAutoPrint(v=>!v);else setAutoPrintBon(v=>!v);}}
                className="flex items-center justify-between w-full active:scale-[0.98]"
                style={{ opacity: canAutoprint ? 1 : 0.45 }}>
                <div className="text-left">
                  <p className="text-sm font-bold">{isOn ? "Impression auto activée" : "Impression manuelle"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {!canAutoprint ? "Nécessite un agent connecté et une imprimante sélectionnée" : isOn ? "Chaque document part automatiquement" : "Activez pour imprimer sans action manuelle"}
                  </p>
                </div>
                <div className="w-12 h-6 rounded-full flex-shrink-0 ml-4 relative transition-colors duration-200" style={{ background: isOn ? PC : "#d1d5db" }}>
                  <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200" style={{ left: isOn ? "26px" : "2px" }}/>
                </div>
              </button>
            </div>
          </div>
        );
      })}

      {/* Setup guide */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="text-base">📋</span>
          <p className="font-bold text-sm">Guide de configuration</p>
        </div>
        <div className="divide-y divide-border">
          {[
            { n:"1", t:"Installer le pilote imprimante", d:"Téléchargez et installez le pilote de votre imprimante thermique 80mm (Xprinter, Epson TM-T20, Star TSP143…) depuis le site du fabricant." },
            { n:"2", t:"Installer et lancer QZ Tray", d:"Téléchargez QZ Tray sur qz.io/download, installez-le et lancez-le. L'icône apparaît dans la barre système. Au premier raccordement, validez l'accès demandé pour Tournal." },
            { n:"3", t:"Sélectionner l'imprimante", d:"Cliquez sur \"Connecter\" ci-dessus. La liste des imprimantes détectées s'affiche. Sélectionnez votre imprimante thermique." },
            { n:"4", t:"Tester l'impression réelle", d:"Cliquez sur \"Test réel\" pour envoyer un ticket de test via QZ Tray. Si le papier sort : vous êtes prêt. Activez ensuite l'impression automatique." },
          ].map(s=>(
            <div key={s.n} className="flex items-start gap-3 px-4 py-3.5">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 mt-0.5" style={{ background:PC }}>{s.n}</div>
              <div>
                <p className="text-sm font-bold">{s.t}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={testPrint} disabled={testJob==="running" || pa.status!=="connected" || !PA.printer}
          className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform border-2"
          style={{ borderColor:testJob==="ok"?"#22c55e":testJob==="fail"?"#ef4444":PC, color:testJob==="ok"?"#166534":testJob==="fail"?"#991b1b":PC, background:"transparent", opacity: pa.status!=="connected"||!PA.printer?0.4:1 }}>
          {testJob==="running" ? <><div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"/>Envoi…</> :
           testJob==="ok"      ? "✓ Ticket imprimé !" :
           testJob==="fail"    ? "✗ Échec — réessayer" :
           "🖨️ Test réel"}
        </button>
        <button onClick={save}
          className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform text-white"
          style={{ background: saved ? SEM.success.accent : PC }}>
          {saved ? "✓ Sauvegardé" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// ─── VIEW: SUPERVISION ───────────────────────────────────────────────────────

const CAT_LABEL: Record<TechLogCat,string>  = { sync:"Sync", email:"Email", pdf:"PDF", qz:"QZ Tray", session:"Session", backend:"Backend" };
const CAT_COLOR: Record<TechLogCat,string>  = { sync:"#3b82f6", email:"#f59e0b", pdf:"#8b5cf6", qz:"#06b6d4", session:"#10b981", backend:"#ef4444" };
const LEVEL_ICON: Record<TechLogLevel,string>  = { error:"❌", warn:"⚠️", info:"ℹ️" };
const LEVEL_COLOR: Record<TechLogLevel,string> = { error:"#ef4444", warn:"#f59e0b", info:"#6b7280" };

function fmtAge(ts: number): string {
  const d = Math.floor((Date.now()-ts)/1000);
  if (d < 60)    return "il y a quelques secondes";
  if (d < 3600)  return `il y a ${Math.floor(d/60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d/3600)}h`;
  return `il y a ${Math.floor(d/86400)}j`;
}
function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

function SupervisionSection({ boutique, allBoutiques, backendOk, lastSyncAt }: {
  boutique: Boutique; allBoutiques: Boutique[];
  backendOk: boolean|null; lastSyncAt: number;
}) {
  const [logs, setLogs]               = useState<TechLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<"logs"|"reseau">("logs");
  const [catFilter, setCatFilter]     = useState<TechLogCat|"all">("all");
  const [levelFilter, setLevelFilter] = useState<TechLogLevel|"all">("all");
  const [networkHealth, setNetworkHealth] = useState<Record<string,TechLog[]>>({});
  const [netLoading, setNetLoading]   = useState(false);

  useEffect(() => {
    // Legacy diagnostic events were intentionally removed. Operational logs
    // live server-side; this panel only reflects the current client health.
    setLogs([]);
    setLoading(false);
  }, [boutique.id]);

  useEffect(() => {
    if (tab !== "reseau" || allBoutiques.length < 2) return;
    setNetLoading(true);
    setNetworkHealth(Object.fromEntries(allBoutiques.map(b => [b.id, []])));
    setNetLoading(false);
  }, [tab, allBoutiques]);

  const now = Date.now();
  const errors24h = logs.filter(l => l.level==="error" && l.ts > now - 864e5).length;
  const errors7d  = logs.filter(l => l.level==="error" && l.ts > now - 6048e5).length;
  const warns24h  = logs.filter(l => l.level==="warn"  && l.ts > now - 864e5).length;

  const statusColor = backendOk===false ? "#ef4444" : errors24h > 0 ? "#f59e0b" : "#10b981";
  const statusLabel = backendOk===false ? "Hors ligne" : errors24h > 0 ? "Dégradé" : "Opérationnel";
  const statusIcon  = backendOk===false ? "🔴" : errors24h > 0 ? "🟡" : "🟢";

  const filtered = logs.filter(l =>
    (catFilter==="all" || l.cat===catFilter) &&
    (levelFilter==="all" || l.level===levelFilter)
  );

  return (
    <div className="space-y-4">

      {/* ── Health summary ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-4 border border-border col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{statusIcon}</span>
              <div>
                <p className="text-sm font-black" style={{ color:statusColor }}>{statusLabel}</p>
                <p className="text-xs text-muted-foreground">État général du système</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Dernière sync</p>
              <p className="text-xs font-bold">{lastSyncAt ? fmtAge(lastSyncAt) : "—"}</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Erreurs 24h</p>
          <p className="text-2xl font-black" style={{ color: errors24h>0 ? "#ef4444" : "#10b981", fontFamily:"'Nunito',sans-serif" }}>{errors24h}</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Erreurs 7 jours</p>
          <p className="text-2xl font-black" style={{ color: errors7d>0 ? "#f59e0b" : "#10b981", fontFamily:"'Nunito',sans-serif" }}>{errors7d}</p>
        </div>
        {warns24h > 0 && (
          <div className="col-span-2 rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background:"#f59e0b14", border:"1px solid #f59e0b30" }}>
            <span>⚠️</span>
            <p className="text-xs font-semibold" style={{ color:"#b45309" }}>{warns24h} avertissement{warns24h>1?"s":""} au cours des dernières 24h</p>
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      {allBoutiques.length > 1 && (
        <div className="flex gap-2">
          {(["logs","reseau"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-xs font-bold"
              style={{ background: tab===t ? boutique.color : boutique.color+"18", color: tab===t ? "#fff" : boutique.color }}>
              {t==="logs" ? "📋 Logs" : "🌐 Réseau"}
            </button>
          ))}
        </div>
      )}

      {/* ── Network health grid ──────────────────────────────────────────── */}
      {tab==="reseau" && (
        <div className="space-y-3">
          {netLoading ? (
            <div className="text-center py-8"><p className="text-sm text-muted-foreground">Chargement…</p></div>
          ) : allBoutiques.map(b => {
            const bLogs = networkHealth[b.id] ?? [];
            const bErr24 = bLogs.filter(l => l.level==="error" && l.ts > now - 864e5).length;
            const bWarn24 = bLogs.filter(l => l.level==="warn" && l.ts > now - 864e5).length;
            const bOk = bErr24===0 && bWarn24===0;
            const bColor = bErr24>0 ? "#ef4444" : bWarn24>0 ? "#f59e0b" : "#10b981";
            return (
              <div key={b.id} className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito',sans-serif" }}>{b.initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{b.nom}</p>
                  <p className="text-xs text-muted-foreground">{b.ville}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-base">{bOk ? "🟢" : bErr24>0 ? "🔴" : "🟡"}</span>
                    <span className="text-xs font-bold" style={{ color:bColor }}>{bOk ? "OK" : `${bErr24+bWarn24} alerte${bErr24+bWarn24>1?"s":""}`}</span>
                  </div>
                  {bLogs.length>0 && <p className="text-xs text-muted-foreground mt-0.5">{bLogs.length} entrée{bLogs.length>1?"s":""}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Log filters ──────────────────────────────────────────────────── */}
      {tab==="logs" && (
        <>
          <div className="flex gap-2 flex-wrap">
            {(["all","error","warn","info"] as const).map(l => (
              <button key={l} onClick={() => setLevelFilter(l)}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: levelFilter===l ? (l==="all"?"#1f2937":LEVEL_COLOR[l as TechLogLevel]) : "#f3f4f6",
                         color:      levelFilter===l ? "#fff" : "#374151" }}>
                {l==="all" ? "Tous niveaux" : l==="error" ? "❌ Erreurs" : l==="warn" ? "⚠️ Avert." : "ℹ️ Infos"}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all","sync","email","pdf","qz","session","backend"] as const).map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: catFilter===c ? (c==="all"?"#1f2937":CAT_COLOR[c as TechLogCat]) : "#f3f4f6",
                         color:      catFilter===c ? "#fff" : "#374151" }}>
                {c==="all" ? "Toutes catégories" : CAT_LABEL[c as TechLogCat]}
              </button>
            ))}
          </div>

          {/* ── Log list ───────────────────────────────────────────────── */}
          {loading ? (
            <div className="text-center py-8"><p className="text-sm text-muted-foreground">Chargement…</p></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={40} className="mx-auto mb-3" style={{ color:"#10b981", opacity:0.5 }}/>
              <p className="text-sm font-bold text-muted-foreground">Aucun log</p>
              <p className="text-xs text-muted-foreground mt-1">Aucun événement correspondant aux filtres sélectionnés.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry, idx) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                         style={{ background: LEVEL_COLOR[entry.level]+"18" }}>
                      {LEVEL_ICON[entry.level]}
                    </div>
                    {idx < filtered.length-1 && <div className="w-0.5 flex-1 mt-1 mb-1" style={{ background:"rgba(0,0,0,0.08)" }}/>}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="bg-card rounded-2xl px-3 py-3 border border-border">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-black"
                              style={{ background: CAT_COLOR[entry.cat]+"18", color: CAT_COLOR[entry.cat] }}>
                              {CAT_LABEL[entry.cat]}
                            </span>
                            {entry.level === "error" && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-black" style={{ background:"#ef444418", color:"#ef4444" }}>ERREUR</span>
                            )}
                            {entry.level === "warn" && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-black" style={{ background:"#f59e0b18", color:"#b45309" }}>AVERT.</span>
                            )}
                          </div>
                          <p className="text-sm font-bold">{entry.msg}</p>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{fmtAge(entry.ts)}</p>
                      </div>
                      {entry.detail && (
                        <p className="text-xs text-muted-foreground font-mono bg-muted rounded-xl px-2 py-1.5 mt-1 break-all">{entry.detail}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(entry.ts)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── VIEW: ADMIN ──────────────────────────────────────────────────────────────

function AdminView({ boutique, allBoutiques, platformUsers, currentUser, onUpdate, onUpdateUsers, onCreateUser, logAction, onSaveAuthSettings, lockMinutesInit, sessionMinutesInit, backendOk, lastSyncAt }: {
  boutique: Boutique; allBoutiques: Boutique[]; platformUsers: PlatformUser[]; currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  onUpdateUsers: (updater: PlatformUser[] | ((prev: PlatformUser[]) => PlatformUser[])) => void;
  onCreateUser: (user: Omit<PlatformUser,"id">) => Promise<PlatformUser|null>;
  logAction: (action: string, detail: string, icon: string) => void;
  onSaveAuthSettings?: (lockMin: number, sessMin: number) => Promise<void>;
  lockMinutesInit?: number;
  sessionMinutesInit?: number;
  backendOk?: boolean|null;
  lastSyncAt?: number;
}) {
  // ── section type ──────────────────────────────────────────────────────────
  type AdminSec = "equipe"|"perms"|"auth"|"stock-params"|"boutique"|"imprimante"|"lecteur"|"tiroir"|"activite"|"supervision";
  const [section, setSection] = useState<AdminSec>("equipe");
  const [catOpen, setCatOpen] = useState<"securite"|"fonctionnel"|"systeme"|"journal"|"supervision">("securite");

  // ── equipe / perms state ──────────────────────────────────────────────────
  const [expanded, setExpanded]   = useState<string|null>(null);
  const [editingRole, setEditingRole] = useState<string|null>(null);
  const [addModal, setAddModal]   = useState(false);
  const [auditFilter, setAuditFilter] = useState("all");
  const [pwdModal, setPwdModal]   = useState<{userId:string;nom:string}|null>(null);
  const [pwdVal, setPwdVal]       = useState("");
  const [pwdBusy, setPwdBusy]     = useState(false);
  const [uNom,setUNom]=useState(""); const [uPhone,setUPhone]=useState("+221 ");
  const [uPwd,setUPwd]=useState(""); const [uRole,setURole]=useState(ROLES[0]);
  const [creatingUser,setCreatingUser]=useState(false);
  const [uDroits,setUDroits]=useState<Record<Permission,boolean>>(ROLE_PRESETS[ROLES[0]]);

  // ── auth section state ────────────────────────────────────────────────────
  const [lockMinutes, setLockMinutes] = useState(lockMinutesInit ?? 10);
  type SessUnit = "min" | "h" | "j";
  // Initialise the free-form input in the most readable unit
  const initSessMin = sessionMinutesInit ?? 720; // default 12h
  const initUnit: SessUnit = initSessMin % 1440 === 0 ? "j" : initSessMin % 60 === 0 ? "h" : "min";
  const initValue = initUnit === "j" ? initSessMin / 1440 : initUnit === "h" ? initSessMin / 60 : initSessMin;
  const [sessValue, setSessValue] = useState(initValue);
  const [sessUnit, setSessUnit] = useState<SessUnit>(initUnit);
  const [authSaved, setAuthSaved] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [authSaveError, setAuthSaveError] = useState<string | null>(null);
  const sessMinutes = Math.max(5, Math.round(sessValue * (sessUnit === "min" ? 1 : sessUnit === "h" ? 60 : 1440)));

  const boutiqueUsers = platformUsers.filter(u=>!u.isSuperAdmin&&u.assignments.some(a=>a.boutiqueId===boutique.id));
  const permDefs = [
    {id:"dashboard"    as Permission, label:"Accueil",            icon:"🏠"},
    {id:"stock"        as Permission, label:"Catalogue",          icon:"📦"},
    {id:"fournisseurs" as Permission, label:"Fournisseurs",       icon:"🚛"},
    {id:"clients"      as Permission, label:"Clients",            icon:"👥"},
    {id:"factures"     as Permission, label:"Factures",           icon:"🧾"},
    {id:"vente"        as Permission, label:"Vente",              icon:"🛒"},
    {id:"encaissement_vente" as Permission, label:"Encaissement", icon:"💳"},
    {id:"remboursement"as Permission, label:"Remboursement",      icon:"↩️"},
    {id:"charges"      as Permission, label:"Charges",            icon:"💸"},
    {id:"compta"       as Permission, label:"Rapport",            icon:"📊"},
    {id:"inventaire"   as Permission, label:"Inventaire physique",icon:"📋"},
    {id:"marges"       as Permission, label:"Voir les marges",    icon:"📈"},
  ];

  // ── guards ────────────────────────────────────────────────────────────────
  function isOwnerUser(userId: string) {
    return platformUsers.find(u=>u.id===userId)
      ?.assignments.find(a=>a.boutiqueId===boutique.id)
      ?.role === "Propriétaire";
  }

  async function submitNewUser() {
    if (creatingUser || !uNom.trim()||!uPhone.trim()||uPwd.length<12) return;
    setCreatingUser(true);
    try {
      const newAssign: BoutiqueAssignment = { boutiqueId:boutique.id, role:uRole, droits:{...uDroits} };
      const existing = platformUsers.find(u=>cleanPhone(u.phone)===cleanPhone(uPhone.trim()));
      if (existing) {
        const already = existing.assignments.some(a=>a.boutiqueId===boutique.id);
        if (!already) { const eid=existing.id; onUpdateUsers(prev=>prev.map(u=>u.id!==eid?u:{...u,assignments:[...u.assignments,newAssign]})); logAction("Compte rattaché",`${existing.nom} · ${uRole}`,"🔗"); }
      } else {
        const color=USER_COLORS[platformUsers.length%USER_COLORS.length];
        const user = await onCreateUser({ phone:uPhone.trim(), password:uPwd, nom:uNom.trim(), initials:ini(uNom.trim()), color, isSuperAdmin:false, assignments:[] });
        if (!user) return;
        onUpdateUsers(prev=>prev.some(existingUser=>existingUser.id===user.id)
          ? prev.map(existingUser=>existingUser.id===user.id ? {...existingUser, assignments:[...existingUser.assignments,newAssign]} : existingUser)
          : [...prev,{...user, assignments:[newAssign]}]);
        logAction("Nouveau compte",`${uNom.trim()} · ${uRole}`,"👤");
      }
      setUNom(""); setUPhone("+221 "); setUPwd(""); setAddModal(false);
    } finally {
      setCreatingUser(false);
    }
  }
  function removeUser(userId: string) {
    if (isOwnerUser(userId)) return; // owner protected
    const u=platformUsers.find(x=>x.id===userId); if (!u) return;
    const bid=boutique.id; onUpdateUsers(prev=>prev.map(x=>x.id!==userId?x:{...x,assignments:x.assignments.filter(a=>a.boutiqueId!==bid)}));
    logAction("Compte supprimé",u.nom,"🗑️");
  }
  function toggleDroit(userId: string, perm: Permission) {
    if (isOwnerUser(userId)) return; // owner protected
    const u=platformUsers.find(x=>x.id===userId); if (!u) return;
    const bid=boutique.id;
    const assignment=u.assignments.find(a=>a.boutiqueId===boutique.id);
    if (!assignment) return;

    const nextValue = !assignment.droits[perm];
    onUpdateUsers(prev=>prev.map(x=>x.id!==userId?x:{...x,assignments:x.assignments.map(a=>{
      if (a.boutiqueId!==bid) return a;
      const nextDroits = {...a.droits,[perm]:nextValue};
      if (perm === "vente" && !nextValue) nextDroits.encaissement_vente = false;
      return {...a,droits:nextDroits};
    })}));
    logAction("Permission modifiée",`${u.nom} · ${perm}→${nextValue?"ON":"OFF"}`,"🔒");
  }
  function changeRole(userId: string, newRole: string) {
    if (isOwnerUser(userId)) return; // owner protected
    const u=platformUsers.find(x=>x.id===userId); if (!u) return;
    const bid=boutique.id;
    const preset=ROLE_PRESETS[newRole];
    onUpdateUsers(prev=>prev.map(x=>x.id!==userId?x:{...x,assignments:x.assignments.map(a=>a.boutiqueId!==bid?a:{...a,role:newRole,...(preset?{droits:{...preset}}:{})})}));
    logAction("Rôle modifié",`${u.nom} · ${newRole}`,"🔄");
    setEditingRole(null);
  }

  const auditLog=[...boutique.auditLog].sort((a,b)=>b.timestamp-a.timestamp);
  const filteredAudit=auditFilter==="all"?auditLog:auditLog.filter(e=>e.userId===auditFilter);
  const userStats=boutiqueUsers.map(u=>({ user:u, count:auditLog.filter(e=>e.userId===u.id).length, last:auditLog.find(e=>e.userId===u.id) })).sort((a,b)=>b.count-a.count);
  const found = uPhone.length>5 ? platformUsers.find(u=>cleanPhone(u.phone)===cleanPhone(uPhone)) : null;

  // ── sidebar categories ────────────────────────────────────────────────────
  type CatId = "securite"|"fonctionnel"|"systeme"|"journal"|"supervision";
  const CATS: Array<{ id:CatId; icon:string; label:string; subs:Array<{id:AdminSec;label:string}> }> = [
    { id:"securite",    icon:"🔒", label:"Sécurité",    subs:[{id:"equipe",label:"Équipe"},{id:"perms",label:"Droits"},{id:"auth",label:"Authentification"}] },
    { id:"fonctionnel", icon:"⚙️", label:"Fonctionnel", subs:[{id:"stock-params",label:"Catalogue"},{id:"boutique",label:"Boutique"}] },
    { id:"systeme",     icon:"🔧", label:"Système",     subs:[{id:"imprimante",label:"Imprimante"},{id:"lecteur",label:"Code-barre"},{id:"tiroir",label:"Tiroir caisse"}] },
    { id:"journal",     icon:"📋", label:"Journal",     subs:[{id:"activite",label:"Activité"}] },
    { id:"supervision", icon:"🩺", label:"Supervis.",   subs:[{id:"supervision",label:"Monitoring"}] },
  ];

  function navTo(catId: CatId, secId: AdminSec) { setCatOpen(catId); setSection(secId); }

  const activeLabel = CATS.flatMap(c=>c.subs).find(s=>s.id===section)?.label ?? "";
  const activeCatLabel = CATS.find(c=>c.subs.some(s=>s.id===section))?.label ?? "";

  return (
    <div className="flex gap-0 pb-4" style={{ minHeight:"60vh" }}>

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col gap-0.5 py-1 overflow-y-auto" style={{ width:"84px", maxHeight:"75vh" }}>
        {CATS.map(cat => {
          const isCatActive = catOpen === cat.id;
          return (
            <div key={cat.id}>
              {/* Category header */}
              <button onClick={()=>{ setCatOpen(isCatActive?cat.id:cat.id); navTo(cat.id, cat.subs[0].id); }}
                className="w-full flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl transition-all"
                style={{ background: isCatActive ? "rgba(0,0,0,0.05)" : "transparent" }}>
                <span className="text-base leading-none">{cat.icon}</span>
                <span className="font-black text-center leading-tight" style={{ fontSize:"8px", color: isCatActive ? "#1f2937" : "#9a8f78" }}>{cat.label.toUpperCase()}</span>
              </button>
              {/* Sub-items (visible when category open) */}
              {isCatActive && (
                <div className="flex flex-col gap-0.5 pb-1 pl-1 pr-0.5">
                  {cat.subs.map(sub => {
                    const active = section === sub.id;
                    return (
                      <button key={sub.id} onClick={()=>setSection(sub.id)}
                        className="relative w-full flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                        style={{ background: active ? boutique.color+"18" : "transparent" }}>
                        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full" style={{ background:boutique.color }}/>}
                        <span className="font-bold text-center leading-tight px-1" style={{ fontSize:"8px", color: active ? boutique.color : "#9a8f78" }}>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex-shrink-0 mx-2" style={{ width:"1px", background:"var(--border)", alignSelf:"stretch" }}/>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Breadcrumb header */}
        <div className="flex items-center gap-1.5 pb-1" style={{ borderBottom:"1px solid var(--border)" }}>
          <span className="text-xs text-muted-foreground font-semibold">{activeCatLabel}</span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-sm font-black">{activeLabel}</span>
        </div>

        {/* ── ÉQUIPE ─────────────────────────────────────────────────────── */}
        {section==="equipe"&&<>
          {boutiqueUsers.map(u=>{
            const a=u.assignments.find(x=>x.boutiqueId===boutique.id)!;
            const isOwner=a.role==="Propriétaire"; const isMe=u.id===currentUser.id;
            const activePerms=permDefs.filter(p=>isOwner||a.droits[p.id]);
            const roleIcon = isOwner?"👑":a.role==="Manager"?"🔑":"🪪";
            return <div key={u.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center gap-3 p-3.5">
                <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:u.color+"22",color:u.color,fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-black text-sm leading-tight">{u.nom}</p>
                    {isMe&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#EEE9D8", color:"#9a8f78" }}>vous</span>}
                    {isOwner&&<span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background:"#C9A22720", color:"#C9A227" }}>👑 Propriétaire</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Smartphone size={10} className="text-muted-foreground"/>
                    <span className="text-xs text-muted-foreground">{u.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1" style={{ background:u.color+"18", color:u.color }}>
                    <span>{roleIcon}</span> {a.role}
                  </span>
                  {!isMe&&<button onClick={()=>{ setPwdVal(""); setPwdModal({userId:u.id,nom:u.nom}); }} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#37415115" }} title="Changer le mot de passe"><Lock size={13} style={{ color:"#374151" }}/></button>}
                  {!isOwner&&!isMe&&<button onClick={()=>removeUser(u.id)} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={13} style={{ color:"#ef4444" }}/></button>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 px-3.5 pb-3 pt-0">
                {isOwner
                  ? <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ background:"#C9A22722", color:"#C9A227" }}>🔓 Accès complet à tout</span>
                  : activePerms.length > 0
                    ? activePerms.map(p=><span key={p.id} className="text-xs px-1.5 py-0.5 rounded-md font-bold" style={{ background:"#37415115", color:"#374151" }}>{p.icon} {p.label}</span>)
                    : <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ background:"#ef444415", color:"#ef4444" }}>⚠ Aucun accès configuré</span>
                }
              </div>
            </div>;
          })}
          <button onClick={()=>setAddModal(true)} className="w-full rounded-2xl p-3.5 border-2 border-dashed border-border flex items-center gap-3 active:scale-[0.98]">
            <div className="w-10 h-10 rounded-xl border-2 border-dashed border-border flex items-center justify-center flex-shrink-0"><UserPlus size={18} className="text-muted-foreground"/></div>
            <div className="text-left"><p className="text-sm font-bold text-muted-foreground">Ajouter un membre</p><p className="text-xs text-muted-foreground mt-0.5">Numéro existant = rattachement auto</p></div>
          </button>
          {addModal&&<Modal title="Nouveau membre" color="#374151" onClose={()=>setAddModal(false)}>
            {found&&<div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background:SEM.success.bg }}>
              <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:found.color+"22",color:found.color,fontFamily:"'Nunito', sans-serif" }}>{found.initials}</div>
              <div className="flex-1"><p className="text-sm font-bold" style={{ color:SEM.success.accent }}>Compte existant</p><p className="text-xs text-muted-foreground">{found.nom} sera rattaché à cette boutique</p></div>
              <CheckCircle size={18} style={{ color:SEM.success.accent }}/>
            </div>}
            <Field label="NOM COMPLET"><input value={uNom} onChange={e=>setUNom(e.target.value)} placeholder="Ex: Kadiatou Bah" className={inputCls} autoFocus onKeyDown={e=>e.key==="Enter"&&submitNewUser()}/></Field>
            <Field label="TÉLÉPHONE (identifiant unique)"><div className="relative"><Smartphone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={uPhone} onChange={e=>{const v=e.target.value;setUPhone(v.startsWith("+221 ")?v:"+221 ");}} placeholder="+221 77 000 0000" type="tel" className={inputCls+" pl-11"} onKeyDown={e=>e.key==="Enter"&&submitNewUser()}/></div></Field>
            <Field label="MOT DE PASSE"><input value={uPwd} onChange={e=>setUPwd(e.target.value)} placeholder="Mot de passe" type="password" className={inputCls} onKeyDown={e=>e.key==="Enter"&&submitNewUser()}/></Field>
            <Field label="RÔLE">
              <div className="grid grid-cols-3 gap-2">{ROLES.map(r=><button key={r} onClick={()=>{ setURole(r); setUDroits(ROLE_PRESETS[r]??{stock:false,fournisseurs:false,clients:false,factures:false}); }} className="py-2.5 rounded-xl text-xs font-bold" style={{ background:uRole===r?boutique.color:"#EEE9D8",color:uRole===r?"#fff":"#6b7280" }}>{r}</button>)}</div>
            </Field>
            <Field label="ACCÈS (cliquez pour activer / désactiver)">
              <div className="grid grid-cols-2 gap-2">{permDefs.map(p=>(
                <button key={p.id}
                  disabled={p.id==="encaissement_vente"&&!uDroits.vente}
                  onClick={()=>setUDroits(d=>{
                    if (p.id==="encaissement_vente"&&!d.vente) return d;
                    const next={...d,[p.id]:!d[p.id]};
                    if (p.id==="vente"&&d.vente) next.encaissement_vente=false;
                    return next;
                  })}
                  className="flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background:uDroits[p.id]?boutique.color+"18":"transparent", borderColor:uDroits[p.id]?boutique.color:"rgba(0,0,0,0.1)" }}>
                  <span className="text-base">{p.icon}</span>
                  <span className="text-xs font-bold flex-1 text-left" style={{ color:uDroits[p.id]?boutique.color:"#7A7055" }}>{p.label}</span>
                  <div className="w-8 h-4 rounded-full flex items-center flex-shrink-0 transition-all duration-200" style={{ background:uDroits[p.id]?boutique.color:"#c7bfa0", paddingLeft:uDroits[p.id]?"14px":"2px" }}>
                    <div className="w-3 h-3 rounded-full bg-white shadow-sm"/>
                  </div>
                </button>
              ))}</div>
              {Object.values(uDroits).every(v=>!v)&&<p className="text-xs mt-2 px-1" style={{ color:"#ef4444" }}>⚠ Aucun accès — cet utilisateur ne pourra rien faire</p>}
            </Field>
            <SubmitBtn color={boutique.color} label={creatingUser?"Création…":"Créer le compte"} onClick={submitNewUser} disabled={creatingUser||!uNom.trim()||!uPhone.trim()||!uPwd.trim()}/>
          </Modal>}
          {pwdModal&&<Modal title={`Mot de passe · ${pwdModal.nom}`} color="#374151" onClose={()=>setPwdModal(null)}>
            <Field label="NOUVEAU MOT DE PASSE">
              <input value={pwdVal} onChange={e=>setPwdVal(e.target.value)} type="password"
                placeholder="12 caractères minimum" className={inputCls} autoFocus
                onKeyDown={async e=>{ if(e.key==="Enter"&&pwdVal.length>=12){ setPwdBusy(true); try{ await resetUserPassword(pwdModal.userId,pwdVal); toast.success("Mot de passe mis à jour"); setPwdModal(null); }catch(err){ toast.error(err instanceof Error?err.message:"Erreur"); } finally{ setPwdBusy(false); } } }}/>
              {pwdVal.length>0&&pwdVal.length<12&&<p className="text-xs mt-1" style={{color:"#ef4444"}}>12 caractères minimum ({12-pwdVal.length} restants)</p>}
            </Field>
            <SubmitBtn color="#374151" label={pwdBusy?"Enregistrement…":"Mettre à jour"} onClick={async()=>{
              if(pwdVal.length<12) return;
              setPwdBusy(true);
              try{ await resetUserPassword(pwdModal.userId,pwdVal); toast.success("Mot de passe mis à jour"); setPwdModal(null); }
              catch(err){ toast.error(err instanceof Error?err.message:"Erreur"); }
              finally{ setPwdBusy(false); }
            }} disabled={pwdBusy||pwdVal.length<12}/>
          </Modal>}
        </>}

        {/* ── DROITS ─────────────────────────────────────────────────────── */}
        {section==="perms"&&<>
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background:"#ef444408", border:"1px solid #ef444425" }}>
            <Shield size={16} style={{ color:"#ef4444" }}/>
            <p className="text-xs font-semibold" style={{ color:"#ef4444" }}>Cliquez sur un employé pour modifier ses droits d'accès en temps réel.</p>
          </div>
          {boutiqueUsers.map(u=>{
            const a=u.assignments.find(x=>x.boutiqueId===boutique.id)!;
            const isOwner=a.role==="Propriétaire"; const isEditRole=editingRole===u.id;
            return <div key={u.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 text-left" onClick={()=>{setExpanded(expanded===u.id?null:u.id);setEditingRole(null);}}>
                <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:u.color+"22",color:u.color,fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                <div className="flex-1"><p className="font-bold text-sm">{u.nom}</p><p className="text-xs" style={{ color:u.color }}>{a.role}{isOwner?" 👑":""}</p></div>
                <ChevronRight size={16} className="text-muted-foreground transition-transform duration-200" style={{ transform:expanded===u.id?"rotate(90deg)":"rotate(0deg)" }}/>
              </button>
              {expanded===u.id&&(
                <div className="border-t border-border">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black tracking-wider" style={{ color:"#ef4444" }}>RÔLE</p>
                      {!isOwner&&<button onClick={()=>setEditingRole(isEditRole?null:u.id)} className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ background:isEditRole?"#ef444415":"#EEE9D8", color:isEditRole?"#ef4444":"#6b7280" }}>{isEditRole?"Annuler":"Changer"}</button>}
                    </div>
                    {isOwner?(
                      <span className="text-xs px-2.5 py-1 rounded-xl font-bold" style={{ background:"#C9A22720",color:"#C9A227" }}>👑 Propriétaire — rôle protégé</span>
                    ):isEditRole?(
                      <div className="grid grid-cols-3 gap-2">
                        {ROLES.map(r=><button key={r} onClick={()=>changeRole(u.id,r)} className="py-2 rounded-xl text-xs font-bold" style={{ background:a.role===r?"#ef4444":"#EEE9D8", color:a.role===r?"#fff":"#6b7280" }}>{r}</button>)}
                      </div>
                    ):(
                      <span className="inline-block text-xs px-2.5 py-1 rounded-xl font-bold" style={{ background:u.color+"22",color:u.color }}>{a.role}</span>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">ACCÈS</p>
                    {isOwner&&<span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ background:SEM.role.bg, color:SEM.role.text }}>🔓 Propriétaire — accès complet</span>}
                  </div>
                  {!isOwner&&<div className="grid grid-cols-2 divide-x divide-y divide-border border-t border-border">
                    {permDefs.map(({id,label,icon})=>{const enabled=a.droits[id];return(
                      <button key={id} disabled={id==="encaissement_vente"&&!a.droits.vente} onClick={()=>toggleDroit(u.id,id)} className="flex items-center gap-3 px-4 py-3.5 active:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:enabled?boutique.color+"22":"#EEE9D8" }}><span className="text-base">{icon}</span></div>
                        <div className="flex-1 text-left"><p className="text-xs font-bold" style={{ color:enabled?boutique.color:"#7A7055" }}>{label}</p></div>
                        <div className="w-9 h-5 rounded-full flex-shrink-0 flex items-center transition-all duration-200" style={{ background:enabled?boutique.color:"#c7bfa0", paddingLeft:enabled?"18px":"2px" }}><div className="w-4 h-4 rounded-full bg-white shadow-sm"/></div>
                      </button>
                    );})}
                  </div>}
                </div>
              )}
            </div>;
          })}
        </>}

        {/* ── AUTHENTIFICATION ───────────────────────────────────────────── */}
        {section==="auth"&&<div className="space-y-4">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background:"#3b82f608", border:"1px solid #3b82f625" }}>
            <Lock size={16} style={{ color:"#3b82f6" }}/>
            <p className="text-xs font-semibold" style={{ color:"#3b82f6" }}>Ces paramètres s'appliquent à tous les utilisateurs de cette boutique.</p>
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Verrouillage automatique</p><p className="text-xs text-muted-foreground mt-0.5">Durée d'inactivité avant verrouillage de l'écran (code PIN requis pour reprendre)</p></div>
            <div className="px-4 py-4">
              <div className="flex gap-2 flex-wrap">
                {[5,10,15,30,60].map(m=>(
                  <button key={m} onClick={()=>setLockMinutes(m)} className="px-4 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background:lockMinutes===m?"#1f2937":"#f3f4f6", color:lockMinutes===m?"#fff":"#374151" }}>{m} min</button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border"><p className="font-bold text-sm">Expiration de session</p><p className="text-xs text-muted-foreground mt-0.5">Durée maximale d'inactivité avant une reconnexion complète</p></div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <input type="number" min={1} value={sessValue}
                  onChange={e => setSessValue(Math.max(1, Number(e.target.value)))}
                  className="w-24 px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/30"/>
                <div className="flex gap-1">
                  {(["min","h","j"] as SessUnit[]).map(u => (
                    <button key={u} onClick={() => setSessUnit(u)}
                      className="px-3 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: sessUnit===u ? "#1f2937" : "#f3f4f6", color: sessUnit===u ? "#fff" : "#374151" }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {sessMinutes < 60
                  ? `${sessMinutes} minute${sessMinutes > 1 ? "s" : ""}`
                  : sessMinutes < 1440
                    ? `${Math.round(sessMinutes / 60 * 10) / 10} heure${sessMinutes >= 120 ? "s" : ""}`
                    : `${Math.round(sessMinutes / 1440 * 10) / 10} jour${sessMinutes >= 2880 ? "s" : ""}`
                } · minimum 5 min
              </p>
            </div>
          </div>
          {authSaveError && <p className="text-xs font-semibold" style={{ color:SEM.danger.text }}>{authSaveError}</p>}
          <button onClick={async()=>{
              if (authSaving) return;
              setAuthSaving(true); setAuthSaveError(null);
              try {
                await onSaveAuthSettings?.(lockMinutes, sessMinutes);
                setAuthSaved(true);
                setTimeout(()=>setAuthSaved(false),2000);
                logAction("Paramètres auth modifiés",`Verrou ${lockMinutes}min · Session ${sessMinutes}min`,"🔒");
              } catch (error) {
                setAuthSaveError(error instanceof Error ? error.message : "Enregistrement impossible. Réessayez.");
              } finally {
                setAuthSaving(false);
              }
            }} disabled={authSaving}
            className="w-full py-4 rounded-2xl text-base font-black active:scale-95 transition-all disabled:opacity-60"
            style={{ background:authSaved?SEM.success.accent:boutique.color, color:"#fff", fontFamily:"'Nunito',sans-serif" }}>
            {authSaving ? "Enregistrement…" : authSaved ? "✓ Enregistré" : "Appliquer les paramètres"}
          </button>
        </div>}

        {/* ── CATALOGUE ──────────────────────────────────────────────────── */}
        {section==="stock-params"&&<CatalogueSection boutique={boutique} onUpdate={onUpdate} logAction={logAction}/>}

        {/* ── BOUTIQUE ───────────────────────────────────────────────────── */}
        {section==="boutique"&&<BoutiqueInfoSection boutique={boutique} onUpdate={onUpdate}/>}

        {/* ── IMPRIMANTE ─────────────────────────────────────────────────── */}
        {section==="imprimante"&&<PrinterSection boutique={boutique} onUpdate={onUpdate}/>}

        {/* ── LECTEUR CODE-BARRE ─────────────────────────────────────────── */}
        {section==="lecteur"&&<div className="space-y-4">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background:"#f3f4f6", border:"1px solid var(--border)" }}>
            <span className="text-2xl">📷</span>
            <div><p className="text-sm font-bold">Lecteur de code-barre</p><p className="text-xs text-muted-foreground mt-0.5">Configuration des lecteurs connectés à cette boutique (HID / USB).</p></div>
          </div>
          <div className="rounded-2xl px-4 py-8 flex flex-col items-center gap-2" style={{ background:"#f9f9f7", border:"1.5px dashed var(--border)" }}>
            <span className="text-3xl opacity-30">🔍</span>
            <p className="text-sm font-bold text-muted-foreground">Aucun lecteur configuré</p>
            <p className="text-xs text-muted-foreground">Cette fonctionnalité sera disponible dans une prochaine mise à jour.</p>
          </div>
        </div>}

        {/* ── TIROIR DE CAISSE ───────────────────────────────────────────── */}
        {section==="tiroir"&&<div className="space-y-4">
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background:"#f3f4f6", border:"1px solid var(--border)" }}>
            <span className="text-2xl">🗄️</span>
            <div><p className="text-sm font-bold">Tiroir de caisse</p><p className="text-xs text-muted-foreground mt-0.5">Configuration du tiroir de caisse connecté à l'imprimante thermique.</p></div>
          </div>
          <div className="rounded-2xl px-4 py-8 flex flex-col items-center gap-2" style={{ background:"#f9f9f7", border:"1.5px dashed var(--border)" }}>
            <span className="text-3xl opacity-30">🗄️</span>
            <p className="text-sm font-bold text-muted-foreground">Aucun tiroir configuré</p>
            <p className="text-xs text-muted-foreground">Le tiroir s'ouvre automatiquement via l'imprimante thermique (commande ESC/POS).</p>
          </div>
        </div>}

        {/* ── JOURNAL ────────────────────────────────────────────────────── */}
        {section==="activite"&&<>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl p-4 border border-border"><div className="flex items-center gap-2 mb-2"><ClipboardList size={18} style={{ color:"#a855f7" }}/><p className="text-xs font-black" style={{ color:"#a855f7" }}>OPÉRATIONS</p></div><p className="text-3xl font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{auditLog.length}</p><p className="text-xs text-muted-foreground mt-0.5">au total</p></div>
            <div className="bg-card rounded-2xl p-4 border border-border"><div className="flex items-center gap-2 mb-2"><Activity size={18} style={{ color:SEM.success.accent }}/><p className="text-xs font-black" style={{ color:SEM.success.accent }}>ACTIFS</p></div><p className="text-3xl font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{[...new Set(auditLog.map(e=>e.userId))].length}</p><p className="text-xs text-muted-foreground mt-0.5">membres</p></div>
          </div>
          {userStats.length>0&&<div className="bg-card rounded-2xl border border-border overflow-hidden">
            <p className="text-xs font-black tracking-wider text-muted-foreground px-4 pt-4 pb-2">PAR MEMBRE</p>
            {userStats.map(({ user:u,count,last })=>(
              <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-t border-border">
                <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black" style={{ background:u.color+"22",color:u.color,fontFamily:"'Nunito', sans-serif" }}>{u.initials}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-bold">{u.nom}</p><p className="text-xs text-muted-foreground truncate">{last?.action??"—"}</p></div>
                <div className="text-right"><p className="text-base font-black" style={{ color:u.color,fontFamily:"'Nunito', sans-serif" }}>{count}</p><p className="text-xs text-muted-foreground">ops.</p></div>
              </div>
            ))}
          </div>}
          <div className="flex gap-2" style={{ overflowX:"auto", scrollbarWidth:"none" }}>
            <button onClick={()=>setAuditFilter("all")} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{ background:auditFilter==="all"?"#a855f7":"#a855f722",color:auditFilter==="all"?"#fff":"#a855f7" }}>Tous</button>
            {boutiqueUsers.map(u=><button key={u.id} onClick={()=>setAuditFilter(u.id)} className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0" style={{ background:auditFilter===u.id?u.color:u.color+"22",color:auditFilter===u.id?"#fff":u.color }}>{u.nom.split(" ")[0]}</button>)}
          </div>
          {filteredAudit.length>0?<div className="space-y-2">{filteredAudit.map((e,idx)=>(
            <div key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{ background:e.userColor+"22" }}>{e.icon}</div>
                {idx<filteredAudit.length-1&&<div className="w-0.5 flex-1 mt-1 mb-1" style={{ background:"rgba(0,0,0,0.08)" }}/>}
              </div>
              <div className="flex-1 pb-3">
                <div className="bg-card rounded-2xl px-3 py-3 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold">{e.action}</p>
                        {currentUser?.isSuperAdmin && e.source && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wide" style={{ background:"#16a34a15", color:"#16a34a" }}>
                            Natif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>
                    </div>
                    <p className="text-xs text-muted-foreground text-right whitespace-nowrap flex-shrink-0">{e.date}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background:e.userColor+"22",color:e.userColor,fontSize:"9px",fontWeight:900 }}>{e.userNom[0]}</div>
                    <span className="text-xs font-semibold" style={{ color:e.userColor }}>{e.userNom}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}</div>:<div className="text-center py-12"><Activity size={40} className="mx-auto mb-3 text-muted-foreground" style={{ opacity:0.4 }}/><p className="text-sm text-muted-foreground">Aucune activité</p></div>}
        </>}

        {section==="supervision"&&<SupervisionSection
          boutique={boutique} allBoutiques={allBoutiques}
          backendOk={backendOk??null} lastSyncAt={lastSyncAt??0}/>}

      </div>{/* end main content */}
    </div>
  );
}


// ─── NAV ──────────────────────────────────────────────────────────────────────

function buildOrderTicketHtml(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean): string {
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
function printOrderTicket(inv: Invoice, boutique: Boutique, operatorNom: string, isDuplicate?: boolean) {
  silentPrint(buildOrderTicketHtml(inv, boutique, operatorNom, isDuplicate));
}

function printCaisseReport(session: CaisseSession, boutique: Boutique, invoices: Invoice[]) {
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

// ─── VIEW: POINT DE VENTE ─────────────────────────────────────────────────────

function POSView({ boutique, allBoutiques, currentUser, onUpdate, logAction }: {
  boutique: Boutique; allBoutiques: Boutique[]; currentUser: PlatformUser;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const sendNotif = useNotif();
  const POS_COLOR = boutique.color;
  const { products, entries, invoices } = boutique;
  const session = boutique.caisseSession;
  const isSessionOpen = !!(session && !session.closedAt);

  // Caisse open/close
  const [fondCaisse, setFondCaisse] = useState("0");
  const [closeModal, setCloseModal] = useState(false);

  // Order taking
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addModal, setAddModal] = useState<Product|null>(null);
  const [addQty, setAddQty] = useState("1.00");
  const [addPrice, setAddPrice] = useState("");
  const [addSellUnit, setAddSellUnit] = useState("");
  const posCats = boutique.categories ?? [];

  function posConditioning(p: Product): ProductParam | Category | undefined {
    return (boutique.productParams ?? []).find(x => x.productId === p.id)
      ?? posCats.find(c => c.nom === p.categorie);
  }

  function getSellOptions(p: Product): string[] {
    const cat = posConditioning(p);
    if (!cat || cat.nbPiecesParLot <= 0) return [p.unit];
    const opts: string[] = ["Lot"];
    if (cat.unitVente !== "pièces") opts.push("Pièce");
    opts.push(cat.unitVente);
    return opts;
  }

  function toBaseQty(sellQty: number, sellUnit: string, p: Product): number {
    const cat = posConditioning(p);
    if (!cat || cat.nbPiecesParLot <= 0) return sellQty;
    if (sellUnit === "Lot")
      return cat.unitVente === "pièces"
        ? sellQty * cat.nbPiecesParLot
        : sellQty * cat.nbPiecesParLot * (cat.longueurParPiece || 1);
    if (sellUnit === "Pièce")
      return cat.unitVente === "pièces" ? sellQty : sellQty * (cat.longueurParPiece || 1);
    return sellQty;
  }

  function sellConversion(sellQty: number, sellUnit: string, p: Product): string | null {
    const cat = posConditioning(p);
    if (!cat || !sellQty) return null;
    const base = toBaseQty(sellQty, sellUnit, p);
    if (base === sellQty && sellUnit === cat.unitVente) return null;
    return `${base} ${cat.unitVente}`;
  }
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientNom, setClientNom] = useState("");
  const [clientTel, setClientTel] = useState("+221 ");
  const [done, setDone] = useState(false);
  const [lastInv, setLastInv] = useState<Invoice|null>(null);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [posTab, setPosTab] = useState<"produits"|"commandes">("produits");
  const [deleteOrderId, setDeleteOrderId] = useState<string|null>(null);
  const [printJob, setPrintJob] = useState<{status:"printing"|"ok"|"fail"|"fallback";html:string;label:string}|null>(null);

  // Auto-connect QZ Tray if configured
  useEffect(()=>{ if (boutique.autoPrint && boutique.printerName && PA.status==="idle") connectQZ(boutique.printerName); },[]);

  async function doPrint(html: string, label: string) {
    setPrintJob({ status:"printing", html, label });
    const result = await agentPrint(html);
    setPrintJob(j=>j?{...j, status:result}:null);
    if (result !== "fail") setTimeout(()=>setPrintJob(null), 3500);
  }

  // Pending (unpaid) orders that can still be modified before encaissement
  const pendingOrders = invoices.filter(i => i.acompte === 0 && i.status === "en attente" && i.type !== "Retour");

  const todayStr = new Date().toISOString().split("T")[0];
  const todayInv = invoices.filter(i => i.dateRaw === todayStr && i.acompte > 0);
  const totalJour = todayInv.reduce((s, i) => s + signedInvoicePaid(i), 0);
  const byMethod = PAYMENT_METHODS.map(m => ({
    m,
    total: todayInv.filter(i => i.paymentMethod === m).reduce((s, i) => s + signedInvoicePaid(i), 0),
    count: todayInv.filter(i => i.paymentMethod === m).length,
  }));
  const totalEspeces = byMethod.find(b => b.m === "Espèces")?.total ?? 0;

  const [posCatFilter, setPosCatFilter] = useState("all");
  const [posSort, setPosSort] = useState<"nom"|"stock_asc"|"stock_desc"|"bestseller">("nom");
  const [posViewMode, setPosViewMode] = useState<"grid"|"list">("grid");

  const allPosCats = Array.from(new Set(products.map(p => p.categorie).filter(Boolean) as string[]));

  function getStock(p: Product) {
    return entries.filter(e => e.productId === p.id).reduce((s, e) => s + e.qty, 0);
  }

  function getSalesCount(p: Product) {
    return invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;
  }

  const filtered = products
    .filter(p => p.nom.toLowerCase().includes(search.toLowerCase()))
    .filter(p => posCatFilter === "all" || p.categorie === posCatFilter)
    .sort((a, b) => {
      if (posSort === "nom") return a.nom.localeCompare(b.nom);
      if (posSort === "bestseller") return getSalesCount(b) - getSalesCount(a);
      const sa = getStock(a), sb = getStock(b);
      return posSort === "stock_asc" ? sa - sb : sb - sa;
    });
  const cartTotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  function openCaisse() {
    const s: CaisseSession = { id: Date.now(), openedAt: new Date().toISOString(), openedBy: currentUser.nom, fondDeCaisse: Number(fondCaisse) || 0 };
    onUpdate({ caisseSession: s });
    logAction("Ouverture caisse", `Fond : ${fmt(s.fondDeCaisse)}`, "🏪");
  }

  function closeCaisse() {
    if (!session) return;
    const closed: CaisseSession = { ...session, closedAt: new Date().toISOString(), closedBy: currentUser.nom };
    const history = [...(boutique.caisseHistory ?? []), closed];
    printCaisseReport(closed, boutique, invoices);
    onUpdate({ caisseSession: closed, caisseHistory: history });
    logAction("Fermeture caisse", `Total encaissé : ${fmt(totalJour)}`, "🔒");
    setCloseModal(false);
  }

  function openAdd(p: Product) {
    const inCart = cart.find(i => i.productId === p.id);
    const opts = getSellOptions(p);
    const cat2 = posConditioning(p);
    const baseU = cat2?.unitVente ?? p.unit;
    const defaultUnit = inCart?.sellUnit ?? (
      opts.includes(baseU) ? baseU :
      opts.includes("Pièce") ? "Pièce" :
      opts[0]
    );
    setAddModal(p);
    setAddSellUnit(defaultUnit);
    setAddQty(inCart ? qtyFmt(inCart.sellQty ?? inCart.qty) : "1.00");
    setAddPrice(inCart ? String(inCart.prixUnit) : "");
  }
  function confirmAdd() {
    if (!addModal || !addQty || !addPrice || Number(addQty) <= 0) return;
    const sellQtyN = Number(addQty);
    const prix = Number(addPrice);
    const opts = getSellOptions(addModal);
    const cat = posConditioning(addModal);
    const baseUnit = cat?.unitVente ?? addModal.unit;
    const isSell = opts.length > 1 && addSellUnit !== baseUnit;
    const baseQty = isSell ? toBaseQty(sellQtyN, addSellUnit, addModal) : sellQtyN;
    const item: CartItem = {
      productId: addModal.id, nom: addModal.nom, img: addModal.img,
      unit: baseUnit, qty: baseQty, prixUnit: prix,
      ...(isSell ? { sellUnit: addSellUnit, sellQty: sellQtyN } : {}),
    };
    setCart(prev => { const ex = prev.find(i => i.productId === addModal.id); if (ex) return prev.map(i => i.productId === addModal.id ? item : i); return [...prev, item]; });
    setAddModal(null);
  }
  function removeFromCart(productId: number) { setCart(prev => prev.filter(i => i.productId !== productId)); }
  function updateItem(productId: number, qty: number, prixUnit: number) {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(i => i.productId === productId ? { ...i, qty, prixUnit } : i));
  }
  function updateCartQty(productId: number, newDispQty: number) {
    if (newDispQty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      if (item.sellUnit && item.sellQty !== undefined) {
        const p = products.find(pr => pr.id === productId);
        const newBase = p ? toBaseQty(newDispQty, item.sellUnit, p) : newDispQty;
        return { ...item, sellQty: newDispQty, qty: newBase };
      }
      return { ...item, qty: newDispQty };
    }));
  }

  function editOrder(inv: Invoice) {
    if (inv.acompte > 0) return; // déjà encaissée : non modifiable
    setCart((inv.lines ?? []).map(l => ({
      productId: l.productId, nom: l.nom,
      img: products.find(p => p.id === l.productId)?.img ?? "",
      unit: l.unit, qty: l.qty, prixUnit: l.prixUnit, sellUnit: l.sellUnit, sellQty: l.sellQty,
    })));
    setClientNom(inv.client === "Client comptoir" ? "" : inv.client);
    setClientTel(inv.clientTel ?? "+221 ");
    setEditingId(inv.id);
    setDone(false); setLastInv(null);
    setCheckoutOpen(true);
  }

  function resetCheckout() {
    setCart([]); setClientNom(""); setClientTel("+221 ");
    setCheckoutOpen(false); setDone(false); setLastInv(null); setEditingId(null);
  }

  function checkout() {
    if (cart.length === 0) return;
    const client = clientNom.trim() || "Client comptoir";
    const orderLines = cart.map(i => ({ productId: i.productId, nom: i.nom, qty: i.qty, unit: i.unit, prixUnit: i.prixUnit, sellUnit: i.sellUnit, sellQty: i.sellQty }));

    if (editingId) {
      // Modification d'une commande existante non encaissée — stock unchanged (will deduct on encaissement)
      const existing = invoices.find(i => i.id === editingId);
      if (!existing || existing.acompte > 0) { setEditingId(null); return; }
      const updatedInv: Invoice = { ...existing, client, clientTel: clientTel.trim()||undefined, lines: orderLines, montant: cartTotal };
      onUpdate({ invoices: invoices.map(i => i.id === editingId ? updatedInv : i) });
      logAction("Commande modifiée", `${editingId} · ${client} · ${fmt(cartTotal)}`, "✏️");
      setLastInv(updatedInv);
      setDone(true);
      setTimeout(() => doPrint(buildOrderTicketHtml(updatedInv, boutique, currentUser.nom), "Bon de commande"), 200);
      return;
    }

    const id = genInvoiceId(boutique, allBoutiques, invoices);
    const newInv: Invoice = {
      id, client, clientTel: clientTel.trim()||undefined,
      lines: orderLines,
      montant: cartTotal, acompte: 0, date: today(), dateRaw: new Date().toISOString().split("T")[0],
      status: "en attente", type: "B2C", operatorNom: currentUser.nom, operatorColor: currentUser.color,
    };
    onUpdate({ invoices: [...invoices, newInv] });
    logAction("Commande PDV", `${id} · ${client} · ${fmt(cartTotal)}`, "🛒");
    sendNotif({ icon:"🛒", title:"Nouvelle commande", body:`${client} · ${fmt(cartTotal)} · ${id}`, tab:"factures" });
    setLastInv(newInv);
    setDone(true);
    setTimeout(() => doPrint(buildOrderTicketHtml(newInv, boutique, currentUser.nom), "Bon de commande"), 200);
  }

  // ── If caisse not open ───────────────────────────────────────────────────────
  if (!isSessionOpen) {
    const lastClosed = (boutique.caisseHistory ?? []).slice(-1)[0];
    return (
      <div className="space-y-5 pb-24 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background:POS_COLOR+"15" }}>
          <Store size={36} style={{ color:POS_COLOR }}/>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black">Ouvrir la caisse</h2>
          <p className="text-sm text-muted-foreground mt-1">Renseignez le fond de caisse pour commencer</p>
        </div>
        {lastClosed && (
          <div className="w-full max-w-sm px-4 py-3 rounded-2xl text-xs text-muted-foreground" style={{ background:"#EEE9D8" }}>
            Dernière session : {new Date(lastClosed.openedAt).toLocaleDateString("fr-FR")} · {lastClosed.openedBy} · fermée {lastClosed.closedAt ? new Date(lastClosed.closedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : "—"}
          </div>
        )}
        <div className="w-full max-w-sm space-y-3 px-4">
          <Field label="FOND DE CAISSE (F CFA)" color={POS_COLOR}>
            <input value={fondCaisse} onChange={e=>setFondCaisse(e.target.value)} type="number" placeholder="0" className={inputCls+" text-center text-xl font-black"} autoFocus onKeyDown={e=>e.key==="Enter"&&openCaisse()}/>
          </Field>
          <button onClick={openCaisse} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-transform" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
            <Store size={20}/> Ouvrir la caisse
          </button>
        </div>
      </div>
    );
  }

  // ── Session open ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-36">

      {/* Caisse header bar */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background:SEM.success.bg, border:"1px solid "+SEM.success.accent+"44" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"/>
          <div className="min-w-0">
            <p className="text-sm font-black truncate" style={{ color:SEM.success.text }}>CAISSE OUVERTE</p>
            <p className="text-xs text-muted-foreground truncate">{session!.openedBy} · {new Date(session!.openedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})} · Fond : {fmt(session!.fondDeCaisse)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-base font-black" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalJour)}</span>
          <button onClick={()=>setCloseModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold active:scale-95" style={{ background:"#f3f4f6", color:"#374151" }}>
            <X size={13}/> Fermer
          </button>
        </div>
      </div>

      {/* Two tabs: Produits / Commandes */}
      <div className="flex bg-card rounded-2xl p-1 border border-border gap-1">
        <button onClick={()=>setPosTab("produits")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all"
          style={{ background:posTab==="produits"?"#1f2937":"transparent", color:posTab==="produits"?"#fff":"#9a9070" }}>
          <ShoppingBag size={18}/> Produits
        </button>
        <button onClick={()=>setPosTab("commandes")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all relative"
          style={{ background:posTab==="commandes"?"#1f2937":"transparent", color:posTab==="commandes"?"#fff":"#9a9070" }}>
          <ClipboardList size={18}/> Commandes
          {pendingOrders.length > 0 && (
            <span className="absolute top-1.5 right-3 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:SEM.danger.accent, border:"2px solid var(--card)" }}>
              {pendingOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Produits ── */}
      {posTab==="produits" && <>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un produit…" className={inputCls+" pl-11"}/>
        </div>
        {/* Category filter + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
            {["all", ...allPosCats].map(cat => (
              <button key={cat} onClick={() => setPosCatFilter(cat)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: posCatFilter === cat ? "#1f2937" : "#f3f4f6", color: posCatFilter === cat ? "#fff" : "#374151" }}>
                {cat === "all" ? "Tous" : cat}
              </button>
            ))}
          </div>
          <select value={posSort} onChange={e => setPosSort(e.target.value as typeof posSort)}
            className="flex-shrink-0 text-xs font-bold rounded-xl px-2.5 py-1.5 border-0 outline-none"
            style={{ background:"#EEE9D8", color:"#7A7055" }}>
            <option value="bestseller">⭐ Best seller</option>
            <option value="nom">A→Z</option>
            <option value="stock_desc">Stock ↓</option>
            <option value="stock_asc">Stock ↑</option>
          </select>
          <button onClick={() => setPosViewMode(v => v === "grid" ? "list" : "grid")}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#EEE9D8" }}>
            {posViewMode === "grid"
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="10" width="6" height="3" rx="1" fill="#7A7055"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="14" height="3" rx="1" fill="#7A7055"/></svg>}
          </button>
        </div>

        {posViewMode === "list" ? (
          <div className="space-y-2">
            {filtered.map(p => {
              const inCart = cart.find(i => i.productId === p.id);
              const stock = productQty(p.id, entries);
              const outOfStock = stock <= 0;
              return (
                <button key={p.id} onClick={() => !outOfStock && openAdd(p)}
                  className="w-full bg-card rounded-2xl border text-left flex items-center gap-3 p-3 transition-transform active:scale-[0.98]"
                  style={{ borderColor: inCart ? POS_COLOR+"66" : "var(--border)", opacity: outOfStock ? 0.5 : 1 }}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <img src={imgSrc(p.img,120,120)} alt={p.nom} className="w-full h-full object-cover"/>
                    {outOfStock && <div className="absolute inset-0 bg-black/55 flex items-center justify-center"><span className="text-white text-xs font-black" style={{fontSize:"8px"}}>RUPTURE</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">Stock : {stock} {p.unit}</p>
                    {p.categorie && <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ background:"#EEE9D8", color:"#7A7055" }}>{p.categorie}</span>}
                  </div>
                  {inCart && (
                    <div className="flex-shrink-0 text-right">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ml-auto" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <p className="text-xs font-black mt-1" style={{ color:POS_COLOR }}>{fmt(lineTotal(inCart))}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const inCart = cart.find(i => i.productId === p.id);
            const stock = productQty(p.id, entries);
            const outOfStock = stock <= 0;
            return (
              <button key={p.id} onClick={() => !outOfStock && openAdd(p)}
                className="bg-card rounded-2xl overflow-hidden border text-left relative transition-transform active:scale-95"
                style={{ borderColor: inCart ? POS_COLOR+"66" : "var(--border)", opacity: outOfStock ? 0.5 : 1 }}>
                <div className="w-full h-36 relative overflow-hidden">
                  <img src={imgSrc(p.img,300,300)} alt={p.nom} className="w-full h-full object-cover"/>
                  {inCart && (
                    <div className="absolute inset-0 flex flex-col justify-between p-2">
                      <div className="self-end w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <div className="w-full rounded-xl py-1 px-2 text-center text-xs font-black text-white" style={{ background:POS_COLOR+"cc" }}>{fmt(inCart.qty * inCart.prixUnit)}</div>
                    </div>
                  )}
                  {outOfStock && (<div className="absolute inset-0 bg-black/55 flex items-center justify-center"><span className="text-white text-xs font-black tracking-wide">RUPTURE</span></div>)}
                </div>
                <div className="p-2.5">
                  <p className="font-black text-base truncate leading-tight">{p.nom}</p>
                  <p className="text-sm font-semibold text-muted-foreground mt-0.5">Stock : {stock} {p.unit}</p>
                </div>
              </button>
            );
          })}
        </div>
        )}
      </>}

      {/* ── Tab: Commandes en attente ── */}
      {posTab==="commandes" && <>
        {pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background:SEM.warning.bg }}>
              <ClipboardList size={30} style={{ color:SEM.warning.accent }}/>
            </div>
            <p className="font-black text-base" style={{ color:SEM.warning.accent }}>Aucune commande en attente</p>
            <p className="text-sm text-muted-foreground text-center px-8">Les commandes créées par le vendeur et non encore encaissées apparaîtront ici.</p>
            <button onClick={()=>setPosTab("produits")} className="mt-2 px-5 py-3 rounded-2xl font-black text-sm active:scale-95" style={{ background:POS_COLOR, color:"#fff" }}>
              + Nouvelle commande
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {[...pendingOrders].reverse().map(inv => (
              <div key={inv.id} className="bg-card rounded-2xl border overflow-hidden" style={{ borderColor:SEM.warning.accent+"33" }}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.warning.bg }}>
                    <ClipboardList size={20} style={{ color:SEM.warning.accent }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-base truncate">{inv.client}</p>
                    <p className="text-sm text-muted-foreground">{inv.id} · {(inv.lines?.length ?? 0)} article(s)</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-lg" style={{ color:SEM.warning.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p>
                    <p className="text-xs text-muted-foreground">{inv.date.split(" · ")[0]}</p>
                  </div>
                </div>
                {inv.lines && inv.lines.length > 0 && (
                  <div className="px-4 pb-3 space-y-1">
                    {inv.lines.map((l,i) => (
                      <div key={i} className="flex justify-between items-center text-sm px-3 py-1.5 rounded-xl" style={{ background:SEM.warning.bg }}>
                        <span className="font-semibold truncate flex-1">{l.nom}</span>
                        <span className="text-muted-foreground ml-2 flex-shrink-0">{l.qty} {l.unit} × {fmt(l.prixUnit)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex border-t" style={{ borderColor:SEM.warning.accent+"22" }}>
                  <button onClick={()=>editOrder(inv)} className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:SEM.warning.accent }}>
                    <Edit2 size={14}/> Modifier
                  </button>
                  <div className="w-px" style={{ background:SEM.warning.accent+"22" }}/>
                  <button onClick={()=>{ silentPrint(buildOrderTicketHtml(inv, boutique, currentUser.nom, true)); }} className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#6b7280" }}>
                    🖨 Réimprimer
                  </button>
                  <div className="w-px" style={{ background:SEM.warning.accent+"22" }}/>
                  <button onClick={()=>setDeleteOrderId(inv.id)} className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#ef4444" }}>
                    <Trash2 size={14}/> Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </>}

      {/* Sticky cart bar */}
      {cart.length > 0 && !checkoutOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-20">
          <button onClick={() => setCheckoutOpen(true)}
            className="w-full py-4 rounded-2xl flex items-center justify-between px-5 active:scale-95 transition-transform"
            style={{ background:POS_COLOR, boxShadow:`0 8px 32px ${POS_COLOR}55` }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><ShoppingBag size={16} color="white"/></div>
              <span className="text-white font-black">{cartCount} article{cartCount>1?"s":""} · Valider commande</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-lg" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
              <ChevronRight size={18} color="white"/>
            </div>
          </button>
        </div>
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <Modal title={editingId ? `Modifier ${editingId}` : "Nouvelle commande"} color={POS_COLOR} onClose={resetCheckout}>
          {!done ? (<>
            <div className="space-y-2">
              {cart.map(item => {
                const dQty = lineDispQty(item);
                const dUnit = lineDispUnit(item);
                const dTotal = lineTotal(item);
                return (
                <div key={item.productId} className="flex items-center gap-3 bg-muted rounded-2xl p-3">
                  <img src={imgSrc(item.img,80,80)} alt={item.nom} className="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-sm truncate">{item.nom}</p>
                      {item.sellUnit && <span className="text-xs font-bold px-1.5 py-0.5 rounded-lg ml-1 flex-shrink-0" style={{ background:POS_COLOR+"18", color:POS_COLOR }}>{item.sellUnit}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button onClick={()=>updateCartQty(item.productId, dQty-1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Minus size={12} style={{ color:POS_COLOR }}/></button>
                      <span className="text-base font-black w-8 text-center">{dQty}</span>
                      <button onClick={()=>updateCartQty(item.productId, dQty+1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Plus size={12} style={{ color:POS_COLOR }}/></button>
                      <span className="text-xs text-muted-foreground ml-0.5">{dUnit} × {fmt(item.prixUnit)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <p className="font-black text-base" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(dTotal)}</p>
                    <button onClick={()=>removeFromCart(item.productId)} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={11} style={{ color:"#ef4444" }}/></button>
                  </div>
                </div>
                );
              })}
            </div>
            {/* Inline product selector (add article to order) */}
            <div className="rounded-2xl border-2 border-dashed overflow-hidden" style={{ borderColor:POS_COLOR+"44" }}>
              <p className="text-xs font-black tracking-wider px-3 py-2" style={{ color:POS_COLOR }}>+ AJOUTER UN ARTICLE</p>
              <div className="grid grid-cols-2 gap-2 px-3 pb-3" style={{ maxHeight:"200px", overflowY:"auto", scrollbarWidth:"none" }}>
                {products.filter(p=>productQty(p.id,entries)>0).map(p=>{
                  const inCart=cart.find(i=>i.productId===p.id);
                  return (
                    <button key={p.id} onClick={()=>openAdd(p)} className="flex items-center gap-2 rounded-xl p-2 text-left transition-colors active:scale-95"
                      style={{ background:inCart?POS_COLOR+"15":"#EEE9D8", border:inCart?`2px solid ${POS_COLOR}44`:"2px solid transparent" }}>
                      <img src={imgSrc(p.img,60,60)} alt={p.nom} className="w-10 h-10 rounded-lg object-cover flex-shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{p.nom}</p>
                        <p className="text-xs text-muted-foreground">{productQty(p.id,entries)} {p.unit}</p>
                        {inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>× {inCart.qty} ✓</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="font-black tracking-wide" style={{ color:POS_COLOR }}>TOTAL</span>
              <span className="text-2xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background:currentUser.color }}>{currentUser.initials}</div>
              <span className="text-xs text-muted-foreground">Opérateur : <span className="font-semibold text-foreground">{currentUser.nom}</span></span>
            </div>
            <Field label="NOM DU CLIENT (optionnel)" color={POS_COLOR}>
              <input value={clientNom} onChange={e=>setClientNom(e.target.value)} placeholder="Client comptoir" className={inputCls} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.closest("div")?.nextElementSibling?.querySelector("input") as HTMLInputElement|null)?.focus();}}}/>
            </Field>
            <Field label="TÉLÉPHONE (optionnel)" color={POS_COLOR}>
              <input value={clientTel} onChange={e=>{ const v=e.target.value; setClientTel(v.startsWith("+221 ")?v:"+221 "); }} placeholder="+221 77 000 0000" className={inputCls} onKeyDown={e=>e.key==="Enter"&&checkout()}/>
            </Field>
            <button onClick={checkout} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              <ClipboardList size={18}/> {editingId ? "Enregistrer les modifications" : "Enregistrer la commande"}
            </button>
          </>) : (<>
            <div className="flex flex-col items-center gap-3 py-5 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={40} style={{ color:SEM.success.accent }}/>
              <div className="text-center">
                <p className="font-black text-lg" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{editingId ? "Commande modifiée ✓" : "Commande enregistrée ✓"}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{lastInv?.id} · {lastInv?.client} · {fmt(lastInv?.montant ?? 0)}</p>
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:"#3b82f611", color:"#3b82f6" }}>
              <span>🖨️</span>
              <span className="text-sm font-semibold">Bon de commande imprimé automatiquement</span>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:SEM.warning.bg, color:SEM.warning.accent }}>
              <AlertCircle size={16}/> <span className="text-sm font-semibold">Le client présente ce bon au caissier pour encaissement</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => lastInv && silentPrint(buildOrderTicketHtml(lastInv, boutique, currentUser.nom, true))}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95 border-2"
                style={{ borderColor:POS_COLOR, color:POS_COLOR, background:"transparent" }}>
                🖨 Réimprimer
              </button>
              <button onClick={()=>{ resetCheckout(); setPosTab("commandes"); }}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95"
                style={{ background:SEM.warning.accent+"22", color:SEM.warning.accent }}>
                <ClipboardList size={15}/> Commandes
              </button>
            </div>
            <button onClick={resetCheckout}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
              style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              + Nouvelle commande
            </button>
          </>)}
        </Modal>
      )}

      {/* Fermer la caisse modal */}
      {closeModal && session && (
        <Modal title="Fermeture de caisse" color={POS_COLOR} onClose={() => setCloseModal(false)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Store size={18} style={{ color:POS_COLOR }}/></div>
              <div>
                <p className="text-sm font-bold">Session</p>
                <p className="text-xs text-muted-foreground">Ouvert par {session.openedBy} à {new Date(session.openedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 border-b border-border bg-muted/50">
                <span className="text-xs font-black text-muted-foreground">Fond de caisse</span>
                <span className="text-sm font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(session.fondDeCaisse)}</span>
              </div>
              {PAYMENT_METHODS.map(m => {
                const b = byMethod.find(x => x.m === m)!;
                return (
                  <div key={m} className="flex justify-between items-center px-4 py-2.5 border-b border-border">
                    <span className="text-sm flex items-center gap-2"><span>{PM_ICON[m]}</span><span style={{ color:PM_COLOR[m] }}>{m}</span><span className="text-xs text-muted-foreground">({b.count})</span></span>
                    <span className="font-black text-sm" style={{ color: b.total > 0 ? PM_COLOR[m] : "#c4b89a", fontFamily:"'Nunito', sans-serif" }}>{fmt(b.total)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between px-4 py-3" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total encaissé</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(totalJour)}</span>
              </div>
              <div className="flex justify-between px-4 py-3 border-t border-border" style={{ background:"#1E9B1E0d" }}>
                <span className="font-black text-sm" style={{ color:SEM.success.accent }}>Total en caisse (espèces)</span>
                <span className="font-black text-base" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(session.fondDeCaisse + totalEspeces)}</span>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">Un rapport sera imprimé automatiquement à la fermeture</p>
            <button onClick={closeCaisse} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              🔒 Confirmer la fermeture
            </button>
          </div>
        </Modal>
      )}
      {/* Delete order confirmation */}
      {deleteOrderId && (
        <Modal title="Supprimer la commande" color={SEM.danger.accent} onClose={()=>setDeleteOrderId(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background:"#ef444415" }}>
              <Trash2 size={22} style={{ color:"#ef4444", flexShrink:0 }}/>
              <div>
                <p className="font-black text-sm">Supprimer {deleteOrderId} ?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cette action est irréversible. La commande sera définitivement supprimée.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>setDeleteOrderId(null)} className="py-3.5 rounded-2xl font-black text-sm border-2 border-border active:scale-95">Annuler</button>
              <button onClick={()=>{ onUpdate({ invoices: invoices.filter(i=>i.id!==deleteOrderId) }); logAction("Commande supprimée", deleteOrderId, "🗑️"); setDeleteOrderId(null); }} className="py-3.5 rounded-2xl font-black text-sm active:scale-95 text-white" style={{ background:"#ef4444" }}>Supprimer</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick-add modal — must be LAST so it renders above checkout modal */}
      {addModal && (
        <Modal title={addModal.nom} color={POS_COLOR} onClose={() => setAddModal(null)}>
          <div className="flex gap-4 items-center">
            <img src={imgSrc(addModal.img,160,160)} alt={addModal.nom} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0"/>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Stock disponible</p>
              <p className="text-3xl font-black mt-0.5" style={{ fontFamily:"'Nunito', sans-serif", color:POS_COLOR }}>
                {productQty(addModal.id, entries)}<span className="text-base font-normal ml-1 text-muted-foreground">{addModal.unit}</span>
              </p>
            </div>
          </div>
          {getSellOptions(addModal).length > 1 && (
            <Field label="VENDRE PAR" color={POS_COLOR}>
              <div className="flex gap-2">
                {getSellOptions(addModal).map(u => (
                  <button key={u} onClick={() => { setAddSellUnit(u); setAddQty("1.00"); }} className="flex-1 py-3 rounded-xl text-sm font-bold"
                    style={{ background: addSellUnit === u ? POS_COLOR : POS_COLOR+"22", color: addSellUnit === u ? "#fff" : POS_COLOR }}>
                    {u}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`QUANTITÉ (${addSellUnit})`} color={POS_COLOR}>
              <div className="flex items-center gap-2">
                <button onClick={()=>setAddQty(q=>qtyFmt(Math.max(0.01,Number(q)-1)))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Minus size={14} style={{ color:POS_COLOR }}/></button>
                <input value={addQty} onChange={e=>qtyChange(e.target.value,setAddQty)} onBlur={e=>qtyBlur(e.target.value,setAddQty)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" step="0.01" min="0" className={inputCls+" text-center font-black"} autoFocus/>
                <button onClick={()=>setAddQty(q=>qtyFmt(Number(q)+1))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Plus size={14} style={{ color:POS_COLOR }}/></button>
              </div>
            </Field>
            <Field label={`PRIX / ${addSellUnit.toUpperCase()}`} color={POS_COLOR}>
              <input value={addPrice} onChange={e=>setAddPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" placeholder="0 F" className={inputCls+" text-center font-black"}/>
            </Field>
          </div>
          {Number(addQty) > 0 && sellConversion(Number(addQty), addSellUnit, addModal) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: POS_COLOR+"12" }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: POS_COLOR }}/>
              <span className="text-xs font-bold" style={{ color: POS_COLOR }}>
                {Number(addQty)} {addSellUnit} = {sellConversion(Number(addQty), addSellUnit, addModal)}
              </span>
            </div>
          )}
          {Number(addQty)>0 && Number(addPrice)>0 && (
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="text-sm font-bold" style={{ color:POS_COLOR }}>Sous-total</span>
              <span className="text-xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(Number(addQty)*Number(addPrice))}</span>
            </div>
          )}
          <SubmitBtn color={POS_COLOR} label={cart.find(i=>i.productId===addModal.id)?"Mettre à jour":"Ajouter au panier"} onClick={confirmAdd} disabled={!addQty||!addPrice||Number(addQty)<=0||Number(addPrice)<=0}/>
        </Modal>
      )}

      {/* ── Print status bar (fixed, above nav) ── */}
      {printJob && (
        <div className="fixed bottom-20 left-3 right-3 z-[200] pointer-events-none">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border pointer-events-auto" style={{
            background: printJob.status==="ok" ? "#f0fdf4" : printJob.status==="fail" ? "#fef2f2" : printJob.status==="fallback" ? "#fffbeb" : "#f8fafc",
            borderColor: printJob.status==="ok" ? "#bbf7d0" : printJob.status==="fail" ? "#fecaca" : printJob.status==="fallback" ? "#fde68a" : "#e2e8f0",
          }}>
            {printJob.status==="printing" && <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin flex-shrink-0"/>}
            {printJob.status==="ok"       && <span className="text-green-600 text-lg flex-shrink-0 leading-none">✓</span>}
            {printJob.status==="fallback" && <span className="text-amber-500 text-lg flex-shrink-0 leading-none">🖨️</span>}
            {printJob.status==="fail"     && <span className="text-red-500 text-lg flex-shrink-0 leading-none">✗</span>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-tight" style={{
                color: printJob.status==="ok" ? "#166534" : printJob.status==="fail" ? "#991b1b" : printJob.status==="fallback" ? "#92400e" : "#334155",
              }}>
                {printJob.status==="printing" && `Impression en cours — ${printJob.label}…`}
                {printJob.status==="ok"       && `${printJob.label} imprimé ✓`}
                {printJob.status==="fallback" && `${printJob.label} envoyé (dialogue système)`}
                {printJob.status==="fail"     && `Échec — ${printJob.label}`}
              </p>
              {printJob.status==="fail" && <p className="text-xs mt-0.5" style={{ color:"#dc2626" }}>Agent déconnecté ou imprimante hors ligne</p>}
              {printJob.status==="fallback" && <p className="text-xs mt-0.5" style={{ color:"#b45309" }}>Connectez QZ Tray dans Admin → Imprimante pour supprimer ce dialogue</p>}
            </div>
            {printJob.status==="fail" && (
              <button onClick={()=>doPrint(printJob.html, printJob.label)}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-white flex-shrink-0 active:scale-95"
                style={{ background:"#ef4444" }}>
                Réessayer
              </button>
            )}
            {printJob.status!=="printing" && printJob.status!=="fail" && (
              <button onClick={()=>setPrintJob(null)} className="text-muted-foreground w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 active:scale-95 text-lg leading-none">×</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VIEW: RAPPORT ────────────────────────────────────────────────────────────

function ComptabiliteView({ boutique, currentUser }: { boutique: Boutique; currentUser?: PlatformUser }) {
  const RC = boutique.color;
  const { invoices } = boutique;
  const charges = boutique.charges ?? [];
  const [period, setPeriod] = useState<DashPeriod>("jour");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exportModal, setExportModal] = useState<"summary"|"full"|null>(null);

  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);

  // Robust date parser (local copy for this view)
  function parseRapportDate(inv: Invoice): Date {
    const raw = (inv as any).dateRaw ?? inv.date ?? "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw);
    const FR_MON: Record<string,number> = {jan:0,fév:1,fev:1,mar:2,avr:3,mai:4,jun:5,jui:6,jul:6,aoû:7,aou:7,sep:8,oct:9,nov:10,déc:11,dec:11};
    const parts = raw.toLowerCase().replace(" · "," ").split(" ");
    const day = parseInt(parts[0]); const mon = FR_MON[parts[1]?.slice(0,3)] ?? new Date().getMonth();
    const yr = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
    return new Date(yr, mon, isNaN(day) ? 1 : day);
  }

  // Previous period invoices
  const prevRapportInv = (() => {
    const now = new Date();
    if (period === "jour") {
      const y = new Date(now); y.setDate(now.getDate()-1);
      return invoices.filter(inv => { const d = parseRapportDate(inv); return d.toDateString() === y.toDateString(); });
    }
    if (period === "semaine") {
      const w0 = new Date(now); w0.setDate(now.getDate()-14);
      const w1 = new Date(now); w1.setDate(now.getDate()-7);
      return invoices.filter(inv => { const d = parseRapportDate(inv); return d >= w0 && d < w1; });
    }
    if (period === "mois") {
      const pm = now.getMonth() === 0 ? 11 : now.getMonth()-1;
      const py = now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear();
      return invoices.filter(inv => { const d = parseRapportDate(inv); return d.getMonth()===pm && d.getFullYear()===py; });
    }
    if (period === "annee") {
      return invoices.filter(inv => parseRapportDate(inv).getFullYear() === now.getFullYear()-1);
    }
    return [];
  })();
  function trendRapport(curr: number, prev: number) {
    if (prev === 0) return null;
    const delta = curr - prev;
    const pct = Math.round(Math.abs(delta/prev)*100);
    return { up: delta >= 0, pct: pct + "%" };
  }

  const compInv      = filtInv.filter(i => i.type !== "Transfert interne" && i.type !== "B2B Achat");
  const encaisséInv  = compInv.filter(i => i.acompte > 0);
  const ca           = compInv.reduce((s,i)=>s+signedInvoicePaid(i),0);
  const caTotal      = compInv.reduce((s,i)=>s+signedInvoiceAmount(i),0);
  const nbVentes     = encaisséInv.length;
  const panierMoyen  = nbVentes > 0 ? ca / nbVentes : 0;
  const impayé       = compInv.reduce((s,i)=>s+(i.montant-i.acompte),0);
  const totalCharges = filtCh.reduce((s,c)=>s+(c.isB2BDebt?(c.acompte??0):c.montant),0);
  const margeBrute   = ca - totalCharges;
  const tauxMarge    = ca > 0 ? (margeBrute/ca*100).toFixed(1) : "0";

  const prevCaRapport    = prevRapportInv.filter(i=>i.type!=="Transfert interne"&&i.type!=="B2B Achat").reduce((s,i)=>s+signedInvoicePaid(i),0);
  const prevTotalRapport = prevRapportInv.filter(i=>i.type!=="Transfert interne"&&i.type!=="B2B Achat").reduce((s,i)=>s+signedInvoiceAmount(i),0);
  const trendCaRapport   = trendRapport(ca, prevCaRapport);
  const trendTotalRapport = trendRapport(caTotal, prevTotalRapport);

  const byMethode = PAYMENT_METHODS.map(m => ({
    m, total: encaisséInv.reduce((s,i)=>{
      const split = (i as any).paymentSplit as {method:string;amount:number}[]|undefined;
      if (split) return s + split.filter(sp=>sp.method===m).reduce((a,sp)=>a+sp.amount,0);
      return s + (i.paymentMethod===m ? i.acompte : 0);
    }, 0),
    count: encaisséInv.filter(i=>{
      const split = (i as any).paymentSplit as {method:string}[]|undefined;
      return split ? split.some(sp=>sp.method===m) : i.paymentMethod===m;
    }).length,
  })).filter(r=>r.count>0);

  const byCategorie = CHARGE_CATS.map(cat=>({
    cat, montant: filtCh.filter(c=>c.categorie===cat).reduce((s,c)=>s+c.montant,0)
  })).filter(r=>r.montant>0);

  // FIFO margin computation (gated by marges permission)
  const compAssign = currentUser?.assignments.find(a => a.boutiqueId === boutique.id);
  const canSeeMarginComp = compAssign?.role === "Propriétaire" || !!(compAssign?.droits?.marges);
  const margeData = canSeeMarginComp ? compInv.reduce((acc, inv) => {
    for (const l of (inv.lines ?? [])) {
      if (l.prixAchat == null) continue;
      const ca2 = lineTotal(l);
      acc.ca += ca2; acc.cout += l.prixAchat * l.qty; acc.marge += ca2 - l.prixAchat * l.qty;
    }
    return acc;
  }, { ca:0, cout:0, marge:0 }) : null;
  const tauxMargeFifo = margeData && margeData.ca > 0 ? Math.round(margeData.marge / margeData.ca * 100) : 0;

  const periodLabel: Record<DashPeriod,string> = { jour:"Aujourd'hui", semaine:"Cette semaine", mois:"Ce mois", annee:"Cette année", custom:"Période personnalisée" };

  function buildSummaryHtml() {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport — ${boutique.nom}</title>
<style>
body{font-family:Arial,sans-serif;padding:30px 36px;max-width:680px;margin:0 auto;font-size:13px;color:#1a1a1a}
h1{font-size:22px;font-weight:900;margin:0 0 2px}
.sub{color:#888;font-size:12px;margin-bottom:24px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.kpi{padding:14px 16px;border-radius:12px;background:#f7f7f7}
.kpi .label{font-size:10px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.kpi .value{font-size:20px;font-weight:900}
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:18px 0 8px;border-top:1px solid #eee;padding-top:14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0}
.row .label{font-size:12px;display:flex;align-items:center;gap:6px}
.row .value{font-size:13px;font-weight:700}
.green{color:#16a34a}.orange{color:#f97316}.red{color:#ef4444}.muted{color:#888}
.total-row{padding:10px 0;border-top:2px solid #1a1a1a;margin-top:4px}
.total-row .label{font-weight:900;font-size:13px}
.total-row .value{font-weight:900;font-size:16px}
@media print{body{padding:20px}}
</style></head><body>
<h1>${boutique.nom}</h1>
<div class="sub">Rapport — ${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · Généré le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
<div class="kpis">
  <div class="kpi"><div class="label">CA encaissé</div><div class="value green">${fmt(ca)}</div></div>
  <div class="kpi"><div class="label">Ventes</div><div class="value">${nbVentes}</div></div>
  <div class="kpi"><div class="label">Panier moyen</div><div class="value">${fmt(panierMoyen)}</div></div>
  <div class="kpi"><div class="label">CA facturé</div><div class="value muted">${fmt(caTotal)}</div></div>
  <div class="kpi"><div class="label">Impayé</div><div class="value orange">${fmt(impayé)}</div></div>
  <div class="kpi"><div class="label">Marge brute</div><div class="value ${margeBrute>=0?"green":"red"}">${fmt(margeBrute)}</div></div>
</div>
${byMethode.length>0?`<div class="section-title">Répartition par mode de paiement</div>
${byMethode.map(r=>`<div class="row"><span class="label">${PM_ICON[r.m]} ${r.m} <span class="muted">(${r.count})</span></span><span class="value">${fmt(r.total)}</span></div>`).join("")}
<div class="row total-row"><span class="label">Total encaissé</span><span class="value green">${fmt(ca)}</span></div>`:""}
${filtCh.length>0?`<div class="section-title">Charges (${filtCh.length})</div>
${byCategorie.map(r=>`<div class="row"><span class="label">${r.cat}</span><span class="value red">${fmt(r.montant)}</span></div>`).join("")}
${filtCh.map(c=>`<div class="row"><span class="label" style="padding-left:12px;color:#888">· ${c.label}</span><span class="value muted">${fmt(c.montant)}</span></div>`).join("")}
<div class="row total-row"><span class="label">Total charges</span><span class="value red">${fmt(totalCharges)}</span></div>
<div class="row total-row" style="border-top:2px solid #1E9B1E"><span class="label" style="color:#16a34a">Marge brute</span><span class="value" style="color:#16a34a">${fmt(margeBrute)}</span></div>`:""}
</body></html>`;
  }

  function buildFullHtml() {
    const chargesBlock = filtCh.length > 0 ? `
<div class="section-title">Charges (${filtCh.length})</div>
<table><thead><tr><th>Libellé</th><th>Catégorie</th><th>Date</th><th class="val">Montant</th></tr></thead><tbody>
${filtCh.map(c=>`<tr><td>${c.label}</td><td>${c.categorie}</td><td>${c.date}</td><td class="val">${fmt(c.montant)}</td></tr>`).join("")}
<tr class="total-row"><td colspan="3"><b>TOTAL CHARGES</b></td><td class="val red"><b>${fmt(totalCharges)}</b></td></tr>
</tbody></table>` : "";
    const invLines = filtInv.map(inv=>{
      const linesHtml = (inv.lines??[]).map(l=>`<tr style="background:#fafafa"><td style="padding-left:24px;color:#888">↳ ${l.nom}</td><td></td><td></td><td class="val muted">${lineDispQty(l)} ${lineDispUnit(l)} × ${fmt(l.prixUnit)}</td><td class="val muted">${fmt(lineTotal(l))}</td></tr>`).join("");
      const [tc,bc]=invBadge(inv.status);
      return `<tr><td>${inv.id}</td><td>${inv.client}</td><td>${inv.date}</td><td><span style="background:${bc};color:${tc};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">${inv.status}</span></td><td class="val">${fmt(inv.montant)}</td><td class="val green">${fmt(inv.acompte)}</td></tr>${linesHtml}`;
    }).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport complet — ${boutique.nom}</title>
<style>
body{font-family:Arial,sans-serif;padding:30px 36px;max-width:900px;margin:0 auto;font-size:12px;color:#1a1a1a}
h1{font-size:20px;font-weight:900;margin:0 0 2px}.sub{color:#888;font-size:12px;margin-bottom:20px}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.kpi{padding:10px 14px;border-radius:10px;background:#f7f7f7;min-width:120px}
.kpi .label{font-size:10px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:3px}
.kpi .value{font-size:16px;font-weight:900}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:16px 0 6px;border-top:1px solid #eee;padding-top:12px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 10px;text-align:left;border-bottom:1px solid #f0f0f0;font-size:12px}
th{font-weight:700;color:#666;font-size:10px;text-transform:uppercase}
.val{text-align:right;font-weight:700}.green{color:#16a34a}.red{color:#ef4444}.muted{color:#888}
.total-row td{border-top:2px solid #1a1a1a;font-weight:900;padding-top:9px}
@media print{body{padding:16px}}
</style></head><body>
<h1>${boutique.nom} — Rapport complet</h1>
<div class="sub">${periodLabel[period]}${period==="custom"?` (${customFrom} → ${customTo})`:""} · ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
<div class="kpis">
  <div class="kpi"><div class="label">CA encaissé</div><div class="value green">${fmt(ca)}</div></div>
  <div class="kpi"><div class="label">Ventes</div><div class="value">${nbVentes}</div></div>
  <div class="kpi"><div class="label">Panier moyen</div><div class="value">${fmt(panierMoyen)}</div></div>
  <div class="kpi"><div class="label">CA facturé</div><div class="value">${fmt(caTotal)}</div></div>
  <div class="kpi"><div class="label">Impayé</div><div class="value muted">${fmt(impayé)}</div></div>
  <div class="kpi"><div class="label">Marge brute</div><div class="value ${margeBrute>=0?"green":"red"}">${fmt(margeBrute)}</div></div>
</div>
${chargesBlock}
<div id="transactions" class="section-title">Transactions (${filtInv.length})</div>
<table><thead><tr><th>Réf</th><th>Client</th><th>Date</th><th>Statut</th><th class="val">Facturé</th><th class="val">Encaissé</th></tr></thead><tbody>
${invLines}
<tr class="total-row"><td colspan="4"><b>TOTAL</b></td><td class="val"><b>${fmt(caTotal)}</b></td><td class="val green"><b>${fmt(ca)}</b></td></tr>
</tbody></table>
</body></html>`;
  }

  function openPreview(type: "summary"|"full") {
    setExportModal(type);
  }

  function doPrint(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const w = window.open("","_blank","width=860,height=700");
    if (!w) return;
    w.document.write(html + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\/script>`);
    w.document.close();
    setExportModal(null);
  }

  async function downloadRapportPDF(type: "summary"|"full") {
    const { default: jsPDF } = await import("jspdf");
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const canvas = await renderHtmlToCanvas(html, 860);
    const label = periodLabel[period] ?? period;
    buildPdfFromCanvas(jsPDF, canvas).save(`Rapport-${boutique.nom}-${label}.pdf`);
    setExportModal(null);
  }

  const periodBtns: Array<{id:DashPeriod;label:string}> = [
    {id:"jour",label:"Aujourd'hui"},{id:"semaine",label:"Semaine"},{id:"mois",label:"Mois"},{id:"custom",label:"Personnalisé"},
  ];

  const rows = [
    { label:"CA encaissé",   value:ca,           color:RC,                              bold:true },
    { label:"CA facturé",    value:caTotal,       color:"#C9A227"                        },
    { label:"Nb ventes",     value:-1,            color:"#6b7280", txt:`${nbVentes}`     },
    { label:"Panier moyen",  value:panierMoyen,   color:"#a855f7"                        },
    { label:"Impayé",        value:impayé,        color:SEM.warning.accent                        },
    { label:"Charges",       value:totalCharges,  color:"#ef4444"                        },
    { label:"Marge brute",   value:margeBrute,    color:margeBrute>=0?SEM.success.accent:SEM.danger.accent, bold:true },
    { label:"Taux de marge", value:-1,            color:"#a855f7", txt:`${tauxMarge}%`   },
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Period selector */}
      <div className="flex gap-1.5 bg-card rounded-2xl p-1.5 border border-border">
        {periodBtns.map(p=>(
          <button key={p.id} onClick={()=>setPeriod(p.id)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all" style={{background:period===p.id?RC:"transparent",color:period===p.id?"#fff":"#6b7280"}}>
            {p.label}
          </button>
        ))}
      </div>
      {period==="custom" && (
        <div className="flex gap-2">
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">DU</label><input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className={inputCls}/></div>
          <div className="flex-1"><label className="text-xs text-muted-foreground font-bold block mb-1">AU</label><input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className={inputCls}/></div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label:"CA encaissé", value:fmt(ca), color:RC, t:trendCaRapport },
          { label:"Ventes", value:`${nbVentes}`, color:"#6b7280", t:null },
          { label:"Panier moyen", value:fmt(panierMoyen), color:"#a855f7", t:null },
          { label:"CA facturé", value:fmt(caTotal), color:"#475569", t:trendTotalRapport },
        ].map((k,i)=>(
          <div key={i} className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-black mt-1" style={{color:k.color,fontFamily:"'Nunito',sans-serif"}}>{k.value}</p>
            {k.t && (
              <p className="text-xs font-bold mt-0.5" style={{color:k.t.up?"#16a34a":"#dc2626"}}>
                {k.t.up?"↑":"↓"} {k.t.pct} vs période préc.
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Compte de résultat */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2"><BookOpen size={16} style={{color:RC}}/><p className="font-bold text-sm">Compte de résultat</p></div>
        </div>
        {rows.map((r,i)=>(
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${i<rows.length-1?"border-b border-border":""}`} style={{background:r.bold?r.color+"0a":""}}>
            <p className={`text-sm ${r.bold?"font-black":"font-medium"}`}>{r.label}</p>
            <p className={`font-black text-sm ${r.bold?"text-base":""}`} style={{color:r.color,fontFamily:"'Nunito',sans-serif"}}>
              {r.txt ?? fmt(r.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Marge FIFO (compta-gated) */}
      {canSeeMarginComp && margeData && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600"/>
            <p className="font-bold text-sm">Marge FIFO</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold ml-auto">Privé</span>
          </div>
          {margeData.ca === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground text-center">Aucune donnée de marge disponible pour l'instant — les marges sont calculées sur les ventes avec coût FIFO enregistré.</p>
          ) : (
            <div className="divide-y divide-border">
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">CA avec coût connu</span>
                <span className="font-bold text-sm">{fmt(margeData.ca)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Coût FIFO total</span>
                <span className="font-bold text-sm text-red-600">- {fmt(margeData.cout)}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 bg-muted/20">
                <span className="text-sm font-bold">Marge brute</span>
                <div className="text-right">
                  <span className={`font-black text-base ${margeData.marge>=0?"text-emerald-600":"text-red-600"}`} style={{fontFamily:"'Nunito',sans-serif"}}>{margeData.marge>=0?"+":""}{fmt(margeData.marge)}</span>
                  <span className={`ml-2 text-xs font-black px-2 py-0.5 rounded-full ${tauxMargeFifo>=30?"bg-emerald-100 text-emerald-700":tauxMargeFifo>=10?"bg-amber-100 text-amber-700":"bg-red-100 text-red-600"}`}>{tauxMargeFifo}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Répartition paiements */}
      {byMethode.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="text-base">💳</span><p className="font-bold text-sm">Modes de paiement</p>
          </div>
          {byMethode.map((r,i)=>(
            <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <span className="text-sm flex items-center gap-2">{PM_ICON[r.m]} <span style={{color:PM_COLOR[r.m]}}>{r.m}</span><span className="text-xs text-muted-foreground">({r.count})</span></span>
              <span className="font-black text-sm" style={{color:PM_COLOR[r.m],fontFamily:"'Nunito',sans-serif"}}>{fmt(r.total)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Charges par catégorie */}
      {byCategorie.length > 0 && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Wallet size={16} style={{color:"#ef4444"}}/><p className="font-bold text-sm">Charges</p></div>
          {byCategorie.map((r,i)=>(
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:CHARGE_COLORS[r.cat as ChargeCategorie]}}/>
              <p className="flex-1 text-sm font-medium">{r.cat}</p>
              <div className="text-right">
                <p className="font-black text-sm" style={{color:CHARGE_COLORS[r.cat as ChargeCategorie],fontFamily:"'Nunito',sans-serif"}}>{fmt(r.montant)}</p>
                <p className="text-xs text-muted-foreground">{totalCharges>0?Math.round(r.montant/totalCharges*100):0}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Download size={16} style={{color:RC}}/><p className="font-bold text-sm">Exporter</p></div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <button onClick={()=>openPreview("summary")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:RC+"18"}}><FileText size={18} style={{color:RC}}/></div>
            <p className="text-xs font-black" style={{color:RC}}>Entête de rapport</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">CA, ventes, panier moyen, répartition</p>
          </button>
          <button onClick={()=>openPreview("full")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"#a855f718"}}><BookOpen size={18} style={{color:"#a855f7"}}/></div>
            <p className="text-xs font-black" style={{color:"#a855f7"}}>Rapport complet</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">Toutes les transactions + détail lignes</p>
          </button>
        </div>
      </div>

      {/* Factures */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><FileText size={16} style={{color:"#a855f7"}}/><p className="font-bold text-sm">Transactions ({filtInv.length})</p></div>
        {filtInv.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune transaction sur cette période</p>}
        {[...filtInv].reverse().slice(0,30).map(inv=>{
          const [tc,bc]=invBadge(inv.status);
          return (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <div><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p></div>
              <div className="text-right">
                <p className="text-sm font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(inv.acompte > 0 ? inv.acompte : inv.montant)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize" style={{background:bc,color:tc}}>{inv.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Export preview modal */}
      {exportModal && (
        <Modal title={exportModal==="summary"?"Entête de rapport":"Rapport complet"} color={RC} onClose={()=>setExportModal(null)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-border overflow-hidden" style={{height:"320px"}}>
              <iframe
                srcDoc={exportModal==="summary"?buildSummaryHtml():buildFullHtml()}
                className="w-full h-full"
                style={{border:"none",background:"#fff"}}
                onLoad={e => {
                  if (exportModal === "full") {
                    try {
                      const doc = (e.target as HTMLIFrameElement).contentDocument;
                      const el = doc?.getElementById("transactions");
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } catch {}
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setExportModal(null)} className="py-3 px-4 rounded-2xl font-black text-sm border-2 border-border active:scale-95">Annuler</button>
              <button onClick={()=>doPrint(exportModal)} className="flex-1 py-3 rounded-2xl font-black text-sm active:scale-95 flex items-center justify-center gap-2 border-2 border-border" style={{color:RC}}>
                <Printer size={15}/> Imprimer
              </button>
              <button onClick={()=>downloadRapportPDF(exportModal)} className="flex-1 py-3 rounded-2xl font-black text-sm active:scale-95 text-white flex items-center justify-center gap-2" style={{background:RC}}>
                <Download size={15}/> PDF
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const ALL_NAV: Array<{ id:Tab; label:string; Icon:typeof LayoutDashboard; color:string; perm?:Permission; adminOnly?:boolean }> = [
  { id:"dashboard",    label:"Accueil",   Icon:LayoutDashboard, color:"#C9A227",        perm:"dashboard" },
  { id:"stock",        label:"Stock",     Icon:Package,          color:"#3b82f6",        perm:"stock" },
  { id:"transferts",   label:"Transferts",Icon:RefreshCw,        color:"#f97316",        perm:"stock" },
  { id:"inventaire",   label:"Inventaire",Icon:ClipboardCheck,   color:"#10b981",        perm:"inventaire" },
  { id:"fournisseurs", label:"Fournis.",  Icon:Truck,            color:"#f97316",        perm:"fournisseurs" },
  { id:"clients",      label:"Clients",   Icon:Users,            color:SEM.success.accent, perm:"clients" },
  { id:"factures",     label:"Factures",  Icon:FileText,         color:"#a855f7",        perm:"factures" },
  { id:"pos",          label:"Vente",     Icon:ShoppingBag,      color:"#e11d48",        perm:"vente" },
  { id:"charges",      label:"Charges",   Icon:Wallet,           color:"#ef4444",        perm:"charges" },
  { id:"compta",       label:"Rapport",   Icon:BookOpen,         color:"#10b981",        perm:"compta" },
  { id:"admin",        label:"Admin",     Icon:ShieldCheck,      color:"#ef4444",        adminOnly:true },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen,           setScreen]           = useState<Screen>("login");
  const [boutiques,        setBoutiques]        = useState<Boutique[]>([]);
  const [platformUsers,    setPlatformUsers]    = useState<PlatformUser[]>(INIT_PLATFORM_USERS);
  const [groupes,          setGroupes]          = useState<Groupe[]>([]);
  const [currentUser,      setCurrentUser]      = useState<PlatformUser|null>(null);
  const [activeBoutiqueId, setActiveBoutiqueId] = useState<string|null>(null);
  const [activeAssign,     setActiveAssign]     = useState<BoutiqueAssignment|null>(null);
  const [businessLoading,  setBusinessLoading]  = useState(false);
  const [appSessionReady,  setAppSessionReady]  = useState(false);
  const [boutiqueSyncProtocol, setBoutiqueSyncProtocol] = useState<{ boutiqueId:string; version:"v1"|"v2" }|null>(null);
  const [tab,              setTab]              = useState<Tab>("dashboard");
  const [navFilter,        setNavFilter]        = useState<Record<string,string>>({});
  const [synced,           setSynced]           = useState(false);
  const [backendOk,        setBackendOk]        = useState<boolean|null>(null);
  const [saveState,        setSaveState]        = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [lastSyncAt,       setLastSyncAt]       = useState(0);
  const [locked,           setLocked]           = useState(() => {
    try { return sessionStorage.getItem(APP_LOCK_KEY) === "1"; } catch { return false; }
  });
  const [lockPin,          setLockPin]          = useState("");
  const [lockBusy,         setLockBusy]         = useState(false);
  const [lockError,        setLockError]        = useState("");
  const [moreOpen,         setMoreOpen]         = useState(false);
  const [notifs,           setNotifs]           = useState<Notif[]>([]);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const [notificationCenterOpen,setNotificationCenterOpen] = useState(false);
  const [pushState,        setPushState]        = useState<PushState>({ supported:false, permission:"unsupported", subscribed:false, iosNeedsInstall:false });
  const [pushBusy,         setPushBusy]         = useState(false);
  const notifiedLowStock = useRef(new Set<number>());
  const lockTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const appSessionRenewalInFlight = useRef<Promise<boolean>|null>(null);
  const appSessionRecoveryInFlight = useRef<Promise<boolean>|null>(null);
  const appSessionHeartbeatAt = useRef(0);
  const lastUserActivityAt = useRef(Date.now());
  const endingSessionForInactivity = useRef(false);
  // Auth settings come from the relational auth_settings table.
  const [lockTimeoutMs, setLockTimeoutMs] = useState(10 * 60 * 1000);
  const [sessionExpiryMs, setSessionExpiryMs] = useState(SESSION_EXPIRY_MS);
  const LOCK_TIMEOUT_MS = lockTimeoutMs; // alias for existing refs
  const saveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const isPulling            = useRef(false); // prevents overlapping Realtime reconciliations
  const pullQueued           = useRef(false); // guarantees a trailing refresh when an event arrives mid-pull
  const lastRemoteB          = useRef<string>(""); // JSON fingerprint to detect real changes
  const lastSyncRevision     = useRef<number|null>(null);
  const seenSyncEventIds     = useRef<Set<string>>(new Set());
  const lastDataTab          = useRef<{ boutiqueId:string; tab:Tab }|null>(null);
  const platformUsersRef     = useRef<PlatformUser[]>([]);
  const activeBoutiqueIdRef  = useRef<string|null>(null); // stable ref for async callbacks
  const currentUserRef       = useRef<PlatformUser | null>(null);

  // ── Notification helpers ──────────────────────────────────────────────────
  const sendNotif = React.useCallback(async (params: Omit<Notif,"id"|"read"|"dateRaw">) => {
    // Immediate in-app feedback only. System notifications are emitted by the
    // backend audit/event pipeline so PC, mobile and background PWA stay in sync.
    const n: Notif = { ...params, id: Date.now(), read: false, dateRaw: new Date().toISOString() };
    setNotifs(prev => [n, ...prev].slice(0, 100));
  }, []);

  const refreshServerNotifications = React.useCallback(async () => {
    if (!activeBoutiqueId) { setNotifs([]); return; }
    try {
      const rows = await getNotifications(activeBoutiqueId, 80);
      setNotifs(prev => {
        const server = rows.map(row => ({
          id: row.id,
          serverId: row.id,
          icon: row.icon || "🔔",
          title: row.title,
          body: row.body || "",
          dateRaw: row.created_at,
          read: Boolean(row.read_at),
          tab: (row.action_tab || undefined) as Tab | undefined,
          filter: row.action_filter || undefined,
        } satisfies Notif));
        const locals = prev.filter(n => !n.serverId && !rows.some(row =>
          row.title === n.title && row.body === n.body && Math.abs(new Date(row.created_at).getTime() - new Date(n.dateRaw).getTime()) < 120000
        ));
        return [...server, ...locals]
          .sort((a,b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime())
          .slice(0, 100);
      });
    } catch (error) {
      console.warn("Notifications serveur indisponibles", error);
    }
  }, [activeBoutiqueId]);

  useEffect(() => {
    if (screen !== "app" || !appSessionReady || !currentUser || !activeBoutiqueId || !hasAuthenticatedSession()) {
      setNotifs([]);
      return;
    }
    let cancelled = false;
    let unsubscribe = () => undefined;
    const refreshPushState = () => { void getPushState().then(setPushState).catch(() => undefined); };
    const activate = async () => {
      setNotifs([]);
      await syncWebPushBoutique().catch(() => undefined);
      if (cancelled) return;
      await refreshServerNotifications();
      if (cancelled) return;
      refreshPushState();
      unsubscribe = subscribeToNotifications(activeBoutiqueId, () => { void refreshServerNotifications(); });
    };
    void activate();
    const onVisible = () => { if (document.visibilityState === "visible") refreshPushState(); };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("controllerchange", refreshPushState);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("controllerchange", refreshPushState);
    };
  }, [screen, appSessionReady, currentUser?.id, activeBoutiqueId, refreshServerNotifications]);

  const togglePushNotifications = React.useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const next = pushState.subscribed ? await disableWebPush() : await enableWebPush();
      setPushState(next);
      toast.success(next.subscribed ? "Notifications Push activées sur cet appareil" : "Notifications Push désactivées sur cet appareil");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier les notifications Push");
      void getPushState().then(setPushState).catch(() => undefined);
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushState.subscribed]);

  const markAllNotifsRead = React.useCallback(() => {
    setNotifs(prev => prev.map(n => ({...n,read:true})));
    void markAllNotificationsRead().catch(() => undefined);
  }, []);

  const clearAllNotifs = React.useCallback(() => {
    setNotifs([]);
    void dismissAllNotifications().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (screen !== "app") return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab") as Tab | null;
    const requestedBoutique = params.get("boutique");
    const allowedTabs: Tab[] = ["dashboard","stock","fournisseurs","clients","factures","pos","charges","compta","admin","inventaire","transferts"];
    if (requestedBoutique && requestedBoutique !== activeBoutiqueId) return;
    if (requestedTab && allowedTabs.includes(requestedTab)) setTab(requestedTab);
    if (params.has("notification")) window.history.replaceState({}, "", window.location.pathname);
  }, [screen, activeBoutiqueId]);

  // Low-stock alert — fires whenever entries or products change for the active boutique
  React.useEffect(() => {
    const b = boutiques.find(x => x.id === activeBoutiqueId);
    if (!b) return;
    b.products.forEach(p => {
      const qty = productQty(p.id, b.entries);
      const threshold = p.alertLow ?? 0;
      if (threshold > 0 && qty <= threshold) {
        if (!notifiedLowStock.current.has(p.id)) {
          notifiedLowStock.current.add(p.id);
          sendNotif({ icon:"⚠️", title:"Stock bas", body:`${p.nom} — ${qty} ${p.unit} restant(s)`, tab:"stock" });
        }
      } else {
        notifiedLowStock.current.delete(p.id);
      }
    });
  }, [boutiques, activeBoutiqueId]);

  const saveGroupesDebounced = useCallback((groups: Groupe[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveGroupes(groups);
        setBackendOk(true);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch (e) {
        setBackendOk(false);
        setSaveState("error");
        toast.error("Erreur de sauvegarde : " + String(e), { duration: 6000 });
        const bid = activeBoutiqueIdRef.current;
        if (bid) logTech(bid, { level:"error", cat:"sync", msg:"Échec de sauvegarde", detail: String(e) });
      }
    }, 800);
  }, []);

  // ── Load boutique auth settings on mount ───────────────────────────────────
  const loadAuthSettings = useCallback(async (boutiqueId: string) => {
    try {
      const settings = await loadStoredAuthSettings(boutiqueId);
      if (settings) {
        if (settings.lockMinutes) setLockTimeoutMs(settings.lockMinutes * 60 * 1000);
        if (settings.sessionMinutes) setSessionExpiryMs(settings.sessionMinutes * 60 * 1000);
      }
    } catch { /* use defaults */ }
  }, []);

  // Reconcile the active boutique after a debounced Realtime event. Account and
  // group metadata is deliberately excluded: it is unrelated to stock/sales and
  // used to triple every Realtime refresh.
  const pullRemote = useCallback(async () => {
    if (isPulling.current) {
      pullQueued.current = true;
      return;
    }
    isPulling.current = true;
    try {
      const bid = activeBoutiqueIdRef.current;
      const remoteB = bid ? await loadBoutiqueSnapshot<Boutique[]>(bid) : null;
      if (remoteB && remoteB.length > 0) {
        const fingerprint = JSON.stringify(remoteB);
        if (fingerprint !== lastRemoteB.current) {
          lastRemoteB.current = fingerprint;
          if (bid && remoteB[0]) {
            setBoutiques(prev => prev.some(b=>b.id===bid)
              ? prev.map(b=>b.id===bid?remoteB[0]:b)
              : [...prev, remoteB[0]]);
          } else {
            setBoutiques(remoteB);
          }
        }
      }
      setLastSyncAt(Date.now());
    } catch (e) {
      const bid = activeBoutiqueIdRef.current;
      if (bid) logTech(bid, { level:"warn", cat:"backend", msg:"Échec de synchronisation", detail: String(e) });
    }
    finally {
      isPulling.current = false;
      if (pullQueued.current) {
        pullQueued.current = false;
        setTimeout(() => { void pullRemote(); }, 0);
      }
    }
  }, []);

  const applyBoutiqueSyncPatch = useCallback((patch: BoutiqueSyncPatch) => {
    const mergeById = (current: any[] | undefined, changes: any[] | undefined, deletedIds: string[] | undefined, idKey = "id") => {
      const removed = new Set((deletedIds ?? []).map(String));
      const next = (current ?? []).filter(item => !removed.has(String(item[idKey])));
      for (const change of changes ?? []) {
        const index = next.findIndex(item => String(item[idKey]) === String(change[idKey]));
        if (index < 0) next.push(change);
        else next[index] = { ...next[index], ...change };
      }
      return next;
    };
    setBoutiques(previous => previous.map(shop => {
      if (shop.id !== activeBoutiqueIdRef.current) return shop;
      const products = mergeById(shop.products, patch.products, patch.deleted.product);
      const categories = mergeById(shop.categories, patch.categories, patch.deleted.category);
      const entries = mergeById(shop.entries, patch.entries, patch.deleted.stock_entry);
      const invoices = mergeById(shop.invoices, patch.invoices, patch.deleted.invoice);
      const clients = mergeById(shop.clients, patch.clients, patch.deleted.client);
      const suppliers = mergeById(shop.suppliers, patch.suppliers, patch.deleted.supplier);
      const charges = mergeById(shop.charges, patch.charges, patch.deleted.charge);
      const caisseHistory = mergeById(shop.caisseHistory, patch.caisseSessions, patch.deleted.caisse_session)
        .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
      const auditLog = mergeById(shop.auditLog, patch.auditLog, patch.deleted.audit_log)
        .sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
      const patchedProductIds = new Set((patch.products ?? []).map(product => String(product.id)));
      // A product can stop using the optional lot/length parameters. Remove
      // any previous parameters for the refreshed products before merging the
      // current canonical values.
      const productParams = mergeById(
        (shop.productParams ?? []).filter(param => !patchedProductIds.has(String(param.productId))),
        patch.productParams,
        patch.deleted.product,
        "productId",
      );
      let caisseSession = shop.caisseSession;
      if ((patch.deleted.caisse_session ?? []).some(id => String(id) === String(caisseSession?.id))) caisseSession = undefined;
      for (const session of patch.caisseSessions ?? []) {
        if (session.closedAt) {
          if (String(caisseSession?.id) === String(session.id)) caisseSession = undefined;
        } else {
          caisseSession = { id:session.id, openedAt:session.openedAt, fondDeCaisse:session.fondDeCaisse, openedBy:session.openedBy };
        }
      }
      return { ...shop, products, categories, entries, invoices, clients, suppliers, charges, caisseHistory, caisseSession, auditLog, productParams };
    }));
  }, []);

  const processBoutiqueSyncEvents = useCallback(async (incoming: BoutiqueSyncEvent[], reason: "events" | "reconnect") => {
    if (reason === "reconnect") {
      lastSyncRevision.current = null;
      await pullRemote();
      return;
    }
    let unique = incoming
      .filter(event => !seenSyncEventIds.current.has(event.event_id))
      .sort((left, right) => left.revision - right.revision);
    if (!unique.length) return;
    for (const event of unique) seenSyncEventIds.current.add(event.event_id);
    while (seenSyncEventIds.current.size > 500) seenSyncEventIds.current.delete(seenSyncEventIds.current.values().next().value!);
    const previousRevision = lastSyncRevision.current;
    if (previousRevision !== null) {
      let expectedRevision = previousRevision + 1;
      for (const event of unique) {
        if (event.revision < expectedRevision) continue;
        if (event.revision !== expectedRevision) {
          // An event was missed in the same batch or between two batches. A
          // targeted patch would be unsafe, so reconcile the authoritative
          // snapshot before accepting any later event.
          lastSyncRevision.current = null;
          await pullRemote();
          return;
        }
        expectedRevision += 1;
      }
      unique = unique.filter(event => event.revision > previousRevision);
      if (!unique.length) return;
    }
    if (unique.some(event => event.domain === "access" || event.domain === "transfers")) {
      // Access changes must refresh the authorization shell; transfers retain
      // their existing dedicated targeted loader until its screen is migrated.
      lastSyncRevision.current = null;
      await pullRemote();
      return;
    }
    try {
      const boutiqueId = activeBoutiqueIdRef.current;
      if (!boutiqueId) return;
      const patch = await loadBoutiqueSyncPatch(boutiqueId, unique);
      applyBoutiqueSyncPatch(patch);
      lastSyncRevision.current = unique[unique.length - 1].revision;
      setLastSyncAt(Date.now());
    } catch (error) {
      console.warn("Correctif Sync v2 indisponible, réconciliation complète utilisée", error);
      lastSyncRevision.current = null;
      await pullRemote();
    }
  }, [applyBoutiqueSyncPatch, pullRemote]);

  // V1 is kept as the safety net while V2 rolls out boutique by boutique.
  // Stock movements are frequent and independent, so external product/entry
  // events can safely use the same narrow canonical patch as V2. Every other
  // V1 event falls back to the complete reconciliation path.
  const processLegacyBoutiqueChanges = useCallback(async (
    changes: LegacyBoutiqueChange[],
    reason: "events" | "reconnect" | "unavailable",
  ) => {
    if (reason !== "events") {
      await pullRemote();
      return;
    }
    const patchable = changes.length > 0
      && changes.every(change => (change.table === "products" || change.table === "stock_entries") && change.operation !== "DELETE")
      // The originating client has already applied an optimistic stock entry.
      // It receives a full snapshot instead, avoiding a transient double count.
      && !changes.some(change => change.ownStockWrite);
    if (!patchable) {
      await pullRemote();
      return;
    }
    const events: BoutiqueSyncEvent[] = [];
    for (const [index, change] of changes.entries()) {
      const record = change.record;
      const recordId = String(record.id ?? "");
      const entityId = change.table === "stock_entries"
        ? String(record.product_id ?? "")
        : recordId;
      if (!recordId || !entityId) {
        await pullRemote();
        return;
      }
      events.push({
        event_id: `v1:${change.table}:${recordId}:${index}`,
        revision: index,
        domain: change.table === "stock_entries" ? "stock" : "catalogue",
        entity_type: change.table === "stock_entries" ? "stock_entry" : "product",
        entity_id: entityId,
        record_id: recordId,
        operation: change.operation,
      });
    }
    try {
      const boutiqueId = activeBoutiqueIdRef.current;
      if (!boutiqueId) return;
      const patch = await loadBoutiqueSyncPatch(boutiqueId, events);
      applyBoutiqueSyncPatch(patch);
      setLastSyncAt(Date.now());
    } catch (error) {
      console.warn("Correctif ciblé Realtime V1 indisponible, réconciliation complète utilisée", error);
      await pullRemote();
    }
  }, [applyBoutiqueSyncPatch, pullRemote]);


  const hydrateBoutique = useCallback(async (boutiqueId: string) => {
    setBusinessLoading(true);
    setAppSessionReady(false);
    try {
      // All writes and protected reads require this short-lived application
      // session. Starting it once here removes the former race with the
      // notifications effect and with the first user action.
      const appSession = await startAppSession(boutiqueId);
      appSessionHeartbeatAt.current = Date.now();
      lastUserActivityAt.current = Date.now();
      if (appSession.locked) {
        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}
        setLocked(true);
      }
      const remoteB = await loadBoutiqueSnapshot<Boutique[]>(boutiqueId);
      if (remoteB?.[0]) {
        const hydrated = remoteB[0];
        lastRemoteB.current = JSON.stringify(remoteB);
        setBoutiques(prev => prev.some(b=>b.id===boutiqueId)
          ? prev.map(b=>b.id===boutiqueId?hydrated:b)
          : [...prev, hydrated]);
      }
      setLastSyncAt(Date.now());
      setAppSessionReady(true);
      void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));
      // These administration-only collections are non-blocking. The cashier
      // can use the shop as soon as the business snapshot is available.
      void Promise.all([loadPlatformUsers<PlatformUser[]>(), loadGroupes<Groupe[]>()])
        .then(([users, groups]) => {
          if (users.length) setPlatformUsers(users);
          setGroupes(groups);
        }).catch(() => undefined);
    } catch (error) {
      setBackendOk(false);
      toast.error("Données boutique indisponibles : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
    } finally {
      setBusinessLoading(false);
    }
  }, []);

  const endSessionForInactivity = useCallback(() => {
    if (endingSessionForInactivity.current) return;
    endingSessionForInactivity.current = true;
    const boutiqueId = activeBoutiqueIdRef.current;
    if (boutiqueId) void logTech(boutiqueId, { level:"info", cat:"session", msg:"Session expirée après inactivité" });
    void signOutFromSupabase().catch(() => undefined).finally(() => {
      clearSession();
      setAppSessionReady(false);
      setCurrentUser(null);
      setActiveBoutiqueId(null);
      setActiveAssign(null);
      setLocked(false);
      setScreen("login");
      endingSessionForInactivity.current = false;
    });
  }, []);

  // The database application session has the same idle-lifetime setting as
  // the UI. Renew it while the app is in use so an active cashier cannot end
  // up with a valid Auth token but an expired write session. A locked screen is
  // never renewed: unlocking still requires the quick PIN on the server.
  const renewAppSession = useCallback(async (): Promise<boolean> => {
    const boutiqueId = activeBoutiqueIdRef.current;
    if (screen !== "app" || !appSessionReady || locked || !boutiqueId) return false;
    if (appSessionRenewalInFlight.current) return appSessionRenewalInFlight.current;

    const renewal = startAppSession(boutiqueId)
      .then((appSession) => {
        if (!appSession.locked) {
          appSessionHeartbeatAt.current = Date.now();
          return true;
        }
        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}
        setLocked(true);
        return false;
      })
      .catch((error) => {
        console.warn("Renouvellement de session applicative différé :", error);
        return false;
      })
      .finally(() => {
        appSessionRenewalInFlight.current = null;
      });
    appSessionRenewalInFlight.current = renewal;
    return renewal;
  }, [appSessionReady, locked, screen]);

  // A protected request can arrive just after a browser timer was delayed.
  // Confirm that it is an app-session issue before restoring it: real missing
  // permissions must continue to be rejected normally.
  const recoverAppSession = useCallback(async (): Promise<boolean> => {
    const boutiqueId = activeBoutiqueIdRef.current;
    if (screen !== "app" || locked || !boutiqueId) return false;
    if (Date.now() - lastUserActivityAt.current >= sessionExpiryMs) {
      endSessionForInactivity();
      return false;
    }
    if (appSessionRecoveryInFlight.current) return appSessionRecoveryInFlight.current;

    const recovery = (async () => {
      let isActive: boolean;
      try {
        isActive = await validateAppSession(boutiqueId);
      } catch {
        return false;
      }
      if (isActive) return false;

      try {
        const appSession = await startAppSession(boutiqueId);
        if (appSession.locked) {
          try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}
          setLocked(true);
          return false;
        }
        setAppSessionReady(true);
        appSessionHeartbeatAt.current = Date.now();
        toast.message("Session rétablie. Votre action est relancée.");
        return true;
      } catch (error) {
        console.warn("Rétablissement de session applicative impossible :", error);
        return false;
      }
    })().finally(() => {
      appSessionRecoveryInFlight.current = null;
    });
    appSessionRecoveryInFlight.current = recovery;
    return recovery;
  }, [endSessionForInactivity, locked, screen, sessionExpiryMs]);

  useEffect(() => {
    setAppSessionRecoveryHandler(recoverAppSession);
    return () => setAppSessionRecoveryHandler(null);
  }, [recoverAppSession]);

  const refreshAuthenticatedFlow = useCallback(async () => {
    if (!hasAuthenticatedSession()) {
      setAppSessionReady(false);
      setSynced(true);
      setScreen("login");
      return;
    }
    if (!await validateServerSession()) {
      clearSession();
      setAppSessionReady(false);
      setCurrentUser(null);
      setSynced(true);
      setScreen("login");
      return;
    }
    try {
      const bootstrap = await getAuthBootstrap();
      if (!bootstrap?.user) throw new Error("Profil utilisateur introuvable");
      const user = bootstrap.user as PlatformUser;
      const shellBoutiques = bootstrap.boutiques as Boutique[];
      setCurrentUser(user);
      setPlatformUsers([user]);
      setBoutiques(shellBoutiques);
      setGroupes((bootstrap.groupes ?? []) as Groupe[]);
      setSynced(true);

      if (user.isSuspended) {
        await signOutFromSupabase(); clearSession(); setAppSessionReady(false); setCurrentUser(null); setScreen("login");
        toast.error("Compte suspendu — contactez l’administrateur Tournal");
        return;
      }
      if (user.mustChangePassword) { setScreen("password-change"); return; }
      const pinState = await getPinStatus().catch(() => ({ configured:false }));
      if (!pinState.configured) { setScreen("pin-setup"); return; }

      // The global admin shell needs account metadata, never all boutique business data.
      if (user.isSuperAdmin) {
        setScreen("superadmin");
        setTimeout(() => { void Promise.all([
          loadPlatformUsers<PlatformUser[]>(), loadGroupes<Groupe[]>(),
        ]).then(([users, groups]) => {
          if (users?.length) setPlatformUsers(users);
          if (groups?.length) setGroupes(groups);
          void checkBackend().then(setBackendOk).catch(()=>setBackendOk(false));
        }).catch(()=>undefined); }, 0);
        return;
      }

      const assignments = user.assignments.filter(a => shellBoutiques.some(b => b.id === a.boutiqueId));
      const rememberedId = loadSession()?.boutiqueId ?? null;
      const remembered = rememberedId ? assignments.find(a=>a.boutiqueId===rememberedId) : undefined;
      const selected = remembered ?? (assignments.length === 1 ? assignments[0] : undefined);
      if (selected) {
        activeBoutiqueIdRef.current = selected.boutiqueId;
        setActiveBoutiqueId(selected.boutiqueId);
        setActiveAssign(selected);
        setTab("dashboard");
        saveSession(user.id, selected.boutiqueId, selected);
        setBusinessLoading(true);
        setScreen("app");
        void loadAuthSettings(selected.boutiqueId);
        setTimeout(() => { void hydrateBoutique(selected.boutiqueId); }, 0);
        return;
      }
      saveSession(user.id, null, null);
      setScreen("boutique-select");
    } catch (error) {
      setSynced(true);
      setBackendOk(false);
      toast.error("Connexion impossible : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
    }
  }, [hydrateBoutique]);

  useEffect(() => { void refreshAuthenticatedFlow(); }, [refreshAuthenticatedFlow]);

  // Prevent accidental value changes when scrolling over a focused number input.
  // Blurring on wheel lets the scroll event propagate normally to the page.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLInputElement && el.type === "number") el.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  // Resolve the sync protocol after the application session is ready. The
  // result is boutique-specific, so a V2 pilot never changes other shops.
  useEffect(() => {
    let disposed = false;
    if (!synced || businessLoading || locked || !appSessionReady || !hasAuthenticatedSession() || !activeBoutiqueId) {
      setBoutiqueSyncProtocol(null);
      return () => { disposed = true; };
    }
    setBoutiqueSyncProtocol({ boutiqueId:activeBoutiqueId, version:"v1" });
    void isBoutiqueSyncV2Enabled(activeBoutiqueId)
      .then(enabled => {
        if (!disposed) setBoutiqueSyncProtocol({ boutiqueId:activeBoutiqueId, version:enabled ? "v2" : "v1" });
      })
      .catch(error => {
        console.warn("Bascule Sync v2 indisponible, protocole historique conservé", error);
        if (!disposed) setBoutiqueSyncProtocol({ boutiqueId:activeBoutiqueId, version:"v1" });
      });
    return () => { disposed = true; };
  }, [synced, businessLoading, locked, appSessionReady, activeBoutiqueId]);

  // Sync v2 applies narrow canonical patches only for boutiques explicitly
  // enabled by the server. Every other boutique retains the legacy listener.
  useEffect(() => {
    if (!synced || businessLoading || locked || !appSessionReady || !hasAuthenticatedSession()) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastUserActivityAt.current >= sessionExpiryMs) {
        endSessionForInactivity();
        return;
      }
      void validateServerSession().then(async valid => {
        if (!valid) { handleLogout(); return; }
        await renewAppSession();
        void pullRemote();
      });
    };
    const useSyncV2 = boutiqueSyncProtocol?.boutiqueId === activeBoutiqueId && boutiqueSyncProtocol.version === "v2";
    const unsubscribe = useSyncV2
      ? subscribeToBoutiqueSync(activeBoutiqueId ?? "", (events, reason) => { void processBoutiqueSyncEvents(events, reason); })
      : subscribeToBoutiqueChanges(activeBoutiqueId ?? "", (changes, reason) => { void processLegacyBoutiqueChanges(changes, reason); });
    document.addEventListener("visibilitychange", onVisible);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
  }, [synced, pullRemote, activeBoutiqueId, businessLoading, locked, appSessionReady, endSessionForInactivity, renewAppSession, sessionExpiryMs, processBoutiqueSyncEvents, processLegacyBoutiqueChanges, boutiqueSyncProtocol]);

  // Realtime keeps the shared state current in normal use. When a cashier
  // explicitly opens Stock, Sale or Invoices after working elsewhere, run one
  // background reconciliation as a safety net for a missed socket event.
  useEffect(() => {
    const boutiqueId = activeBoutiqueId;
    const dataTab = tab === "stock" || tab === "pos" || tab === "factures";
    if (!synced || screen !== "app" || businessLoading || locked || !appSessionReady || !boutiqueId || !dataTab) {
      if (screen !== "app" || !boutiqueId) lastDataTab.current = null;
      return;
    }
    const previous = lastDataTab.current;
    lastDataTab.current = { boutiqueId, tab };
    if (!previous || (previous.boutiqueId === boutiqueId && previous.tab === tab)) return;
    // Avoid an immediate duplicate fetch after a just-received Realtime patch.
    if (Date.now() - lastSyncAt < 1_500) return;
    void pullRemote();
  }, [activeBoutiqueId, appSessionReady, businessLoading, lastSyncAt, locked, pullRemote, screen, synced, tab]);

  // Boutique updates are persisted by domain-specific relational operations.
  // Never write a full JSON state blob from the client.
  useEffect(() => { if (!synced) return; saveGroupesDebounced(groupes); }, [groupes, synced, saveGroupesDebounced]);

  // Refresh the access token before its expiry so Realtime keeps its existing
  // channel rather than disconnecting users after an hour.
  useEffect(() => {
    if (!hasAuthenticatedSession()) return;
    const refresh = () => {
      void refreshSessionIfNeeded().catch((error) => {
        console.warn("Renouvellement de session différé :", error);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "app" || !appSessionReady) return;
    function resetTimers() {
      const now = Date.now();
      if (now - lastUserActivityAt.current >= sessionExpiryMs) {
        endSessionForInactivity();
        return;
      }
      lastUserActivityAt.current = now;
      if (lockTimer.current)   clearTimeout(lockTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      lockTimer.current   = setTimeout(() => {
        const bid = activeBoutiqueIdRef.current;
        if (bid) void lockAppSession(bid).catch(() => undefined);
        try { sessionStorage.setItem(APP_LOCK_KEY, "1"); } catch {}
        setLocked(true);
      }, LOCK_TIMEOUT_MS);
      logoutTimer.current = setTimeout(() => {
        endSessionForInactivity();
      }, sessionExpiryMs);
      // A live user refreshes the server-side gate at most once per minute.
      // No interval runs in the background, so inactivity can still expire.
      if (!locked && now - appSessionHeartbeatAt.current >= 60_000) void renewAppSession();
    }
    const events = ["mousemove", "pointerdown", "keydown", "touchstart", "click", "input", "change", "focusin", "wheel"];
    events.forEach(e => document.addEventListener(e, resetTimers, { passive: true }));
    document.addEventListener("scroll", resetTimers, { passive: true, capture: true });
    resetTimers();
    return () => {
      if (lockTimer.current)   clearTimeout(lockTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      events.forEach(e => document.removeEventListener(e, resetTimers));
      document.removeEventListener("scroll", resetTimers, true);
    };
  }, [appSessionReady, endSessionForInactivity, lockTimeoutMs, locked, renewAppSession, screen, sessionExpiryMs]);

  // Keep stable refs in sync for asynchronous callbacks.
  useEffect(() => { activeBoutiqueIdRef.current = activeBoutiqueId; }, [activeBoutiqueId]);
  useEffect(() => { platformUsersRef.current = platformUsers; }, [platformUsers]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const boutique = boutiques.find(b=>b.id===activeBoutiqueId)??null;

  function updateBoutique(updates: Partial<Boutique>) {
    if (!activeBoutiqueId) return;
    setBoutiques(prev=>prev.map(b=>b.id===activeBoutiqueId?{...b,...updates}:b));
  }
  function updateOtherBoutique(boutiqueId: string, updates: Partial<Boutique>) {
    setBoutiques(prev=>prev.map(b=>b.id===boutiqueId?{...b,...updates}:b));
  }
  function logAction(action: string, detail: string, icon: string) {
    if (!activeBoutiqueId || !currentUser) return;
    const boutiqueId = activeBoutiqueId;
    const user = currentUserRef.current ?? currentUser;
    const optimisticId = Date.now();
    const optimistic: AuditEntry = {
      id: optimisticId,
      userId: user.id,
      userNom: user.nom,
      userColor: user.color,
      action,
      detail,
      icon,
      timestamp: optimisticId,
      date: new Date(optimisticId).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }),
      source: "native",
    };
    setBoutiques(prev=>prev.map(b=>b.id===boutiqueId?{...b,auditLog:[optimistic,...b.auditLog]}:b));
    void (async () => {
      try {
        const rows = await recordAuditLog({
          boutiqueId,
          userId: user.id,
          action,
          detail,
          icon,
          source: "native",
        });
        const saved = rows[0];
        if (!saved) return;
        const ts = new Date(saved.created_at).getTime();
        setBoutiques(prev => prev.map(b => b.id !== boutiqueId ? b : {
          ...b,
          auditLog: b.auditLog.map((entry) => entry.id !== optimisticId ? entry : {
            ...entry,
            id: saved.id,
            timestamp: ts,
            date: new Date(ts).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }),
            source: "native",
          }),
        }));
      } catch (error) {
        console.warn("Audit log server write failed", error);
      }
    })();
  }
  function handleSelectBoutique(b: Boutique, assignment: BoutiqueAssignment) {
    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assignment); setTab("dashboard"); setBusinessLoading(true); setScreen("app");
    void loadAuthSettings(b.id);
    setTimeout(()=>{ void hydrateBoutique(b.id); },0);
    if (currentUser) {
      saveSession(currentUser.id, b.id, assignment);
      logTech(b.id, { level:"info", cat:"session", msg:`Connexion : ${currentUser.nom}`, detail: assignment.role });
    }
  }
  function handleEnterBoutiqueAsAdmin(b: Boutique) {
    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true } };
    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assign); setTab("dashboard"); setBusinessLoading(true); setScreen("app");
    void loadAuthSettings(b.id);
    setTimeout(()=>{ void hydrateBoutique(b.id); },0);
    if (currentUser) saveSession(currentUser.id, b.id, assign);
  }
  function handleLogout() {
    if (activeBoutiqueId && currentUser) logTech(activeBoutiqueId, { level:"info", cat:"session", msg:`Déconnexion : ${currentUser.nom}` });
    void signOutFromSupabase();
    clearSession(); setAppSessionReady(false); setCurrentUser(null); setActiveBoutiqueId(null); setActiveAssign(null); setScreen("login");
  }

  function handleUpdateBoutique(id: string, nom: string, ville: string) {
    setBoutiques(prev=>prev.map(b=>b.id===id?{...b,nom,ville,initials:nom.split(" ").map((w:string)=>w[0]).slice(0,2).join("").toUpperCase()}:b));
  }
  function handleDeleteBoutique(id: string) {
    setBoutiques(prev=>prev.filter(b=>b.id!==id));
    setPlatformUsers(prev=>prev.map(u=>({...u,assignments:u.assignments.filter(a=>a.boutiqueId!==id)})));
  }
  async function handleCreateBoutique(nom: string, ville: string, ownerId: string) {
    try {
      const { boutiqueId } = await createBoutique(nom, ville, ownerId);
      const color = SUP_COLORS[boutiques.length%SUP_COLORS.length];
      const initials = nom.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
      setBoutiques(prev=>[...prev,{ id:boutiqueId, nom, ville, color, initials, products:[], entries:[], suppliers:[], clients:[], invoices:[], auditLog:[], charges:[] }]);
      const ownerAssign: BoutiqueAssignment = { boutiqueId, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true } };
      setPlatformUsers(prev=>prev.map(u=>u.id!==ownerId?u:{...u,assignments:[...u.assignments,ownerAssign]}));
      toast.success("Boutique créée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création de boutique impossible");
    }
  }

  async function handleCreateUser(user: Omit<PlatformUser,"id">): Promise<PlatformUser|null> {
    try {
      const { userId } = await createUser(user.phone, user.nom, user.password, boutique.id);
      const created = {...user,id:userId,password:""};
      setPlatformUsers(prev=>[...prev,created]);
      toast.success("Compte utilisateur créé");
      return created;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création du compte impossible");
      return null;
    }
  }

  async function handleResetPassword(userId: string, password: string) {
    try {
      await resetUserPassword(userId, password);
      toast.success("Mot de passe réinitialisé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Réinitialisation impossible");
    }
  }

  function handleUpdatePlatformUsers(updater: PlatformUser[] | ((previous: PlatformUser[]) => PlatformUser[])) {
    const previous = platformUsersRef.current;
    const next = typeof updater === "function" ? updater(previous) : updater;
    platformUsersRef.current = next;
    setPlatformUsers(next);

    const roleToDatabase = (role: string): "owner" | "manager" | "employee" =>
      role === "Propriétaire" ? "owner" : role === "Manager" || role === "Gérant" ? "manager" : "employee";
    const previousAssignments = new Map(previous.flatMap(user => user.assignments.map(assignment => [
      `${user.id}:${assignment.boutiqueId}`, assignment,
    ])));
    const changedAssignments = next.flatMap(user => user.assignments.map(assignment => ({ user, assignment })))
      .filter(({ user, assignment }) => {
        const old = previousAssignments.get(`${user.id}:${assignment.boutiqueId}`);
        return !old || old.role !== assignment.role || JSON.stringify(old.droits) !== JSON.stringify(assignment.droits);
      });
    const nextAssignmentKeys = new Set(next.flatMap(user => user.assignments.map(assignment => `${user.id}:${assignment.boutiqueId}`)));
    const removedAssignments = previous.flatMap(user => user.assignments.map(assignment => ({ user, assignment })))
      .filter(({ user, assignment }) => !nextAssignmentKeys.has(`${user.id}:${assignment.boutiqueId}`));

    if (changedAssignments.length || removedAssignments.length) {
      // Try direct PostgREST PATCH first (works for owners managing their own boutique).
      // Fall back to adminProvision (SuperAdmin only) if the direct call is rejected.
      const tryUpsert = async ({ user, assignment }: { user: PlatformUser; assignment: BoutiqueAssignment }) => {
        try {
          await upsertAssignmentDirect(assignment.boutiqueId, user.id, roleToDatabase(assignment.role), assignment.droits);
        } catch {
          await assignUserToBoutique(assignment.boutiqueId, user.id, roleToDatabase(assignment.role), assignment.droits);
        }
      };
      const tryRemove = async ({ user, assignment }: { user: PlatformUser; assignment: BoutiqueAssignment }) => {
        try {
          await deleteAssignmentDirect(assignment.boutiqueId, user.id);
        } catch {
          await unassignUserFromBoutique(assignment.boutiqueId, user.id);
        }
      };
      void Promise.all([
        ...changedAssignments.map(tryUpsert),
        ...removedAssignments.map(tryRemove),
      ]).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Affectation utilisateur impossible");
        void pullRemote();
      });
    }
  }

  // Nav
  const droits  = activeAssign?.droits;
  const isOwner = activeAssign?.role === "Propriétaire";
  const isReadOnly = activeAssign?.role === "Compte Mère";
  function canAccess(perm: Permission) { return isOwner || isReadOnly || !!(droits?.[perm]); }
  // Margins are sensitive: only owners or users explicitly granted "Voir les marges".
  // Read-only accounts do NOT see margins unless the right is set.
  const canSeeMargin = isOwner || !!(droits?.marges);
  const NAV = ALL_NAV.filter(n => {
    if (n.adminOnly) return isOwner;
    if (n.perm) return canAccess(n.perm);
    return true;
  });
  // Primary tabs always shown; secondary tabs hidden under "..."
  const PRIMARY_TABS: Tab[] = ["dashboard", "pos", "clients", "factures", "admin"];
  const navPrimary = NAV.filter(n => PRIMARY_TABS.includes(n.id));
  const navSecondary = NAV.filter(n => !PRIMARY_TABS.includes(n.id));
  const safeTab = NAV.find(n=>n.id===tab) ? tab : (NAV[0]?.id ?? "dashboard");
  const current = NAV.find(n=>n.id===safeTab)!;
  const headLabel: Record<Tab,string> = { dashboard:"Accueil", stock:"Stock", fournisseurs:"Fournisseurs", clients:"Clients", factures:"Factures", pos:"Vente", charges:"Charges", compta:"Rapport", admin:"Admin", inventaire:"Inventaire physique", transferts:"Transferts B2B" };


  if (screen==="login") return <LoginScreen onAuthenticated={refreshAuthenticatedFlow}/>;
  if (screen==="password-change"&&currentUser) return <RequiredPasswordChangeScreen onComplete={refreshAuthenticatedFlow}/>;
  if (screen==="pin-setup"&&currentUser) return <PinSetupScreen onComplete={refreshAuthenticatedFlow}/>;
  if (screen==="superadmin"&&currentUser) return (
    <SuperAdminScreen boutiques={boutiques} platformUsers={platformUsers} groupes={groupes}
      onEnterBoutique={handleEnterBoutiqueAsAdmin}
      onCreateBoutique={handleCreateBoutique}
      onUpdateBoutique={handleUpdateBoutique}
      onDeleteBoutique={handleDeleteBoutique}
      onCreateUser={handleCreateUser}
      onUpdateUser={(uid,updates)=>setPlatformUsers(prev=>prev.map(u=>u.id===uid?{...u,...updates}:u))}
      onCreateGroupe={nom=>setGroupes(prev=>[...prev,{id:"g"+Date.now(),nom}])}
      onUpdateGroupe={(gid,nom)=>setGroupes(prev=>prev.map(g=>g.id===gid?{...g,nom}:g))}
      onDeleteGroupe={gid=>{ setGroupes(prev=>prev.filter(g=>g.id!==gid)); setPlatformUsers(prev=>prev.map(u=>u.groupeId===gid?{...u,groupeId:undefined,isCompteMere:undefined}:u)); }}
      onResetPassword={handleResetPassword}
      onLogout={handleLogout}
      backendOk={backendOk}
      saveState={saveState}/>
  );
  if (screen==="boutique-select"&&currentUser) return (
    <BoutiqueSelectScreen
      user={currentUser} boutiques={boutiques} assignments={currentUser.assignments}
      groupes={groupes} allUsers={platformUsers}
      onSelect={handleSelectBoutique} onLogout={handleLogout}
      onBack={activeBoutiqueId ? ()=>setScreen("app") : undefined}
    />
  );
  if (!boutique||!currentUser||!activeAssign) return null;

  // Lock screen overlay
  if (locked && currentUser && screen === "app") {
    const unlock = async (pinValue = lockPin) => {
      if (lockBusy) return;
      if (!/^\d{6}$/.test(pinValue)) { setLockError("Entrez votre PIN à 6 chiffres."); return; }
      setLockBusy(true);
      setLockError("");
      try {
        const result = await verifyQuickPin(pinValue, activeBoutiqueId);
        if (result.ok) {
          setLockPin("");
          try { sessionStorage.removeItem(APP_LOCK_KEY); } catch {}
          appSessionHeartbeatAt.current = Date.now();
          lastUserActivityAt.current = Date.now();
          setLocked(false);
          return;
        }
        if (result.sessionExpired) {
          setLockError("Session expirée. Reconnectez-vous avec vos identifiants.");
          endSessionForInactivity();
          return;
        }
        if (!result.configured) { setLockPin(""); setLocked(false); setScreen("pin-setup"); return; }
        setLockPin("");
        if (result.lockedUntil) { setLockError("PIN temporairement bloqué. Reconnectez-vous avec votre mot de passe."); return; }
        setLockError(`PIN incorrect${typeof result.attemptsRemaining === "number" ? ` · ${result.attemptsRemaining} essai(s) restant(s)` : ""}`);
      } catch (e) {
        setLockError(e instanceof Error ? e.message : "Vérification du PIN impossible");
      } finally {
        setLockBusy(false);
      }
    };
    return createPortal(
      <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center" style={{ background:"rgba(0,0,0,0.92)", backdropFilter:"blur(12px)" }}>
        <div className="flex flex-col items-center gap-6 px-8 py-10 rounded-3xl" style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", maxWidth:"340px", width:"100%" }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black" style={{ background:currentUser.color+"22", color:currentUser.color, fontFamily:"'Nunito', sans-serif" }}>{currentUser.initials}</div>
          <div className="text-center">
            <p className="text-white font-black text-xl" style={{ fontFamily:"'Nunito', sans-serif" }}>{currentUser.nom}</p>
            <p className="text-sm mt-1" style={{ color:"rgba(255,255,255,0.55)" }}>Session verrouillée · Saisissez votre PIN rapide</p>
          </div>
          <div className="flex items-center gap-2" aria-hidden="true">
            {Array.from({length:6}).map((_,i)=><span key={i} className="w-2.5 h-2.5 rounded-full transition-all" style={{ background:i<lockPin.length?currentUser.color:"rgba(255,255,255,0.18)", transform:i<lockPin.length?"scale(1.08)":"scale(1)" }}/>) }
          </div>
          <div className="w-full relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color:"rgba(255,255,255,0.4)" }}/>
            <input type="password" value={lockPin}
              onChange={e=>{
                const next=e.target.value.replace(/\D/g,"").slice(0,6);
                setLockPin(next); setLockError("");
                if(next.length===6&&!lockBusy) setTimeout(()=>void unlock(next),0);
              }}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void unlock();}}}
              placeholder="PIN à 6 chiffres" autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" enterKeyHint="done"
              disabled={lockBusy}
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-center text-lg font-black tracking-[0.3em] outline-none disabled:opacity-60"
              style={{ background:"rgba(255,255,255,0.1)", border:`1px solid ${lockError?"rgba(239,68,68,0.65)":"rgba(255,255,255,0.15)"}`, color:"#fff", caretColor:"#fff" }}/>
          </div>
          {lockError&&<div role="alert" className="w-full px-3 py-2.5 rounded-xl text-xs font-bold text-center" style={{background:"rgba(239,68,68,0.12)",color:"#fca5a5"}}>{lockError}</div>}
          <button onClick={()=>void unlock()} disabled={lockBusy||lockPin.length!==6} className="w-full py-3.5 rounded-2xl font-black text-sm disabled:opacity-55 transition-all" style={{ background:currentUser.color, color:"#fff" }}>
            {lockBusy?"Vérification…":"Déverrouiller"}
          </button>
          <button onClick={()=>{setLocked(false);setLockPin("");setLockError("");handleLogout();}} disabled={lockBusy} className="text-xs font-bold" style={{ color:"rgba(255,255,255,0.48)" }}>
            Utiliser mon mot de passe / Changer de compte
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <NotifCtx.Provider value={sendNotif}>
    <ReadOnlyCtx.Provider value={isReadOnly}>
    <div className="bg-background text-foreground h-screen flex flex-col overflow-hidden" style={{ fontFamily:"'Inter', sans-serif" }}>
      <Toaster position="top-center" theme="light" toastOptions={{ style: { background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:"16px", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}} />
      <header className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom:"1px solid rgba(0,0,0,0.07)" }}>
        <div>
          <button onClick={()=>setScreen("boutique-select")} className="flex items-center gap-2 mb-0.5 active:opacity-70">
            <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-black" style={{ background:boutique.color+"22",color:boutique.color,fontFamily:"'Nunito', sans-serif" }}>{boutique.initials}</div>
            <p className="text-xs text-muted-foreground">{boutique.nom}</p>
            <ChevronRight size={11} className="text-muted-foreground" style={{ transform:"rotate(90deg)" }}/>
          </button>
          <h1 className="text-2xl font-black leading-tight" style={{ fontFamily:"'Nunito', sans-serif" }}>{headLabel[safeTab]}</h1>
        </div>
        <div className="flex items-center gap-2">
          {saveState==="saving"&&<span className="text-xs text-amber-500 font-semibold animate-pulse flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"/>Sync…</span>}
          {saveState==="saved"&&<span className="text-xs text-green-600 font-semibold flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"/>Sauvegardé</span>}
          {saveState==="error"&&<span className="text-xs text-red-500 font-semibold flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"/>Erreur sync</span>}
          {saveState==="idle"&&backendOk===false&&<span className="text-xs text-red-400 font-semibold flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400"/>Hors ligne</span>}
          <button onClick={pullRemote} title="Synchroniser maintenant" className="p-2 rounded-xl active:scale-95 transition-transform" style={{ background:"#EEE9D8" }}><RefreshCw size={16} className="text-muted-foreground"/></button>
          <button onClick={()=>setNotifOpen(o=>!o)} className="relative p-2.5 rounded-xl" style={{ background:"#EEE9D8" }}>
            <Bell size={22} className="text-muted-foreground"/>
            {notifs.some(n=>!n.read) && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 flex items-center justify-center text-white" style={{fontSize:"9px",fontFamily:"'Nunito',sans-serif",fontWeight:900}}>
                {notifs.filter(n=>!n.read).length > 9 ? "9+" : notifs.filter(n=>!n.read).length}
              </span>
            )}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:currentUser.color+"22" }}>
            <span className="text-sm font-black" style={{ color:currentUser.color,fontFamily:"'Nunito', sans-serif" }}>{currentUser.initials}</span>
            <LogOut size={14} style={{ color:currentUser.color }}/>
          </button>
        </div>
      </header>
      {businessLoading && <div className="fixed inset-x-0 top-[72px] bottom-[64px] z-40 bg-background/90 backdrop-blur-[2px] flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-border border-t-foreground animate-spin"/>
          <div><p className="text-sm font-black">Ouverture de la boutique…</p><p className="text-xs text-muted-foreground mt-1">Les données métier se chargent en arrière-plan.</p></div>
        </div>
      </div>}
      {isReadOnly && <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-800 bg-amber-50 border-b border-amber-200"><Lock size={12}/> Mode lecture seule — aucune modification possible</div>}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-20" style={{ scrollbarWidth:"none" }}>
        {safeTab==="dashboard"    && canAccess("dashboard") && <DashboardView boutique={boutique} onNavigate={(t,f)=>{setNavFilter(f??{});setTab(t);}}/>}
        {safeTab==="stock"        && canAccess("stock")        && <RelationalStockView boutique={boutique} onUpdate={updateBoutique} logAction={logAction} initialFilter={navFilter.stockFilter}/>}
        {safeTab==="fournisseurs" && canAccess("fournisseurs") && <RelationalFournisseursView boutique={boutique} onUpdate={updateBoutique} logAction={logAction} canPaySupplier={canAccess("charges")}/>}
        {safeTab==="clients"      && canAccess("clients")      && <RelationalClientsView boutique={boutique} allBoutiques={boutiques} platformUsers={platformUsers} currentUser={currentUser!} onUpdate={updateBoutique} logAction={logAction} initialTab={navFilter.clientTab as ClientType|undefined} onOpenInvoice={(invoiceId)=>{setNavFilter({invoiceId});setTab("factures");}} onCreateInvoice={(client)=>{setNavFilter({clientId:String(client.id)});setTab("factures");}}/>}
        {safeTab==="factures"     && canAccess("factures")     && <RelationalFacturesView boutique={boutique} allBoutiques={boutiques} platformUsers={platformUsers} currentUser={currentUser} canReturn={canAccess("remboursement")} canCollectPayment={isOwner || !!(droits?.encaissement_vente)} canSeeMargin={canSeeMargin} onUpdate={updateBoutique} onUpdateOtherBoutique={updateOtherBoutique} logAction={logAction} initialStatus={navFilter.statusFilter as InvoiceStatus|"all"|undefined} initialInvoiceId={navFilter.invoiceId} initialClientId={navFilter.clientId?Number(navFilter.clientId):undefined}/>}
        {safeTab==="pos"          && canAccess("vente")        && <RelationalPOSView boutique={boutique} allBoutiques={boutiques} currentUser={currentUser} canEncaissVente={isOwner || !!(droits?.encaissement_vente)} onUpdate={updateBoutique} logAction={logAction}/>}
        {safeTab==="charges"      && canAccess("charges")      && <RelationalChargesView boutique={boutique} onUpdate={updateBoutique} logAction={logAction}/>}
        {safeTab==="compta"       && canAccess("compta")       && <RelationalComptabiliteView boutique={boutique} canSeeMargin={canSeeMargin}/>}
        {safeTab==="inventaire"   && canAccess("inventaire")   && (
          <InventaireView
            boutique={boutique}
            currentUser={currentUser!}
            onUpdate={updateBoutique}
            logAction={logAction}
            onClose={()=>setTab("dashboard")}
          />
        )}
        {safeTab==="transferts"   && canAccess("stock")        && <RelationalTransfersView boutique={boutique} allBoutiques={boutiques} platformUsers={platformUsers} currentUser={currentUser!}/>}
        {safeTab==="admin"        && isOwner                  && (
        <AdminView
            boutique={boutique}
            allBoutiques={boutiques}
            platformUsers={platformUsers}
            currentUser={currentUser!}
            onUpdate={updateBoutique}
            onUpdateUsers={handleUpdatePlatformUsers}
            onCreateUser={handleCreateUser}
            logAction={logAction}
            lockMinutesInit={Math.round(lockTimeoutMs / 60000)}
            sessionMinutesInit={Math.round(sessionExpiryMs / 60000)}
            onSaveAuthSettings={async (lockMinutes, sessionMinutes) => {
              await saveAuthSettings(boutique.id, { lockMinutes, sessionMinutes });
              setLockTimeoutMs(lockMinutes * 60 * 1000);
              setSessionExpiryMs(sessionMinutes * 60 * 1000);
            }}
            backendOk={backendOk}
            lastSyncAt={lastSyncAt}
          />
        )}
      </main>
      {/* More menu overlay */}
      {moreOpen && createPortal(
        <div className="fixed inset-0 z-[150]" onClick={()=>setMoreOpen(false)}>
          <div className="absolute bottom-16 right-2 bg-card rounded-2xl border border-border shadow-2xl overflow-hidden min-w-[160px]" onClick={e=>e.stopPropagation()}>
            {navSecondary.map(({id,label,Icon})=>{
              const active=safeTab===id;
              return <button key={id} onClick={()=>{setTab(id);setMoreOpen(false);}} className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-border last:border-0 active:bg-muted transition-colors" style={{ background:active?"#00000008":"transparent" }}>
                <Icon size={18} style={{ color:active?boutique.color:"#6b7280" }}/>
                <span className="text-sm font-bold" style={{ color:active?boutique.color:"#374151" }}>{label}</span>
                {active&&<span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background:boutique.color }}/>}
              </button>;
            })}
          </div>
        </div>,
        document.body
      )}
      {/* Notification panel */}
      {notifOpen && createPortal(
        <div className="fixed inset-0 z-[80]" onClick={()=>setNotifOpen(false)}>
          <div className="absolute top-16 right-4 w-[340px] max-w-[calc(100vw-2rem)] bg-card rounded-2xl border border-border shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <p className="font-black text-sm">Notifications</p>
                <button onClick={()=>{setNotifOpen(false);setNotificationCenterOpen(true);}} className="text-xs font-black px-2.5 py-1.5 rounded-lg" style={{background:"#111827",color:"#fff"}}>Tout voir</button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={togglePushNotifications} disabled={pushBusy} title={pushState.iosNeedsInstall?"Sur iPhone/iPad, installez Tournal sur l’écran d’accueil":pushState.permission==="denied"?"Notifications bloquées dans les réglages du navigateur":pushState.supported?"Activer les notifications système sur cet appareil":"Vérifier la compatibilité Push de cet appareil"} className="text-xs font-black px-3 py-2 rounded-xl disabled:opacity-50 transition-all active:scale-95" style={{background:pushState.subscribed?"#dcfce7":pushState.iosNeedsInstall?"#ffedd5":pushState.permission==="denied"?"#fee2e2":pushState.supported?"#C9A227":"#fef3c7",color:pushState.subscribed?"#166534":pushState.iosNeedsInstall?"#c2410c":pushState.permission==="denied"?"#b91c1c":pushState.supported?"#ffffff":"#92400e",border:`1px solid ${pushState.subscribed?"#86efac":pushState.iosNeedsInstall?"#fdba74":pushState.permission==="denied"?"#fca5a5":pushState.supported?"#C9A227":"#fcd34d"}`}}>{pushBusy?"Vérification…":pushState.subscribed?"Push actif ✓":pushState.iosNeedsInstall?"Installer PWA":pushState.permission==="denied"?"Push bloqué":pushState.supported?"Activer Push":"Tester Push"}</button>
                {notifs.some(n=>!n.read) && (
                  <button onClick={markAllNotifsRead} className="text-xs font-bold text-muted-foreground">Tout lire</button>
                )}
                {notifs.length > 0 && (
                  <button onClick={clearAllNotifs} className="text-xs font-bold" style={{color:"#ef4444"}}>Effacer</button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto max-h-[65vh]" style={{scrollbarWidth:"none"}}>
              {notifs.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell size={28} className="mx-auto mb-3 text-muted-foreground opacity-40"/>
                  <p className="text-sm text-muted-foreground">Aucune notification</p>
                </div>
              ) : notifs.map(n => (
                <button key={n.serverId?`server-${n.serverId}`:`local-${n.id}`} onClick={()=>{
                  setNotifs(prev=>prev.map(x=>x.id===n.id?{...x,read:true}:x));
                  if (n.serverId) void markNotificationRead(n.serverId).catch(()=>undefined);
                  if (n.tab) { setTab(n.tab); if (n.filter) setNavFilter(n.filter); }
                  setNotifOpen(false);
                }} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0" style={{background:n.read?"transparent":"#3b82f608"}}>
                  <span className="text-xl leading-none mt-0.5 flex-shrink-0">{n.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold truncate flex-1">{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"/>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{new Date(n.dateRaw).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
      <NotificationCenter
        open={notificationCenterOpen}
        onClose={()=>setNotificationCenterOpen(false)}
        boutiques={boutiques.map(b=>({id:b.id,nom:b.nom}))}
        activeBoutiqueId={activeBoutiqueId!}
        canManageSettings={currentUser.isSuperAdmin || isOwner}
        onNavigate={(targetTab,filter)=>{
          const found=ALL_NAV.find(n=>n.id===targetTab);
          if(found){ setTab(found.id); if(filter) setNavFilter(filter); }
        }}
      />
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card" style={{ borderTop:"1px solid rgba(0,0,0,0.08)" }}>
        <div className="flex">
          {navPrimary.map(({ id,label,Icon })=>{const active=safeTab===id;return(
            <button key={id} onClick={()=>setTab(id)} className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 relative active:scale-95">
              {active&&<span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-b-full" style={{ background:boutique.color }}/>}
              <Icon size={22} style={{ color:active?boutique.color:"#b0a898" }}/>
              <span className="font-bold tracking-wide" style={{ fontSize:"9px",color:active?boutique.color:"#b0a898" }}>{label.toUpperCase()}</span>
            </button>
          );})}
          {navSecondary.length > 0 && (
            <button onClick={()=>setMoreOpen(o=>!o)} className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 relative active:scale-95">
              {navSecondary.some(n=>n.id===safeTab)&&<span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-b-full" style={{ background:boutique.color }}/>}
              <span className="text-xl leading-none font-black" style={{ color: navSecondary.some(n=>n.id===safeTab)?boutique.color:"#b0a898", lineHeight:"22px" }}>···</span>
              <span className="font-bold tracking-wide" style={{ fontSize:"9px", color: navSecondary.some(n=>n.id===safeTab)?boutique.color:"#b0a898" }}>PLUS</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  </ReadOnlyCtx.Provider>
  </NotifCtx.Provider>
  );
}

