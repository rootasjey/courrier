# Plan du prototype Courrier

## Avancement

- **Jalon 0 — vérification préalable (vérifié le 30 septembre 2026) :** Email Routing et les enregistrements MX Cloudflare sont actifs pour `verbatims.cc`. Les règles historiques `support@verbatims.cc` et `francis@verbatims.cc` continuent de transférer vers `codingbox.fr`. Une règle dédiée `courrier-test@verbatims.cc` dirige les messages vers le Worker `courrier` ; le handler les stocke et les relaie vers la destination historique tant que `COURRIER_LEGACY_FORWARD_TO` est configuré. Les règles historiques n’ont pas été modifiées.
- **Jalon 2 — réception réelle (partiellement validé le 30 septembre 2026) :** deux messages de test ont été reçus par Cloudflare, traités par le Worker, affichés dans l’interface de production et relayés vers HEY. Le journal Email Routing indique `Handled` et `Forwarded` pour les deux ; l’arrivée du second relais dans HEY a été confirmée. Les originaux sont conservés dans R2 et les métadonnées/parsing dans D1. Les pièces jointes réelles, les réémissions avec le même `Message-ID` et le comportement en cas d’échec restent à vérifier avant de retirer le relais.
- **Continuité de service :** maintenir le relais vers `codingbox.fr` pendant la validation. Ensuite, retirer le relais pour l’adresse pilote seulement après les vérifications de réception, d’affichage, de conservation, des pièces jointes et de déduplication ; conserver les deux règles historiques tant que leurs adresses ne sont pas migrées séparément.
- **Handler de réception :** `worker.ts` délègue les requêtes HTTP à Nuxt/Nitro et expose directement le handler Cloudflare `email()`. Le relais de migration est optionnel via `COURRIER_LEGACY_FORWARD_TO`. La simulation Wrangler du `.eml` de démonstration et deux réceptions réelles ont été validées. Le chemin nominal est confirmé ; le chemin d’échec et la déduplication lors d’une réémission réelle restent à valider.
- **Jalon 1 — socle :** application Nuxt locale opérationnelle ; un `.eml` synthétique passe par PostalMime, est conservé dans D1/R2 locaux et apparaît dans l’Imbox avec sa pièce jointe.
- **Jalon sécurité — Cloudflare Access :** Zero Trust Free est actif (0 $/mois, jusqu’à 50 utilisateurs). Une règle Worker protège tout le trafic de production et de prévisualisation de `courrier`, avec la politique « Cloudflare account members ». Après le déploiement final, `/api/messages` renvoie `200`, `[]` et `Cache-Control: private, no-store` avec une session valide ; sans cookie, `GET /` et `GET /api/messages` renvoient `403`.
- **Jalon sécurité — code :** les routes `/api/*` exigent une identité Cloudflare Access et désactivent la mise en cache. Le code utilise le contexte natif quand il est disponible, sinon vérifie cryptographiquement le JWT `Cf-Access-Jwt-Assertion` avec `jose`, l’émetteur et l’AUD de l’application. Ce second chemin est nécessaire car le routeur interne des Workers Static Assets ne transmet pas `ctx.access` au Worker applicatif.
- **Déploiement distant :** dépôt public `rootasjey/courrier` relié à Workers Builds. La branche `main` déploie le Worker `https://courrier.jerem-dev.workers.dev`, D1 `courrier-db` et R2 `courrier-mail-store` ; le schéma contient `messages` et `attachments`. Le Worker est protégé par Cloudflare Access. Email Routing dirige maintenant l’adresse d’essai dédiée vers ce Worker.

## Intention

Construire une boîte de réception par domaine, dans une interface inspirée par les idées de HEY. Pour `verbatims.cc`, prévoir une adresse principale et des alias qui arrivent dans sa propre boîte Courrier. Commencer pour un seul utilisateur, puis envisager le multi-utilisateurs après fiabilisation du flux de réception et de conservation.

Le dépôt `cloudflare/agentic-inbox` sert de référence pour l’ingestion et le stockage des messages, le parsing MIME, les pièces jointes et les en-têtes de fil. Nous ne convertissons pas son application React/Hono : l’interface et les contrats applicatifs de Courrier sont construits pour Nuxt/Vue.

## Principes de départ

- Première étape mono-utilisateur : le propriétaire du compte Cloudflare, protégé par Cloudflare Access ; le multi-utilisateurs viendra après la fiabilisation du courrier.
- Aucun changement DNS ni bascule de `codingbox.fr` pendant le prototype.
- Vérifier les enregistrements MX et l’usage mail actuel de `verbatims.cc` avant toute modification d’Email Routing ; conserver les transferts existants sauf décision explicite contraire.
- Conserver les messages originaux et leurs pièces jointes. La base SQL contient les champs normalisés utiles à l’affichage, au classement et à la recherche.
- Garder l’envoi et les agents derrière une validation explicite tant que la réception et la conservation ne sont pas fiables.
- Afficher toute donnée fictive comme telle ; aucun contenu de démonstration ne doit être confondu avec un vrai message.

