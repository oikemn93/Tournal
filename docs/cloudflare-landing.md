# Publication de la vitrine sur Cloudflare Workers

Le check GitHub Workers Builds: tournal confirme que le projet utilise Workers, et non Pages. Build npm run build (ou pnpm avec installation verrouillée), déploiement wrangler deploy ; les assets viennent de dist. wrangler.jsonc et cloudflare/worker.ts servent les assets SPA et conservent /d/:token via la fonction Supabase de partage existante. Aucun secret privilégié requis pour ce relais.

public/_headers conserve les en-têtes de sécurité des assets. Le mode single-page-application sert les routes publiques et /login /app. public/_redirects fournit aussi les routes explicites si le projet est ultérieurement déployé sur Pages.

Vérifier / sans session, /login, /app après connexion, déconnexion, anciens favoris avec paramètres, /d avec un jeton fictif invalide, /mentions-legales et /confidentialite. Le formulaire /demande-acces exige la PR #84 et les clés Turnstile ; ne pas annoncer qu'il fonctionne avant ce contrôle.

À compléter pour les mentions officielles : identité juridique de l'éditeur, adresse et contact pour les droits. Ne pas inventer ces informations.
