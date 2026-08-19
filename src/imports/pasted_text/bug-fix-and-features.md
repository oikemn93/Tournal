Plusieurs corrections et vérifications à traiter, sans t'arrêter pour 
validation intermédiaire — je testerai moi-même après, budget de temps 
limité.

RAPPEL DE PRINCIPE — Sécurité Supabase (à appliquer à CHAQUE point ci-dessous)
Toute nouvelle donnée sensible, tout nouveau droit, toute nouvelle table ou 
colonne doit être protégée par RLS côté Supabase, pas seulement filtrée côté 
client. Un utilisateur sans droit ne doit jamais pouvoir accéder à une 
donnée en appelant l'API directement, même s'il ne la voit pas dans 
l'interface. Applique ce principe systématiquement, sans que j'aie à te le 
redemander à chaque point.

═══════════════════════════════════════════════════════
1. BUG — Détail de facture ne s'affiche pas lors de l'encaissement
═══════════════════════════════════════════════════════
Dans l'écran Factures, au moment d'encaisser une facture, le détail de la 
facture (lignes produits, quantités, prix) ne s'affiche pas. Diagnostique la 
cause (requête manquante, mauvaise référence d'ID, erreur silencieuse) et 
corrige pour que le détail complet soit visible pendant l'encaissement.

═══════════════════════════════════════════════════════
2. MARGE BRUTE À L'ENCAISSEMENT — Avec droit dédié, protégé par RLS
═══════════════════════════════════════════════════════
Ajoute l'affichage de la marge brute (prix de vente − prix d'achat, coût 
FIFO déjà en place) sur l'écran d'encaissement, pour chaque article de la 
facture.

- Cette marge doit être visible UNIQUEMENT si l'utilisateur a un droit 
  dédié (réutilise le droit "marges" déjà existant dans le système de 
  permissions, ou crée-le s'il n'existe pas encore).
- Protection CÔTÉ SERVEUR obligatoire : si la marge est calculée côté client 
  à partir de données (prix d'achat) déjà présentes dans la réponse API, un 
  utilisateur sans droit "marges" pourrait quand même la voir en inspectant 
  la requête réseau. Si c'est le cas, restreins la donnée prix_achat 
  elle-même dans la réponse API pour les utilisateurs sans ce droit (RLS ou 
  filtrage explicite côté RPC), pas seulement un masquage visuel côté 
  interface.

═══════════════════════════════════════════════════════
3. MARGE DANS LES RAPPORTS
═══════════════════════════════════════════════════════
Reporte cette même marge brute (et la marge nette déjà spécifiée 
précédemment : CA − toutes charges) dans le module Rapport, avec la même 
protection par droit "marges" que le point 2.

═══════════════════════════════════════════════════════
4. SUPPRIMER LE POLLING TOUTES LES 2 SECONDES, S'IL EXISTE ENCORE
═══════════════════════════════════════════════════════
Vérifie s'il reste un mécanisme de polling (setInterval interrogeant le 
serveur à intervalle fixe) quelque part dans le code actuel — ça avait été 
supprimé au profit de Supabase Realtime lors d'une migration précédente, 
mais vérifie qu'aucune régression ne l'a réintroduit (notamment dans les 
écrans plus récents comme POSView ou FacturesView modifiés récemment). Si 
trouvé, supprime-le et remplace par un abonnement Realtime scopé par 
boutique, cohérent avec le reste de l'application.

═══════════════════════════════════════════════════════
5. INVENTAIRE ET TRANSFERTS — Non opérationnels du tout
═══════════════════════════════════════════════════════
Ces deux écrans ne fonctionnent pas du tout actuellement. Diagnostique 
d'abord la cause avant de corriger :
- Sont-ils encore sur l'ancienne architecture (composants historiques 
  App.tsx, non connectés aux RPC/tables relationnelles), comme identifié 
  dans un audit précédent ?
- Y a-t-il des erreurs bloquantes (console, réseau, RLS) qui empêchent tout 
  affichage ?
