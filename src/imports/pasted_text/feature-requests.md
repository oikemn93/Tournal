Plusieurs sujets à traiter, chacun testé individuellement avant validation.

1. PERMISSION MARGE — À ajouter et corriger l'affichage dans Stock
   La permission utilisée pour restreindre l'accès à la marge n'apparaît pas 
   dans la liste des permissions configurables (Admin > Sécurité > Droits). 
   Ajoute une permission explicite et nommée clairement (ex: "Voir les marges 
   / rentabilité"), visible et activable/désactivable comme les autres 
   permissions granulaires existantes.
   
   Corrige ensuite l'affichage de la section Rentabilité dans Stock, 
   actuellement invisible malgré cette permission :
   - Vérifie que la condition d'affichage est bien reliée à cette NOUVELLE 
     permission, pas à l'ancienne condition cachée (Propriétaire OU 
     droits.compta).
   - Teste avec un compte ayant explicitement activé cette permission, 
     confirme que la section apparaît.
   - Si aucune donnée FIFO n'est encore disponible, affiche un message clair 
     "Aucune donnée de marge disponible pour l'instant" plutôt qu'une section 
     qui semble absente ou cassée.

2. MARGES DANS LES RAPPORTS
   La marge par produit/vente doit aussi être visible dans le module Rapport 
   (ComptabiliteView). Ajoute une section ou un indicateur de marge globale 
   sur la période sélectionnée (marge brute totale, taux de marge moyen), 
   cohérente avec le calcul FIFO déjà en place, soumise à la même permission 
   "Voir les marges".

3. BUG COMPTABLE CRITIQUE — CA des transferts inter-boutiques, selon la 
   relation entre les boutiques
   Actuellement, tout transfert de stock accepté génère une facture comptée 
   comme une vraie vente dans le CA du destinataire, quelle que soit la 
   relation entre les deux boutiques — c'est incorrect dans un cas, correct 
   dans l'autre. La règle doit distinguer :

   - Transfert entre boutiques du MÊME propriétaire (peu importe si elles 
     sont dans un Groupe ou non) : PAS une vente. Simple mouvement de stock 
     interne — aucun impact sur le CA ni la marge d'aucune des deux 
     boutiques, dans un sens comme dans l'autre.
   
   - Transfert entre boutiques de propriétaires DIFFÉRENTS (même Groupe ou 
     totalement indépendantes) : VRAIE VENTE commerciale entre deux entités 
     distinctes. Doit compter normalement dans le CA et la marge du vendeur 
     (boutique expéditrice), et comme un achat/coût pour le destinataire — 
     comme n'importe quelle vente/achat entre deux tiers.

   Implémentation :
   - À la création du transfert, détermine si les deux boutiques appartiennent 
     au même propriétaire (comparaison directe des comptes propriétaires 
     assignés).
   - Si même propriétaire : marque l'écriture "Transfert interne" (type 
     distinct), exclue de tous les calculs de CA/marge/statistiques.
   - Si propriétaires différents : traite comme une vente normale — statut 
     de paiement réel à l'acceptation (pas automatiquement "Payé", modifiable 
     ensuite comme toute facture), intégrée normalement au CA/marge de 
     l'expéditeur une fois payée, et comme un achat/entrée de stock avec un 
     vrai coût pour le destinataire.
   - Vérifie cette logique aux deux points où elle s'applique : à la création 
     du transfert (déterminer le bon type d'écriture), et dans tous les 
     calculs de CA/marge (Accueil, Rapport, Rentabilité).

   Priorité absolue sur ce point — impact direct sur des chiffres financiers 
   déjà faussés.

4. PAIEMENT MULTI-MODE SUR UNE MÊME FACTURE
   Ajoute la possibilité de scinder le paiement d'une même facture entre 
   plusieurs modes simultanément (ex: 5000F espèces + 3000F Wave sur une 
   facture de 8000F), à l'écran de caisse (Vente) et sur l'encaissement d'une 
   facture existante (Factures).
   - Interface : liste des modes utilisés avec montant affecté à chacun, 
     total devant correspondre exactement au montant de la facture.
   - Le ticket/la facture doit détailler la répartition par mode de paiement.
   - Les rapports (répartition par mode de paiement) doivent refléter cette 
     répartition par facture, pas un mode unique.

5. RAPPORT D'INVENTAIRE — Prix d'achat/vente/marge cassés
   Le rapport d'inventaire est censé afficher prix d'achat, prix de vente et 
   marge, mais ce n'est pas correct actuellement. Diagnostique précisément 
   ce qui ne fonctionne pas (valeur absente, mal calculée, mal affichée), 
   puis corrige en utilisant le même calcul de coût par lot (FIFO) que la 
   marge par vente.

6. FACTURE PDF — Trop colorée, à rendre professionnelle
   Refonds la palette du template de facture :
   - Texte et éléments graphiques (bordures, tableaux, lignes) en noir/gris, 
     sans couleur d'accent.
   - Seule exception : le logo de la boutique, s'il est configuré, garde ses 
     couleurs d'origine, centré en haut.
   - Le badge de statut de paiement reste lisible mais sobre (encadré noir, 
     texte en gras, plutôt qu'un badge coloré).
   - Garde la même structure et hiérarchie d'information, seule la palette 
     change.

Traite chaque point séparément. Priorise le point 3 (impact financier direct). 
Pour chacun, confirme avec un test réel :
- Permission + section Rentabilité visibles dans Stock.
- Marge affichée dans un Rapport généré.
- Transfert entre boutiques du même propriétaire → CA inchangé des deux côtés.
- Transfert entre boutiques de propriétaires différents du même Groupe → 
  apparaît comme une vente réelle dans le CA de l'expéditeur, statut de 
  paiement correct et modifiable.
- Facture réglée avec deux modes de paiement différents.
- Rapport d'inventaire avec des chiffres cohérents.
- PDF de facture en noir/gris avec uniquement le logo en couleur.