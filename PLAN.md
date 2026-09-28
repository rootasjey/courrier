# Plan du prototype Courrier

## Avancement

- **Jalon 0 — vérification préalable :** les MX publics de `verbatims.cc` pointent vers Cloudflare Email Routing. Cela ne confirme pas quelles règles de transfert sont configurées dans le tableau de bord ; ne pas modifier les MX avant cette vérification.
- **Jalon 1 — socle :** application Nuxt locale opérationnelle ; un `.eml` synthétique passe par PostalMime, est conservé dans D1/R2 locaux et apparaît dans l’Imbox avec sa pièce jointe.
- **Déploiement distant :** dépôt public `rootasjey/courrier` relié à Workers Builds ; le push `d2baf23` a déclenché un build sur `main`, puis le Worker a été déployé sous `https://courrier.jerem-dev.workers.dev`. Cloudflare a provisionné `courrier-db` (D1) et `courrier-mail-store` (R2), et la migration distante a créé `messages` et `attachments`. L’interface distante s’affiche avec sa boîte vide de démonstration. Access et la réception réelle restent à configurer.

## Intention

Construire une boîte de réception personnelle qui réunit plusieurs adresses et domaines dans une interface inspirée par les idées de HEY. Le premier domaine envisagé est `verbatims.cc`.

Le dépôt `cloudflare/agentic-inbox` sert de référence pour l’ingestion et le stockage des messages, le parsing MIME, les pièces jointes et les en-têtes de fil. Nous ne convertissons pas son application React/Hono : l’interface et les contrats applicatifs de Courrier sont construits pour Nuxt/Vue.

## Principes de départ

- Un seul utilisateur : le propriétaire du compte Cloudflare, protégé par Cloudflare Access.
- Aucun changement DNS ni bascule de `codingbox.fr` pendant le prototype.
- Vérifier les enregistrements MX et l’usage mail actuel de `verbatims.cc` avant tout onboarding Email Routing.
- Conserver les messages originaux et leurs pièces jointes. La base SQL contient les champs normalisés utiles à l’affichage, au classement et à la recherche.
- Garder l’envoi et les agents derrière une validation explicite tant que la réception et la conservation ne sont pas fiables.
- Afficher toute donnée fictive comme telle ; aucun contenu de démonstration ne doit être confondu avec un vrai message.

## Architecture envisagée

- **Interface et API :** Nuxt sur Cloudflare Workers.
- **Réception :** handler `email()` du Worker Cloudflare généré par Nitro. Un hook `cloudflare:email` délègue le parsing et le stockage au service d’ingestion partagé avec le test local.
- **Données :** D1 pour les adresses, messages, fils, dossiers et métadonnées ; R2 pour les originaux RFC 822 et les pièces jointes. Confirmer ce choix au jalon d’ingestion après vérification des limites et coûts actuels.
- **Accès :** Cloudflare Access limité au compte personnel. L’application vérifiera l’identité côté serveur avant toute lecture ou modification de données.
- **Agents :** hors périmètre du premier jalon. Ils viendront après la recherche, le classement et les brouillons.

## Publication continue

- Relier `rootasjey/courrier` au Worker `courrier` depuis **Cloudflare Workers Builds**. La branche de production est `main` ; les builds de prévisualisation restent désactivés pour l’instant.
- Déclarer les bindings D1/R2 (et ceux qui seront réellement nécessaires) dans `wrangler.jsonc`. Wrangler a provisionné `courrier-db` et `courrier-mail-store` au premier déploiement. Les identifiants créés par Workers Builds restent dans le dashboard et ne sont pas réécrits dans le dépôt.
- Workers Builds exécute `npm run build`, puis `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote` sur `main`. Le script local `npm run deploy` inclut aussi l’application des migrations. Le cache Worker ne nécessite pas de bucket dédié, et les règles Email Routing/MX restent une configuration séparée.
- D’abord valider l’initialisation du schéma D1 et un déploiement déclenché par un push. Ensuite seulement configurer l’accès Cloudflare et une règle de réception pour l’adresse d’essai.

