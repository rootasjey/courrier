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
| Owner | read, write, send, classify, trash | manage | manage |
| Admin | read, write, send, classify, trash | manage | manage |
| Member | read, write, send, classify, trash | — | — |
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

The application now has email/password login and logout endpoints using Nuxt Auth Utils sealed cookies and its scrypt password verifier. Login requires a same-origin `Origin`, an active user with a password credential, and at least one active workspace membership. The session holds only the user identity, session version, and active workspace id; account APIs re-check the user, session version, workspace, and membership in D1. Workspace selection accepts only an active membership and replaces the sealed session. Failed login counts are keyed by SHA-256 hashes of normalized email plus Cloudflare client IP, with a second per-IP limit; raw IP addresses are not stored. These hashes are pseudonymous, not anonymization.

Cloudflare Access remains required for every application API, including the new account endpoints. The auth-utils session endpoint remains exempt from application middleware so session fetching works behind Access. No invitation acceptance, password setup/recovery, initial owner bootstrap, or administrator UI exists yet; therefore there is no production Courrier user who can use this login flow. Existing mail APIs still use their legacy domain-wide queries and do not consume the account session. Do not remove Access, expose account onboarding, or present this as tenant-isolated mail until the data migration, all-route authorization, first-owner provisioning, and cross-workspace denial checks are complete.
