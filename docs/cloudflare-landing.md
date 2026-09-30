# Publication de la vitrine sur Cloudflare Pages

Build : npm run build (ou pnpm run build avec installation verrouillée), sortie dist, branche de production main. Les Functions Pages doivent être compilées depuis functions à la racine du dépôt ; un simple upload de dist ne déploie pas la route de partage /d/:token.

public/_redirects fournit les routes SPA explicites. public/_headers conserve les en-têtes de sécurité de Vercel. functions/d/[token].ts relaie uniquement le jeton public vers la fonction de partage existante : aucune clé privilégiée n'est requise.

Vérifier / sans session, /login, /app après connexion, déconnexion, anciens favoris avec paramètres, /d avec un jeton fictif invalide, /mentions-legales et /confidentialite. Le formulaire /demande-acces exige la livraison de la PR applicative #84 et les clés Turnstile ; ne pas annoncer qu'il fonctionne avant ce contrôle.

À compléter pour les mentions officielles : identité juridique de l'éditeur, adresse et contact pour les droits. Ne pas inventer ces informations.
