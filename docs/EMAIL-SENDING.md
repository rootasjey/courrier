# Brouillons et réponses

## État du pilote — 1 octobre 2026

Cloudflare Email Sending indique `verbatims.cc` **Enabled** et **Configured** dans le compte Courrier. Le quota quotidien affiché est de 1 000 envois. Courrier utilise l’alias `courrier-test@verbatims.cc` comme expéditeur pour son premier parcours de réponse.

Le formulaire de réponse enregistre un brouillon dans D1. Chaque envoi passe par une confirmation dans l’interface et ajoute la réponse envoyée au fil, à D1 et à R2. Les en-têtes `In-Reply-To` et `References` relient la réponse au fil entrant. L’archive R2 d’un envoi est nommée `sent-copy.eml` : elle reconstitue le contenu texte transmis et l’identifiant fourni par Cloudflare, car Email Sending ne renvoie pas le MIME exact après traitement par le fournisseur.

## Garde-fous du prototype

- Le binding `EMAIL` limite l’expéditeur à `courrier-test@verbatims.cc` et aux destinataires explicitement autorisés pour le pilote. Le Worker vérifie aussi cette liste avant l’appel au binding.
- En local, le binding est simulé par Wrangler : aucun email réel n’est envoyé. Le contenu est journalisé par le simulateur ; Courrier conserve aussi une copie d’envoi dans les données locales. En production, le Worker utilise le service Cloudflare Email Sending.
- L’envoi n’utilise pas d’allowlist de destinataires à maintenir dans les secrets Cloudflare. Les réponses sont envoyées à l’expéditeur du message auquel on répond, sous réserve que le domaine d’envoi soit autorisé par Cloudflare et que la requête soit authentifiée par Cloudflare Access. Toute ancienne variable `COURRIER_ALLOWED_RECIPIENTS` configurée dans `.dev.vars` ou Workers Builds est désormais ignorée et peut être supprimée séparément.
- Cette suppression est une décision technique de Courrier, pas une autorisation d’usage accordée par Cloudflare : leur documentation actuelle indique que Email Service est destiné aux emails transactionnels et ne prend pas encore en charge les emails marketing. Vérifier la compatibilité auprès de Cloudflare avant d’utiliser ce service pour des campagnes marketing ou comme service d’envoi général. Voir la [FAQ Cloudflare Email Service](https://developers.cloudflare.com/email-service/reference/faq/).
- Le script `postbuild` ne modifie que le point d’entrée Worker généré. `npm run deploy` applique les migrations distantes puis déploie, sans exiger de liste de destinataires.
- L’envoi de nouveaux messages, les pièces jointes sortantes, les autres domaines, les autres expéditeurs et les destinataires externes ne sont pas activés dans ce premier parcours.
- Si Cloudflare renvoie une erreur dont l’acceptation est incertaine, ou si Courrier ne peut pas terminer l’archivage après acceptation, le brouillon reste verrouillé en `sending`. Vérifier la boîte destinataire avant toute nouvelle tentative afin d’éviter un doublon.
- Une réponse envoyée depuis la vue d’un message du Screener ou de la corbeille est refusée.

## Vérification de production

Le 2 octobre 2026, une réponse en texte seul a été envoyée depuis Courrier vers une boîte Gmail contrôlée. Elle est arrivée dans Gmail et apparaît dans Courrier comme le second message du fil. Gmail l’a rattachée à la conversation existante `Test Courrier 2` ; ce regroupement est cohérent avec les en-têtes de réponse, il ne s’agissait pas d’un nouveau fil autonome.

Les détails du message dans Gmail indiquent `courrier-test@verbatims.cc` comme expéditeur, `verbatims.cc` comme domaine signataire, `cf-bounce.verbatims.cc` comme relais et un chiffrement TLS. Dans **Afficher l’original**, Gmail rapporte **SPF PASS** (IP `104.30.16.86`), **DKIM PASS** pour `verbatims.cc` et **DMARC PASS**. Ces résultats confirment l’authentification de ce message de test précis ; ils ne suffisent pas à établir la réputation du domaine ni la délivrabilité vers d’autres fournisseurs.

Un second message de test, adressé à `jerem.t@codingbox.fr`, est arrivé dans HEY. Le message entrant utilisé pour ouvrir le fil a été classé dans l’Inbox pour ce message seulement ; aucune règle durable n’a été créée pour l’expéditeur. Dans **View original**, HEY rapporte `spf=pass` pour `bounces@cf-bounce.verbatims.cc` depuis `104.30.16.86`, `dkim=pass` pour `verbatims.cc` et `cloudflare-smtp.net`, et `dmarc=pass` pour `verbatims.cc`.

Le tableau de bord Email Sending Cloudflare affiche, pour `verbatims.cc`, **2 envois et 2 livraisons** sur les dernières 24 heures, un taux de livraison de **100 %** et des taux de bounce et de plainte de **0 %** sur les périodes affichées (24 heures et 7 jours). L’échantillon étant limité à deux messages, ces métriques ne démontrent pas une réputation stable. Aucun bounce réel n’a été provoqué ; continuer à observer les envois contrôlés et ne pas tester avec des adresses inventées.

L’envoi reste soumis à la confirmation explicite de l’utilisateur dans Courrier et à l’acceptation par Cloudflare. Continuer à observer les statistiques de livraison, bounces et plaintes à mesure que l’usage augmente. Cloudflare fournit ces statistiques dans l’onglet **Activity log** et sur la page d’aperçu du domaine. Cette observation concerne la délivrabilité et l’usage du service, pas une allowlist applicative.

Références Cloudflare : [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [restrictions de binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [en-têtes pris en charge](https://developers.cloudflare.com/email-service/reference/headers/).
