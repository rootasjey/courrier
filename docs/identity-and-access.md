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

Migration `0016` introduced identity/workspace metadata and backfilled a single legacy workspace with unverified domains. Migration `0019` adds explicit mailbox grants and binds standalone compose drafts to a sender mailbox. Mail access now requires both the existing workspace permission and an active grant for the exact mailbox. Missing or revoked grants deny access.

Before invitations or additional mail domains are enabled, subsequent work must:

1. Keep Cloudflare Access enabled until authenticated and denied behavior has been verified in production.
2. Keep the legacy domain's shared sender rules, blocks, thread merges, and private thread titles available only to members granted every active mailbox in that domain. Move these records to mailbox-level ownership before allowing partial-domain access to manage them independently.
3. Continue auditing every route for active user + active workspace membership + role permission + mailbox grant, including search, attachment content, raw MIME, export, sender rules, thread actions, draft actions, and sending.
4. Scope all SQL joins and R2 object access server-side. Never accept an object key or mailbox scope from the browser as authorization.
5. Resolve inbound mail from its exact envelope recipient to an active mailbox in an active workspace and non-suspended domain. Unknown, pending, or suspended recipients are rejected before message/attachment storage. The email-ingress trust path stays separate from browser sessions.
6. Add denial checks for cross-workspace IDs, suspended users/memberships, revoked invitations, attachments, raw messages, search, exports, and send endpoints.
7. Deploy additive migrations and the complete scoped application while Access remains enabled; only remove Access after production verification of both authenticated and denied requests.

## Administrator area

The platform console should show workspaces, domain verification state, mailbox counts, user memberships, invitations, and audit history. It can suspend/revoke metadata access and invite users. It must not show mailbox contents. Domain ownership changes require verification and an audit record. Workspace owners can administer members and domains inside their workspace without becoming platform administrators.

## Current implementation boundary

The application has email/password login and logout endpoints using Nuxt Auth Utils sealed cookies and its scrypt password verifier. Login requires a same-origin `Origin`, an active user with a password credential, and either an active workspace membership or a platform-admin record. The session holds the user identity, session version, and optional active workspace id; account APIs re-check the user and session version in D1. Mail APIs additionally require a valid active workspace membership and a role permission. Workspace selection accepts only an active membership and replaces the sealed session. The account menu offers workspace switching and a platform-admin link. A platform administrator without a workspace can sign in and reach the metadata console, but cannot access mail APIs. Failed login counts are keyed by SHA-256 hashes of normalized email plus Cloudflare client IP, with a second per-IP limit; raw IP addresses are not stored. These hashes are pseudonymous, not anonymization.

The initial owner was bootstrapped out of band as `jeremie@verbatims.cc` with owner membership in the legacy workspace and platform-administrator metadata. The `verbatims.cc` app domain remains `legacy_unverified`. Account identity alone grants no mailbox access: migration `0019` preserves existing active members' previous workspace-wide mail access with explicit grants for the mailboxes backfilled from legacy inbound recipients and for `courrier-test@verbatims.cc`, the configured sending identity. The migration does not create `jeremie@verbatims.cc` as a mailbox. Recovery, invitation management, mailbox-grant management, domain verification, and workspace mutations are not yet implemented.

Cloudflare Access remains required at the edge. The auth-utils session endpoint remains exempt from application API middleware so session fetching works behind Access. Profile avatars are stored under the account user id and require an account session. Mail APIs require a current account session, active workspace membership, a role permission, and an active grant to the relevant mailbox. Incoming messages are scoped to the exact envelope recipient; outgoing messages and standalone compose drafts are scoped to the sending mailbox. Reply drafts inherit access from their source message. Attachment bytes and raw MIME are served only after a scoped database lookup. Migration `0019` adds `mailbox_access_grants`; existing active members receive explicit grants for existing legacy mailboxes, while later memberships and mailboxes receive no implicit grant. Database triggers require each outgoing draft to point at a mailbox in its workspace. The admin overview is read-only and is limited to workspaces, domains, memberships, invitations without token hashes, and audit metadata without `details_json`.

The data model currently enforces tenant isolation through a domain-to-workspace mapping and exact mailbox grants, rather than a `mailbox_id` foreign key on every mail row. This preserves imported history while domains are being verified. It assumes each mail domain belongs to exactly one workspace; `workspace_domains.domain` is unique. Inbound routing now requires an exact active envelope-recipient mapping before storage, but legacy domains remain `legacy_unverified` until ownership verification is implemented. Because sender rules, blocked senders, manual merges, and private thread titles are still shared per domain, a user must have grants for every active mailbox in that domain before these domain-wide operations are visible or writable. Sending remains constrained to the legacy `verbatims.cc` workspace because the configured Cloudflare Email binding currently permits only `courrier-test@verbatims.cc`. Do not remove Access or invite new members until mailbox-grant administration is available and remote migrations, secret configuration, route-denial behavior, ingress routing, and sending identity have been verified.
