# Tournal

Application de gestion de boutique textile, stock, ventes, facturation, caisse, clients, fournisseurs et transferts, avec une architecture hybride en cours de migration vers Supabase relationnel.

## Vue d’ensemble

Tournal est une application métier pensée pour plusieurs boutiques d’un même réseau.

Elle permet de :

- gérer le stock
- vendre en boutique
- créer et encaisser des factures
- suivre les clients et fournisseurs
- saisir les charges
- gérer les sessions de caisse
- réaliser des inventaires
- effectuer des transferts inter-boutiques
- imprimer via QZ Tray
- générer et stocker des PDF de factures
- produire des rapports de gestion

Le projet a été progressivement déplacé d’un ancien modèle basé sur un gros état JSON/KV vers un modèle relationnel Supabase.

## Actions déjà réalisées

### Audit et migration

- audit de l’ancienne architecture et du nouveau projet Supabase
- inventaire des boutiques, groupes, utilisateurs et affectations hérités
- migration/restauration des boutiques dans le nouveau Supabase
- migration/restauration des groupes
- restauration d’une partie importante des utilisateurs
- remise en place de nombreuses affectations boutique / utilisateur
- reconstitution de la configuration métier principale

### Frontend

- bascule progressive de plusieurs écrans vers les composants relationnels
- connexion de :
  - Stock
  - Factures
  - Vente / POS
  - Clients
  - Fournisseurs
  - Charges
  - Rapport / comptabilité
- suppression du bouton de création de compte sur l’écran de connexion
- maintien d’une couche de compatibilité pour les écrans encore hérités

### Backend Supabase

- mise en place d’une fonction admin `admin-provision`
- support de :
  - création de boutique
  - création d’utilisateur
  - réinitialisation de mot de passe
  - assignation / désassignation d’utilisateurs à une boutique
- validation côté serveur des sessions applicatives
- abonnement temps réel filtré par boutique
- fonction `qz-sign` pour signer les requêtes QZ côté serveur
- fonction planifiée `cleanup-invoice-pdfs` pour nettoyer les fichiers PDF expirés

### Impression et documents

- support prévu pour QZ Tray
- préparation du certificat public côté client
- génération et stockage des PDF de facture dans Supabase Storage

## Architecture

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Radix UI / shadcn-style primitives
- MUI
- Lucide Icons
- Recharts
- Sonner pour les notifications

### Backend

- Supabase Auth
- Supabase PostgreSQL
- Supabase Realtime
- Supabase Storage
- Supabase Edge Functions

### Services annexes

- QZ Tray pour l’impression thermique
- PDF générés côté client
- nettoyage automatique des PDF côté backend

## Structure du projet

### Fichiers principaux

- `src/app/App.tsx`  
  Shell principal de l’application, navigation, login, anciennes vues et intégration des écrans relationnels.

- `src/lib/api.ts`  
  Client Supabase côté navigateur, auth, session, appels admin, realtime, lecture de données.

- `src/app/screens/`  
  Écrans métier relationnels.

- `supabase/functions/admin-provision/index.ts`  
  Fonction Edge pour les actions administrateur.

- `supabase/functions/qz-sign/index.ts`  
  Signature serveur pour QZ Tray.

- `supabase/functions/cleanup-invoice-pdfs/index.ts`  
  Nettoyage planifié des PDF de factures.

- `migration/20260813_restore_boutique_visuals.sql`  
  Script de restauration / ajustement lié à la migration.

- `src/imports/pasted_text/migration-log.txt`  
  Journal de migration et retour d’exécution.

## Écrans de l’application

### Écrans branchés sur le modèle relationnel

- Stock
- Factures
- Vente / POS
- Clients
- Fournisseurs
- Charges
- Rapport / comptabilité

### Écrans encore largement hérités

- Dashboard / Accueil
- Inventaire physique
- Transferts
- Admin

L’application fonctionne aujourd’hui avec une logique hybride :

- les écrans métiers les plus critiques ont été branchés sur Supabase relationnel
- les écrans historiques plus complexes restent encore partiellement intégrés dans `App.tsx`

## Modèle métier

### Entités principales

