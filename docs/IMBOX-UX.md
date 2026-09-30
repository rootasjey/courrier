# Parcours Imbox et lecture

## Intention

Courrier est une boîte personnelle par domaine, pensée pour lire et traiter son courrier sans bruit. Cette première passe reprend deux usages que Jérémie apprécie dans HEY : une liste facile à parcourir et une lecture concentrée, sans prétendre reproduire HEY.

## Direction visuelle

- Reprendre la liste chronologique aérée de la capture HEY choisie, avec une identité Courrier violette et menthe.
- Ouvrir les destinations depuis le menu du nom Courrier, et non depuis des onglets permanents ; ne pas afficher les chiffres des raccourcis.
- Garder les choix system/light/dark dans une page Réglages dédiée.
- Considérer l’interface comme une tranche fonctionnelle locale ; le design peut encore évoluer à partir des retours d’usage.

## Carte des vues

```text
EN-TÊTE
┌ recherche                    Courrier ▾                 profil ┐
└───────────────────────────────────────────────────────────────┘

MENU COURRIER OUVERT
┌ Screener · Imbox · The Feed · Paper Trail · Réglages ┐
└───────────────────────────────────────────────────────┘

LISTE
┌ Imbox · recherche · composer                              ┐
│ Nouveaux messages                                         │
│ messages classés par date                                 │
│ Déjà consultés                                            │
└───────────────────────────────────────────────────────────┘

LECTURE
┌ ← Imbox                    courrier                           ┐
│                                                               │
│                   objet du message                            │
│                   expéditeur · date                            │
│                   corps du message                             │
│                   pièces jointes                               │
│                   réponse (envoi à venir)                      │
└───────────────────────────────────────────────────────────────┘
```

## Comportements

1. L’Imbox s’ouvre sur la liste, sans sélectionner ni ouvrir automatiquement un message.
2. La liste garde l’ordre chronologique déjà fourni par l’API. Elle accueillera les messages reçus et envoyés quand l’envoi sera implémenté ; pour l’instant, Courrier ne stocke que les messages reçus.
3. L’Imbox sépare les messages non lus (« Nouveaux messages ») des messages consultés (« Déjà consultés »). L’état est persisté dans D1 ; ouvrir un non-lu le marque comme consulté.
4. Ouvrir une ligne affiche le message dans une vue de lecture ample qui masque la liste.
5. « Retour à la boîte » revient à la liste et conserve la boîte active.
6. La vue de lecture affiche le sujet, l’expéditeur, la date, le corps et les pièces jointes. Elle ne montre pas de commandes d’archivage ni d’actions qui ne fonctionnent pas encore.
7. Le menu Courrier donne accès au Screener, Imbox, The Feed, Paper Trail et Réglages. Les raccourcis `1`, `2`, `3` et `0` restent actifs mais ne sont pas imprimés dans la navigation. Sur AZERTY, `Maj+&`, `Maj+é` et `Maj+"` passent aussi à Imbox, The Feed et Paper Trail.
8. Sur petit écran, la liste et la lecture sont deux états successifs, avec un retour toujours visible.
9. Les messages reliés par Message-ID, In-Reply-To et References forment un fil chronologique. La lecture montre un message à la fois, le plus récent par défaut, avec une frise horizontale au-dessus du corps et des commandes précédent/suivant à ses extrémités. « Lire tout » montre tous les corps dans l’ordre chronologique. Flèches gauche/droite et Début/Fin naviguent dans le fil hors des champs de saisie. Ce regroupement ne traverse ni les boîtes ni les dossiers, et ne marque pas les messages d’un autre dossier comme lus.

## Tranche actuelle : liste et réglages

Cette phase couvre le design et la technique, dans cet ordre pour éviter de figer trop tôt le modèle de données :

1. **Design et parcours :** appliquer la direction approuvée à la liste, au menu Courrier, à la lecture et aux réglages.
2. **Contrats fonctionnels :** une nouvelle règle d’expéditeur re-classe aussi son historique. Le filtrage spam reste distinct du classement. Voir [MAILBOX-CLASSIFICATION.md](./MAILBOX-CLASSIFICATION.md).
3. **Implémentation locale :** état lu/non lu persistant, classement par message et règles d’expéditeur en D1, mutations locales et raccourcis clavier. Pas de déploiement effectué.
4. **Vérification locale effectuée :** règles d’expéditeur rétroactives, application aux futurs messages, déplacement isolé sans règle, recherche, lecture persistante, téléchargement d’une pièce jointe et raccourcis AZERTY ont été parcourus sur des messages fictifs. L’annulation d’une règle a été vérifiée dans le navigateur et les dossiers exacts confirmés dans D1 locale. Les erreurs de chargement, de classement, d’annulation et d’enregistrement de lecture ont été provoquées en bloquant leurs seuls appels API locaux ; les écrans de reprise ont été vérifiés, ainsi que l’absence de mutation D1 lors des échecs. L’interface a été contrôlée sur desktop et mobile. Les notifications restent à concevoir.

## Hors de cette passe

- Rendu des emails envoyés, en attendant la fonction d’envoi.
- Fusion manuelle de fils distincts, Collections, blocage des expéditeurs, notifications, Set Aside, Reply Later, alias et agents.
- Reproduction exacte de l’interface ou du comportement interne de HEY.
