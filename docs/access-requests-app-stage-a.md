# Demandes d’accès — application, étape A

Base : main après déploiement de la DB #82 (commit 78e35451), égalité production/replay et tag db/access-requests-A-20260929204856 vérifiés le 30 septembre 2026.

## Périmètre

- `/demande-acces` : formulaire public chargé à la demande, sans montage de l’application ni du coordinateur hors ligne. Aucun JWT de session, donnée métier ou appel authentifié n’est envoyé.
- `/login` et `/app` : aliases explicites Vercel de l’application existante, nécessaires sans fusion préalable de #81 ; `/` conserve le comportement de main jusqu’à la fusion séparée de la vitrine.
- `/confidentialite` : texte provisoire de collecte/conservation/droits. Identité du responsable, base légale et contact d’exercice des droits à fournir.
- Propriétaire : demandes explicitement attribuées à sa boutique. SuperAdmin : vue globale depuis Tournal Ops, vue boutique dans l’application. Autres rôles : bouton absent, RPC liste/détail/compteur/notification refusées côté DB.
- Liste minimale ; téléphone, message et note uniquement au détail. Attribution par SuperAdmin via la RPC existante. Dialog Radix existant (focus, Escape, restauration du focus).
- Badge alimenté par compteur serveur, notifications Realtime existantes et actualisation au retour de focus/visibilité, sans polling. Une notification de demande ouvre le détail. La vue globale filtre Realtime par utilisateur.
- Accepter = décision uniquement. Aucun compte créé, aucun rôle accordé, aucun lien d’activation à cette étape. Complément = statut + contact manuel au téléphone ; aucun SMS ou e-mail automatique.
- Double clic bloqué immédiatement par ref ; RPC idempotente côté DB. En cas d’erreur, actualiser pour vérifier la décision avant de réessayer.
- Aucun changement de migration ni de logique métier.

## Anti-spam

Edge Function unique : validation du corps (8 Ko maximum), longueurs et téléphone, honeypot, puis Siteverify Turnstile côté serveur. Vérification du succès, de l’action `access_request` et du hostname correspondant exactement à l’origine autorisée. Jeton à usage unique/expiration gérés par Cloudflare ; nouveau widget après tout essai. Sans configuration, refus fermé, aucun contournement de production.

La RPC service_role ne retourne qu’une confirmation générique : compte existant, doublon 24 h et quota trois/30 jours ont la même réponse publique. Verrou DB par téléphone pour les envois simultanés. Aucune table publique directement accessible. Pas de log de corps, téléphone, message, jeton, secret ou erreur détaillée de fournisseur. Pas de nouvelle dépendance.

## Configuration requise avant tests E2E et publication

Créer un widget Turnstile avec les hostnames exacts de production et du preview utilisé ; action `access_request`.

- Vercel : variable publique `VITE_TURNSTILE_SITE_KEY`, pour Preview puis Production après validation. Reconstruire après changement.
- Secrets Supabase de la fonction : `TURNSTILE_SECRET_KEY`, `ACCESS_REQUEST_ALLOWED_ORIGINS` (origines HTTPS exactes séparées par virgules, sans slash final ; pas de wildcard Vercel).
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` restent uniquement les secrets serveur natifs de Supabase.
- Déployer les deux fichiers de `supabase/functions/submit-access-request` depuis le commit approuvé, avec vérification JWT de passerelle désactivée pour cette seule fonction publique. La fonction impose Turnstile et ne reprend jamais un JWT fourni par le navigateur.
- Aucun SQL à appliquer pour la PR applicative. Aucune clé SMS nécessaire. E-mail désactivé.
- Ne pas utiliser de clés Turnstile de test dans la fonction de production. Un test complet avec clés factices exige un projet isolé avec replay DB ; jamais de prospect fictif à supprimer arbitrairement de production.

Le domaine preview doit être ajouté explicitement au widget et à la configuration serveur. Ces étapes restent à faire ; l’Edge Function n’est pas publiée par cette PR avant accord.

## Vitrine #81 séparée

#81 n’est pas fusionnée. Son CTA est remplacé séparément par `/demande-acces`. Avant fusion de #81, la rebaser depuis main contenant la PR applicative, conserver les routes publiques du formulaire et de confidentialité ; ne pas remettre la confidentialité provisoire vide ni écraser le lazy loading. Aucun merge automatique.

## Validation

Tests locaux : TypeScript app + handler Edge, build/budget, 27 commandes Node de CI (dont endpoint), contrat de session et permissions, revue des nouveaux fichiers. Le dépôt n’a pas de commande lint générale ; formatage des nouveaux fichiers via oxfmt et diff --check.

Tests d’endpoint exécutés sans réseau : envoi valide/invalide, corps surdimensionné, origine non autorisée, honeypot, absence de secret, rejet captcha/rejeu/hostname/action, erreur fournisseur/DB, réponse publique identique sans fuite.

Tests DB déjà validés dans #82 : anon table/RPC refusés, rôles non autorisés et autre propriétaire refusés, compte existant inchangé, décisions/refus/complément, badge/notifications, double acceptation et vagues de 24 transactions simultanées, conservation et anonymisation.

À vérifier dans le preview après configuration : envoi Turnstile réel et confirmation, invalidité/répétition, visibilité/notification/detail/refus/acceptation selon rôle, connexion/déconnexion sans régression. Les tests de création/activation/connexion nouveau compte restent en étape B.
