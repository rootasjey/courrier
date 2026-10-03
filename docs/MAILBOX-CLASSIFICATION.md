# Classement des messages

**Statut :** tranche déployée sur le Worker de production. Le Screener, le classement par expéditeur, le reclassement de l’historique, le déplacement ponctuel, l’annulation d’un changement de règle et le blocage d’une adresse exacte sont implémentés. Le 2 octobre 2026, des essais réels ont confirmé que de nouveaux expéditeurs passent du Screener à Feed ou Paper et que leurs messages suivants vont directement dans la boîte choisie. Les listes Feed et Paper ont conservé ces messages après rechargement. Les règles par domaine ou motif et les exceptions automatiques restent hors périmètre.

## Objectif

Les trois boîtes doivent aider à décider où l’attention est nécessaire, sans classification opaque :

- **Imbox** : messages importants ou immédiats.
- **The Feed** : newsletters et lectures que l’on souhaite parcourir sans obligation de réponse.
- **Paper Trail** : reçus, confirmations et messages transactionnels à retrouver au besoin.
- **Screener** : étape distincte pour les expéditeurs encore inconnus, avant leur classement dans une boîte.

Ces destinations décrivent le classement de Courrier. Le filtre anti-spam reste indépendant.

## Comportements retenus ou proposés

| Situation | Comportement |
| --- | --- |
| Premier message d’un nouvel expéditeur | Le placer dans le Screener, où l’utilisateur choisit une destination. Ne pas deviner newsletter/reçu à partir du seul contenu. |
| Choix d’une destination pour un expéditeur | Enregistrer une règle par adresse d’expéditeur et domaine de boîte Courrier. Les futurs messages suivent cette règle. |
| Modification de la règle d’un expéditeur | **Confirmé :** reclasser également tous ses messages déjà reçus dans la nouvelle boîte. |
| Déplacement ponctuel d’un message | Distinguer « déplacer ce message » de « classer cet expéditeur », qui modifie la règle et re-classe tout son historique. |
| Conversation manuellement fusionnée | Depuis la conversation, seul le déplacement du groupe est proposé ; il ne modifie pas les règles des expéditeurs. Le déplacement isolé d’un message est refusé. Le reclassement d’un expéditeur se gère séparément : un groupe homogène suit la règle et conserve sa fusion, y compris après annulation ; un groupe contenant plusieurs expéditeurs ne peut pas être dispersé par cette action. Le cycle fusion/séparation a été vérifié localement et en production le 2 octobre 2026. La fiche expéditeur dédiée reste à créer. |
| Nouveau message d’un expéditeur connu | Appliquer sa règle explicite. Le routage direct vers Feed et Paper a été confirmé en production sur un second message de chaque expéditeur test. |
| Réponse à une conversation mise dans Set Aside | Si `In-Reply-To` ou `References` relie le message à un fil Set Aside, l’ajouter à ce fil et le garder dans Set Aside, même si l’expéditeur a une règle Feed/Paper. Cela ne change pas la règle de l’expéditeur pour ses autres messages. Sans en-têtes RFC valides qui l’y relient, le message suit sa règle normale. Si la recherche du fil échoue, le garder visible dans Inbox plutôt que de le classer à tort dans Feed/Paper ; il n’est pas marqué Set Aside. Les scénarios de réponse liée, message indépendant et panne de recherche sont vérifiés localement. |
| Reclassement d’un expéditeur pendant que son fil est dans Set Aside | Set Aside reste prioritaire : les messages du fil et ses métadonnées de fusion restent dans Inbox. La règle change bien pour les messages indépendants et à venir. |
| Remettre un fil dans sa boîte après Set Aside | Si tous les expéditeurs entrants du fil ont la même destination effective, déplacer le fil entier vers cette boîte. Une règle absente correspond à la boîte d’origine du fil. En cas de destinations contradictoires, ou si aucune règle ne s’applique, restaurer le fil dans sa boîte d’origine ; ne jamais le disperser. Aujourd’hui, Set Aside ne peut être activé que depuis Inbox, qui est donc cette boîte d’origine. |
| Expéditeur bloqué | Bloquer l’adresse exacte et rejeter ses nouveaux messages dans le Worker avant stockage ou relais ; conserver les messages déjà reçus. Le blocage est distinct du classement en boîte. |
| Clear all dans le Screener | Écarter les messages en attente sans bloquer leurs expéditeurs ni changer leurs règles. Ils restent consultables dans l’historique du Screener. |
| Blocage par domaine ou motif | Non pris en charge ; à considérer séparément du blocage d’une adresse exacte et du filtre anti-spam. |