## Étapes et critères d’acceptation

### 0. Vérifier le terrain

- Relever les enregistrements MX actuels et les services qui utilisent `verbatims.cc`.
- Choisir une adresse d’essai et vérifier qu’Email Routing peut être activé sans interrompre un usage existant.
- Clarifier le premier parcours : recevoir un email, l’afficher, puis répondre ou seulement l’afficher.

**Critère de sortie :** aucun changement DNS n’est nécessaire avant d’avoir compris les conséquences de la réception Cloudflare sur les MX existants.

### 1. Socle du projet

- Initialiser Nuxt/Vue sur Cloudflare Workers.
- Intégrer UnoCSS et Una UI, en gardant une voie simple pour remplacer cette dernière si son statut alpha bloque le développement.
- Définir l’interface de démonstration et les conventions de code.
- Valider localement un fichier `.eml` synthétique qui passe par PostalMime, D1 et R2 puis apparaît dans l’interface.

**Critère de sortie :** l’application démarre localement ; un `.eml` synthétique est importé, stocké dans les bindings locaux puis affiché dans l’interface sans être confondu avec un vrai message.

### 2. Réception réelle sur une adresse d’essai

- Ajouter le Worker `email()` et parser le message avec PostalMime.
- Écrire les en-têtes et parties lisibles dans D1 ; conserver la source RFC 822 et les pièces jointes dans R2.
- Dédupliquer par identifiant de message et conserver le destinataire reçu, pour distinguer plusieurs domaines dans une même boîte.

**Critère de sortie :** un message réel envoyé à l’adresse d’essai apparaît dans Courrier avec expéditeur, destinataire, date, sujet, corps et pièces jointes lisibles.

### 3. Boîte utile au quotidien

- Ajouter lecture, recherche, conversations et dossiers.
- Ajouter archivage, suivi et classement de messages.
- Protéger l’application par Access et vérifier l’identité sur les API, pas seulement sur la page web.
- Définir une stratégie de sauvegarde et d’export avant d’y conserver du courrier important.

**Critère de sortie :** l’utilisateur peut retrouver un message reçu, l’ouvrir, le classer et exporter les données conservées.

### 4. Envoi et réponses

- Vérifier l’envoi depuis le domaine, les en-têtes de conversation, SPF/DKIM/DMARC, les rejets et la réputation.
- Garder l’envoi en bêta/essai tant que la délivrabilité n’a pas été observée.
- Ajouter une confirmation explicite avant l’envoi.

**Critère de sortie :** une réponse part avec une identité cohérente, apparaît dans le fil local et arrive correctement chez plusieurs destinataires de test.

### 5. Idées de HEY et agents

- Renommer un fil, regrouper des messages, puis faire évoluer Imbox, The Feed et Paper Trail.
- Ajouter classification et résumé assistés, puis préparation de brouillons avec validation humaine.

**Critère de sortie :** les règles de tri restent modifiables et un agent ne peut pas envoyer un email sans approbation explicite.

## Risques à traiter tôt

- **DNS/MX :** activer Email Routing peut changer le chemin de réception du domaine.
- **Livraison :** l’Email Sending de Cloudflare est en bêta ; le quota inclus ne garantit pas la réputation ou l’arrivée en boîte principale.
- **Intégrité :** les emails sont du MIME complexe ; le parser doit être la source de normalisation, et les originaux doivent rester exportables.
- **Accès :** Cloudflare Access protège l’entrée de l’application ; l’API doit aussi vérifier chaque identité et chaque ressource.
- **Coût :** les 5 $ de Workers Paid sont une base de facturation, pas une garantie que tous les composants et usages resteront sous ce montant.

## Hors périmètre initial

- Remplacer HEY ou migrer `codingbox.fr`.
- Partage multi-utilisateur et autorisations par boîte.
- Client IMAP/POP ou synchronisation avec les apps mail du système.
- Envoi automatique par agent.
- Reproduire toute l’interface ou tous les services internes de HEY.