## Architecture envisagée

- **Interface et API :** Nuxt sur Cloudflare Workers.
- **Réception :** point d’entrée `worker.ts`, qui délègue `fetch` au Worker Nuxt/Nitro généré et traite directement les événements `email()` avec le service d’ingestion partagé. Un relais temporaire facultatif maintient la livraison historique pendant le pilote.
- **Données :** D1 pour les adresses, messages, fils, dossiers et métadonnées ; R2 pour les originaux RFC 822 et les pièces jointes. Confirmer ce choix au jalon d’ingestion après vérification des limites et coûts actuels.
- **Accès :** Cloudflare Access limité au compte personnel. L’application vérifiera l’identité côté serveur avant toute lecture ou modification de données.
- **Agents :** hors périmètre du premier jalon. Ils viendront après la recherche, le classement et les brouillons.

## Publication continue

- Relier `rootasjey/courrier` au Worker `courrier` depuis **Cloudflare Workers Builds**. La branche de production est `main` ; les builds de prévisualisation restent désactivés pour l’instant.
- Déclarer les bindings D1/R2 (et ceux qui seront réellement nécessaires) dans `wrangler.jsonc`. Wrangler a provisionné `courrier-db` et `courrier-mail-store` au premier déploiement. Les identifiants créés par Workers Builds restent dans le dashboard et ne sont pas réécrits dans le dépôt.
- Workers Builds exécute `npm run build`, puis `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote` sur `main`. Le script local `npm run deploy` inclut aussi l’application des migrations. Le cache Worker ne nécessite pas de bucket dédié, et les règles Email Routing/MX restent une configuration séparée.
- L’initialisation du schéma D1 et le déploiement déclenché par un push ont été validés. Cloudflare Access est maintenant configuré sur le Worker. Toute modification destinée au Worker distant doit passer par le dépôt et son déploiement Workers Builds.

## Vérification sécurité après déploiement

- Après chaque changement du garde-fou, vérifier le build Workers Builds, l’accès authentifié à `/api/messages`, le refus d’une requête sans JWT et `Cache-Control: private, no-store`.
- Ne pas étendre la réception à d’autres adresses avant d’avoir validé les pièces jointes, la déduplication et le chemin d’échec du pilote.

## Étapes et critères d’acceptation

### 0. Vérifier le terrain

- Relever les enregistrements MX actuels et les services qui utilisent `verbatims.cc`.
- Choisir une adresse dédiée d’essai et vérifier qu’une règle Email Routing vers le Worker Courrier peut remplacer son transfert actuel sans changer les MX ni interrompre la remise : stockage dans Courrier et relais temporaire vers la destination historique.
- Clarifier le premier parcours : recevoir un email, l’afficher, puis répondre ou seulement l’afficher.

**Critère de sortie :** validé pour l’adresse dédiée `courrier-test@verbatims.cc` ; les MX n’ont pas été modifiés.

### 1. Socle du projet

- Initialiser Nuxt/Vue sur Cloudflare Workers.
- Intégrer UnoCSS et Una UI, en gardant une voie simple pour remplacer cette dernière si son statut alpha bloque le développement.
- Définir l’interface de démonstration et les conventions de code.
- Valider localement un fichier `.eml` synthétique qui passe par PostalMime, D1 et R2 puis apparaît dans l’interface.

**Critère de sortie :** l’application démarre localement ; un `.eml` synthétique est importé, stocké dans les bindings locaux puis affiché dans l’interface sans être confondu avec un vrai message.

### 2. Réception réelle sur une adresse d’essai

- Stabiliser le handler `email()` et parser le message avec PostalMime.
- Écrire les en-têtes et parties lisibles dans D1 ; conserver la source RFC 822 et les pièces jointes dans R2.
- Dédupliquer par identifiant de message et conserver le destinataire reçu, pour distinguer plusieurs domaines dans une même boîte.
- Pendant le pilote, configurer `COURRIER_LEGACY_FORWARD_TO` pour relayer les messages vers la destination historique.

**Critère de sortie :** réception, relais, stockage du message et affichage des champs principaux validés avec deux messages réels. À compléter : test d’une pièce jointe réelle, vérification d’une réémission pour le même `Message-ID`, et contrôle du chemin d’échec. Le relais reste actif jusqu’à validation de ces points.

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
- **Facturation Zero Trust :** l’offre Free affiche 0 $/mois jusqu’à 50 utilisateurs ; la souscription validée autorise aussi Cloudflare à facturer les usages qui dépasseraient les limites gratuites.
- **Coût :** les 5 $ de Workers Paid sont une base de facturation, pas une garantie que tous les composants et usages resteront sous ce montant.

## Hors périmètre initial

- Remplacer HEY ou migrer `codingbox.fr`.
- Partage multi-utilisateur et autorisations par boîte.
- Client IMAP/POP ou synchronisation avec les apps mail du système.
- Envoi automatique par agent.
- Reproduire toute l’interface ou tous les services internes de HEY.
