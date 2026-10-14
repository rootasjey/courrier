# Brouillons et réponses

## État du pilote — 1 octobre 2026

Cloudflare Email Sending indique `verbatims.cc` **Enabled** et **Configured** dans le compte Courrier. Le quota quotidien affiché est de 1 000 envois. Courrier utilise l’alias `courrier-test@verbatims.cc` comme expéditeur pour son premier parcours de réponse.

Le formulaire de réponse enregistre un brouillon dans D1. Chaque envoi passe par une confirmation dans l’interface et ajoute la réponse envoyée au fil, à D1 et à R2. Les en-têtes `In-Reply-To` et `References` relient la réponse au fil entrant. L’archive R2 d’un envoi est nommée `sent-copy.eml` : elle reconstitue le contenu texte transmis et l’identifiant fourni par Cloudflare, car Email Sending ne renvoie pas le MIME exact après traitement par le fournisseur.

## Rédaction autonome — déployée le 13 octobre 2026

Le compositeur `Écrire` et la liste des brouillons sont déployés par Workers Builds depuis `main` (commit `943f121`, version Worker `fad3bbda`, 100 % du trafic, état Ready). `Écrire` ouvre un nouveau brouillon au lieu de reprendre le dernier ; le compteur de brouillons ouvre `/mail/drafts`, qui permet de les ouvrir ou de les supprimer. Le compositeur permet de saisir plusieurs destinataires séparés par des virgules, points-virgules ou espaces, de formater le message avec Tiptap, d’ajouter des images intégrées et des pièces jointes conservées dans R2, puis de confirmer l’envoi. L’expéditeur reste `courrier-test@verbatims.cc`.

Les fichiers sont limités à 32. Courrier estime la taille du message MIME complet, y compris le corps, l’encodage base64 des pièces jointes et les en-têtes, et garde une marge de 64 Kio sous la limite Cloudflare de 5 Mio. Le compositeur affiche cette estimation et bloque l’ajout ou l’envoi qui dépasserait le budget. Les images intégrées sont limitées à JPEG, PNG, GIF et WebP. En local, Wrangler simule l’envoi : la vérification de l’interface ne prouve pas la livraison. Les routes `/mail/inbox` et `/mail/drafts` ont été vérifiées visuellement en production. Le 14 octobre, deux envois de contrôle enrichis depuis le compositeur autonome ont été marqués **Delivered** dans le journal Cloudflare : un vers Gmail et un vers HEY. Les deux incluaient titres HTML, liste à puces et pièce jointe texte ; le rendu et la pièce jointe ont été vérifiés dans chaque boîte. Les copies sont aussi présentes dans Courrier. Gmail confirme SPF PASS (IP `104.30.16.86`), DKIM PASS pour `verbatims.cc` et DMARC PASS. L’original HEY confirme SPF PASS (IP `104.30.16.86`), DKIM PASS pour `verbatims.cc` et `cloudflare-smtp.net`, et DMARC PASS pour `verbatims.cc`. Wrangler, avec `wrangler.jsonc`, ne signale aucune migration distante à appliquer ; cela confirme que toutes les migrations locales déclarées, dont `0013` et `0014`, sont déjà appliquées.

## Piste différée — pièces jointes volumineuses via R2

Cette piste est à explorer lors d’un cycle ultérieur ; elle ne fait pas partie du compositeur actuel. Pour les fichiers trop volumineux pour être joints directement au message, Courrier pourrait les stocker dans un bucket R2 privé et insérer un lien de téléchargement dans l’email. Les petites pièces jointes continueraient à être envoyées normalement.

Pour une image volumineuse insérée dans le corps, étudier la génération d’une miniature légère affichée dans le message, avec un lien vers l’image originale. Si l’email dépasse le budget actuel, l’image originale serait partagée par lien plutôt qu’intégrée en MIME.

Avant l’implémentation, décider :

- combien de temps conserver les fichiers dans R2 et comment leur suppression automatique sera configurée ;
- comment protéger les téléchargements et quelle durée donner aux liens ;
- comment révoquer un lien avant son expiration (par exemple, via un endpoint Courrier contrôlé par un jeton révocable plutôt qu’une URL pré-signée seule) ;
- quelles tailles et quels formats accepter, et si les miniatures sont générées à l’envoi ou à la demande.

