# Courrier

Prototype personnel de boîte de réception pour réunir des adresses de plusieurs domaines dans une interface à soi.

## État actuel

- Nuxt/Vue déployable sur Cloudflare Workers avec Workers Assets.
- UnoCSS et Una UI installés comme base de composants ; Una UI est encore en alpha, donc l’interface garde des styles natifs faciles à remplacer.
- Maquette locale avec contenu fictif clairement signalé.
- Ingestion locale d’un email synthétique avec PostalMime ; métadonnées et pièces jointes vont dans D1/R2 locaux.
- Le Worker distant est protégé par Cloudflare Access sur toutes ses URL, avec la politique « Cloudflare account members » ; les requêtes sans session sont redirigées vers la connexion.
- Les routes `/api/*` vérifient l’identité Cloudflare Access : contexte natif quand disponible, ou JWT signé `Cf-Access-Jwt-Assertion` pour le Worker avec Static Assets. Wrangler simule une identité locale de démonstration.
- Zero Trust Free est actif à 0 $/mois jusqu’à 50 utilisateurs ; les dépassements des limites gratuites peuvent être facturés selon les conditions validées à la souscription.
- Aucune connexion Email Routing, aucune donnée réelle et aucun changement DNS.
- Le plan et les critères de validation sont dans [PLAN.md](./PLAN.md).

## Démarrer

```sh
npm install
npm run db:migrate:local
npm run dev
```

## Déployer

Après configuration des bindings Cloudflare et de l’accès :

```sh
npm run deploy
```

Ne configure pas encore les MX de `verbatims.cc` : vérifie d’abord l’usage actuel du domaine et suis le jalon 0 de [PLAN.md](./PLAN.md).
