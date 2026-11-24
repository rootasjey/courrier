# Conception du journal d’audit Courrier

## Objet et statut

Cette note propose un modèle de journal commun aux actions humaines, agentes et système, et cartographie la couverture observée dans le dépôt. Elle complète les conceptions CART-16 (identité et permissions) et CART-19 (approbation et annulation). C’est une proposition à valider avant toute implémentation. Les constats de code ci-dessous proviennent de la revue statique CART-13/CART-15 ; ils ne prouvent ni l’état d’un environnement déployé ni l’absence de chemins non parcourus.

Le modèle s’aligne sur les conceptions CART-16 (identité technique distincte et permissions par boîte) et CART-19 (approbation liée à l’action exacte et politique d’annulation). Chaque compensation sensible possède son propre `action_request_id` et `action_hash`, reliés à l’action initiale par `parent_action_request_id`.

## Modèle d’événement proposé

Un événement est une entrée append-only décrivant un fait ou une transition, sans donnée nécessaire à la reconstitution du contenu d’un message. Une requête peut produire plusieurs événements corrélés ; elle ne doit pas remplacer l’événement précédent par une version « mise à jour ».

| Champ | Type / règle proposée | Usage |
|---|---|---|
| `event_id` | UUID aléatoire, unique | Identité immuable de l’événement. |
| `occurred_at` | UTC RFC 3339, généré côté serveur | Heure du fait ; conserver séparément l’heure d’ingestion si une file introduit un délai. |
| `actor_type` | `user`, `agent`, `system` | Nature de l’acteur. |
| `actor_id` | ID interne stable, nullable seulement pour acteur système non individualisé | Pour un agent, ID d’identité de service CART-16 ; ne jamais le remplacer par l’utilisateur approbateur ou un compte humain partagé. |
| `run_id` | ID de run Multica, nullable si non applicable | Corrélation d’une exécution d’agent. Enregistrer une référence opaque seulement, jamais les entrées, sorties ou logs du run. |
| `action_request_id` | ID opaque, nullable hors flux agent | Identifiant stable de la demande CART-19, conservé sur toutes ses transitions. |
| `parent_action_request_id` | ID opaque nullable | Relie une compensation à la demande qu’elle compense ; la compensation garde son propre ID et son propre hash. |
| `approver_id` | ID utilisateur nullable | Approbateur humain vérifié par le serveur, uniquement pour une décision. Une demande sans approbation n’en invente pas. |
| `workspace_id`, `mailbox_id` | IDs internes opaques, nullable seulement pour une opération véritablement transversale | Portée de sécurité et filtrage. Une opération transverse doit énumérer ses boîtes ou porter un type de cible explicite. |
| `action_type` | Enum versionné (ex. `mail.send`, `mail.trash`, `rules.manage`, `access.grant`) | Vocabulaire borné, stable et sans texte libre. |
| `target_type`, `target_id` | Type et identifiant interne opaque, selon nécessité | Cible minimale. Ne pas inclure d’adresse, sujet, extrait, destinataire ni nom d’objet si l’ID suffit. |
| `action_hash` | Empreinte HMAC-SHA-256 côté serveur de la représentation canonique versionnée de l’action complète, avec `action_hash_key_id` | Lie demande, approbation et exécution à la même action exacte. La représentation canonique comprend tous les paramètres qui en changent l’effet : destinataires, en-têtes pertinents, corps exact du brouillon, ordre et contenu binaire des pièces jointes, paramètres de règle et cible. Les octets sont lus côté serveur en mémoire ; seul le HMAC et l’identifiant de version de clé sont persistés dans l’audit et l’approbation. Ne jamais persister la représentation canonique ou les pièces jointes dans le journal. |
| `phase` | Enum : `request`, `decision`, `expiry`, `cancellation`, `execution_attempt`, `execution_result`, `compensation` | Distingue chaque étape ; ne pas fusionner tentative et résultat. |
| `result` | Enum borné : `pending`, `approved`, `denied`, `expired`, `cancelled`, `succeeded`, `failed`, `unknown`, `compensated`, `compensation_failed` | Résultat fonctionnel normalisé, sans texte libre. `unknown` signifie que l’effet externe n’est pas encore déterminable ; ce n’est pas un échec et il interdit le rejeu automatique. |
| `error_code` | Code interne normalisé nullable | Catégorie exploitable (ex. `authorization_denied`, `provider_unavailable`) ; jamais l’objet d’erreur fournisseur brut, stack, message ou réponse HTTP contenant des données. |
| `before_state`, `after_state` | JSON versionné et allowlisté, nullable | À enregistrer seulement si indispensable à l’explication ou à l’annulation ; valeurs minimales, aucun snapshot de message. Pour le retour arrière, préférer une référence opaque à un snapshot opérationnel séparé à durée courte. |
| `schema_version` | Entier | Évolution explicite du format. |
| `integrity` | `previous_hash`, `event_hash`, signature périodique de lot | Détection des altérations selon la proposition de protection ci-dessous. |

