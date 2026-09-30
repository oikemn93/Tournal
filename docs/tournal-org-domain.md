# Passage à tournal.org

Adresse publique cible : https://tournal.org ; www.tournal.org redirige vers celle-ci.

## Avant la mise en service
- Vérifier le projet Vercel qui sert actuellement tournal.vercel.app. Ne pas rattacher le domaine au projet homonyme tournal-one.vercel.app.
- Ajouter tournal.org et www.tournal.org à ce projet, puis utiliser exactement les enregistrements DNS indiqués par Vercel.
- Vérifier le certificat et les routes /, /login, /app et les liens de partage.
- Supabase Auth : Site URL https://tournal.org, conserver temporairement les anciennes URL de retour explicitement autorisées et les previews nécessaires.
- Secret Edge Function TOURNAL_PUBLIC_URL : https://tournal.org. Redéployer create-invoice-share et web-push-dispatch après validation et fusion.
- Turnstile : autoriser tournal.org, www.tournal.org et les hôtes de preview utilisés.
- ACCESS_REQUEST_ALLOWED_ORIGINS : inclure https://tournal.org et les origines exactes encore utilisées pendant la transition ; aucun wildcard.
- Vitrine PR #81 : image Open Graph et URL canonique https://tournal.org.

## Compatibilité et retour arrière
Ne pas supprimer l'ancien domaine tant que le nouveau n'est pas vérifié. Les sessions sont propres à chaque origine : une reconnexion peut être nécessaire. Les jetons de partage et paramètres de retour doivent être conservés. Aucun changement DB.
En cas d'échec DNS/TLS, conserver l'ancien domaine et restaurer Site URL/TOURNAL_PUBLIC_URL à leur valeur précédente ; revenir aux versions précédentes des fonctions. Ne pas rediriger les anciens liens avant validation complète.