La reclassification rétroactive est confirmée. Un déplacement ponctuel ne modifie pas la règle existante ; les prochains messages suivent donc toujours cette règle. Pour un expéditeur encore au Screener, déplacer un seul message ne valide pas les suivants : ils restent au Screener. L’interface affiche cette différence avant l’action. Une fusion manuelle est un classement atomique : pour agir sur une partie seulement, il faut d’abord séparer les fils. Sur `localhost:3004`, un fil synthétique de 2 messages et un autre de 3 ont été fusionnés, déplacés ensemble d’Inbox vers Feed puis remis dans Inbox, puis séparés. Les deux fils ont retrouvé leurs compteurs d’origine ; aucun identifiant de fusion ne subsiste. Les endpoints de déplacement isolé d’un message et de reclassement d’un expéditeur dans un groupe mixte ont répondu HTTP 409, sans mutation. Un second parcours avec deux fils du même expéditeur a confirmé que son reclassement conserve le groupe et que l’annulation restaure le dossier de la fusion ; la séparation a rendu les deux fils d’origine. Dossiers, règles et regroupements des données synthétiques de ce parcours ont été restaurés. Les migrations `0009` et `0010` sont appliquées en production. Après le déploiement de `712d5b7` (Workers version 33), deux fils synthétiques `[Courrier test fusion]` ont été réunis en une conversation de deux messages, puis séparés ; les deux fils d’origine sont revenus dans Inbox. Aucun autre message ni règle d’expéditeur n’a été modifié. La fiche expéditeur dédiée reste à créer.

## Vérification en production — 2 octobre 2026

Deux expéditeurs contrôlés et distincts ont été utilisés sur `courrier-test@verbatims.cc` :

- Le premier message du premier expéditeur est apparu dans le Screener, a été classé dans Feed, puis un second message du même expéditeur est arrivé directement dans Feed.
- Le premier message du second expéditeur est apparu dans le Screener, a été classé dans Paper, puis un second message du même expéditeur est arrivé directement dans Paper.
- Les messages des deux parcours étaient toujours visibles dans leur boîte respective après rechargement de l’application.

Ces essais confirment le chemin de classement et la persistance des règles d’expéditeur en production pour Feed et Paper. Ils ne valident pas les exceptions automatiques, ni les règles de blocage par domaine ou motif. Les adresses et contenus des messages de test ne sont pas conservés dans cette documentation.

Le Worker appelle `setReject()` pour un expéditeur bloqué avant le stockage ou le relais. Aucun avis de non-distribution n’a été vu dans la boîte Outlook de l’expéditeur lors du contrôle rapporté ; la présence ou l’absence d’un tel avis ne confirme donc pas à elle seule le rejet SMTP. Au prochain message naturellement reçu d’une adresse bloquée, vérifier l’événement Cloudflare et confirmer que le message n’a pas été conservé dans D1/R2 ni relayé. Aucun bounce artificiel ne sera provoqué et le relais de secours reste actif.

La recherche de production dans Paper a été vérifiée séparément le 2 octobre 2026 : une requête ciblant un message de test déjà classé dans cette boîte a renvoyé un message dans un fil, avec l’étiquette Paper. La recherche dans les trois boîtes principales est ainsi confirmée en production.

Un essai complémentaire a changé temporairement la règle d’un expéditeur de Paper vers Feed. Ses deux messages existants ont immédiatement suivi la nouvelle destination. En production, le bouton d’annulation n’est pas apparu après le retour à la liste ; la règle a donc été remise à Paper en appliquant une seconde fois le classement par expéditeur. Le message ouvert pendant l’essai a été marqué lu automatiquement ; son état non lu a été restauré, et les deux messages sont revenus dans Paper, non lus. Le reclassement rétroactif est confirmé en production.

