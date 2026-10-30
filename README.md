# Courrier

Courrier is a personal, multi-domain email workspace. It receives mail for explicitly configured addresses and brings those messages into a private inbox where they can be screened, organized, searched, replied to, and exported.

## Current status

Courrier is an actively developed pilot, not a general-purpose hosted email provider. The web app runs on Nuxt and Vue and is deployed to Cloudflare Workers. Cloudflare D1 stores application data; R2 stores original messages and attachments.

As of 30 October 2026, the production pilot has three verified domains: `corpinot.cc`, `tronche.cc`, and `verbatims.cc`. Controlled inbound tests from Gmail reached Courrier for all three domains. An Outlook test to `tronche.cc` also reached Courrier and its configured copy appeared in HEY. After the latest deployment, a disposable mailbox on `tronche.cc` was created with an exact Cloudflare rule, archived, and permanently deleted. The audit log recorded each lifecycle action, and Cloudflare no longer showed the disposable rule; the existing `support@tronche.cc` rule remained active and catch-all remained disabled. No message was sent to the disposable mailbox. These checks confirm those test paths at that time; they do not establish long-term deliverability or prove that every address on each domain is configured. The Cloudflare deletion-refusal fallback is covered by local tests with a simulated 403; it was not forced in production.

## Features

- Separate workspaces, verified domains, exact mailboxes, membership roles, and explicit mailbox access grants.
- Inbound screening through the Screener, with messages organized into Imbox, The Feed, and Paper Trail.
- Thread reading, search, sender rules, shared contacts and tags, drafts, and replies.
- Mailbox administration for verified domains, including creation and lifecycle controls. When the Cloudflare Email Routing write secret is configured, Courrier can manage an exact-address routing rule for a mailbox; a manual setup path remains available when it is not.
- Message export and documented recovery procedures.
- Passkey-based MFA for platform administration and audit events for sensitive administrative actions.

Courrier only receives messages that Cloudflare routes to its Worker. A configured mailbox is an exact address; adding a domain does not automatically accept every possible address on that domain. Domain verification, MX records, Email Routing, and the destination address must be configured and checked separately.

## Local development

Requirements: Node.js, npm, and the Wrangler CLI provided by the project dependencies.

```sh
npm install
npm run db:migrate:local
npm run dev
```

Nuxt normally serves the app at `http://localhost:3000`. Local development uses a project-specific session cookie name so another app on a different localhost port does not overwrite Courrier's login session. Local Cloudflare bindings and development secrets belong in ignored local configuration files; never commit credentials.

## Checks

```sh
npm run test:auth
npm run test:email
npm run build
```

`test:auth` covers account, workspace, and authorization flows. `test:email` covers mail handling and related behavior. `build` creates the Nuxt/Cloudflare Worker output.

## Cloudflare deployment

The production Worker configuration is in `wrangler.jsonc`; the separate canary configuration is `wrangler.canary.jsonc`. Production deployments are normally made through the repository's configured Cloudflare Workers Builds integration.

`npm run deploy` builds the app, applies pending migrations to the **remote production D1 database**, and deploys the Worker with Wrangler. Run it only when a direct production deployment is intended. `npm run deploy:canary` targets the configured canary environment.

Cloudflare bindings and secrets must be configured for the target environment. In particular, automatic domain-readiness checks and mailbox routing changes use the `COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN` and `COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN` secrets respectively. Keep these least-privileged and never put their values in source control.

## Documentation

- [Roadmap and validation status](./PLAN.md)
- [Product model](./PRODUCT.md)
- [Design direction](./DESIGN.md)
- [Identity, workspaces, and access](./docs/identity-and-access.md)
- [Email sending](./docs/EMAIL-SENDING.md)
- [Mailbox classification](./docs/MAILBOX-CLASSIFICATION.md)
- [Imbox workflow](./docs/IMBOX-UX.md)
- [Exports and backups](./docs/DATA-EXPORT-AND-BACKUPS.md)
- [Contact logos](./docs/CONTACT-LOGOS.md)
