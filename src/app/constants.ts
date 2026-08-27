import type { AuditEntry, Boutique, ChargeCategorie, Charge, Permission, PlatformUser } from "./types";

// ─── SEMANTIC COLOR TOKENS ────────────────────────────────────────────────────
export const SEM = {
  success: { bg:"#f0fdf4", text:"#166534", accent:"#16a34a" },
  danger:  { bg:"#fef2f2", text:"#991b1b", accent:"#dc2626" },
  warning: { bg:"#fffbeb", text:"#92400e", accent:"#d97706" },
  neutral: { bg:"#f3f4f6", text:"#374151", accent:"#6b7280" },
  role:    { bg:"#eff6ff", text:"#1d4ed8", accent:"#2563eb" },
} as const;

export const MONTHLY = [
  { m: "Jan", v: 420 }, { m: "Fév", v: 380 }, { m: "Mar", v: 510 },
  { m: "Avr", v: 470 }, { m: "Mai", v: 620 }, { m: "Jun", v: 580 }, { m: "Jul", v: 710 },
];

export const CHARGE_CATS: ChargeCategorie[] = ["Loyer","Salaires","Électricité","Transport","Achat stock","Marketing","Taxes","Autre"];
export const CHARGE_COLORS: Record<ChargeCategorie, string> = {
  "Loyer":"#6366f1","Salaires":"#ec4899","Électricité":"#f59e0b","Transport":"#3b82f6",
  "Achat stock":"#8b5cf6","Marketing":"#10b981","Taxes":"#ef4444","Autre":"#9ca3af"
};

export const INIT_CHARGES: Charge[] = [
  { id:1, label:"Loyer boutique",      montant:180000, date:"1 Jul",  dateRaw:"2026-07-01", categorie:"Loyer",      recurrence:"mensuelle"  },
  { id:2, label:"Salaire vendeur",     montant:120000, date:"5 Jul",  dateRaw:"2026-07-05", categorie:"Salaires",   recurrence:"mensuelle"  },
  { id:3, label:"Électricité",         montant:35000,  date:"10 Jul", dateRaw:"2026-07-10", categorie:"Électricité",recurrence:"mensuelle"  },
  { id:4, label:"Transport livraison", montant:25000,  date:"15 Jul", dateRaw:"2026-07-15", categorie:"Transport",  recurrence:"unique"     },
  { id:5, label:"Publicité réseaux",   montant:50000,  date:"12 Jul", dateRaw:"2026-07-12", categorie:"Marketing",  recurrence:"mensuelle"  },
  { id:6, label:"Taxes municipales",   montant:40000,  date:"3 Jul",  dateRaw:"2026-07-03", categorie:"Taxes",      recurrence:"mensuelle"  },
];

export const PLACEHOLDER_IMGS = ["photo-1558769132-cb1aea458c5e","photo-1567401893414-76b7b1e5a7a5","photo-1606041008023-472dfb5e530f","photo-1547481887-a26e2cacb5b2"];
export const SUP_COLORS  = ["#C9A227","#1E9B1E","#3b82f6","#a855f7","#f97316","#ec4899","#14b8a6","#ef4444"];
export const USER_COLORS = ["#C9A227","#3b82f6","#1E9B1E","#a855f7","#f97316","#ec4899","#14b8a6","#ef4444"];
export const ROLES       = ["Gérant","Vendeur","Vendeuse","Caissier","Livreur","Autre"];
export const ROLE_PRESETS: Record<string, Record<Permission,boolean>> = {
  "Gérant":   { dashboard:true,  stock:true,  fournisseurs:true,  clients:true,  factures:true,  remboursement:true,  charges:true,  compta:true,  vente:true,  inventaire:true,  marges:true,  encaissement_vente:true,  annulation_commande:false },
  "Vendeur":  { dashboard:true,  stock:true,  fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:true,  inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false },
  "Vendeuse": { dashboard:true,  stock:true,  fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:true,  inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false },
  "Caissier": { dashboard:true,  stock:false, fournisseurs:false, clients:true,  factures:true,  remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:true,  annulation_commande:false },
  "Livreur":  { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:true,  remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false },
  "Autre":    { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:false, remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false },
};
export const COULEURS    = ["","#C9A227","#3b82f6","#1E9B1E","#ef4444","#a855f7","#f97316","#ec4899","#6b7280","#ffffff","#000000","#8B4513"];
export const CATEGORIES_DEF = ["Wax","Bazin","Soie","Dentelle","Velours","Coton","Lin","Satin","Kente","Bogolan","Autre"];
export const NOW = Date.now();

export const PAYMENT_METHODS = ["Espèces", "Wave", "Orange Money", "Autre"] as const;
export const PM_ICON: Record<string, string> = { "Espèces":"💵", "Wave":"📱", "Orange Money":"🔶", "Autre":"💳", "Avoir client":"🎟️" };
export const PM_COLOR: Record<string, string> = { "Espèces":"#1E9B1E", "Wave":"#3b82f6", "Orange Money":"#f97316", "Autre":"#a855f7", "Avoir client":"#0f766e" };

export const inputCls = "w-full bg-muted border border-border rounded-xl px-4 py-3.5 text-base focus:outline-none";
// Search is a frequent navigation control, not a data-entry field.  Keep it
// compact so it does not dominate the operational screens on mobile.
export const searchInputCls = "w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm focus:outline-none";

// ─── SEED DATA ────────────────────────────────────────────────────────────────

const B1_AUDIT: AuditEntry[] = [
  { id: 1, userId: "u1", userNom: "Moussa Konaté",  userColor: "#C9A227", action: "Entrée stock",     detail: "Wax Ankara · +25 yards · 112 500 F", icon: "📦", timestamp: NOW - 7200000,   date: "Aujourd'hui 10:30" },
  { id: 2, userId: "u3", userNom: "Kadiatou Diallo", userColor: "#1E9B1E", action: "Nouvelle facture", detail: "F-047 · Boutique Élégance · 350 000 F", icon: "🧾", timestamp: NOW - 10800000, date: "Aujourd'hui 09:15" },
  { id: 3, userId: "u2", userNom: "Ibrahima Bah",    userColor: "#3b82f6", action: "Nouveau client",   detail: "Mode Africaine SAS (B2B) · Abidjan",   icon: "👥", timestamp: NOW - 86400000,  date: "Hier 16:42" },
];

export const INIT_BOUTIQUES: Boutique[] = [
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

export const INIT_PLATFORM_USERS: PlatformUser[] = [];
