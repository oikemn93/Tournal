Je veux que tu mettes à jour l’application existante sans casser les fonctionnalités déjà opérationnelles. Analyse d’abord les écrans, composants, tables et flux existants, puis applique les changements ci-dessous en réutilisant au maximum le design system et les composants actuels.

# 1. Super Admin — Youssou Niang

Le compte **Youssou Niang** doit être considéré comme **Super Admin global de l’application**.

Le Super Admin doit avoir les droits nécessaires pour :

* lire toutes les données de l’application ;
* créer des données dans toutes les tables nécessaires au fonctionnement de l’application ;
* modifier les données de toutes les boutiques ;
* administrer les utilisateurs ;
* administrer les boutiques ;
* administrer les groupes de boutiques ;
* intervenir sur les transferts et opérations nécessitant une administration globale.

Les permissions doivent être appliquées **côté backend/base de données et pas uniquement dans l’interface**.

Ne pas simplement masquer ou afficher des boutons selon le rôle : les règles d’autorisation réelles doivent permettre au Super Admin d'effectuer ces opérations.

Si l’application utilise Supabase/RLS ou un autre système de permissions, adapter proprement les policies sans rendre les tables publiquement modifiables et sans contourner la sécurité pour les autres utilisateurs.

# 2. Accueil Super Admin

Après connexion, Youssou Niang doit arriver sur son dashboard Super Admin.

Organiser l’administration avec au minimum les onglets suivants :

### Boutiques

Afficher la liste de toutes les boutiques de l’application.

Prévoir :

* recherche ;
* consultation des informations d’une boutique ;
* propriétaire ;
* téléphone ;
* statut ;
* groupe éventuel ;
* accès à la fiche détaillée ;
* modification lorsque cela est autorisé.

### Utilisateurs

Afficher **tous les utilisateurs existants de l’application**.

Il y a actuellement un bug : les utilisateurs existants ne se chargent pas.

Identifier la cause et corriger le chargement des utilisateurs.

Pour chaque utilisateur, permettre au Super Admin de :

* consulter ses informations ;
* identifier les boutiques auxquelles il est rattaché ;
* voir son rôle ;
* modifier ses informations ;
* modifier son rôle ou ses accès lorsque cela est pertinent ;
* activer/désactiver son accès si cette fonctionnalité existe ;
* déclencher une procédure sécurisée de réinitialisation du mot de passe.

IMPORTANT : ne jamais afficher ni récupérer les mots de passe actuels. La réinitialisation doit utiliser le mécanisme sécurisé du système d’authentification existant.

Prévoir également les états :

* chargement ;
* liste vide ;
* erreur de chargement ;
* recherche sans résultat.

### Groupes de boutiques

Créer/conserver un onglet permettant d’afficher tous les groupes de boutiques.

Le Super Admin doit pouvoir consulter :

* nom du groupe ;
* boutiques appartenant au groupe ;
* propriétaires concernés ;
* nombre de boutiques ;
* informations utiles déjà présentes dans le modèle de données.

Permettre également la gestion des groupes si le backend existant le permet.

# 3. Transfert de produits

Ne pas casser le transfert existant entre magasins appartenant au **même propriétaire**.

Ce fonctionnement existe déjà et doit continuer à fonctionner normalement.

Il faut maintenant prendre en charge correctement le transfert entre **deux boutiques appartenant à des propriétaires différents**.

# 4. Nouvel onglet « Annuaire » dans Transfert

Dans l’interface de transfert, ajouter un onglet :

**Annuaire**

Cet annuaire sert à trouver une boutique appartenant à un autre propriétaire.

Permettre de rechercher une boutique principalement à partir de son **numéro de téléphone**.

Le résultat doit afficher suffisamment d’informations pour éviter d’envoyer des marchandises à la mauvaise boutique :

* nom de la boutique ;
* numéro de téléphone ;
* propriétaire ou identité commerciale pertinente ;
* adresse/localisation si disponible ;
* autres informations utiles déjà présentes dans l’application.

L’utilisateur sélectionne ensuite la boutique destinataire et poursuit la création du transfert.

Ne pas exposer dans l’annuaire des données personnelles ou administratives qui ne sont pas nécessaires au transfert.

# 5. Transfert entre propriétaires différents

Lorsque la boutique A transfère/vend des produits à une boutique B appartenant à **un autre propriétaire**, le système doit traiter cette opération différemment d’un simple transfert interne.

Lors de la validation, effectuer de manière cohérente les opérations suivantes :

**Boutique émettrice A**

