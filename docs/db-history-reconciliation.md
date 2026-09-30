# Réconciliation de l'historique Supabase

Cette PR prépare le préalable à la PR #82. Elle ne crée aucun objet en production
et ne doit déclencher aucun déploiement SQL.

## Source et immutabilité

Le connecteur Supabase a lu `supabase_migrations.schema_migrations` sur le projet
`cnxtylngddwmhugxkzju`. La version `20260916195927` et le nom
`repair_transfer_receipt_payable_trace` étaient déjà enregistrés en production,
mais absents du dépôt et du manifeste canonique.

Le nouveau fichier contient exactement l'unique élément du tableau `statements`
enregistré pour cette version, sans ajout de saut de ligne final. SHA-256 :
`02dc6f41fe35aa910681ef0117759c07f39f724b41bf75b722465385accdecd2`.
Il restaure deux fonctions privées et deux triggers :

- `private.enrich_transfer_receipt_trace()` ;
- `private.enrich_transfer_charge_supplier()` ;
- `public.stock_entries.trg_enrich_transfer_receipt_trace` ;
- `public.charges.trg_enrich_transfer_charge_supplier`.

Les deux UPDATE historiques restent dans le fichier original. Ils ne seront
exécutés que sur les données fictives du replay. La version déjà appliquée ne
doit jamais être réappliquée ou remplacée en production.

## Permissions et contrôle

Un fichier sous `.github/audit/replay-migrations/` reproduit exclusivement dans
le replay les ACL existantes de `boutique_state`, `invoice_payments`,
`notifications` et `push_subscriptions`. Ces fichiers d'audit ne sont jamais des
migrations à déployer. Sur les quatre tables, postgres et service_role ont tous
les droits ; authenticated dispose de SELECT et MAINTAIN, plus REFERENCES,
TRIGGER et TRUNCATE sur notifications et push_subscriptions. Les droits existants
TRUNCATE/TRIGGER méritent une revue de sécurité séparée ; cette PR ne les change
pas en production. PostgreSQL 17 est requis pour MAINTAIN.

Les signatures couvrent désormais également les ACL des 79 relations. Le
fingerprint épingle la production lue le 30 septembre 2026 et refuse tout écart,
y compris les anciennes variantes de fonctions auparavant tolérées.

La CI réalise le replay canonique et vérifie ce fingerprint figé. Si le secret
GitHub `SUPABASE_DB_PASSWORD` existe, elle compare aussi les signatures avec une
lecture directe de production et échoue au moindre écart. Sans ce secret, cette
lecture directe est indisponible : après la CI finale, il faut exporter à nouveau
les signatures avec le connecteur Supabase et comparer chaque objet à l'artefact
`local-schema-signatures.txt`. Un fingerprint figé seul ne prouve pas l'état live.

## Livraison et retour arrière

1. Obtenir toute la CI verte sur le dernier commit et l'égalité complète entre
   production lue via le connecteur et artefact du replay de ce même commit.
2. Demander l'accord du propriétaire pour fusionner cette PR. Aucun SQL à appliquer.
3. Rebaser ensuite la PR #82 depuis main et revalider son delta explicite.
   Le déploiement de #82 reste une opération distincte soumise à accord.

En cas d'échec du replay, ne pas fusionner et ne rien appliquer en production.
Après fusion, un retour arrière éventuel consiste à restaurer les changements
d'audit dans une PR dédiée. Ne pas supprimer ni réécrire la migration historique
récupérée et ne pas annuler ses fonctions ou ses UPDATE en production : ils
préexistaient à cette PR. Il n'y a donc pas de déploiement partiel à reprendre ici.
