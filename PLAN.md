# Plan du prototype Courrier

## Avancement

- **Jalon 0 — vérification préalable (vérifié le 30 septembre 2026) :** Email Routing et les enregistrements MX Cloudflare sont actifs pour `verbatims.cc`. Les règles historiques `support@verbatims.cc` et `francis@verbatims.cc` continuent de transférer vers `codingbox.fr`. Une règle dédiée `courrier-test@verbatims.cc` dirige les messages vers le Worker `courrier` ; le handler les stocke et les relaie vers la destination historique tant que `COURRIER_LEGACY_FORWARD_TO` est configuré. Les règles historiques n’ont pas été modifiées.
- **Jalon 2 — réception réelle (validé pour l’adresse pilote le 30 septembre 2026) :** quatre messages de test ont été reçus et affichés dans Courrier. Le dernier message texte a été confirmé dans HEY ; un message avec pièce jointe a été conservé dans D1/R2 et listé dans Courrier. Les journaux Cloudflare associent `Handled` et `Forwarded` au dernier message. Un rejeu séquentiel du même `.eml` avec le même `Message-ID` dans Wrangler local n’a créé qu’un message et une pièce jointe dans D1/R2. Les tests locaux couvrent les échecs simulés et deux livraisons concurrentes avec le même `Message-ID` (identiques ou avec un contenu MIME différent) : un seul message est stocké et relayé, et les objets R2 perdants sont supprimés. Les pannes réelles et les réémissions concurrentes sur Cloudflare ne sont pas couvertes. Le relais de secours reste actif.
- **Continuité de service :** maintenir le relais vers `codingbox.fr` pendant la validation. Ensuite, retirer le relais pour l’adresse pilote seulement après les vérifications de réception, d’affichage, de conservation, des pièces jointes et de déduplication ; conserver les deux règles historiques tant que leurs adresses ne sont pas migrées séparément.
- **Handler de réception :** `worker.ts` délègue les requêtes HTTP à Nuxt/Nitro et expose directement le handler Cloudflare `email()`. Le relais de migration est optionnel via `COURRIER_LEGACY_FORWARD_TO` ; les doublons séquentiels et concurrents ne sont pas relayés une seconde fois. Le rejeu Wrangler local, les branches d’échec simulées et les scénarios de concurrence D1/R2 sont couverts par les tests locaux. Aucun scénario de panne réelle ni de réémission concurrente sur Cloudflare n’a été exécuté.
- **Jalon 1 — socle :** application Nuxt locale opérationnelle ; un `.eml` synthétique passe par PostalMime, est conservé dans D1/R2 locaux et apparaît dans l’Imbox avec sa pièce jointe.
- **Tranche UI — liste et réglages (30 septembre 2026) :** proposition visuelle inspirée de la liste HEY choisie, avec les boîtes dans le menu Courrier, une page Réglages et sans chiffres de raccourcis visibles. L’Imbox sépare les non-lus des messages consultés avec un état `is_read` persistant dans D1. La tranche de sélection et navigation clavier a été publiée par Workers Builds avec le commit `712d5b7` (version 33) le 2 octobre 2026.
- **Publication Workers Builds (4 octobre 2026) :** le dashboard Cloudflare indique le commit `b886db6` (`fix(mail): skip duplicate Reply Later history entry`), version `f99804d3`, avec 100 % du trafic. Le déploiement provient du push GitHub, pas d’un déploiement Wrangler manuel.
- **Set Aside (local vérifié, déployé le 4 octobre 2026) :** mise de côté au niveau de toute la conversation depuis Inbox, dans une boîte dédiée. Une réponse liée par ses en-têtes RFC rejoint le fil dans Set Aside, même si une règle Feed/Paper existe pour son expéditeur ; cette exception de conversation ne change pas la règle de l’expéditeur pour ses autres messages. Les tests automatisés et le parcours E2E local couvrent la réponse liée, le message indépendant du même expéditeur, le retour vers la destination cohérente et le maintien du fil lors d’un reclassement. La migration `0011_message_set_aside.sql` est inscrite dans la base distante `courrier-db` depuis le 3 octobre à 23:40:56 (heure affichée dans Cloudflare). L’API de production expose l’état Set Aside ; les interactions de classement et de réponse entrante restent à valider en production avec des messages de test contrôlés.
- **Reply Later (local vérifié, déployé le 4 octobre 2026) :** file persistante sans échéance, au niveau de toute la conversation, qui masque temporairement un fil de sa boîte d’origine sans en changer le classement. `L` ajoute ou retire un fil depuis la lecture ; une réponse reçue liée par `In-Reply-To` ou `References` reste dans la file, et une réponse envoyée la vide pour tout le fil. Les règles d’expéditeurs ne déplacent pas les fils en attente ; le reclassement isolé est refusé tant que le fil est en attente. L’export ZIP conserve cet état. Le parcours local a vérifié l’ajout/retrait, les raccourcis `4` et `L` et le retour au dossier d’origine ; le rattachement d’une réponse entrante et le vidage après un envoi réel restent à vérifier de bout en bout. La migration `0012_message_reply_later.sql` est inscrite dans `courrier-db` depuis le 4 octobre à 16:44:07 (heure affichée dans Cloudflare). L’API de production expose cet état.
- **Tranche export (1 octobre 2026, déployée) :** la page Réglages propose le téléchargement d’une archive ZIP contenant les originaux RFC 822 en `.eml` et un manifeste JSON avec les métadonnées, classements, règles d’expéditeurs et pièces jointes. Le flux archive les originaux depuis R2 sans les charger tous en mémoire. Le build, l’affichage local, l’ouverture de l’archive ZIP et l’affichage en production ont été vérifiés. Workers Builds a publié le commit `238329e` (version `66bc13f6`).
- **Tranche recherche globale (1 octobre 2026, déployée) :** une migration D1 ajoute l’index plein texte FTS5 pour le nom et l’adresse de l’expéditeur, l’objet et le corps texte. `/api/search` renvoie les messages par pages et les regroupe par fil dans Inbox, Feed et Paper ; Screener et corbeille gardent leur recherche locale dans leur espace. Inbox, Feed et Paper ont été contrôlées localement ; des messages synthétiques temporaires ont servi à vérifier Feed et Paper, puis ont été supprimés. En production, la recherche du fil de test a renvoyé deux messages regroupés en un fil et l’avertissement des requêtes de plus de 200 caractères s’affiche aussi sur les résultats. Workers Builds a publié le commit `a4faaac` (version `30ce4a2a`). Le contenu des pièces jointes n’est pas indexé.
- **Vérification production de la recherche (2 octobre 2026) :** la recherche renvoie un résultat correspondant dans Inbox et Feed. Le 2 octobre, un message de test déjà classé dans Paper a également été retrouvé par une recherche depuis cette boîte : un message et un fil affichés, avec l’étiquette Paper. La recherche en production est maintenant vérifiée dans les trois boîtes principales. Le contenu de la requête de test n’est pas conservé dans la documentation.
- **Fusion réversible de fils (classement atomique et garde-fous vérifiés localement et en production) :** les originaux RFC 822 restent intacts. Une association D1 explicite relie les racines des fils choisis dans la même boîte et le même dossier ; listes et recherche utilisent le regroupement obtenu, et la conversation propose de séparer les fils. Classer une conversation déplace tous ses messages présents sans modifier les règles des expéditeurs. Dans une conversation fusionnée, l’interface ne propose que le classement du groupe ; un déplacement isolé est refusé. Le reclassement d’un expéditeur reste distinct : un groupe qui contient plusieurs expéditeurs est protégé contre sa dispersion ; si tous ses messages appartiennent au même expéditeur, le groupe suit la règle et son association est conservée. L’annulation restaure aussi le dossier de fusion. La fiche expéditeur dédiée reste à créer. Les migrations `0009` et `0010` sont appliquées en production (aucune migration en attente après le déploiement du commit `712d5b7`, Workers version 33). Le build passe. Sur `localhost:3004`, les fils synthétiques de 2 et 3 messages ont été fusionnés, déplacés ensemble d’Inbox vers Feed puis remis dans Inbox. Les API ont refusé avec HTTP 409 le déplacement isolé d’un message et le reclassement d’un expéditeur d’un groupe mixte. Un parcours séparé avec deux fils du même expéditeur (3 et 5 messages) a confirmé que le reclassement conserve le groupe, que « Annuler » restaure le dossier et la fusion, puis que la séparation retrouve les compteurs d’origine. En production, deux fils synthétiques marqués `[Courrier test fusion]` ont été réunis en une conversation de deux messages, puis séparés ; les deux fils d’origine sont revenus dans Inbox. Aucun autre message ni règle d’expéditeur n’a été modifié.
- **Tranche brouillon et réponse (2 octobre 2026, déployée) :** la migration `0008` ajoute les brouillons persistants et le sens sortant des messages. Une première réponse en texte seul peut être rédigée, sauvegardée, puis envoyée après confirmation. Cloudflare Email Sending affiche `verbatims.cc` activé et configuré, avec `courrier-test@verbatims.cc` comme seul expéditeur permis. `COURRIER_ALLOWED_RECIPIENTS` est configuré en Production comme secret runtime et secret de build ; `postbuild` injecte la restriction dans la configuration Wrangler générée, tandis que l’API vérifie la liste runtime. En local, `.dev.vars` reste privé et Wrangler simule l’envoi ; aucune livraison réelle n’a lieu. Deux envois contrôlés vers Gmail et HEY sont arrivés ; leurs originaux indiquent SPF, DKIM et DMARC PASS. Cloudflare compte 2 envois livrés sur 2, sans bounce ni plainte observés. Cet échantillon ne suffit pas à établir une réputation durable ; garder l’allowlist et continuer l’observation. Voir [Brouillons et réponses](docs/EMAIL-SENDING.md).
- **Sauvegarde (déployée et exercice d’objet validé le 1 octobre 2026) :** le tableau de bord confirme que `courrier-db` dispose de Time Travel ; la base contient 135 kB et son historique courant remonte à sa création le 28 septembre. D1 assure une restauration à la minute sur 30 jours avec Workers Paid. Le bucket `courrier-mail-store` contient 1,24 MB. Le Worker copie chaque nuit les objets R2 vers `courrier-mail-backup`, bucket privé du même compte, sans effacer automatiquement les copies ; le premier passage du cron a été constaté à 03:15 UTC, avec des objets `original.eml` visibles dans le miroir. Un exercice manuel avec un `.eml` synthétique a validé la récupération du bucket de secours et la remise sous la clé d’origine : les empreintes SHA-256 avant/après étaient identiques. L’objet synthétique a ensuite été supprimé des deux buckets. L’essai ne valide pas la synchronisation cron d’un objet synthétique ni une restauration complète de boîte. L’export ZIP reste la copie portable hors Cloudflare. Le bucket de secours est en région automatique (Europe de l’Ouest), stockage Standard, accès public désactivé. Le miroir ajoute actuellement environ 1,24 MB ; le compte stocke 886,17 MB au total, sous les 10 GB-mois inclus. R2 facture 0,015 $/GB-mois au-delà, avec arrondi par unité. La copie R2 protège d’une suppression accidentelle, mais pas d’une perte d’accès au compte Cloudflare ; les sauvegardes D1 restent couvertes par Time Travel.
- **Jalon sécurité — Cloudflare Access :** Zero Trust Free est actif (0 $/mois, jusqu’à 50 utilisateurs). Une règle Worker protège tout le trafic de production et de prévisualisation de `courrier`, avec la politique « Cloudflare account members ». Après le déploiement final, `/api/messages` renvoie `200`, `[]` et `Cache-Control: private, no-store` avec une session valide ; sans cookie, `GET /` et `GET /api/messages` renvoient `403`.
- **Jalon sécurité — code :** en production, les routes `/api/*` exigent une identité Cloudflare Access et désactivent la mise en cache. Le code utilise le contexte natif quand il est disponible, sinon vérifie cryptographiquement le JWT `Cf-Access-Jwt-Assertion` avec `jose`, l’émetteur et l’AUD de l’application. Ce second chemin est nécessaire car le routeur interne des Workers Static Assets ne transmet pas `ctx.access` au Worker applicatif. En développement, `localhost` et `127.0.0.1` utilisent une identité synthétique limitée au serveur local.
- **Tranche Screener et classement (2 octobre 2026, déployée et vérifiée en production) :** deux expéditeurs contrôlés distincts ont été examinés dans le Screener puis classés, l’un dans Feed et l’autre dans Paper. Dans les deux cas, un second message du même expéditeur est arrivé directement dans la boîte choisie, sans repasser par le Screener. Les deux boîtes ont conservé leurs messages après rechargement. Le flux « nouvel expéditeur → Screener → règle d’expéditeur → classement des messages futurs » est donc confirmé en production pour Feed et Paper. Les adresses et contenus des messages de test ne sont pas consignés ici. Voir [Classement des messages](docs/MAILBOX-CLASSIFICATION.md).
- **Suivi des rejets entrants :** le Worker appelle `setReject()` pour un expéditeur bloqué avant stockage ou relais. L’utilisateur n’a pas vu d’avis de non-distribution dans Outlook ; cet avis n’est donc pas un indicateur confirmé. À la prochaine réception naturellement liée à un expéditeur bloqué, vérifier l’événement Cloudflare et l’absence du message dans D1/R2 et le relais. Ne pas fabriquer de bounce ni désactiver le relais de secours pour ce contrôle.
- **Vérification du reclassement rétroactif et de l’annulation (2 octobre 2026) :** deux messages existants d’un expéditeur de test ont suivi sa règle de Paper vers Feed, puis sont revenus dans leurs dossiers précédents grâce à « Annuler ». Le premier essai a révélé que le bandeau disparaissait au retour à la liste ; l’état du feedback et de l’identifiant d’annulation est désormais partagé entre routes Nuxt. Le parcours a été vérifié localement, puis en production après le commit `ca0083e` (version `763500d8`). L’état non lu initial des deux messages de production a été restauré. Voir [Classement des messages](docs/MAILBOX-CLASSIFICATION.md).
- **Déploiement distant :** dépôt public `rootasjey/courrier` relié à Workers Builds. La branche `main` déploie le Worker `https://courrier.jerem-dev.workers.dev`, D1 `courrier-db` et R2 `courrier-mail-store` ; le schéma contient `messages` et `attachments`. Le Worker est protégé par Cloudflare Access. Email Routing dirige maintenant l’adresse d’essai dédiée vers ce Worker. Workers Builds exécute `npm run build`, puis applique les migrations D1 distantes avant `wrangler deploy`, pour que le nouveau code ne parte pas avec un schéma précédent.