La canonicalisation de l’action doit définir l’ordre des clés, l’encodage, les règles de normalisation, la version et la liste des champs qui influent sur l’action. Pour le contenu, elle engage les octets exacts soumis au fournisseur ; pour les pièces jointes, elle engage chaque contenu binaire, sa position et les métadonnées qui changent l’envoi. Le serveur calcule le HMAC lors de la demande, puis le recalcule depuis la charge utile exacte au moment de l’exécution et compare en temps constant avec l’empreinte approuvée. Toute modification, y compris du corps ou d’une pièce jointe, produit une autre empreinte et invalide l’approbation : nouvelle demande et nouvelle approbation obligatoires. La clé HMAC reste hors du journal, protégée comme secret de service, versionnée par `action_hash_key_id` et conservée suffisamment longtemps pour vérifier les demandes encore valides. Les identifiants et l’empreinte ne sont pas des protections contre une fuite s’ils sont résolubles par des lecteurs trop largement autorisés.

### Cycle agent à journaliser

Chaque ligne est un événement distinct, horodaté et corrélé avec l’identité agent stable, le run, la demande, la boîte, l’action et son empreinte. Les étapes non atteintes n’ont pas d’événement fictif.

| Étape | `phase` / résultat | Champs et règle |
|---|---|---|
| Demande créée | `request` / `pending` | Acteur agent, identité et run, ID de demande, parent éventuel, boîte, action/cible minimales, hash, expiration demandée et politique appliquée. Pas de payload libre. |
| Décision | `decision` / `approved` ou `denied` | ID de l’approbateur authentifié et autorisé, horodatage, hash exact approuvé, méthode de contrôle sous forme de code (ex. `step_up_passkey`, sans assertion ni credential). Un refus n’expose pas de commentaire libre. |
| Expiration ou annulation | `expiry` / `expired`, ou `cancellation` / `cancelled` | Acteur de l’annulation s’il existe ; pour expiration automatique, `system`. Résultat terminal et raison normalisée. Toute nouvelle demande produit un nouvel ID. |
| Tentative d’exécution | `execution_attempt` / `pending` | Juste avant l’appel au service : revalidation serveur du statut, de l’autorisation actuelle, de la portée de boîte, de l’expiration et du hash approuvé. Ajouter un ID de tentative distinct si plusieurs tentatives contrôlées sont permises. |
| Résultat | `execution_result` / `succeeded`, `failed` ou `unknown` | `failed` n’est permis que si le serveur sait que l’action n’a pas été acceptée/produite. Après timeout ou perte de réponse où l’acceptation est possible, émettre `unknown`, sans transformer l’incertitude en échec. Aucune réponse brute du fournisseur. |
| Annulation / compensation | `compensation` / `compensated`, `failed` ou `compensation_failed` | Nouvelle demande, propre hash et approbation si requise, liée avec `parent_action_request_id`. Préciser le type d’annulation (`undo`, `compensation`, `none_possible`) sans prétendre qu’un envoi externe est annulé. |

L’événement de demande et celui de résultat doivent être conservés séparément pour rendre visible l’écart entre intention et effet. Les opérations à effet externe suivent CART-19 : approbation serveur à usage unique, liée exactement au hash ; revalidation des droits et versions avant exécution ; nouvel accord pour toute modification de l’action ou compensation sensible.

**Rapprochement d’un envoi `unknown` :** aucun rejeu automatique et aucune nouvelle tentative avec une nouvelle clé. Si le fournisseur prend en charge une clé d’idempotence, réutiliser la même clé stable liée à cette demande pour vérifier/reprendre l’opération selon ses garanties documentées. Sans cette garantie, vérifier l’état de livraison auprès du fournisseur ou faire une vérification humaine explicite avant de décider d’une nouvelle demande. Consigner un événement de rapprochement lié à la demande initiale (`succeeded`, `failed` confirmé, ou toujours `unknown`) ; conserver l’historique de l’incertitude. Une nouvelle demande d’envoi doit avoir un nouvel ID et une nouvelle approbation liée à son propre hash. Une livraison tardive après rapprochement doit produire un nouvel événement de résultat et déclencher le traitement de conflit prévu, jamais effacer l’incertitude précédente.