Rends-les fonctionnels de bout en bout : Inventaire (démarrage de session, 
comptage, rapport d'écarts avec marges, validation, historique) et 
Transferts (création, acceptation, règles de CA selon même propriétaire vs 
propriétaires différents déjà spécifiées précédemment, génération de 
compte fournisseur et charge le cas échéant).

═══════════════════════════════════════════════════════
6. VÉRIFICATION — Droit d'encaissement dans Vente (encaissement_vente)
═══════════════════════════════════════════════════════
Ce droit a déjà été implémenté lors d'une session précédente (permission 
encaissement_vente, RPC record_express_payment séparée de record_payment). 
Vérifie que c'est bien fonctionnel de bout en bout :
- Un utilisateur SANS ce droit, en Vente express, ne doit voir AUCUNE option 
  d'encaissement — juste la validation de commande en attente.
- Un utilisateur AVEC ce droit peut encaisser directement en Vente express.
- La protection est bien vérifiée côté serveur (RPC), pas seulement 
  masquée côté interface.
Si un écart est trouvé par rapport à ce comportement attendu, corrige-le.

═══════════════════════════════════════════════════════
7. PAIEMENT MULTI-MODE DANS L'ÉCRAN D'ENCAISSEMENT
═══════════════════════════════════════════════════════
L'écran d'encaissement (Factures, et Vente express si le droit est actif) ne 
propose actuellement qu'un seul mode de paiement par transaction. Ajoute la 
possibilité de scinder le paiement d'une même facture entre plusieurs modes 
simultanément (ex: 5000F espèces + 3000F Wave sur une facture de 8000F) :
- Interface : liste des modes de paiement utilisés avec le montant affecté 
  à chacun, total devant correspondre exactement au montant à encaisser 
  avant validation.
- Utilise la RPC de paiement déjà en place (record_payment / 
  record_express_payment) en l'adaptant pour accepter plusieurs lignes de 
  paiement en une seule transaction atomique, plutôt que plusieurs appels 
  séparés qui pourraient laisser un état incohérent en cas d'échec partiel.
- Le ticket/la facture doit détailler la répartition par mode de paiement.
- Les rapports (répartition par mode de paiement) doivent refléter cette 
  répartition par facture, pas un mode unique.

═══════════════════════════════════════════════════════
8. SUPERADMIN — Droits complets sur toutes les boutiques
═══════════════════════════════════════════════════════
Le SuperAdmin de l'application doit avoir :
- Le droit de réaliser TOUTES les actions dans TOUTES les boutiques (accès 
  complet, sans restriction par boutique_id contrairement aux propriétaires).
- La capacité de créer des comptes propriétaires (rattachés à une nouvelle 
  boutique ou existante).
- La capacité de modifier n'importe quel utilisateur et de réinitialiser 
  son mot de passe/code, quelle que soit la boutique.
Vérifie que les policies RLS actuelles (owner-scoped, mises en place lors du 
chantier précédent sur la gestion des employés) laissent bien un passe-droit 
complet pour is_super_admin = true sur toutes les tables concernées 
(platform_users, boutique_assignments, boutiques) — le scoping par 
propriétaire ne doit s'appliquer qu'aux propriétaires normaux, jamais 
restreindre le SuperAdmin.

═══════════════════════════════════════════════════════
9. VÉRIFICATION — Propriétaire peut créer/modifier son équipe et leurs mdp
═══════════════════════════════════════════════════════
Ce point a déjà été implémenté lors du chantier précédent (admin-provision 
owner-scoped). Vérifie que c'est bien fonctionnel : un propriétaire peut 
créer un employé de SA boutique (code à 6 chiffres généré et affiché), 
modifier son rôle/droits, et réinitialiser son code — strictement limité à 
SA boutique, sans pouvoir toucher aux employés d'une autre boutique.

Donne-moi un rapport compact à la fin : ce qui est fait/vérifié, ce qui 
reste incomplet, et tout point où le RLS n'a pas pu être vérifié faute 
d'accès Supabase direct dans cette session.