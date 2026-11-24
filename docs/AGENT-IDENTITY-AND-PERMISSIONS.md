# Identité et permissions des agents Courrier

## Statut et périmètre

Proposition de conception issue de CART-16, après les constats de CART-13 et CART-17. Ce document ne crée ni identité ni credential et n’autorise aucun accès à une boîte réelle. Il décrit la cible à valider avant toute implémentation.

Les décisions d’approbation humaine et d’annulation sont détaillées dans CART-19. Le schéma et la couverture du journal sont détaillés dans CART-22. Les permissions décrites ici sont des conditions d’autorisation, pas une approbation d’exécuter une action.

## Faits actuels vérifiés

- Courrier distingue aujourd’hui les utilisateurs humains (`users`), les rôles d’espace (`owner`, `admin`, `member`, `viewer`) et les platform admins (`platform_admins`). Le rôle platform admin ne donne pas accès aux contenus courrier (`docs/identity-and-access.md:5-10,23-27,31-38`; `migrations/0016_identity_workspaces.sql:88-122`).
- Les accès courrier humains cumulent une permission de rôle et un grant actif vers la boîte exacte. Les nouveaux membres et boîtes ne reçoivent pas de grant implicite (`docs/identity-and-access.md:48`; `migrations/0019_mailbox_access_control.sql:1-24,71-78`).
- Les permissions sont actuellement plus grossières que la matrice proposée : lecture couvre aussi recherche, tandis que `mail.write`, `mail.classify`, `mail.send` et `mail.trash` couvrent plusieurs opérations (`server/utils/workspace-access-policy.ts:84-130`). Il faut une autorisation côté serveur et un contrôle de portée sur chaque requête.
- Les audits n’ont identifié aucun principal ni mécanisme d’authentification d’agent. Ils n’ont pas prouvé une application exhaustive des frontières dans tous les états ou environnements. CART-17 relève notamment que les opérations groupées par domaine exigent un grant sur toutes les boîtes actives du domaine, ce qui peut refuser une action pourtant permise sur une boîte individuelle; ce refus ne démontre pas une fuite inter-boîtes.
- Local, canary et production ont des configurations et ressources distinctes documentées. CART-18 précise que les bindings réellement déployés et leur isolement n’ont pas été vérifiés. Les routes de développement `/api/dev/ingest` et `/api/dev/reindex-attachments` contournent l’authentification en mode dev; elles doivent rester indisponibles aux agents et aux environnements partageant des données sensibles (`server/middleware/workspace-access.ts:19`; `server/api/dev/ingest.post.ts`; `server/api/dev/reindex-attachments.post.ts`).

Ces faits décrivent le dépôt et les audits, pas l’état effectif d’une configuration de production.

## Modèle d’identité proposé

Créer un principal technique dédié, par exemple `agent_principals`, hors de `users`, des adhésions humaines, des invitations, du compte de notification et de `platform_admins`. Chaque principal reçoit un `agent_id` opaque et stable, jamais recyclé. L’identité logique est un agent déployé dans un environnement précis : un même nom de produit en local, canary et production correspond à trois principaux sans credential ni grant partagé.

Le principal contient uniquement les métadonnées nécessaires : identifiant, état (`active`/`suspended`/`revoked`), environnement, dates de création et de révocation, version de révocation et référence à l’émetteur de confiance. Il n’est pas un utilisateur interactif et ne peut pas ouvrir une session navigateur, changer d’espace ou être promu en rôle humain.

À chaque requête, le serveur doit vérifier l’identité de service, l’environnement, le principal actif, l’espace demandé, le grant exact de boîte et la permission d’action. Les identifiants de boîte, espace, cible ou acteur fournis par le client ne constituent jamais une preuve d’autorisation. Une demande de boîte hors grant, un principal inconnu ou suspendu, une permission absente, un token invalide ou expiré, et toute route non explicitement couverte sont refusés par défaut.

## Authentification et cycle de vie des credentials

### Voie préférée : identité de workload fédérée

Utiliser une identité de workload fédérée si le runtime Multica fournit un jeton signé vérifiable ou un échange standard vers un émetteur de confiance. Courrier doit valider la signature via des clés publiées et tournantes, l’émetteur attendu, l’audience exacte de l’API Courrier, `sub` lié à `agent_id`, l’environnement, `nbf`/`exp` et les portées demandées. N’accepter aucun jeton destiné à un autre service, environnement ou agent. Ne pas faire confiance à un en-tête d’identité transmis librement par le client.

La fédération évite un secret d’agent permanent et facilite la révocation par l’émetteur. Elle dépend toutefois d’une capacité Multica qu’il reste à confirmer; les constats disponibles ne prouvent pas qu’elle existe.

### Repli si Multica n’offre pas cette fédération : secret de bootstrap protégé

