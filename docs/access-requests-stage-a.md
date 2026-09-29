# Demandes d’accès — étape A

Cette PR DB fournit la collecte, les décisions et les notifications. `acceptee`
signifie « approuvée » : aucun compte Auth n’est créé avant l’étape B.
La vitrine PR #81 reste indépendante. Aucun SQL de cette PR n’est exécuté en
production lors de son ouverture ou de sa fusion.

## Accès et contrat serveur

- Aucun accès direct à `public.access_requests` pour PUBLIC, anon, authenticated
  ou service_role. RLS activée, aucune policy permissive.
- `submit_access_request` est exécutable uniquement par service_role. L’Edge
  Function publique de la future PR applicative doit vérifier Turnstile côté
  serveur (hostname autorisé, action, jeton à usage unique), le champ piège et
  les limites de taille avant cette RPC. Elle ne doit jamais journaliser le
  formulaire. Les pages publiques utilisent cet endpoint sans session Auth.
- Réponse `{"received":true}` identique pour une demande valide, un doublon,
  un plafond atteint ou un compte existant. Aucun compte existant n’est modifié.
  Les erreurs de format utilisent SQLSTATE 22023.
- Téléphones : suppression des espaces, tirets et parenthèses; `00` devient
  `+`; les numéros locaux de neuf chiffres utilisent le préfixe sénégalais
  `+221`, en cohérence avec l’application actuelle. Pour un autre pays,
  fournir l’indicatif international. Un verrou transactionnel par numéro
  normalisé protège le doublon 24 h et le plafond de trois demandes sur 30 jours.
- SuperAdmin actif : demandes globales et routage vers une boutique. Propriétaire
  actif : uniquement les demandes explicitement routées vers sa boutique.
  Les comptes suspendus ou devant changer leur mot de passe sont refusés.
  Les rôles Ops, gérant ou vendeur ne reçoivent aucun droit implicite.
- Liste paginée sans téléphone ni message; détail autorisé séparément.
  Décisions terminales irréversibles, répétition de la même décision idempotente.
- Réutilisation de `notifications` (contenu générique, push désactivé) et
  `ops_interactions` (acteur, identifiant de demande, action, date; aucune donnée
  du prospect). `tech_logs` exige une boutique non nulle et ne convient pas
  au journal global. Aucun nouveau système de notifications.
- « Complément demandé » change le statut seulement. En étape A, le décideur
  contacte le prospect manuellement; aucun envoi SMS/e-mail implicite.

## Conservation

`pg_cron` est disponible sur le projet : vérification en lecture seule,
extension 1.6.4 et quatre jobs actifs avant cette PR. Le job quotidien
`access-requests-retention` exécute `private.purge_access_requests()` à 03:15 UTC.

- Refus : suppression 30 jours après `refused_at`.
- Acceptation : anonymisation du nom, société, téléphone, activité, message et
  note interne 30 jours après `accepted_at`.
- Nouvelle/vue/complément : suppression après 90 jours depuis la dernière
  décision (`traite_le`, sinon `created_at`).
- Les notifications liées sont supprimées aux mêmes échéances. Les journaux
  de décision restent sans données personnelles. Les dates terminales ne sont
  jamais repoussées par une consultation ou un double clic.

Le job quotidien donne une suppression au premier passage après l’échéance
(au maximum 24 h de délai). Les sauvegardes Supabase suivent leur propre durée
de conservation : la politique de confidentialité applicative doit le préciser.
Un prospect accepté mais non activé devra recevoir un nouveau flux d’accès après
l’anonymisation. L’étape B étendra la purge aux liens d’activation.

## Objets autorisés et fingerprint

La liste exhaustive, y compris signatures de fonctions, colonnes, contraintes
et index, est `.github/audit/access-request-objects.json`.

- Table : `public.access_requests`.
- Fonctions privées : `can_manage_access_request`, `notify_access_request`,
  `log_access_request_decision`, `purge_access_requests`.
- RPC publiques : `submit_access_request`, `list_access_requests`,
  `get_access_request`, `count_new_access_requests`, `route_access_request`,
  `decide_access_request`, `get_access_request_notifications`,
  `mark_access_request_notification_read`.
- Index : clé primaire, téléphone/date, boutique/statut/date, acteur,
  échéances des refus et des acceptations.
- Policies nouvelles : aucune. Triggers nouveaux : aucun.
- ACL : table et fonctions nouvelles seulement. Job : `access-requests-retention`.

Le replay reconstruit main sans la migration candidate avec les mêmes inputs
canoniques qu’auparavant. Le candidat est ensuite appliqué sans aucune
normalisation ni modification. Le contrôle compare les identités **et les
hashes** de tous les objets public/private et des triggers Auth, plus les ACL
des relations et le job de cette migration. Les autres jobs historiques restent
hors du fingerprint canonique; leur fonctionnement n’est pas modifié.

