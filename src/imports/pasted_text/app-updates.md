Implémente les modifications suivantes sur l'application. Chaque point concerne un 
écran précis — respecte le comportement décrit sans changer la logique métier.

1. ÉCRAN ACCUEIL — Période par défaut
   Change la période sélectionnée par défaut à l'ouverture : "Jour" au lieu de "Mois". 
   Les statistiques affichées (CA encaissé, charges, marge nette, etc.) doivent 
   correspondre à la journée en cours. L'utilisateur peut toujours basculer 
   manuellement vers Sem. / Mois / An, mais chaque nouvelle ouverture de l'écran 
   revient sur "Jour".

2. ÉCRAN CLIENTS — Nouveaux champs à la création
   Ajouter les champs suivants au formulaire de création, selon le type de client :
   - Particulier (B2C) : "Adresse" et "Adresse e-mail" (en plus des champs 
     existants nom/téléphone).
   - Grossiste (B2B) : "Adresse", "Adresse e-mail", et "Personne de contact" 
     (nom du contact référent chez le grossiste).
   Champs optionnels sauf indication contraire, mais visibles et clairement 
   associés au bon type de client dans le formulaire.

3. ÉCRAN FACTURES — Envoi par e-mail en PDF
   Ajouter la possibilité d'envoyer une facture par e-mail depuis sa fiche détail :
   - Génération automatique d'un PDF de la facture (logo boutique, infos client, 
     détail des produits, montant, statut de paiement).
   - Bouton "Envoyer par e-mail" utilisant l'adresse e-mail du client (point 2), 
     pré-remplie mais modifiable avant envoi.
   - Si le client n'a pas d'adresse e-mail enregistrée, proposer de la saisir 
     à la volée au moment de l'envoi.
   - L'icône d'envoi déjà présente sur les lignes de facture doit maintenant 
     proposer un choix entre "Envoyer par e-mail" et les autres canaux existants.

4. ÉCRAN ADMIN — Informations de la boutique
   Ajouter une nouvelle section dans la sidebar Admin (ex: "Boutique") permettant 
   de modifier :
   - Nom de la boutique (actuellement fixe, ex: "KDT1")
   - Adresse de la boutique
   - Adresse e-mail de la boutique (utilisée comme expéditeur pour l'envoi des 
     factures par e-mail, point 3)
   - Numéro de téléphone de la boutique
   Ces informations doivent aussi alimenter l'en-tête du PDF de facture généré 
   au point 3.

5. IMPRESSION — Séparer bons de commande et tickets de caisse
   Scinder l'impression automatique en deux documents distincts et configurables 
   séparément :
   - Bon de commande : document détaillé destiné au client/fournisseur (produits, 
     quantités, prix, conditions).
   - Ticket de caisse : reçu court format imprimante thermique, pour la remise 
     immédiate au client au comptoir.
   Chaque type doit pouvoir être activé/désactivé et paramétré indépendamment 
   (ex: imprimante associée, déclenchement automatique ou manuel).

6. ÉCRAN STOCK — Référence produit à l'ajout
   Lors de l'ajout ou la mise à jour d'une quantité en stock, ajouter un champ 
   permettant à l'utilisateur de saisir une référence produit (SKU ou code interne) 
   associée à ce mouvement de stock. Ce champ doit être visible dans l'historique 
   des mouvements de stock pour assurer la traçabilité.

7. ENCAISSEMENT — Mode de paiement par défaut
   Lors de l'encaissement d'un paiement, le mode de paiement présélectionné par 
   défaut doit être "Espèces". L'utilisateur reste libre de changer vers un autre 
   moyen de paiement disponible avant de valider.

8. ÉCRAN FACTURES — Vente par lot ou à la pièce pour les clients hors comptoir
   Actuellement, la vente unitaire est le seul mode disponible lors de l'édition 
   d'une facture. Pour les clients hors comptoir (grossistes), ajouter la 
   possibilité de sélectionner la quantité par lot OU à la pièce lors de l'ajout 
   d'un produit à la facture, selon la façon dont l'article est vendu.

9. SÉCURITÉ — Verrouillage après inactivité
   Si aucune action n'est effectuée pendant 10 minutes, verrouiller la session 
   en cours (retour à un écran de déverrouillage type code PIN, sans déconnecter 
   complètement l'utilisateur). L'utilisateur doit ressaisir son code pour 
   reprendre là où il en était.

10. ÉCRAN VENTE — Mode de vente par défaut à la sélection d'un produit
    Lorsqu'un produit est sélectionné dans l'écran Vente, le mode "à la pièce" 
    (unitaire) doit être sélectionné par défaut. L'utilisateur peut ensuite 
    basculer manuellement vers la vente par lot si le produit le permet.

11. CLIENTS / FOURNISSEURS — Indicatif téléphonique modifiable
    L'application est utilisée principalement au Sénégal (+221), mais certains 
    clients ou fournisseurs peuvent avoir un numéro à l'étranger. Sur les 
    formulaires de création/édition de client et de fournisseur, remplacer le 
    préfixe fixe +221 par un sélecteur d'indicatif international modifiable, 
    avec +221 comme valeur par défaut.

12. ÉCRAN STOCK — Filtres et tri
    Ajouter des options de filtre (par catégorie, par statut de stock : OK/Bas/
    Critique) et de tri (par nom, par quantité, par valeur) sur l'écran Stock, 
    en plus de la recherche existante.

13. ÉCRAN STOCK — Repositionner le bouton "Recevoir"
    Le bouton "Recevoir" (réception de stock) est actuellement en bas de la 
    fiche produit, nécessitant un défilement long. Le repositionner juste après 
    le bouton "Modifier", en haut ou dans une zone visible sans scroll.

14. ÉCRAN FOURNISSEURS — Afficher les sorties (paiements)
    Actuellement l'écran Fournisseurs n'affiche que les entrées (livraisons/
    achats). Ajouter l'affichage des sorties : chaque paiement effectué à un 
    fournisseur (comptant ou acompte) doit apparaître dans l'historique du 
    fournisseur, avec la date, le montant et le mode de paiement.

15. ÉCRAN ACCUEIL — Supprimer les comptes de démonstration
    Retirer les comptes ou données de démonstration actuellement visibles sur 
    l'écran Accueil.

16. IMPRESSION — Marquer les réimpressions comme "Duplicata"
    Lorsqu'un ticket de caisse est réimprimé (impression déjà effectuée une 
    première fois), la mention "DUPLICATA" doit apparaître clairement sur 
    l'exemplaire réimprimé pour le distinguer de l'original.

17. SÉCURITÉ — Expiration de session
    Actuellement la session reste active indéfiniment, y compris après 
    fermeture et réouverture du navigateur. Mettre en place une expiration de 
    session : après une durée définie (ex: 12h ou 24h, à préciser selon le 
    besoin), l'utilisateur doit se reconnecter complètement (identifiants), 
    même si le navigateur a été fermé entre-temps. Ce mécanisme est distinct 
    du verrouillage par inactivité du point 9 : le verrouillage protège un 
    poste laissé sans surveillance quelques minutes, l'expiration protège 
    contre une session ouverte indéfiniment sur un appareil.

Pour chaque écran modifié, garde la cohérence visuelle et le système de couleurs 
déjà en place (couleur d'accent réservée à la navigation active et au CTA principal 
uniquement, couleurs sémantiques vert/rouge/ambre/gris réservées aux états réels : 
payé/impayé/attente/neutre).