1. Créer le transfert.
2. Enregistrer les produits et quantités transférés.
3. Mettre à jour le stock selon le workflow existant.
4. Générer automatiquement la facture correspondant à l’opération.
5. Associer cette facture à la boutique destinataire B.

**Boutique réceptrice B**

6. Créer automatiquement une **charge en attente de paiement** correspondant à la facture émise par A.
7. Associer cette charge à la boutique émettrice, à la facture et au transfert d’origine.
8. Afficher clairement son statut : **En attente de paiement**.

La facture chez l’émetteur et la charge chez le destinataire doivent représenter **la même opération commerciale**.

Prévoir donc une relation fiable entre :

**Transfert ↔ Facture ↔ Charge**

afin d’éviter les doublons ou les incohérences.

# 6. Cohérence transactionnelle

Le transfert inter-propriétaires ne doit jamais créer une situation où :

* le transfert existe mais pas la facture ;
* la facture existe mais pas la charge correspondante ;
* la charge est créée deux fois ;
* les stocks sont modifiés alors que l’opération principale a échoué.

Si le backend le permet, traiter cette opération de manière transactionnelle/atomique.

Ajouter également une protection contre les doubles clics et les doubles soumissions.

# 7. Statuts

Réutiliser les statuts existants autant que possible.

Pour un transfert entre propriétaires différents, prévoir un workflow cohérent autour de statuts tels que :

* Brouillon
* En attente
* Envoyé
* Reçu
* Annulé

Pour la partie financière :

* En attente de paiement
* Payé
* Annulé

Ne crée pas de nouveaux statuts inutilement si des équivalents existent déjà dans l’application.

# 8. Traçabilité

Les opérations administratives sensibles doivent être traçables.

Lorsque le Super Admin :

* modifie un utilisateur ;
* modifie ses permissions ;
* réinitialise son accès ;
* modifie une boutique ;
* intervient sur une opération sensible ;

conserver, si l’architecture existante le permet :

* l’utilisateur ayant effectué l’action ;
* la date et l’heure ;
* le type d’action ;
* l’entité concernée.

# 9. Sécurité

Point important : **ne donne pas des droits globaux à tous les utilisateurs pour résoudre le problème du Super Admin.**

Les droits globaux doivent être accordés uniquement au rôle Super Admin prévu par l’application.

Ne désactive pas globalement les protections RLS ou les contrôles d’autorisation.

La recherche dans l’annuaire doit uniquement retourner les informations nécessaires à l’identification d’une boutique.

La réinitialisation d’un mot de passe doit passer par le système d’authentification sécurisé existant.

# 10. Travail demandé

Commence par analyser l’implémentation actuelle avant de modifier quoi que ce soit.

Identifie :

1. pourquoi la liste des utilisateurs ne se charge pas ;
2. quelles permissions empêchent actuellement le Super Admin d’administrer certaines données ;
3. comment les boutiques, utilisateurs et groupes sont actuellement reliés ;
4. comment fonctionne le transfert entre boutiques d’un même propriétaire ;
5. quelles tables gèrent actuellement les transferts, factures, charges et stocks ;
6. comment étendre cette architecture au transfert entre propriétaires différents sans dupliquer inutilement la logique existante.

Ensuite, implémente les corrections en conservant les fonctionnalités existantes.

Priorité :

1. **Ne rien casser dans l’existant.**
2. Corriger les permissions Super Admin.
3. Corriger le chargement et la gestion des utilisateurs.
4. Ajouter l’annuaire des boutiques.
5. Faire fonctionner les transferts entre propriétaires différents.
6. Automatiser la création **Facture émetteur → Charge en attente chez le destinataire**.
7. Garantir la sécurité, la cohérence des stocks et l’absence de doublons.

À la fin, vérifie les scénarios suivants :

* Super Admin → liste de toutes les boutiques : OK
* Super Admin → liste des utilisateurs existants : OK
* Super Admin → modification d’un utilisateur : OK
* Super Admin → reset sécurisé du mot de passe : OK
* Super Admin → groupes de boutiques : OK
* Transfert entre deux boutiques du même propriétaire : toujours OK
* Recherche d’une autre boutique par téléphone : OK
* Transfert entre propriétaires différents : OK
* Facture créée automatiquement chez l’émetteur : OK
* Charge en attente créée automatiquement chez le destinataire : OK
* Facture, charge et transfert correctement reliés : OK
* Pas de double transfert/facture/charge en cas de double clic : OK
* Un utilisateur standard ne récupère pas les droits du Super Admin : OK
