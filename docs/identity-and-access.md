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

Registration remains invite-only. A platform administrator can invite an exact email as a `member` or `viewer`; workspace-level invitation management and `admin` invitations are intentionally not enabled yet. Invitation tokens are random, single-use bearer credentials with a seven-day expiry; only their SHA-256 hashes are stored. One pending invitation is allowed per email and workspace, and D1 enforces a limit of ten invitations per platform administrator per hour inside the write transaction. The email follows the administrator's selected French or English UI locale. Acceptance checks the token, email, expiry, revocation, workspace status, account state, and existing membership before creating the account and membership atomically. Existing accounts must sign in as the invited identity first. Revoking an invitation is audited. Workspace membership does not grant mailbox access: an administrator must assign exact mailbox grants separately.

Authentication sessions contain only the stable user id and a session version. The active workspace is selected separately and validated against D1 on each request. Changing a password, suspending a user, or revoking access increments the session version. Nuxt Auth Utils is now installed as the session foundation. Local Nuxt development uses a host-only `courrier-dev-session` cookie name; production uses a distinct `courrier-session` name. Production must provide `NUXT_SESSION_PASSWORD` as a Worker secret before any login flow is enabled.

## Data isolation rollout

Migration `0016` introduced identity/workspace metadata and backfilled a single legacy workspace with unverified domains. Migration `0019` adds explicit mailbox grants and binds standalone compose drafts to a sender mailbox. Mail access now requires both the existing workspace permission and an active grant for the exact mailbox. Missing or revoked grants deny access.

Before invitations are used for people outside the current Cloudflare Access policy, or Access is retired, subsequent work must:

1. Keep Cloudflare Access enabled at the edge until authenticated and denied behavior has been verified in production and a recovery procedure is usable.
2. Keep the legacy domain's shared sender rules, blocks, thread merges, and private thread titles available only to members granted every active mailbox in that domain. Move these records to mailbox-level ownership before allowing partial-domain access to manage them independently.
3. Continue auditing every route for active user + active workspace membership + role permission + mailbox grant, including search, attachment content, raw MIME, export, sender rules, thread actions, draft actions, and sending.
4. Scope all SQL joins and R2 object access server-side. Never accept an object key or mailbox scope from the browser as authorization.
5. Resolve inbound mail from its exact envelope recipient to an active mailbox in an active workspace and non-suspended domain. Unknown, pending, or suspended recipients are rejected before message/attachment storage. The email-ingress trust path stays separate from browser sessions.
6. Verify in production that cross-workspace IDs, suspended users/memberships, revoked or expired invitation tokens, attachments, raw messages, search, exports, and send endpoints are denied as expected.
7. Deploy additive migrations and the complete scoped application while Access remains enabled; only remove Access after production verification of both authenticated and denied requests.

## Administrator area

The platform console shows workspaces, domain verification state, mailbox counts, user memberships, invitations, and audit history. It can invite members/viewers, revoke pending invitations, and manage exact mailbox grants for active members and active mailboxes; it does not show message contents. Invitation and grant changes are platform-admin-only for now and append audit events. A workspace owner's grant cannot be revoked through this interface. The console currently caps its access-management lists at 500 mailboxes, 500 active members, and 5,000 grants, and reports when those caps hide records. Workspace-scoped member administration and domain ownership verification remain future work.

## Current implementation boundary

The application has email/password login, logout, and password recovery endpoints using Nuxt Auth Utils sealed cookies and its scrypt password verifier. Sessions expire after seven days. Login and password recovery mutations require a same-origin `Origin`; login requires an active user with a password credential and either an active workspace membership or a platform-admin record. A reset link is sent only for an active account with a password credential; its random bearer token is one-use, expires after one hour, and only its SHA-256 hash is stored. Reset requests are rate-limited per normalized email and client IP using hashes; raw IP addresses are not stored. A successful reset increments the user's session version, invalidates all existing sessions, and appends a metadata-only account audit event. Failed login counts are keyed by SHA-256 hashes of normalized email plus Cloudflare client IP, with a second per-IP limit; raw IP addresses are not stored. These hashes are pseudonymous, not anonymization.