## Critères d’acceptation vérifiables

Ces scénarios sont des critères à vérifier lors de l’implémentation ; ils ne sont pas exécutés dans ce livrable de conception.

1. **Corps modifié après approbation :** créer une demande et approuver son `action_hash`, puis modifier un octet du corps du brouillon avant exécution. Le HMAC recalculé côté serveur diffère ; l’exécution avec l’approbation précédente est refusée et ne transmet aucun message. Une nouvelle demande et une nouvelle approbation sont requises. Le journal ne contient ni le corps initial ni le corps modifié.
2. **Pièce jointe modifiée après approbation :** approuver une action, puis modifier, remplacer ou réordonner le contenu d’une pièce jointe. L’empreinte recalculée diffère et l’approbation précédente est invalide. Aucun octet, nom de fichier ni contenu de pièce jointe n’est écrit dans l’audit.
3. **Timeout puis acceptation tardive :** simuler une requête fournisseur dont la réponse expire après que le fournisseur a accepté l’envoi. Le résultat consigné est `unknown`, sans événement `failed` trompeur ; aucun rejeu automatique n’est lancé. Si disponible, le rapprochement réutilise la même clé d’idempotence selon les garanties du fournisseur ; sinon, une vérification explicite de l’état de livraison précède toute nouvelle demande.
4. **Rapprochement après acceptation tardive :** lorsqu’une livraison est confirmée, ajouter un résultat de rapprochement `succeeded` lié à la demande initiale, préserver l’événement `unknown` antérieur et ne pas renvoyer le message. Si une tentative ultérieure a été autorisée après vérification que rien n’avait été livré, elle utilise un nouvel `action_request_id`, son propre hash et une nouvelle approbation.
5. **Inspection de minimisation :** pour les scénarios ci-dessus, vérifier les lignes d’audit et les journaux techniques générés : seulement IDs opaques, hash/version, étapes, horodatages et résultats/codes normalisés ; aucun corps, pièce jointe, secret ou objet d’erreur fournisseur brut.

## Couverture constatée dans le dépôt

Les états « couvert » et « non couvert » décrivent uniquement les chemins cités et les journaux examinés par CART-15 au commit `ca8caa5588ffa7d74325ae9452708f661e43bc2c`. « Inconnu » signifie que la revue n’a pas établi la couverture pour l’ensemble du domaine. « Couvert » signifie qu’une écriture de journal a été trouvée pour ce chemin, pas qu’elle satisfait déjà le modèle proposé.