À défaut, injecter un secret aléatoire distinct par principal et environnement depuis un gestionnaire de secrets du runtime. Ce secret n’est qu’un justificatif d’échange pour obtenir un credential Courrier de courte durée : il ne doit jamais être accepté comme bearer pour les routes mail. L’échange authentifié délivre un token signé par Courrier, avec `agent_id`, environnement, audience `courrier-api`, expiration courte et portée maximale autorisée par les grants actifs. Stocker uniquement un vérificateur haché côté Courrier lorsque la vérification le permet; protéger le secret à la source, limiter les lecteurs et ne jamais le placer dans le dépôt, un prompt, une variable de navigateur ou un journal.

Ce repli reste moins sûr que la fédération : le secret bootstrap est une valeur statique à protéger et à faire tourner. Une fuite impose sa révocation et son remplacement avant tout nouvel échange.

### Durée, rotation et révocation

- Proposition : token d’accès d’au plus 10 minutes (maximum 15 minutes), audience unique et portée au plus égale aux grants courants. Aucun refresh token autonome de longue durée.
- Réévaluer le principal, le statut du grant et la permission côté serveur pour chaque opération; ne pas compter sur les seules claims d’un token pour refléter une révocation récente. Utiliser la version de révocation ou une vérification équivalente côté serveur.
- À la révocation du principal, d’un grant, d’une permission ou d’un environnement : refuser immédiatement les nouvelles opérations, invalider les sessions de service et supprimer l’accès aux nouveaux tokens. La courte expiration borne aussi les credentials volés qui n’ont pas encore été présentés.
- La rotation du secret bootstrap remplace le vérificateur de façon atomique, invalide l’ancien immédiatement et n’autorise qu’une courte fenêtre de chevauchement explicitement contrôlée si l’exploitation l’exige. Rotation immédiate après suspicion de fuite, changement du runtime de confiance ou fin de mission.
- Une demande d’accès et son changement d’état doivent produire des événements de métadonnées; les champs précis relèvent de CART-22. Ne jamais journaliser token, secret, clé, en-tête d’autorisation, contenu de message ou pièce jointe.

## Isolation des environnements

| Environnement | Principal et issuer | Audience/ressources | Règle |
| --- | --- | --- | --- |
| Local | Identité locale synthétique, émetteur et clés locaux | API locale et données locales uniquement | Aucun credential, identifiant réel ou accès réseau implicite vers canary/production. |
| Canary | Principal et issuer canary séparés | API, D1, R2 et secrets canary dédiés | Données synthétiques uniquement; aucun grant ou secret de production réutilisé. |
| Production | Principal et issuer production distincts, créés uniquement après validation humaine | API et ressources production | Aucun accès par défaut; provisionnement et grants nominatifs par agent, environnement, espace et boîte. |

Un token émis pour un environnement est refusé par les deux autres, même si `agent_id` ou la boîte coïncide. Les noms d’hôte, ids de ressources, bindings et clés doivent être liés à la configuration de confiance côté serveur, pas choisis par le token. Les audits n’ont pas vérifié les bindings déployés : l’isolation effective est un prérequis à vérifier avant toute activation.

## Matrice proposée des capacités

Portée minimale d’un grant : `(environment, agent_id, workspace_id, mailbox_id, capability)`. Pas de portée wildcard, de grant de domaine ou de grant d’espace implicite. L’autorisation doit en plus vérifier que la boîte est active et appartient à l’espace indiqué. Les actions non listées sont interdites.

| Capacité | Permission proposée | Ressource et effet | Octroi proposé | Expiration/révocation | Garde supplémentaire |
| --- | --- | --- | --- | --- | --- |
| Lire messages, métadonnées et pièces jointes | `mail.read` | Messages et pièces jointes d’une boîte exacte | Grant explicite à l’agent pour cette boîte | Date de fin obligatoire à décider; révocation immédiate au niveau serveur | Pas d’export implicite. |
| Rechercher | `mail.search` | Recherche bornée aux mêmes boîtes explicitement accordées; résultats, compteurs et extraits filtrés | Grant distinct, même portée exacte | Comme `mail.read` | Ne pas retourner ni compter des résultats hors portée. |
| Classer, marquer lu/non lu, déplacer dans les vues réversibles | `mail.classify` | Message autorisé individuellement dans la boîte | Grant distinct par boîte | Comme ci-dessus | Toute action groupée est décomposée et recontrôlée par message; un message interdit échoue sans fuite d’existence. |
| Créer ou modifier un brouillon | `mail.draft.write` | Brouillon rattaché à un message autorisé ou brouillon sortant lié à une boîte autorisée | Grant distinct par boîte | Comme ci-dessus | La création d’un brouillon ne vaut jamais autorisation d’envoi. |
| Envoyer un message | `mail.send` | Envoi depuis une adresse expéditrice exacte et boîte autorisée | Grant explicite séparé; aucun héritage de `mail.draft.write` | Comme ci-dessus | Approbation par action selon CART-19, vérifiée et consommée côté serveur avant envoi. |
| Modifier règles, blocages et réglages de routage | `mail.rules.manage` | Règle explicitement attachée à une boîte | Grant séparé et exceptionnel | Comme ci-dessus, avec échéance obligatoire recommandée | Approbation par action; contrôler version et cible au moment d’exécuter. Les règles actuellement au niveau domaine restent refusées aux agents tant qu’elles ne sont pas isolées par boîte. |
| Gérer comptes, rôles, grants, espaces, domaines, plateforme ou configuration | aucune permission agent | Contrôle plan global ou accès | Jamais accordé à un principal agent | Sans objet | Refus systématique, y compris pour les routes `/api/admin/*`, `/api/dev/*`, exports et opérations d’administration. |

