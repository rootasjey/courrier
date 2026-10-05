# Export et sauvegardes

Ce guide décrit comment Courrier conserve les emails, comment en télécharger une copie et ce que permettent les mécanismes de récupération actuels. Il s'adresse aux personnes qui utilisent ou déploient le projet.

> **État du pilote (5 octobre 2026) :** l’export ZIP version 2 et un importeur de restauration sont disponibles dans le dépôt. Les exercices précédents ont confirmé une restauration manuelle locale et dans des ressources Cloudflare temporaires isolées ; aucune ressource de production n’a été modifiée. L’importeur vérifie et reconstruit une archive vers de nouvelles ressources D1/R2, mais ne remplace pas une base de production, ne restaure pas l’infrastructure Cloudflare et n’est pas encore validé comme procédure de reprise après perte complète du compte.

## Où sont les données ?

| Ressource | Contenu | Mécanisme de récupération |
| --- | --- | --- |
| D1 | En-têtes et corps texte normalisés, classement, état de lecture, Set Aside et Reply Later, corbeille, règles d'expéditeurs et métadonnées des pièces jointes | Time Travel de Cloudflare D1, restauration à un point dans le temps |
| R2 `MAIL_STORE` | Originaux RFC 822 (`.eml`) et objets de pièces jointes | Miroir quotidien vers un second bucket R2 ; export ZIP manuel |
| R2 `BACKUP_STORE` | Copie des objets de `MAIL_STORE`, sous le préfixe `mirror/` | Copie privée dans le même compte Cloudflare ; restauration manuelle |

Le miroir copie les objets sous `messages/`, y compris les originaux et les fichiers de pièces jointes. Pour un objet d'origine `messages/<id>/original.eml`, sa copie se trouve sous `mirror/messages/<id>/original.eml` ; les pièces jointes suivent la même règle.

## Télécharger un export Courrier

1. Ouvrir **Réglages** dans Courrier.
2. Dans **Exporter tes données**, choisir **Télécharger l’archive**.
3. Conserver le ZIP dans un emplacement sûr, idéalement indépendant du compte Cloudflare.

La route `/api/export` exige une session autorisée par Cloudflare Access. L'archive contient :

- `README.txt`, qui explique le format ;
- `manifest.json` version 2, avec les métadonnées et états des messages, les brouillons, les fusions réversibles de fils, les règles d’expéditeurs et leur historique d’annulation, ainsi que les expéditeurs bloqués ;
- `messages/<id>.eml`, avec l'email RFC 822 reçu à l'origine ou, pour un email envoyé par Courrier, une copie RFC 822 reconstruite depuis le contenu remis à Cloudflare. Les pièces jointes MIME des messages reçus restent incluses dans leur `.eml`.

Le texte indexé des messages est reconstruit à partir du `.eml` pendant l’import ; l’index de recherche est recréé par les migrations et les déclencheurs SQLite. L’archive n’inclut pas la configuration d’infrastructure. Elle n’est pas chiffrée : toute personne qui peut la lire peut consulter le courrier qu’elle contient. Protège-la comme les emails originaux.

### Inspecter et restaurer une archive

Depuis la racine du dépôt, avec Node.js, les dépendances du projet et Wrangler installés :

```sh
npm run restore:inspect -- /chemin/vers/courrier-export-2026-10-05.zip
```

L’inspection ne contacte pas Cloudflare et ne crée aucune ressource. Elle vérifie la structure ZIP, le manifeste v2, les références entre lignes, les pièces MIME et les empreintes SHA-256 des originaux, puis affiche un résumé.

Pour restaurer, choisir deux noms de ressources **neuves** commençant par `courrier-restore-` :

```sh
npm run restore:apply -- /chemin/vers/courrier-export-2026-10-05.zip \\
  --database courrier-restore-20261005-test \\
  --bucket courrier-restore-20261005-test
```

La commande redemande une confirmation interactive exacte (`RESTORE <base> <bucket>`), crée les ressources en région WEUR, applique toutes les migrations du dépôt puis restaure les lignes D1 et les originaux/pièces jointes dans R2. Elle refuse les noms hors préfixe et ne remplace pas une ressource existante. Elle affiche le chemin de sa configuration Wrangler temporaire et la commande pour lancer localement l’application sur le port 3008 ; ce Worker local utilise des remote bindings reliés uniquement aux ressources de restauration. Les brouillons marqués `sending` gardent cet état incertain afin d’éviter un envoi en double ; vérifie la boîte destinataire avant de les débloquer. Vérifie l’application et les objets restaurés avant de supprimer manuellement ces ressources temporaires depuis Cloudflare. Le fichier de configuration temporaire est gardé pour cette vérification et peut ensuite être supprimé.

