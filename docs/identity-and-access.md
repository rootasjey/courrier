# Identity, workspaces, and administration

## Product model

- A **user** is one human identity and may belong to several workspaces.
- A **workspace** is the security boundary. It owns domains, mailboxes, and mail data.
- A verified **domain** belongs to one workspace. A domain is never a permission by itself.
- A **mailbox** is an exact recipient address under one workspace domain.
- A user switches workspace in the UI. The server resolves the active workspace again on every request and checks current membership; a workspace id in a cookie or URL is never proof of access.
- A **platform administrator** manages workspace and identity metadata. This role grants no access to message bodies, attachments, exports, or send operations.

## Roles

Workspace roles are deliberately fixed in the first release:

| Role | Mail | Members | Domains and settings |
| --- | --- | --- | --- |
| Owner | read, write, send, classify, trash, export | manage | manage |
| Admin | read, write, send, classify, trash, export | manage | manage |
| Member | read, write, send, classify, trash, export | — | — |
| Viewer | read | — | — |

The `role_permissions` table is the source of grants. The client may hide unavailable actions, but every API operation must enforce its permission in the server. There are no user-defined roles in this first version.

Platform administration uses the separate `platform_admins` table and a separate permission namespace. Workspace roles must never imply platform access. Sensitive administrative changes write an append-only audit event without message contents, credentials, invitation tokens, or other secrets.

## Account onboarding

Registration remains invite-only. A workspace owner/admin creates an invitation for an exact email and role. The database stores only a hash of the one-time token; acceptance checks the hash, expiry, revocation, normalized invited email, and workspace status in one transaction. A first platform administrator must be bootstrapped out of band while Cloudflare Access is still required; there is no public first-admin endpoint and no domain-name-based admin inference.

Authentication sessions contain only the stable user id and a session version. The active workspace is selected separately and validated against D1 on each request. Changing a password, suspending a user, or revoking access increments the session version. Nuxt Auth Utils is now installed as the session foundation. Local Nuxt development uses a host-only `courrier-dev-session` cookie name; production uses a distinct `courrier-session` name. Production must provide `NUXT_SESSION_PASSWORD` as a Worker secret before any login flow is enabled.

## Data isolation rollout

Migration `0016` introduces identity/workspace metadata and backfills a single legacy workspace with unverified domains. It creates no users, grants no membership, and does not alter current mail behavior. It is a schema foundation, not a production-ready multi-user release.

Before app authentication can replace Cloudflare Access, subsequent work must:

1. Provision an initial owner through a documented, one-time operator path.
2. Move every message, draft, attachment, merge, sender rule, classification change, and thread subject to an exact `mailbox_id` or workspace scope, preserving existing data.
3. Require active user + active workspace membership + permission on every API route, including search, attachment content, raw MIME, avatar, export, sender rules, thread actions, draft actions, and sending.
4. Scope all SQL joins and R2 object access server-side. Never accept an object key or mailbox scope from the browser as authorization.
5. Resolve inbound mail from its verified envelope recipient to one active mailbox. Keep the email-ingress trust path separate from browser sessions.
6. Add denial checks for cross-workspace IDs, suspended users/memberships, revoked invitations, attachments, raw messages, search, exports, and send endpoints.
7. Deploy additive migrations and the complete scoped application while Access remains enabled; only remove Access after production verification of both authenticated and denied requests.

## Administrator area

The platform console should show workspaces, domain verification state, mailbox counts, user memberships, invitations, and audit history. It can suspend/revoke metadata access and invite users. It must not show mailbox contents. Domain ownership changes require verification and an audit record. Workspace owners can administer members and domains inside their workspace without becoming platform administrators.

## Current implementation boundary

The application has email/password login and logout endpoints using Nuxt Auth Utils sealed cookies and its scrypt password verifier. Login requires a same-origin `Origin`, an active user with a password credential, and either an active workspace membership or a platform-admin record. The session holds the user identity, session version, and optional active workspace id; account APIs re-check the user and session version in D1. Mail APIs additionally require a valid active workspace membership and a role permission. Workspace selection accepts only an active membership and replaces the sealed session. The account menu offers workspace switching and a platform-admin link. A platform administrator without a workspace can sign in and reach the metadata console, but cannot access mail APIs. Failed login counts are keyed by SHA-256 hashes of normalized email plus Cloudflare client IP, with a second per-IP limit; raw IP addresses are not stored. These hashes are pseudonymous, not anonymization.

The initial owner was bootstrapped out of band as `jeremie@verbatims.cc` with owner membership in the legacy workspace and platform-administrator metadata. The `verbatims.cc` app domain remains `legacy_unverified`, and that address is not yet an app mailbox; the account identity alone grants no access to that address's incoming mail. Recovery, invitation management, domain verification, and workspace mutations are not yet implemented.

Cloudflare Access remains required at the edge. The auth-utils session endpoint remains exempt from application API middleware so session fetching works behind Access. Profile avatars are stored under the account user id and require an account session. Mail APIs require a current account session, active workspace membership, and a permission. Message, search, export, attachment, thread, classification, and draft queries are scoped to domains belonging to that active workspace. Standalone outgoing drafts carry a workspace id through migration `0018`; database triggers reject new or updated drafts without one. The admin overview is read-only and is limited to workspaces, domains, memberships, invitations without token hashes, and audit metadata without `details_json`.

The data model currently enforces tenant isolation by workspace domain, not by a foreign key on every mail row. This preserves the imported legacy mailbox history while domains are being verified. It assumes each mail domain belongs to exactly one workspace; `workspace_domains.domain` is unique. Inbound routing still needs an explicit verified envelope-recipient-to-mailbox mapping before adding more domains or retiring Access. Sending remains constrained to the legacy `verbatims.cc` workspace because the configured Cloudflare Email binding currently permits only `courrier-test@verbatims.cc`. Do not remove Access or enable additional workspaces/domains for production mail until remote migrations, secret configuration, route-denial behavior, ingress routing, and sending identity have been verified.
