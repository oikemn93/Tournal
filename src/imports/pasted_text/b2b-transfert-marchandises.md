# Refonte du module B2B – Transfert de marchandises

## Objectif

Refondre le module **Transfert de marchandises B2B** afin qu'il fonctionne comme un véritable flux logistique entre boutiques, avec un annuaire de partenaires, un workflow de validation, une génération automatique de facture et un historique complet.

---

# 1. Créer un nouvel onglet « Annuaire B2B »

Le module de transfert ne doit plus afficher l'ensemble des boutiques (tenants) de la plateforme.

Créer un onglet **Annuaire B2B** accessible selon les droits utilisateurs.

Chaque boutique gère son propre annuaire de partenaires.

## Fonctionnement

L'ajout d'un partenaire se fait uniquement à partir de son **numéro de téléphone**.

Lorsqu'un numéro est saisi :

* rechercher toutes les boutiques associées à ce numéro ;
* créer un seul contact dans l'annuaire ;
* associer automatiquement les boutiques trouvées à ce contact.

Exemple :

Téléphone :

+221 77 123 45 67

Résultat :

* Boutique Dakar Centre
* Boutique Liberté 6
* Boutique Thiès

Le contact apparaît une seule fois dans l'annuaire.

Chaque utilisateur ne voit que les partenaires qu'il a lui-même ajoutés.

Il ne doit plus être possible de parcourir l'ensemble des boutiques de la plateforme.

---

# 2. Création d'un transfert

Le workflow devient :

1. Sélectionner un partenaire dans l'annuaire.
2. Si ce partenaire possède une seule boutique, elle est sélectionnée automatiquement.
3. Si plusieurs boutiques sont associées au même numéro de téléphone, demander à l'utilisateur de choisir la boutique destinataire.
4. Composer le transfert.

---

# 3. Gestion des lignes de transfert

Le transfert doit permettre d'envoyer des marchandises :

* par lot ;
* par pièce ;
* par unité de vente.

Chaque ligne doit contenir :

* Produit
* Quantité en lots
* Quantité en pièces
* Quantité en unités de vente
* Prix de cession unitaire (modifiable)
* Remise éventuelle (optionnelle)
* Montant calculé automatiquement

Le **prix de cession** est défini au moment du transfert et sera repris dans la facture B2B.

Le **prix d'achat (PPI)** ne doit pas être saisi dans ce module. Il reste une donnée interne servant à la valorisation du stock et au calcul des marges.

---

# 4. Cycle de vie du transfert

À la création :

* enregistrer le transfert ;
* statut = **En attente** ;
* ne modifier aucun stock.

Le destinataire reçoit une demande de transfert.

Il peut :

* Accepter
* Refuser

---

# 5. Acceptation du transfert

Lorsqu'un transfert est accepté :

1. Vérifier que l'expéditeur possède toujours les quantités demandées.

2. Si le stock est insuffisant :

* empêcher l'acceptation ;
* afficher les produits en rupture ou insuffisants.

3. Si le stock est suffisant :

* déduire le stock de l'expéditeur ;
* ajouter le stock au destinataire ;
* générer automatiquement une facture B2B ;
* associer cette facture au transfert ;
* enregistrer l'opération dans le journal d'activité.

Le stock ne doit jamais être modifié avant l'acceptation.

---

# 6. Génération automatique de la facture

À l'acceptation, créer automatiquement une facture B2B contenant :

* Numéro de facture
* Date
* Boutique expéditrice
* Boutique destinataire
* Produits
* Quantités
* Prix de cession
* Montants
* Total
* Statut

Cette facture devient la référence commerciale du transfert.

---

# 7. Historique des transferts

Créer un historique complet des transferts entrants et sortants.

Chaque ligne doit afficher :

* Date
* Type (Entrée / Sortie)
* Boutique concernée
* Statut
* Nombre de produits
* Montant total
* Lien vers la facture

Le lien ouvre directement la facture générée.

Des filtres doivent permettre de rechercher par :

* période ;
* partenaire ;
* statut ;
* numéro de facture.

---

# 8. États du transfert

Chaque transfert possède un statut :

* En attente
* Accepté
* Refusé
* Annulé

Ces statuts doivent être visibles dans toutes les listes ainsi que dans l'historique.

---

# 9. Sécurité

Chaque boutique ne peut consulter que :

* son propre annuaire B2B ;
* ses transferts envoyés ;
* ses transferts reçus.

Aucun utilisateur ne doit pouvoir accéder à la liste globale des boutiques de la plateforme.

---

# 10. Règles métier

* Aucun mouvement de stock lors de la création d'un transfert.
* Le stock est décrémenté chez l'expéditeur uniquement après acceptation.
* Le stock est incrémenté chez le destinataire uniquement après acceptation.
* Une facture B2B est générée automatiquement après acceptation.
* Chaque transfert est lié à une facture unique.
* L'historique doit permettre d'ouvrir directement la facture associée.
* Les montants de la facture correspondent aux prix de cession saisis lors du transfert.
* Un même numéro de téléphone peut être associé à plusieurs boutiques.
* L'annuaire contient un seul contact par numéro de téléphone ; si plusieurs boutiques sont associées, le choix de la boutique de destination se fait au moment de la création du transfert.
* Le prix d'achat (PPI) ne doit jamais être demandé dans le processus de transfert, afin de garantir la cohérence de la valorisation des stocks.