## Intention

Construire une boîte de réception par domaine, dans une interface inspirée par les idées de HEY. Pour `verbatims.cc`, prévoir une adresse principale et des alias qui arrivent dans sa propre boîte Courrier. Commencer pour un seul utilisateur, puis envisager le multi-utilisateurs après fiabilisation du flux de réception et de conservation.

## Boussole produit et priorités UX

Les priorités ci-dessous viennent des usages HEY que l’utilisateur considère les plus utiles. Elles guident Courrier sans imposer une reproduction exacte de HEY.

### Priorités principales

1. **Lecture et navigation :** présenter les messages reçus et envoyés dans une même liste chronologique ; ouvrir un message dans une vue de lecture ample qui prend toute l’interface ; pouvoir passer rapidement entre les boîtes au clavier.
2. **Trois espaces de classement :** Imbox pour les messages importants, The Feed pour les newsletters et lectures, Paper Trail pour les reçus et confirmations. Le Screener sert de file distincte pour les nouveaux expéditeurs. Une règle choisie par expéditeur s’applique aux nouveaux messages et re-classe aussi tout son historique (décision du 30 septembre 2026).
3. **Screener et contrôle des expéditeurs :** distinguer l’autorisation d’un expéditeur, le classement d’un message et le blocage d’une adresse. « Oui » ouvre le choix de destination et de portée (expéditeur ou message). « Non » bloque l’adresse exacte pour l’avenir et rejette les nouveaux emails dans le Worker avant leur stockage ou leur relais ; les messages déjà reçus sont conservés. « Clear all » écarte seulement les messages en attente, les conserve dans l’historique et ne crée pas de règle pour les prochains. Le filtre anti-spam reste séparé. Le Speakeasy Code, qui permet à un nouvel expéditeur de contourner le Screener, est une piste ultérieure. ([Screener HEY](https://help.hey.com/article/722-the-screener), [Speakeasy Code](https://help.hey.com/article/773-the-speakeasy-code), [Cloudflare Email Handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/))
4. **Notifications discrètes :** aucune notification par défaut ; activation explicite pour les expéditeurs ou fils choisis.

### Fonctions appréciées ensuite

- Set Aside et Reply Later pour suivre les messages à garder sous la main ou auxquels répondre, sans encombrer l’Imbox.
- Renommer localement l’objet d’un fil, sans modifier l’objet reçu ou l’affichage chez les autres correspondants.
- Priorité de regroupement : fusionner plusieurs fils en une conversation unique ; proposer aussi les Collections pour garder plusieurs conversations distinctes sur une page, à un rang inférieur.
- Clips pour conserver et retrouver un extrait de texte, par exemple un code promotionnel.
- Alias par boîte/domaine.

### Piste ultérieure : agents

Envisager des boîtes de réception destinées à des agents seulement après avoir défini les comptes, le multi-utilisateur et les autorisations par boîte et par action. Les droits devront être limités, visibles et révocables ; l’envoi devra rester soumis à une approbation explicite.

### Méthode d’observation

Avant de développer les interactions principales, documenter pour chaque fonction son besoin, son déclencheur, son résultat dans l’interface, son effet sur le message et la possibilité d’annuler l’action. Prioriser selon l’usage réel plutôt que chercher la parité fonctionnelle avec HEY.

### Observation directe de HEY — 30 septembre 2026

- L’Imbox sépare visuellement « New For You » et « Previously Seen » ; le fil ouvert utilise une vue de lecture ample et une barre d’actions dédiée en bas. Les emails envoyés figurent dans « Previously Seen » selon l’aide HEY.
- The Feed, Paper Trail, Reply Later, Set Aside et Bubble Up sont des destinations séparées dans la navigation. Les commandes d’action affichent leurs raccourcis clavier ; HEY documente aussi des raccourcis dédiés pour basculer entre Imbox, Feed et Paper Trail.
- Le Screener possède une vue dédiée avec une file à examiner et un historique réversible pour les messages écartés ou les expéditeurs bloqués. « Non » rejette les futures réceptions au niveau SMTP ; aucun expéditeur réel n’a été bloqué pendant l’observation.
- L’autorisation globale des notifications web était désactivée dans le compte observé ; aucun réglage n’a été modifié.
- Le parcours de fusion demande de sélectionner plusieurs fils, propose un objet pour le fil résultant, récapitule les fils sélectionnés et présente la fusion comme permanente. Parcours exploré avec deux messages de test, sans validation finale ; aucun fil n’a été fusionné.
- Aucun email n’a été envoyé pendant cette observation.

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
- Workers Builds exécute `npm run build`, puis applique les migrations D1 distantes avant `npx wrangler deploy` sur `main`. Le secret de build `COURRIER_ALLOWED_RECIPIENTS` génère la restriction des destinataires du binding Email ; le secret runtime homonyme protège aussi l’API. Le script local `npm run deploy` vérifie l’allowlist générée avant d’appliquer les migrations distantes. Le cache Worker ne nécessite pas de bucket dédié, et les règles Email Routing/MX restent une configuration séparée.
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

**Critère de sortie :** réception, relais, stockage, affichage et pièce jointe validés avec des messages réels ; rejeu séquentiel et concurrence simulée validés localement, ainsi que les chemins d’échec simulés. À compléter avant de retirer le relais : mieux couvrir les pannes réelles et décider si une vérification de concurrence Cloudflare est nécessaire et sûre.

### 3. Boîte utile au quotidien

- Ajouter lecture, recherche, conversations et dossiers.
- Ajouter le suivi et le classement des messages selon le modèle HEY (Set Aside, Feed, Paper Trail).
- Protéger l’application par Access et vérifier l’identité sur les API, pas seulement sur la page web.
- Définir une stratégie de sauvegarde et d’export avant d’y conserver du courrier important.

**Critère de sortie :** l’utilisateur peut retrouver un message reçu, l’ouvrir, le classer et exporter les données conservées.

### 4. Envoi et réponses

- Vérifier l’envoi depuis le domaine, les en-têtes de conversation, SPF/DKIM/DMARC, les rejets et la réputation. Deux envois contrôlés vers Gmail et HEY sont arrivés ; les deux originaux indiquent SPF, DKIM et DMARC PASS. Le tableau de bord Cloudflare compte 2 envois livrés sur 2, sans bounce ni plainte observés à ce stade. Garder l’envoi du pilote `verbatims.cc` sous allowlist temporaire pendant l’observation.
- Garder l’envoi en bêta/essai tant que la délivrabilité n’a pas été observée.
- Ajouter une confirmation explicite avant l’envoi. Une réponse avec brouillon persistant et confirmation est déployée ; deux envois contrôlés sont confirmés dans Gmail, HEY et Courrier, avec SPF/DKIM/DMARC PASS. Aucun bounce réel n’a été provoqué ; garder l’allowlist temporaire et surveiller les statistiques Cloudflare avant d’élargir le périmètre.

**Critère de sortie :** une réponse part avec une identité cohérente, apparaît dans le fil local et arrive correctement chez plusieurs destinataires de test.

### 5. Fonctions complémentaires et agents

- Après les priorités UX, étudier Set Aside, Reply Later, renommage local d’objet, clips et alias. Donner la priorité à la fusion de fils ; les Collections sont appréciées mais moins prioritaires.
- Envisager ensuite classification et résumé assistés, puis préparation de brouillons avec validation humaine.
- Reporter les agents disposant de leur propre boîte à une phase ultérieure au cadrage des identités, du multi-utilisateur et des autorisations par ressource.

**Critère de sortie :** les règles de tri restent modifiables ; un agent ne peut consulter que les boîtes autorisées et ne peut pas envoyer un email sans approbation explicite.

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