L’inspection accepte les archives ZIP non compressées produites par Courrier, jusqu’à 2 Gio au total, 64 Mio par entrée et 100 000 entrées. Les archives compressées, chiffrées, multi-disques ou ZIP64 ne sont pas prises en charge. Les exports v1 sont aussi acceptés : les champs ajoutés en v2 sont reconstruits quand ils sont déductibles ; les collections introduites après v1 sont initialisées vides, car un ancien export ne peut pas contenir cet historique. La commande ne supprime pas automatiquement les ressources Cloudflare en cas d’échec ou après validation : elle affiche les noms créés afin d’éviter toute suppression implicite.

## Résultat de l’exercice de restauration locale

Le 1 octobre 2026, un export de test contenant des messages de la boîte pilote a été restauré dans une copie temporaire du projet. Le test a utilisé Wrangler en mode local et des bindings locaux distincts ; le serveur de vérification a répondu sur `127.0.0.1:3007`. Le serveur de développement habituel et les ressources distantes n’ont pas été utilisés pour écrire les données restaurées.

Contrôles effectués :

- les 8 messages et leurs métadonnées ont été reconstruits à partir du manifeste et des fichiers `.eml` ; les SHA-256 des originaux correspondaient à leurs identifiants de contenu ;
- les règles d’expéditeurs, le blocage et les métadonnées de changement présents dans l’export ont été restaurés ;
- les références de pièces jointes pointaient vers des objets R2 locaux présents ;
- l’inbox s’est affichée dans le navigateur ; un fil de 2 messages est resté lisible après rechargement direct de son URL ;
- une pièce jointe a été téléchargée depuis l’application locale et son SHA-256 correspondait à l’objet extrait.

Il s’agissait d’un exercice manuel et ponctuel : la base locale a été initialisée avec les migrations du projet, puis les enregistrements et objets ont été reconstruits à partir de l’export et chargés dans les bindings locaux. L’importeur décrit ci-dessus n’existait pas encore lors de cet exercice. Les fichiers et le serveur temporaires de l’exercice ne sont pas des sauvegardes durables.

Cet exercice montre que l’application peut lire une boîte reconstruite depuis l’export dans un environnement isolé. Il ne teste pas le remplacement d’une base D1 de production par Time Travel, la recréation de buckets/bindings sur Cloudflare, une reprise après perte complète du compte, ni une restauration automatisée en CI/CD.

## Résultat de l’exercice sur des ressources Cloudflare isolées

Le 4 octobre 2026, la copie de test a aussi été restaurée dans une base D1 et un bucket R2 temporaires, séparés des ressources de production. La base vide a reçu les migrations courantes du projet, puis les données et les objets du snapshot ont été chargés manuellement. Le Worker applicatif a tourné localement sur `127.0.0.1:3008` avec ses bindings D1 et R2 reliés à ces seules ressources de test ; aucun Worker de test n’a été déployé.

Contrôles effectués :

- les 8 messages, 1 pièce jointe, 3 règles d’expéditeurs, 1 expéditeur bloqué et les métadonnées de changement de règle ont été retrouvés dans D1 ;
- les 9 objets R2 (8 originaux RFC 822 et 1 pièce jointe) ont été téléchargés et comparés octet par octet aux fichiers du snapshot ;
- l’Inbox s’est affichée dans le navigateur et le fil de deux messages était consultable ;
- la pièce jointe téléchargée depuis l’application correspondait octet par octet à l’objet du snapshot.

Les ressources `courrier-restore-drill-20261004` ont été supprimées après les vérifications. Cet exercice confirme une restauration manuelle vers des ressources Cloudflare neuves et isolées, ainsi que la lecture par l’application locale. Il ne teste pas une restauration de la base de production, une opération Time Travel, la remise en service d’un Worker ou d’un domaine, ni la récupération d’un compte Cloudflare entier.

## Vérification de l’importeur ZIP

Le 5 octobre 2026, l’importeur a d’abord été exécuté avec une archive synthétique contenant trois messages, une pièce jointe, un brouillon, des règles et blocages d’expéditeurs, l’historique de reclassement et une fusion réversible de deux fils. L’inspection a validé le manifeste, les empreintes et les relations. L’application locale a affiché les fils, les deux messages fusionnés et la pièce jointe.

Le même jour, il a ensuite été exécuté avec un export v1 réel de la boîte pilote : 26 messages, 1 pièce jointe, 6 règles d’expéditeurs, 1 expéditeur bloqué et 4 changements de règle. L’inspection a accepté les copies envoyées dont l’identifiant est un UUID, et vérifié les empreintes SHA-256 des messages entrants. Après restauration, les nombres de lignes des dix tables D1 correspondaient au manifeste, et l’Inbox s’est affichée dans Ego Browser sur `127.0.0.1:3008/mail/inbox`. Une capture a été conservée séparément. Les ressources de test ont été supprimées ensuite ; le serveur utilisateur sur le port 3004 et les ressources de production sont restés intacts.

