# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Nuxt, Vue, UnoCSS and Una UI; deployed on Cloudflare Workers with D1 and R2.

## Users

An owner-controlled mail client for several personal domains. Courrier supports invite-only accounts, workspace roles, explicit mailbox grants, workspace-level member administration, domain verification, and platform-admin mailbox provisioning. Broader collaboration and agent-owned inboxes remain outside its current scope.

## Product Purpose

Courrier provides a dedicated inbox for the user's domains, so incoming mail can be received, stored, read and organized in one place.

## Positioning

An owner-controlled, multi-domain personal mail client shaped around explicit sender screening and three intentional destinations: Imbox, The Feed and Paper Trail. HEY is a product and workflow reference; Courrier does not aim to reproduce all of HEY.

## Operating Context

Courrier receives mail for verified domains through exact Cloudflare Email Routing rules that deliver to a Worker. D1 stores normalized message data and R2 stores original messages and attachments. Domain onboarding and mailbox provisioning are managed in the platform console; workspace managers separately control membership and mailbox access. Local development uses separate local bindings by default.

## Capabilities and Constraints

- Receive and retain incoming RFC 822 messages and attachments.
- Screen unknown senders, then classify them into Imbox, The Feed or Paper Trail.
- A sender rule applies to future messages and may reclassify that sender's history.
- Invite-only accounts, workspaces, owner/admin/member/viewer roles, audited workspace management, and explicit mailbox grants are implemented. Cloudflare Access protects Worker previews; production relies on Courrier sessions and application authorization.
- Platform admins can add a domain, verify ownership with DNS TXT, inspect email-routing readiness, create mailboxes with initial access grants, and manage exact Cloudflare routing rules when the routing write secret is configured. Manual Cloudflare setup remains the fallback when it is not.
- Sending is limited to the configured pilot identity. Cross-user sharing and agents require explicit permission design.

## Brand Commitments

The product name is Courrier. The interface is available in French and English; mailbox names Imbox, The Feed and Paper Trail remain in English. The user wants a spacious, chronological mail list and a focused reading experience, while giving Courrier its own visual personality.

## Evidence on Hand

Production checks on 29 October 2026 confirmed test messages sent from Gmail to `verbatims.cc`, `corpinot.cc`, and `tronche.cc`, and from Outlook to `tronche.cc`, in Courrier and in the configured HEY forwarding destination. This is point-in-time evidence for those routes, not a long-term deliverability guarantee. Local and remote messages must remain distinguishable; illustrative content must never be presented as real mail.

## Product Principles

- Preserve original messages and attachments.
- Make sender classification explicit and understandable.
- Keep the inbox quiet by default; notifications are opt-in.
- Keep sending constrained to the configured pilot identity and behind explicit human confirmation; defer agent access until mailbox-level permissions and recovery paths have been exercised.
- Keep local development isolated from production data unless a deliberate read-only connection is configured.

## Open Decisions

Thread merging and splitting are available within a mailbox. The remaining onboarding work is to simplify Cloudflare credential provisioning, improve operational recovery and observe delivery over time. Broader sharing and agent access need separate product and permission design.