| Action / événement | Couverture actuelle | Preuve et constat | Proposition |
|---|---|---|---|
| Certaines opérations d’administration, d’accès, d’invitations, de domaines, de boîtes et de passkeys | Couvert (partiel) | `migrations/0016_identity_workspaces.sql:140-154`; insertions réparties sous `server/api/admin/`, `server/api/workspace/`, `server/api/account/passkeys/`, `server/utils/workspace-invitations.ts`. Schéma acteur humain optionnel, action, cible, espace, `details_json`, date ; pas de run, approbation structurée ni résultat universel. | Migrer progressivement vers les événements typés et distinguer décision, tentative et résultat. Vérifier chaque route d’écriture dans une revue d’implémentation. |
| Lecture de ressources admin sensibles | Couvert (partiel) | `server/utils/platform-admin-audit.ts:24-55` déduplique les lectures identiques sur 15 min ; `server/api/admin/overview.get.ts:92-102` affiche au plus 50 entrées récentes. | Garder un événement de lecture borné ; définir lecteurs et rétention, sans assimiler l’aperçu UI à une politique de conservation. |
| Modifications groupées de messages visibles dans l’activité | Couvert (partiel) | `migrations/0028_workspace_activity.sql:4-24`; écriture `server/api/threads/bulk-action.patch.ts:156-200`, `server/api/threads/[id]/mark-unseen.post.ts:65-96`. La table admet `user|agent|system`, mais les écritures examinées sont humaines. `undo_data_json` conserve IDs de messages et versions/états de lecture. | Ajouter le résultat normalisé et un événement distinct d’annulation ; conserver les snapshots fonctionnels séparément et à durée courte. |
| Consultation de l’activité par utilisateur | Couvert pour la route observée | `server/api/activity.get.ts:108-180` impose espace actif et grant actif pour chaque boîte ; action de classification requise pour annuler. L’interface de recherche/pagination est `app/pages/activity.vue`. | Étendre les mêmes contrôles aux futurs lecteurs d’audit et à chaque requête d’export. |
| Nettoyage de `workspace_activity` et des données d’annulation | Couvert dans le code, exécution effective inconnue | `server/utils/workspace-activity.ts:1-33` efface les snapshots expirés et les lignes au-delà de 12 mois ; l’appel effectif du nettoyage n’a pas été établi par CART-15. | Prouver l’appel planifié par environnement avant d’affirmer l’échéance effective. |
| Événements entrants rejetés, dégradés ou échoués | Couvert pour les événements inscrits | `migrations/0039_inbound_email_events.sql:1-16`; `server/utils/inbound-email-events.ts:1-46`; planification `worker.ts:17-24`, configuration `wrangler.jsonc:26-28`, liste cron vide en canary `wrangler.canary.jsonc:17-19`. Adresses expéditeur/destinataire conservées ; aucun contenu de message dans cette insertion. Exécution déployée non vérifiée. | Garder des codes de raison bornés ; confirmer la tâche de purge dans chaque environnement actif. |
| Envoi de réponse ou de nouveau message | Non couvert par les journaux applicatifs examinés | `server/api/messages/[id]/send.post.ts:118-222`; `server/api/outgoing-drafts/[id]/send.post.ts:150-311` : pas d’écriture `platform_audit_log` ni `workspace_activity` identifiée. | Émettre demande, approbation éventuelle, tentative et résultat. Le HMAC de l’action doit engager les octets du corps et des pièces jointes, sans les écrire dans le journal. Distinguer échec certain de `unknown` après timeout ; interdire le rejeu automatique et rapprocher l’état avant toute nouvelle demande. L’envoi externe reste irréversible. |
| Rejeu de transfert legacy | Couvert (partiel) | `server/api/admin/legacy-forward-deliveries/[id]/replay.post.ts:46-64,130-179` journalise demande et résultat ; métadonnées de transport/statut et IDs, sans MIME identifié dans l’audit. | Conserver comme modèle partiel, normaliser acteur/run/demande et codes de résultat. Le rejeu externe peut dupliquer une livraison ; si résultat incertain, bloquer le rejeu et rapprocher l’état avant une nouvelle action. |
| Mise à la corbeille et restauration unitaire | Non couvert par les routes unitaires | `server/api/messages/[id]/trash.post.ts:14-24`; `server/api/messages/[id]/restore-trash.post.ts:14-24`. Les actions groupées sont tracées, les routes unitaires examinées ne le sont pas. | Journaliser les deux directions et relier la restauration à l’événement initial. |
| Suppression définitive d’un brouillon et pièces jointes | Non couvert | `server/api/outgoing-drafts/[id].delete.ts:4-26` supprime sans entrée des deux journaux examinés ; confirmation UI, mais pas de preuve de confirmation vérifiée par la route. | Tracer la demande et le résultat avec IDs seulement ; ne pas conserver les pièces jointes ni leur contenu dans l’audit. |
| Suppression définitive de boîte | Couvert (partiel) | `server/utils/mailbox-deletion.ts:84-135` purge R2/D1 ; l’événement `workspace_mailbox.deleted` est écrit lignes 89-103 après la suppression R2 et avant le batch D1. Un échec peut laisser une purge partielle sans événement fiable. | Journaliser l’intention avant effet, puis chaque résultat/reprise avec état normalisé et identifiant d’opération idempotente. |
| Export de données | Non couvert | `server/api/export.get.ts:40-64,100-143,165-182` ; aucun audit/activité identifié. L’archive contient des messages RFC822 et pièces jointes. | Tracer la demande et le téléchargement avec acteur/espace/boîtes et résultat ; jamais copier les données exportées dans l’audit. |
| Modification et annulation de règle expéditeur | Non couvert dans les journaux d’audit généraux | `server/api/messages/[id]/sender-rule.put.ts:97-190`; annulation fonctionnelle `server/api/sender-rule-changes/[id]/undo.post.ts:28-121`. `sender_rule_changes` garde adresse, dossiers et IDs pour l’annulation ; ce snapshot n’est pas un audit complet. | Événement de mutation et de compensation séparés ; limiter les détails de snapshot et les purger à échéance. |
| Création/refus/expiration/annulation/exécution d’actions d’agents | Non couvert dans les écritures parcourues | Aucun événement agent identifié dans les écritures analysées par CART-15. Le schéma `workspace_activity` accepte le type `agent`, ce qui ne prouve aucune écriture effective. | Couvrir toutes les étapes du cycle décrit ci-dessus ; ne déclarer la couverture complète qu’après vérification des producteurs serveur. |
| Échecs techniques et erreurs fournisseur | Inconnu / risque de données excessives | `server/utils/email-handler.ts:139-171,231-249` et `server/utils/workspace-invitations.ts:204-217` journalisent certains objets d’erreur bruts vers console ; leur contenu dépend du fournisseur et n’est pas assaini. | Remplacer par `error_code` fermé et identifiant de corrélation ; ne pas copier messages, stack, headers ni réponses fournisseur. |

