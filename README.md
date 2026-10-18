# Courrier

Prototype personnel de boîte de réception pour réunir des adresses de plusieurs domaines dans une interface à soi.

## État actuel

- Nuxt/Vue déployable sur Cloudflare Workers avec Workers Assets.
- UnoCSS et Una UI installés comme base de composants ; Una UI est encore en alpha, donc l’interface garde des styles natifs faciles à remplacer.
- Prototype en cours : les données de démonstration locales sont signalées comme fictives ; une adresse pilote reçoit aussi des emails réels en production.
- Ingestion locale d’un email synthétique avec PostalMime ; métadonnées et pièces jointes vont dans D1/R2 locaux.
- Depuis le 17 octobre 2026, Cloudflare Access protège les URL de prévisualisation du Worker ; la production est publiquement joignable et s’appuie sur les sessions Courrier et les autorisations applicatives.
- L’application contrôle elle-même les sessions Courrier, les rôles, les espaces et les accès aux boîtes. Les réponses API sont privées et non mises en cache ; l’identité Cloudflare Access n’est pas utilisée par le code applicatif.
- Zero Trust Free est actif à 0 $/mois jusqu’à 50 utilisateurs ; les dépassements des limites gratuites peuvent être facturés selon les conditions validées à la souscription.
- La réception réelle reste limitée à une adresse pilote ; les autres règles et transferts existants ne sont pas migrés automatiquement.
- L'export et les limites des sauvegardes sont décrits dans [Export et sauvegardes](./docs/DATA-EXPORT-AND-BACKUPS.md). Le statut détaillé et les critères de validation sont dans [PLAN.md](./PLAN.md).

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

Avant de configurer Email Routing ou de modifier des MX, vérifie l’usage actuel du domaine et suis le jalon 0 de [PLAN.md](./PLAN.md).