Avant application : production = baseline, candidat − baseline = exactement
la liste autorisée. Aucun remplacement ni suppression autorisé. Tout objet
supplémentaire, manquant, ou écart hors migration bloque la CI. Après application :
production = candidat intégralement. Aucun secret DB absent ne permet de sauter
ce contrôle. Les artifacts ne contiennent que des identités et hashes.

## Déploiement exact, après accord explicite

Configurer avant toute fusion :

1. Secret GitHub `SUPABASE_DB_PASSWORD` pour les exports en lecture seule du
   projet `cnxtylngddwmhugxkzju`.
2. Environnement GitHub `production-db` avec reviewers obligatoires. Le workflow
   vérifie leur présence et refuse un environnement non protégé.
3. Secret d’environnement `PRODUCTION_DB_DSN` : connexion PostgreSQL SSL du même
   projet, autorisée à migrer et écrire `supabase_migrations.schema_migrations`.
   Garder la valeur exclusivement côté serveur/GitHub. Aucun secret dans le dépôt.

Après CI complète verte sur le dernier commit de la PR, accord du propriétaire
et fusion par le propriétaire, déclencher manuellement
`Deploy reviewed access-request migration` avec : SHA complet du commit fusionné,
numéro de PR DB fusionnée, SHA-256 du fichier final revu.

Le workflow vérifie main, la PR fusionnée, la CI du head final, le replay vert,
les reviewers requis et l’égalité exacte fichier revu/fichier fusionné. Il
refait le replay et le fingerprint avant de présenter le job protégé à
l’approbation du reviewer. Ensuite le runner :

1. Vérifie le SHA-256 du fichier fusionné
   `supabase/migrations/20260929204856_access_requests_stage_a.sql`.
2. Ouvre une transaction, prend un verrou de déploiement, vérifie de nouveau la
   baseline production et l’absence de la version.
3. Exécute le fichier entier à l’identique et inscrit version, nom et texte SQL
   exact dans l’historique **dans la même transaction**.
4. Exige l’égalité complète production/replay avant commit.
5. Revérifie l’égalité depuis une nouvelle connexion en lecture seule.
6. Crée le tag annoté `db/access-requests-A-20260929204856` uniquement après succès.

La nouvelle PR applicative partira de main seulement après application,
fingerprint conforme et tag. Ne jamais remplacer cela par du SQL copié dans
le dashboard, par une version différente ou un `db push` de l’historique ancien.
Le driver psycopg est épinglé et utilisé uniquement par le runner CI; aucune
dépendance applicative n’est ajoutée.

## Reprise et retour arrière

- Erreur SQL, timeout, droits manquants ou fingerprint différent avant commit :
  rollback automatique; table, fonctions, job et ligne d’historique sont annulés
  ensemble. La PR applicative reste bloquée.
- Connexion perdue au moment du commit : ne pas supposer l’échec. Relancer le
  même workflow avec les mêmes SHA et version. Le runner accepte une reprise
  uniquement si historique (y compris texte SQL) et fingerprint sont strictement
  identiques. Un état partiel/différent est bloquant et nécessite inspection.
- Échec de l’export post-commit ou du tag : ne pas créer le tag à la main et ne
  pas ouvrir la PR applicative. Réparer l’accès en lecture/GitHub, puis reprendre
  le workflow identique; aucune réapplication aveugle.
- Migration validée puis défaut fonctionnel : maintenir l’endpoint applicatif
  désactivé. Préparer une **nouvelle** PR DB compensatrice, version à 14 chiffres,
  manifeste et replay/fingerprint, puis demander l’accord avant fusion/application.
  Si aucune donnée n’existe, elle peut retirer ces objets dans l’ordre des
  dépendances. Si des demandes existent, conserver les données, révoquer les
  endpoints et suspendre le job seulement via cette migration compensatrice.
  Ne jamais modifier le fichier fusionné, supprimer son historique ni restaurer
  une sauvegarde globale sans procédure et accord distincts.

## Tests et étapes suivantes

Tests SQL sur replay canonique : envoi valide/invalide/répété, compte existant
inchangé, table et RPC interdites à anon, list/detail/count/notifications interdites
au vendeur et à un autre propriétaire, décisions, badge, notification lue,
double acceptation, terminalité, purge et journaux sans PII.
Test multi-connexions : 24 soumissions simultanées par vague, doublon 24 h,
quota trois/30 jours, 24 acceptations simultanées avec un seul événement.

L’écran, Turnstile, le honeypot et le parcours navigateur seront testés dans
la PR applicative A. Comptes, périmètres de boutiques, activation, expiration,
usage unique, régénération, reprise après échec partiel et adaptateurs manual/SMS
seront livrés et testés en étape B. Notification e-mail désactivée pour l’instant.