Le défaut d’affichage de l’annulation a ensuite été reproduit sur les données locales : le retour à la liste faisait perdre l’état local du composant. Le message d’action et son identifiant d’annulation sont maintenant conservés dans l’état Nuxt partagé entre routes. Sur `localhost:3004/mail/paper`, le bandeau est resté visible après le retour à la liste ; « Annuler » a restauré les deux messages dans leurs dossiers précédents.

Après le déploiement du commit `ca0083e` (version Cloudflare `763500d8`), le même parcours a été rejoué en production : les deux messages sont passés de Paper à Feed, le bandeau **Annuler** est resté visible au retour à la liste et l’action a restauré leurs dossiers Paper. Le message ouvert a été marqué lu par l’interface pendant l’essai ; son état non lu a été rétabli. Les deux messages sont actuellement dans Paper et non lus. Le parcours de reclassement rétroactif et son annulation sont confirmés en production.

La migration conserve dans leur boîte actuelle les messages déjà stockés. Elle crée une règle Imbox pour leurs expéditeurs afin que les futurs messages gardent le comportement déjà observé. Les expéditeurs sans règle arrivent au Screener.

## Parcours envisagés

### Nouvel expéditeur

```text
Screener
┌ Expéditeur + adresse ── aperçu du dernier message ┐
│ [Placer dans Imbox ▾] [Placer dans The Feed]      │
│                    [Placer dans Paper Trail]       │
└───────────────────────────────────────────────────┘
```

Le choix crée la règle de l’expéditeur et classe ses messages existants. La portée est indiquée avant confirmation. Un bouton « Annuler » reste disponible pendant 20 secondes ; il restaure les dossiers exacts des messages et la règle précédente. Cette annulation est transactionnelle et ne doit pas écraser une règle modifiée entre-temps.

### Expéditeur déjà classé

Depuis un message, une fiche expéditeur ou un menu d’action, présenter séparément :

1. déplacer ce message uniquement ;
2. changer la destination de cet expéditeur et reclasser tous ses messages.

Ne pas placer ces commandes dans un menu ambigu intitulé seulement « Déplacer ».

### Navigation clavier

Les touches `1`, `2` et `3` ouvrent respectivement Imbox, The Feed et Paper Trail ; `0` ouvre le Screener. Sur clavier AZERTY, `Maj+&`, `Maj+é` et `Maj+"` ouvrent aussi les trois boîtes principales via les touches physiques `Digit1`, `Digit2` et `Digit3`. Les raccourcis ne sont pas affichés dans le menu et n’interfèrent pas avec les champs de saisie ni les dialogues.

## Direction d’interface

- Concevoir les boîtes, le Screener et la fiche expéditeur comme un seul parcours cohérent.
- Garder une liste chronologique et une lecture concentrée plein écran.
- Faire apparaître le classement et ses effets au moment de la décision ; garder la liste et la lecture sobres.
- Les choix de thème sont dans la page Réglages dédiée, hors de la liste et de la lecture.
- Traiter l’interface existante comme un prototype fonctionnel à simplifier, pas comme le design final.

## Piste technique — à confirmer après les parcours

- Une destination est persistée sur chaque message ; l’API ne renvoie plus `Imbox` en dur.
- Une règle d’expéditeur liée au domaine de boîte choisit une des trois destinations.
- À la réception, appliquer la règle existante ; sans règle, classer dans le Screener.
- Lors d’un changement de règle, mettre à jour l’historique dans le même batch D1 et retourner le nombre de messages touchés.
- Les opérations HTTP de classement restent protégées par le middleware Cloudflare Access existant.
- Ne pas introduire de classification IA automatique dans cette première version.

La structure D1 conserve un instantané des dossiers et de la règle précédente pour permettre ce retour arrière. Les enregistrements d’annulation expirent après 24 heures ; l’action n’est exposée à l’interface que pendant 20 secondes. Le traitement des règles de blocage reste à décider après validation des parcours et des cas limites.