- `boutiques`
- `platform_users`
- `boutique_assignments`
- `groupes`
- `products`
- `stock_entries`
- `invoices`
- `invoice_lines`
- `clients`
- `suppliers`
- `charges`
- `caisse_sessions`
- `categories`
- `product_params`
- `transfers`
- `inventaires`

### Principes de gestion

- une boutique est l’unité principale de données
- chaque boutique possède ses produits, clients, factures, charges et sessions de caisse
- les droits sont gérés par affectation boutique / utilisateur
- les opérations sensibles passent par le backend ou par des règles de base de données

## Authentification

La connexion se fait via :

- numéro de téléphone
- mot de passe

Le téléphone est transformé en email interne de type :

- `221XXXXXXXX@tournal.internal`

Le flux d’authentification comprend :

- connexion Supabase Auth
- stockage local de la session
- validation serveur de la session
- validation d’accès à la boutique active

## Permissions

Le système distingue plusieurs rôles :

- owner
- manager
- employee

Et des permissions métier :

- dashboard
- stock
- fournisseurs
- clients
- factures
- remboursement
- charges
- compta
- vente
- inventaire
- marges

Certaines fonctionnalités avancées dépendent aussi du statut de super admin.

## Temps réel

L’application écoute les changements Supabase par boutique sur :

- `products`
- `stock_entries`
- `invoices`
- `invoice_lines`
- `clients`
- `charges`
- `caisse_sessions`

Objectif :

- éviter le polling agressif
- mettre à jour seulement la boutique concernée
- garder les données cohérentes pour plusieurs utilisateurs connectés en même temps

## Impression QZ

L’impression thermique repose sur QZ Tray.

Le serveur fournit une signature via `qz-sign`, afin d’éviter d’exposer une clé privée au navigateur.

Le fonctionnement attendu est :

1. le frontend prépare la requête d’impression
2. le backend signe la requête
3. QZ Tray exécute l’impression localement sur le poste utilisateur

## Factures et PDF

Les factures peuvent être :

- créées
- encaissées totalement ou partiellement
- retournées
- exportées en PDF

Les PDF sont stockés dans Supabase Storage, dans le bucket :

- `invoice-pdfs`

Un nettoyage automatique supprime les fichiers expirés.

## Session de caisse

Le module POS / caisse gère :

- ouverture de caisse
- fond de caisse
- fermeture de caisse
- historique de caisse

## Fichiers de configuration Supabase

### `supabase/README.md`

Liste les migrations déjà appliquées :

- `tournal_additive_relational_schema`
- `tournal_harden_internal_functions_and_auth_profile`
- `tournal_secure_compatibility_state`
- `restrict_profile_writes_to_super_admins`
- `optimize_profile_select_policy`
- `index_fk_columns_for_growth`

### `supabase/config.toml`

Contient la configuration des Edge Functions et des tâches planifiées.

## Variables d’environnement

Les variables exactes peuvent évoluer selon le déploiement, mais les plus importantes sont :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QZ_PRIVATE_KEY`

## Scripts

Dans l’état actuel du projet :

- `npm run dev` : démarre le serveur de développement
- `npm run build` : construit l’application pour la production

## État actuel

Ce qui est déjà en place :

- base relationnelle Supabase
- auth et session
- admin provisioning
- realtime boutique
- support QZ côté serveur
- nettoyage des PDFs
- plusieurs écrans métiers déjà branchés sur les nouvelles tables

Ce qui reste le plus sensible :

- harmonisation complète de tous les écrans historiques
- finalisation des transferts et de l’inventaire
- cohérence totale entre ancienne logique et nouvelle architecture
- vérifications de fin de migration sur toutes les boutiques et tous les comptes

## Notes de migration

Le projet a volontairement conservé certaines couches de compatibilité pendant la transition, afin de ne pas casser les écrans encore hérités le temps de la migration.

L’objectif final est :

- une seule source de vérité relationnelle dans Supabase
- des écrans métier branchés sur cette source
- plus de dépendance au gros blob JSON historique

## Références utiles

- [Journal de migration](src/imports/pasted_text/migration-log.txt)
- [Notes fonctionnelles](src/imports/pasted_text/app-updates.md)
- [Guidelines internes](guidelines/Guidelines.md)