Les URL pré-signées R2 sont une option à évaluer, pas encore un choix arrêté : elles donnent accès à quiconque possède l’URL jusqu’à son expiration. Voir la documentation Cloudflare sur les [URL pré-signées R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) et les [règles de cycle de vie des objets](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Garde-fous du prototype

- Le binding `EMAIL` limite l’expéditeur à `courrier-test@verbatims.cc`. Courrier ne maintient pas d’allowlist applicative des destinataires ; l’accès à l’API est protégé par Cloudflare Access et chaque envoi est confirmé dans l’interface.
- En local, le binding est simulé par Wrangler : aucun email réel n’est envoyé. Le contenu est journalisé par le simulateur ; Courrier conserve aussi une copie d’envoi dans les données locales. En production, le Worker utilise le service Cloudflare Email Sending.
- Les réponses sont envoyées à l’expéditeur du message auquel on répond, sous réserve que le domaine d’envoi soit autorisé par Cloudflare et que la requête soit authentifiée par Cloudflare Access. Toute ancienne variable `COURRIER_ALLOWED_RECIPIENTS` configurée dans `.dev.vars` ou Workers Builds est désormais ignorée et peut être supprimée séparément.
- Cette suppression est une décision technique de Courrier, pas une autorisation d’usage accordée par Cloudflare : leur documentation actuelle indique que Email Service est destiné aux emails transactionnels et ne prend pas encore en charge les emails marketing. Vérifier la compatibilité auprès de Cloudflare avant d’utiliser ce service pour des campagnes marketing ou comme service d’envoi général. Voir la [FAQ Cloudflare Email Service](https://developers.cloudflare.com/email-service/reference/faq/).
- Le script `postbuild` ne modifie que le point d’entrée Worker généré. `npm run deploy` applique les migrations distantes puis déploie, sans exiger de liste de destinataires.
- Les réponses à des messages reçus restent prises en charge. Le compositeur autonome et la liste de brouillons sont déployés ; un premier envoi réel du compositeur vers Gmail a validé la livraison, le HTML et une pièce jointe texte. Les pièces jointes entrantes restent consultables dans Courrier. L’expéditeur reste limité à `courrier-test@verbatims.cc`.
- Si Cloudflare renvoie une erreur dont l’acceptation est incertaine, ou si Courrier ne peut pas terminer l’archivage après acceptation, le brouillon reste verrouillé en `sending`. Vérifier la boîte destinataire avant toute nouvelle tentative afin d’éviter un doublon.
- Une réponse envoyée depuis la vue d’un message du Screener ou de la corbeille est refusée.

## Vérification de production

Le 2 octobre 2026, une réponse en texte seul a été envoyée depuis Courrier vers une boîte Gmail contrôlée. Elle est arrivée dans Gmail et apparaît dans Courrier comme le second message du fil. Gmail l’a rattachée à la conversation existante `Test Courrier 2` ; ce regroupement est cohérent avec les en-têtes de réponse, il ne s’agissait pas d’un nouveau fil autonome.

Les détails du message dans Gmail indiquent `courrier-test@verbatims.cc` comme expéditeur, `verbatims.cc` comme domaine signataire, `cf-bounce.verbatims.cc` comme relais et un chiffrement TLS. Dans **Afficher l’original**, Gmail rapporte **SPF PASS** (IP `104.30.16.86`), **DKIM PASS** pour `verbatims.cc` et **DMARC PASS**. Ces résultats confirment l’authentification de ce message de test précis ; ils ne suffisent pas à établir la réputation du domaine ni la délivrabilité vers d’autres fournisseurs.

Un second message de test, adressé à `jerem.t@codingbox.fr`, est arrivé dans HEY. Le message entrant utilisé pour ouvrir le fil a été classé dans l’Inbox pour ce message seulement ; aucune règle durable n’a été créée pour l’expéditeur. Dans **View original**, HEY rapporte `spf=pass` pour `bounces@cf-bounce.verbatims.cc` depuis `104.30.16.86`, `dkim=pass` pour `verbatims.cc` et `cloudflare-smtp.net`, et `dmarc=pass` pour `verbatims.cc`.

Le 14 octobre 2026, un message autonome de contrôle a été envoyé à la boîte Gmail de l’utilisateur, sans autre destinataire. Gmail l’a reçu dans la boîte de réception (pas dans Spam). Le message contient un `h1`, un `h2`, un paragraphe, une liste à puces et un petit fichier texte ; Gmail expose ces titres et éléments de liste comme HTML et affiche la pièce jointe après son contrôle antivirus. Courrier a également créé le fil `[TEST COURRIER] Mise en forme et pièce jointe` dans Inbox avec le contenu. Les détails Gmail montrent `courrier-test@verbatims.cc`, le relais `cf-bounce.verbatims.cc`, la signature `verbatims.cc` et TLS. **Afficher l’original** confirme SPF PASS (IP `104.30.16.86`), DKIM PASS pour `verbatims.cc` et DMARC PASS pour ce message.

Un second envoi autonome enrichi, adressé à `jc@codingbox.fr`, a été marqué **Delivered** dans Cloudflare et apparaît dans HEY. La vue du message montre le `h1`, le paragraphe, le `h2`, les trois éléments de la liste à puces et la pièce jointe `courrier-hey-attachment-test.txt`. Le fil est également présent dans Courrier. L’original HEY confirme SPF PASS (IP `104.30.16.86`), DKIM PASS pour `verbatims.cc` et `cloudflare-smtp.net`, et DMARC PASS pour `verbatims.cc`.

Le 14 octobre, un message de contrôle HTML avec le fichier texte `courrier-outlook-test.txt` a été envoyé à l’adresse du compte Outlook connecté (`jeremiecorpinot@outlook.com`), sans autre destinataire. Outlook l’a trouvé dans la boîte de réception ; le panneau de lecture expose le titre, les paragraphes, le sous-titre, la liste à puces et la pièce jointe (436 octets). La recherche Courrier retrouve aussi une copie dans Inbox avec le corps attendu. La source Outlook rapporte SPF PASS depuis `104.30.16.86`, DKIM PASS pour `verbatims.cc` et `cloudflare-smtp.net`, DMARC PASS pour `verbatims.cc`, ainsi que `compauth=pass`.

Le même jour, une réponse de contrôle depuis HEY vers `courrier-test@verbatims.cc` est apparue dans Inbox sous l’objet `Re: [TEST COURRIER] HTML et pièce jointe — HEY`. Courrier l’a groupée avec le message envoyé d’origine ; le compteur du fil indique 2 messages et l’extrait affiche le texte de réponse.

Lors d’une vérification du 14 octobre, avant le contrôle Outlook décrit ci-dessus, le journal Cloudflare Email Sending de `verbatims.cc`, réglé sur les dernières 24 heures, affichait **3 événements et 3 résultats Delivered** : les contrôles vers Gmail et HEY ainsi que l’envoi autonome précédent vers HEY. Le tableau de bord affichait alors un quota journalier de **3 / 1 000**. Aucun bounce ou rejet n’apparaissait parmi ces événements ; l’aperçu des taux de bounce et de plainte n’a pas été exploité pendant cette vérification. Cet échantillon réduit ne démontre pas une réputation stable. Aucun bounce réel n’a été provoqué ; continuer à observer les envois contrôlés et ne pas tester avec des adresses inventées.

L’envoi reste soumis à la confirmation explicite de l’utilisateur dans Courrier et à l’acceptation par Cloudflare. Continuer à observer les statistiques de livraison, bounces et plaintes à mesure que l’usage augmente. Cloudflare fournit ces statistiques dans l’onglet **Activity log** et sur la page d’aperçu du domaine. Cette observation concerne la délivrabilité et l’usage du service, pas une allowlist applicative.

Références Cloudflare : [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [restrictions de binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [en-têtes pris en charge](https://developers.cloudflare.com/email-service/reference/headers/).
