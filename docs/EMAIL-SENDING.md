# Brouillons et réponses

## État du pilote — 1 octobre 2026

Cloudflare Email Sending indique `verbatims.cc` **Enabled** et **Configured** dans le compte Courrier. Le quota quotidien affiché est de 1 000 envois. Courrier utilise l’alias `courrier-test@verbatims.cc` comme expéditeur pour son premier parcours de réponse.

Le formulaire de réponse enregistre un brouillon dans D1. Chaque envoi passe par une confirmation dans l’interface et ajoute la réponse envoyée au fil, à D1 et à R2. Les en-têtes `In-Reply-To` et `References` relient la réponse au fil entrant. L’archive R2 d’un envoi est nommée `sent-copy.eml` : elle reconstitue le contenu texte transmis et l’identifiant fourni par Cloudflare, car Email Sending ne renvoie pas le MIME exact après traitement par le fournisseur.

## Garde-fous du prototype

- Le binding `EMAIL` limite l’expéditeur à `courrier-test@verbatims.cc` et aux destinataires explicitement autorisés pour le pilote. Le Worker vérifie aussi cette liste avant l’appel au binding.
- En local, le binding est simulé par Wrangler : aucun email réel n’est envoyé. Le contenu est journalisé par le simulateur ; Courrier conserve aussi une copie d’envoi dans les données locales. En production, le Worker utilise le service Cloudflare Email Sending.
- Les destinataires ne sont pas stockés dans le dépôt. `COURRIER_ALLOWED_RECIPIENTS` est configuré en Production dans Cloudflare à deux endroits : comme secret runtime du Worker pour le contrôle de l’API, et comme secret de build Workers Builds pour générer `allowed_destination_addresses` dans le Wrangler de déploiement. Le build échoue en CI si le secret manque. En local, la liste se configure dans `.dev.vars`, ignoré par Git ; le build l’utilise aussi pour générer la restriction du binding. Après toute modification de `.dev.vars`, redémarrer le serveur local pour recharger les bindings.
- La commande manuelle `npm run deploy` vérifie la présence d’une allowlist valide dans la configuration générée avant d’appliquer les migrations distantes. Elle s’arrête si cette restriction est absente.
- L’envoi de nouveaux messages, les pièces jointes sortantes, les autres domaines, les autres expéditeurs et les destinataires externes ne sont pas activés dans ce premier parcours.
- Si Cloudflare renvoie une erreur dont l’acceptation est incertaine, ou si Courrier ne peut pas terminer l’archivage après acceptation, le brouillon reste verrouillé en `sending`. Vérifier la boîte destinataire avant toute nouvelle tentative afin d’éviter un doublon.
- Une réponse envoyée depuis la vue d’un message du Screener ou de la corbeille est refusée.

## Vérification à effectuer avant la mise en production

Le domaine d’envoi est prêt côté tableau de bord, mais le nouveau binding et le parcours d’envoi de Courrier n’ont pas encore été déployés ni utilisés pour envoyer un email. Avant d’envoyer le premier message réel, ouvrir une réponse à un email de test reçu de Gmail, vérifier le brouillon et le destinataire, confirmer l’envoi, puis contrôler le message dans Gmail et le fil dans Courrier. Ne retirer aucun relais de réception pendant cette vérification.

Références Cloudflare : [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [restrictions de binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/), [en-têtes pris en charge](https://developers.cloudflare.com/email-service/reference/headers/).