Les noms `mail.search`, `mail.draft.write` et `mail.rules.manage` sont des propositions de permissions dédiées; le code actuel ne les implémente pas. La séparation entre recherche et lecture est recommandée pour permettre une délégation minimale. Si le produit choisit de lier recherche à lecture, la décision devra être explicite et la recherche restera limitée aux mêmes boîtes.

### Octroi et expiration des grants

L’octroi doit être une opération humaine authentifiée, attribuée à un responsable d’espace autorisé, confirmée récemment pour une capacité sensible et liée à un agent, un environnement, un espace, une boîte, une liste de permissions et une période. Recommandation : seuls owner/admin peuvent accorder ou révoquer, aligné sur le contrôle humain existant `mailbox.access.manage`; créer une permission dédiée à la délégation d’agents plutôt que de traiter l’agent comme un membre. L’agent n’accorde ni n’élargit ses propres droits.

Choix proposé à confirmer : tout grant agent possède une date d’expiration obligatoire, avec durée maximale par politique (par exemple 90 jours), puis renouvellement humain explicite. Une révocation de membre humain, de boîte, de principal ou de workspace doit également empêcher l’accès agent associé quand c’est pertinent. Les grants d’agent ne doivent pas être copiés automatiquement depuis les grants humains.

## Refus vérifiables attendus

| Tentative | Résultat obligatoire |
| --- | --- |
| Lire boîte B avec un token et un grant limités à boîte A, même dans le même espace | Refus sans contenu, métadonnée, compteur ni indication permettant d’énumérer B. |
| Appeler l’API production avec un token local/canary, un mauvais `iss`/`aud`, un agent différent ou un token expiré | Refus avant accès aux données; aucun repli sur une session humaine ou une identité d’en-tête. |
| Réutiliser un token après révocation du principal ou du grant | Refus par vérification d’état côté serveur, sans attendre l’expiration du token. |
| Appeler une action sans capacité correspondante, par exemple envoyer avec seulement `mail.draft.write` ou classer avec seulement `mail.read` | Refus de l’action; aucun effet partiel. |
| Utiliser un endpoint inconnu, platform-admin, export, route dev ou endpoint sans permission explicite | Refus par défaut, même si une autre permission est accordée. |
| Créer un brouillon puis tenter son envoi sans `mail.send` et approbation requise | Le brouillon reste non envoyé; la tentative est refusée. |

## Décisions ouvertes avant implémentation

1. Multica fournit-il une identité de workload signée, avec un issuer/audience et une procédure de révocation vérifiables par Courrier? Si oui, choisir la fédération; sinon, valider le gestionnaire et le flux du secret bootstrap.
2. Quelle équipe ou personne peut accorder les grants agents : owner/admin uniquement, ou une permission dédiée attribuable? Le présent document recommande owner/admin et une permission distincte.
3. Confirmer la durée par défaut et maximale des grants (90 jours proposé), ainsi que le renouvellement et les approbateurs requis.
4. Décider si `mail.search` reste distinct de `mail.read`, et définir les champs de message/pièce jointe inclus par `mail.read`.
5. Définir quelles mutations de classement sont préautorisables par politique et quelles règles nécessitent toujours l’approbation par action (CART-19).
6. Cartographier les routes vers ces capacités, traiter les données actuellement partagées au niveau espace/domaine (contacts, notes, tags, règles, exports) et résoudre l’asymétrie des opérations groupées décrite dans CART-17 avant d’exposer des grants partiels aux agents.
7. Définir avec CART-22 les événements de création, octroi, utilisation refusée, rotation et révocation, avec minimisation et rétention.
8. Vérifier hors de ce ticket l’isolation effective des bindings et endpoints dev. Aucun accès production ni credential ne doit être créé avant cette validation et une autorisation humaine explicite.

## Références

- Audit des rôles et frontières entre boîtes : CART-17, commentaires de livrable et de complément après revue.
- Constats globaux de l’audit : CART-13, commentaire de clôture du 24 novembre 2026.
- Principes d’identité humaine existants : `docs/identity-and-access.md`.
- Permissions de rôle : `migrations/0016_identity_workspaces.sql:88-122`.
- Grants de boîte : `migrations/0019_mailbox_access_control.sql:1-24,71-78`.
- Permissions API actuelles : `server/utils/workspace-access-policy.ts:84-130`.
- Scopes existants : `server/utils/account-auth.ts:175-269`.
