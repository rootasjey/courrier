# Export et sauvegardes

Ce guide décrit comment Courrier conserve les emails, comment en télécharger une copie et ce que permettent les mécanismes de récupération actuels. Il s'adresse aux personnes qui utilisent ou déploient le projet.

> **État du pilote (1 octobre 2026) :** l’export ZIP est disponible. Le premier passage quotidien du miroir R2 a été constaté à 03:15 UTC. Un exercice manuel a confirmé qu’un fichier `.eml` synthétique, récupéré du bucket de secours après suppression temporaire de sa source, pouvait être remis sous sa clé d’origine avec une empreinte identique. Un second exercice a restauré les données d’un export de test dans des bindings D1 et R2 locaux isolés ; Courrier a affiché l’inbox et un fil de deux messages après rechargement, et une pièce jointe téléchargée avait la même empreinte SHA-256 que l’objet restauré. Cet exercice n’a modifié aucune ressource Cloudflare de production. Les deux exercices valident une récupération manuelle de données ; ils ne valident ni un importeur réutilisable, ni une restauration vers des ressources Cloudflare clonées, ni la synchronisation automatique d’un objet synthétique par le cron.

## Où sont les données ?

| Ressource | Contenu | Mécanisme de récupération |
| --- | --- | --- |
| D1 | En-têtes et corps texte normalisés, classement, état de lecture, corbeille, règles d'expéditeurs et métadonnées des pièces jointes | Time Travel de Cloudflare D1, restauration à un point dans le temps |
| R2 `MAIL_STORE` | Originaux RFC 822 (`.eml`) et objets de pièces jointes | Miroir quotidien vers un second bucket R2 ; export ZIP manuel |
| R2 `BACKUP_STORE` | Copie des objets de `MAIL_STORE`, sous le préfixe `mirror/` | Copie privée dans le même compte Cloudflare ; restauration manuelle |

Le miroir copie les objets sous `messages/`, y compris les originaux et les fichiers de pièces jointes. Pour un objet d'origine `messages/<id>/original.eml`, sa copie se trouve sous `mirror/messages/<id>/original.eml` ; les pièces jointes suivent la même règle.

## Télécharger un export Courrier

1. Ouvrir **Réglages** dans Courrier.
2. Dans **Exporter tes données**, choisir **Télécharger l’archive**.
3. Conserver le ZIP dans un emplacement sûr, idéalement indépendant du compte Cloudflare.

La route `/api/export` exige une session autorisée par Cloudflare Access. L'archive contient :

- `README.txt`, qui explique le format ;
- `manifest.json`, avec les métadonnées des messages, les pièces jointes référencées, les classements et états Courrier, ainsi que les règles et expéditeurs bloqués ;
- `messages/<id>.eml`, avec l'email RFC 822 reçu à l'origine ou, pour un email envoyé par Courrier, une copie RFC 822 reconstruite depuis le contenu remis à Cloudflare. Les pièces jointes MIME des messages reçus restent incluses dans leur `.eml`.

L'export est une copie lisible et portable, pas une sauvegarde SQL restaurable automatiquement. Courrier ne possède pas encore d'importeur qui reconstruise une boîte à partir de ce ZIP. Le ZIP n'est pas chiffré : toute personne qui peut le lire peut consulter le courrier qu'il contient. Protège-le comme les emails originaux.

## Résultat de l’exercice de restauration locale

Le 1 octobre 2026, un export de test contenant des messages de la boîte pilote a été restauré dans une copie temporaire du projet. Le test a utilisé Wrangler en mode local et des bindings locaux distincts ; le serveur de vérification a répondu sur `127.0.0.1:3007`. Le serveur de développement habituel et les ressources distantes n’ont pas été utilisés pour écrire les données restaurées.

Contrôles effectués :

- les 8 messages et leurs métadonnées ont été reconstruits à partir du manifeste et des fichiers `.eml` ; les SHA-256 des originaux correspondaient à leurs identifiants de contenu ;
- les règles d’expéditeurs, le blocage et les métadonnées de changement présents dans l’export ont été restaurés ;
- les références de pièces jointes pointaient vers des objets R2 locaux présents ;
- l’inbox s’est affichée dans le navigateur ; un fil de 2 messages est resté lisible après rechargement direct de son URL ;
- une pièce jointe a été téléchargée depuis l’application locale et son SHA-256 correspondait à l’objet extrait.

Il s’agissait d’un exercice manuel et ponctuel : la base locale a été initialisée avec les migrations du projet, puis les enregistrements et objets ont été reconstruits à partir de l’export et chargés dans les bindings locaux. Il n’existe pas encore de commande Courrier qui transforme un export ZIP en boîte restaurée. Le téléchargement du ZIP par lui-même ne permet donc pas de répéter ces étapes automatiquement. Les fichiers et le serveur temporaires de l’exercice ne sont pas des sauvegardes durables.

Cet exercice montre que l’application peut lire une boîte reconstruite depuis l’export dans un environnement isolé. Il ne teste pas le remplacement d’une base D1 de production par Time Travel, la recréation de buckets/bindings sur Cloudflare, une reprise après perte complète du compte, ni une restauration automatisée en CI/CD.

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
- La restauration complète de R2 et D1 n'est pas automatisée. Un exercice manuel a vérifié la lecture d'une copie reconstruite localement, mais pas la restauration vers des ressources Cloudflare clonées.
- Les règles Email Routing, Cloudflare Access, bindings et configuration de déploiement ne sont pas inclus dans l'export mail.
- Le modèle de coût Cloudflare peut évoluer. Consulte la [tarification R2](https://developers.cloudflare.com/r2/pricing/) et le tableau de bord du compte pour l'usage et les éventuels dépassements.

Avant d'utiliser Courrier pour conserver des messages importants, confirmer une exécution du miroir et faire un exercice de restauration avec des données synthétiques. Pour une copie durable hors du compte, télécharger régulièrement l'export ZIP et le stocker dans un emplacement protégé indépendant.