## Consultation et portée proposées

- **Utilisateurs d’espace :** consulter les événements non sensibles de leurs espaces et uniquement les boîtes disposant d’un grant actif, au moment de chaque lecture. La révocation d’un grant retire immédiatement la visibilité ; un droit de consultation d’audit doit être distinct du droit de lire/catégoriser les messages.
- **Agents :** aucune lecture globale de l’audit. Autoriser seulement une réponse de statut pour leurs propres demandes, filtrée par identité agent, run et boîte autorisée, avec résultat normalisé. Pas d’accès aux IDs d’autres acteurs ni aux événements d’autres boîtes.
- **Administrateurs :** accès aux événements d’administration selon rôle privilégié et périmètre nécessaire. Les lectures sensibles de l’audit sont elles-mêmes journalisées. Séparer les lecteurs de l’exploitation, les administrateurs de l’application et les opérateurs de stockage ; aucun rôle implicite ne doit permettre l’altération silencieuse.
- **Système :** accès d’écriture selon le service producteur ; pas d’API générale permettant à l’agent de fabriquer ses propres résultats ou approbations. Les événements sont produits côté serveur après authentification et validation.
- **Interface/API :** pagination bornée, filtre temporel, workspace et mailbox côté serveur, limitation de débit, champs allowlistés. Les exports d’audit sont eux-mêmes audités et suivent le contrôle d’accès de chaque boîte.

Le code existant ne définit pas de politique commune de lecteurs pour `platform_audit_log`. La route `activity.get.ts` établit un précédent de portée par boîte pour `workspace_activity`, mais ne définit pas l’accès aux autres journaux.

## Conservation et suppression proposées

Proposition à arbitrer avant implémentation :

| Catégorie | Durée proposée | Fin de durée |
|---|---:|---|
| Événements d’audit d’action et décisions | 12 mois après l’événement terminal | Suppression automatique des événements et index/copies associés ; traiter les demandes légales ou de sécurité selon une politique séparée documentée. |
| Données nécessaires à une annulation/compensation | Jusqu’à expiration de l’annulation, plafonnée à 30 jours | Effacement des snapshots au terme de la fenêtre, en gardant seulement l’événement minimal d’issue pendant sa durée d’audit. La durée CART-19 doit être alignée à ce plafond ou le plafond révisé explicitement. |
| Événements entrants opérationnels avec adresses | 90 jours, comme le code actuel | Purge planifiée ; vérifier l’exécution par environnement. Ne pas réutiliser cette durée comme durée générale du journal d’audit. |
| Journaux sécurité/admin | 12 mois proposés | Durée non définie par les sources examinées ; distinguer les événements de sécurité des logs techniques et éviter une conservation indéfinie. |

Ce sont des propositions, pas des durées décidées. Le code prévoit déjà 12 mois pour `workspace_activity` et 90 jours pour `inbound_email_events`, mais ne démontre pas la rétention effective de tous les environnements. CART-15 n’a trouvé aucun nettoyage de `platform_audit_log` dans les migrations/utilitaires examinés. L’effacement d’une boîte supprime certains journaux associés dans `server/utils/mailbox-deletion.ts:110-113` ; la politique doit expliciter la suppression en cascade, y compris son effet sur l’investigation, et garder seulement les données strictement requises si une conservation indépendante est approuvée.