The initial owner was bootstrapped out of band as `jeremie@verbatims.cc` with owner membership in the legacy workspace and platform-administrator metadata. The `verbatims.cc` app domain remains `legacy_unverified`. Account identity alone grants no mailbox access: migration `0019` preserves existing active members' previous workspace-wide mail access with explicit grants for mailboxes mapped from canonical legacy recipient addresses and historical sender identities, including `courrier-test@verbatims.cc`, the configured sending identity. The migration does not create `jeremie@verbatims.cc` as a mailbox. Workspace-scoped administration and mailbox provisioning are not yet implemented. Newly created mailboxes and memberships receive no automatic grant; an administrator must assign access explicitly once those provisioning flows exist.

Cloudflare Access remains configured at the production edge, so an invitee still needs to pass that external policy until it is changed. Courrier's Worker no longer depends on Access identity headers: registration through an invitation, login, workspace selection, and mail access are controlled by application sessions and permissions. Do not invite users outside the edge policy until the production cutover is reviewed. The auth-utils session endpoint is an explicit account route; all account endpoints validate their own session where needed. Every API response is marked private and non-cacheable. Profile avatars are stored under the account user id and require an account session. Mail APIs require a current account session, active workspace membership, a role permission, and an active grant to the relevant mailbox. Incoming messages are scoped to the exact envelope recipient; outgoing messages and standalone compose drafts are scoped to the sending mailbox. Reply drafts inherit access from their source message. Attachment bytes and raw MIME are served only after a scoped database lookup. Migration `0019` adds `mailbox_access_grants`; existing active members receive explicit grants for existing legacy mailboxes, while later memberships and mailboxes receive no implicit grant. The platform admin console can grant or revoke an existing member's exact mailbox grant; each change and its audit event are written in one D1 batch. Revocation preserves active owners' grants. Database triggers require each outgoing draft to point at a mailbox in its workspace. The admin overview omits invitation token hashes and audit `details_json`.

The data model currently enforces tenant isolation through a domain-to-workspace mapping and exact mailbox grants, rather than a `mailbox_id` foreign key on every mail row. This preserves imported history while domains are being verified. It assumes each mail domain belongs to exactly one workspace; `workspace_domains.domain` is unique. Inbound routing now requires an exact active envelope-recipient mapping before storage, but legacy domains remain `legacy_unverified` until ownership verification is implemented. Because sender rules, blocked senders, manual merges, and private thread titles are still shared per domain, a user must have grants for every active mailbox in that domain before these domain-wide operations are visible or writable. A partial grant permits mailbox-scoped mail operations only. Sending remains constrained to the legacy `verbatims.cc` workspace because the configured Cloudflare Email binding currently permits only `courrier-test@verbatims.cc`. Before retiring Access, verify production login with the bootstrapped account, session-secret configuration, authenticated and denied behavior for every API route, and a usable recovery procedure; keep Access in place until those checks pass.

## Cloudflare Access readiness

The application no longer reads Cloudflare Access identity headers. Email/password sessions, invite-only registration, explicit workspace membership, mailbox grants, same-origin mutation checks, and scoped API authorization are the application's access boundary. Password recovery uses one-hour single-use tokens and invalidates existing sessions. These controls have passed local HTTP integration tests, but the recovery migration and flow still need production verification after deployment.

The production Worker currently has a Cloudflare Access policy covering all traffic. Courrier does not yet implement its own MFA or step-up authentication for platform administrators. Do not remove Access from admin pages or admin APIs yet. After the production recovery and authorization checks pass, a narrower Access policy for `/admin` and `/api/admin/*` can preserve the existing second barrier while regular users reach Courrier through its account login. A full Access removal should wait for first-party MFA for platform administrators or an explicitly accepted equivalent control.
