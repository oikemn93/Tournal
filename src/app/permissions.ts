import type { Permission } from "./types";

export const PERMISSION_KEYS = [
  "dashboard", "stock", "fournisseurs", "clients", "factures", "remboursement",
  "charges", "compta", "vente", "encaissement_vente", "inventaire", "marges",
  "annulation_commande", "decaissement", "transferts",
] as const satisfies readonly Permission[];

export const ROLE_PRESETS: Record<string, Record<Permission, boolean>> = {
  "Gérant":   { dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true, encaissement_vente:true, annulation_commande:false, transferts:true, decaissement:false },
  "Vendeur":  { dashboard:true, stock:true, fournisseurs:false, clients:true, factures:true, remboursement:false, charges:false, compta:false, vente:true, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false, transferts:true, decaissement:false },
  "Vendeuse": { dashboard:true, stock:true, fournisseurs:false, clients:true, factures:true, remboursement:false, charges:false, compta:false, vente:true, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false, transferts:true, decaissement:false },
  "Caissier": { dashboard:true, stock:false, fournisseurs:false, clients:true, factures:true, remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:true, annulation_commande:false, transferts:false, decaissement:false },
  "Livreur":  { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:true, remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false, transferts:false, decaissement:false },
  "Autre":    { dashboard:false, stock:false, fournisseurs:false, clients:false, factures:false, remboursement:false, charges:false, compta:false, vente:false, inventaire:false, marges:false, encaissement_vente:false, annulation_commande:false, transferts:false, decaissement:false },
};