Chaque nettoyage doit être idempotent, mesuré par compteurs agrégés et testable sans journaliser les identifiants supprimés. Les sauvegardes et leurs délais d’expiration doivent être alignés afin qu’une suppression logique ne soit pas présentée comme un effacement immédiat des copies de sauvegarde.

## Minimisation des données

**Interdit dans le journal :** corps texte/HTML, MIME, sujet ou extrait, contenu ou nom de pièce jointe, pièces jointes, mot de passe, passkey/assertion, code de récupération, cookie/session, credential, secret, token, headers d’authentification, requête/réponse brute fournisseur, objet d’erreur fournisseur, stack trace et entrée/sortie du run agent.

**À privilégier :** IDs opaques, enums, codes d’erreur allowlistés, hash de l’action canonique, et état avant/après minimal. Éviter les adresses e-mail, noms et labels d’acteur dans les nouveaux événements ; `workspace_activity.actor_label` existant conserve actuellement un nom ou courriel affiché et doit être traité comme donnée personnelle. Les adresses expéditeur/destinataire du journal entrant sont aussi des données personnelles. Si un besoin opérationnel impose une valeur lisible, le besoin, les lecteurs et la durée doivent être documentés séparément.

Un hash n’anonymise pas les valeurs à faible entropie ni une cible qui reste reliée à une table métier. Il sert à vérifier que l’action approuvée n’a pas changé, pas à rendre le payload consultable.

## Protection contre l’altération

Le stockage actuel est une base applicative SQLite/D1 avec droits d’écriture détenus par le service. Aucune chaîne de hash, signature ou mécanisme d’immutabilité du journal n’a été identifié dans le code examiné ; le schéma `platform_audit_log` permet aussi une mise à jour (ex. `server/api/admin/mailboxes.post.ts:130`). La protection contre altération est donc **non démontrée**.

Proposition :

1. Interface d’écriture unique côté serveur ; interdiction de `UPDATE`/suppression applicative pour les événements non expirés, avec exceptions de rétention documentées.
2. Chaîne par partition temporelle et périmètre : `event_hash = H(version || previous_hash || canonical_event)`, sérialisation déterministe, tests de cohérence à l’import et lors des lectures d’audit.
3. Signature périodique de la tête de chaque partition par une clé de service protégée et stockage de la preuve dans un domaine de sécurité séparé ; ne jamais mettre la clé ou un secret de signature dans le journal.
4. Accès de lecture, changement de politique, export et purge journalisés dans une piste séparée ou un stockage append-only avec séparation des rôles. Alerte sur rupture de chaîne, suppression hors échéance ou désactivation du nettoyeur.
5. La chaîne doit permettre la suppression à échéance : partitions ou blocs temporels supprimables avec leurs preuves, sans conserver une copie parallèle éternelle des données personnelles. Documenter le compromis entre intégrité locale et effacement.

Une chaîne de hash seule, dans la même base accessible en écriture au même opérateur, ne rend pas le journal inviolable ; elle ne fait que rendre certaines altérations détectables si la tête est ancrée indépendamment.

## Décisions ouvertes

1. Valider ou ajuster la durée proposée de 12 mois pour audit et le plafond de 30 jours pour données d’annulation ; préciser les exigences de sauvegarde et éventuelles exceptions légales.
2. Définir les rôles d’accès à l’audit d’espace et les permissions distinctes de lecture des messages, y compris pour les propriétaires/admins et les agents.
3. Décider si les événements d’envoi, d’export et de suppression restent bloquants en cas d’indisponibilité du journal (fail closed) ou utilisent une file durable avec reprise ; préserver l’interdiction de déclarer un succès non journalisé pour une action sensible.
4. Choisir le stockage append-only, le mécanisme de signature/ancrage indépendant et le traitement de l’effacement à échéance.
5. Réconcilier les durées de compensation de CART-19 avec la politique de conservation ci-dessus.

## Vérifications et limites

Lecture statique des migrations, utilitaires, routes et interfaces référencés, complétée par les livrables/commentaires CART-13, CART-15, CART-16 et CART-19. Aucun test n’a été lancé ; aucun journal réel, secret, compte de production ou environnement Cloudflare n’a été consulté. Le document ne modifie ni la production ni le schéma applicatif. Une revue exhaustive des routes d’écriture et la vérification du fonctionnement des tâches planifiées restent nécessaires lors de l’implémentation.
