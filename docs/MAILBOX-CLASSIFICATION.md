# Classement des messages

**Statut :** première tranche implémentée localement. Le Screener, le classement par expéditeur, le reclassement de l’historique, le déplacement ponctuel et une annulation immédiate des changements de règle sont branchés à D1. Les règles de blocage et les exceptions restent à concevoir.

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
| Réponse ou nouveau message d’un expéditeur connu | **Proposition MVP :** appliquer la règle explicite de cet expéditeur. Les exceptions automatiques et les règles basées sur les en-têtes de réponse sont reportées. |
| Message indésirable | Le traitement spam/blocage est distinct du Screener et du choix entre les trois boîtes. Les règles de blocage par adresse, domaine ou motif restent à concevoir séparément. |

La reclassification rétroactive est confirmée. Un déplacement ponctuel ne modifie pas la règle existante ; les prochains messages suivent donc toujours cette règle. Pour un expéditeur encore au Screener, déplacer un seul message ne valide pas les suivants : ils restent au Screener. L’interface affiche cette différence avant l’action.

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