Ces vérifications confirment l’import d’une archive synthétique et d’un export réel vers de nouvelles ressources isolées. Elles ne testent pas une restauration de production, Time Travel, la remise en service d’un Worker ou d’un domaine, ni la récupération d’un compte Cloudflare entier.

## Sauvegardes automatiques configurées

Pour reproduire ce dispositif sur un déploiement, prévoir une base D1, un bucket R2 principal et un bucket R2 privé distinct pour `BACKUP_STORE`. Le binding de sauvegarde et le déclencheur quotidien sont déclarés dans `wrangler.jsonc`. Aucun bucket ne doit avoir d'accès public pour contenir des emails. Vérifier dans le tableau de bord que le Worker déployé possède bien ces bindings et son déclencheur planifié.

### D1 : Time Travel

Cloudflare D1 conserve un historique permettant de restaurer la base à une minute donnée. Sur Workers Paid, la fenêtre documentée est de 30 jours ; Cloudflare indique que Time Travel est activé par défaut et que l'historique et la restauration n'ont pas de coût supplémentaire. La fenêtre réellement disponible ne peut pas précéder la création de la base : celle du pilote a été créée le 28 septembre 2026.

Pour récupérer D1, utiliser **Time Travel** dans la page de la base, choisir un point antérieur à l'incident et examiner l'impact avant de lancer la restauration. Cette opération remplace l'état courant de la base. Si Courrier répond encore, télécharger d'abord un export ZIP de l'état courant. Voir la [documentation D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

Time Travel protège l'historique de D1 ; il ne restaure pas les objets R2 correspondants. Après une restauration, vérifier que les clés R2 référencées existent encore.

### R2 : miroir quotidien

Le Worker planifie `mirrorMailObjects()` à **03:15 UTC chaque jour**. Il parcourt les objets `messages/` du bucket principal et copie les objets manquants ou de taille différente dans le bucket privé de secours. Il ne supprime pas automatiquement les copies. Les clés originales étant basées sur le contenu, les emails conservés sont normalement immuables.

Le miroir est dans le même compte Cloudflare que la boîte principale. Il aide à récupérer un objet effacé par erreur dans le bucket principal, mais ne protège pas contre la perte d'accès ou la compromission du compte entier. Il n'est pas une copie hors site indépendante.

La copie n'est pas un instantané transactionnel de D1 et R2 : un email arrivé après le passage quotidien peut attendre jusqu'au suivant avant d'être copié. Le statut du premier passage et les derniers contrôles opérationnels sont suivis dans [PLAN.md](../PLAN.md).

## Restaurer un objet R2

1. Identifier dans D1 le `raw_object_key` du message et, si nécessaire, les `object_key` des pièces jointes.
2. Dans le bucket privé de secours, retrouver chaque objet sous `mirror/<clé d'origine>`.
3. Copier ou télécharger puis réimporter l'objet dans le bucket principal en conservant exactement sa clé d'origine.
4. Vérifier que le message s'ouvre et que ses pièces jointes se téléchargent dans Courrier.

La restauration se fait depuis le tableau de bord Cloudflare ou Wrangler par un mainteneur. Évite de remplacer un objet existant sans avoir comparé les clés et le contenu. En cas de restauration D1 et R2 combinée, vérifie chaque référence D1 vers R2 après les deux opérations.

## Limites actuelles et entretien

- Le ZIP doit être téléchargé manuellement ; aucun export périodique hors Cloudflare n'est configuré.
- Le miroir R2 est une copie cumulative des objets présents ; ce n'est pas un historique versionné avec des points de restauration quotidiens.
- L’importeur automatise le chargement d’un export v2 vers de nouvelles ressources isolées. Les exercices précédents étaient manuels ; l’importeur doit encore être éprouvé sur une archive récente et ne remplace pas les ressources de production.
- Les règles Email Routing, Cloudflare Access, bindings et configuration de déploiement ne sont pas inclus dans l'export mail.
- Le modèle de coût Cloudflare peut évoluer. Consulte la [tarification R2](https://developers.cloudflare.com/r2/pricing/) et le tableau de bord du compte pour l'usage et les éventuels dépassements.

Avant d'utiliser Courrier pour conserver des messages importants, confirmer une exécution du miroir et faire un exercice de restauration avec des données synthétiques. Pour une copie durable hors du compte, télécharger régulièrement l'export ZIP et le stocker dans un emplacement protégé indépendant.
