# Publication de la vitrine sur Cloudflare Workers

Le check GitHub Workers Builds: tournal confirme que le projet utilise Workers, et non Pages. Build npm run build (ou pnpm avec installation verrouillée), déploiement wrangler deploy ; les assets viennent de dist. wrangler.jsonc et cloudflare/worker.ts servent les assets SPA et conservent /d/:token via la fonction Supabase de partage existante. Aucun secret privilégié requis pour ce relais.

public/_headers conserve les en-têtes de sécurité des assets. Le mode single-page-application sert les routes publiques et /login /app sans changer leur URL. Ne pas ajouter de réécriture vers /index.html dans public/_redirects : la normalisation HTML de Workers peut renvoyer ces routes vers /, ce qui masque la connexion et les pages légales. Vercel conserve sa configuration distincte dans vercel.json.

Dans Workers Builds, renseigner pnpm build comme commande de build pour la production et les previews. La commande de déploiement production est npx wrangler deploy ; celle des previews est npx wrangler preview. Le bloc previews: {} dans wrangler.jsonc active ces derniers. Le build doit créer dist avant le déploiement.

Vérifier / sans session, /login, /app après connexion, déconnexion, anciens favoris avec paramètres, /d avec un jeton fictif invalide, /mentions-legales et /confidentialite. Le formulaire /demande-acces exige la PR #84 et les clés Turnstile ; ne pas annoncer qu'il fonctionne avant ce contrôle.

À compléter pour les mentions officielles : identité juridique de l'éditeur, adresse et contact pour les droits. Ne pas inventer ces informations.
