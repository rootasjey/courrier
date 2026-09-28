# Courrier

Prototype personnel de boîte de réception pour réunir des adresses de plusieurs domaines dans une interface à soi.

## État actuel

- Nuxt/Vue déployable sur Cloudflare Workers avec Workers Assets.
- UnoCSS et Una UI installés comme base de composants ; Una UI est encore en alpha, donc l’interface garde des styles natifs faciles à remplacer.
- Maquette locale avec contenu fictif clairement signalé.
- Ingestion locale d’un email synthétique avec PostalMime ; métadonnées et pièces jointes vont dans D1/R2 locaux.
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
