# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Nuxt, Vue, UnoCSS and Una UI; deployed on Cloudflare Workers with D1 and R2.

## Users

An owner-controlled mail client for several personal domains. The current pilot supports invite-only accounts, workspaces, roles and mailbox grants; workspace self-service, broader collaboration and agent-owned inboxes remain outside its current scope.

## Product Purpose

Courrier provides a dedicated inbox for the user's domains, so incoming mail can be received, stored, read and organized in one place.

## Positioning

An owner-controlled, multi-domain personal mail client shaped around explicit sender screening and three intentional destinations: Imbox, The Feed and Paper Trail. HEY is a product and workflow reference; Courrier does not need to reproduce all of HEY.

## Operating Context

The initial mailbox is for `verbatims.cc`, with a dedicated pilot address. Cloudflare Email Routing delivers incoming messages to a Worker; D1 stores normalized message data and R2 stores original messages and attachments. Local development uses separate local bindings by default.

## Capabilities and Constraints

- Receive and retain incoming RFC 822 messages and attachments.
- Screen unknown senders, then classify them into Imbox, The Feed or Paper Trail.
- A sender rule applies to future messages and may reclassify that sender's history.
- The current pilot supports invite-only accounts, workspaces, roles and explicit mailbox grants. Cloudflare Access protects Worker previews; production relies on Courrier sessions and application authorization.
- Sending is limited to the configured pilot identity. Cross-user sharing and agents require explicit permission design.

## Brand Commitments

The product name is Courrier. The interface is available in French and English; mailbox names Imbox, The Feed and Paper Trail remain in English. The user wants the interface to take clear inspiration from HEY's spacious, chronological mail-list and focused reading experience, while giving Courrier its own visual personality.

## Evidence on Hand

The repository contains a working Cloudflare email-receive pilot for `courrier-test@verbatims.cc` and local synthetic email fixtures. Local and remote messages must remain distinguishable; illustrative content must never be presented as real mail.

## Product Principles

- Preserve original messages and attachments.
- Make sender classification explicit and understandable.
- Keep the inbox quiet by default; notifications are opt-in.
- Keep sending constrained to the configured pilot identity and behind explicit human confirmation; defer agent access until mailbox-level permissions and recovery paths have been exercised.
- Keep local development isolated from production data unless a deliberate read-only connection is configured.

## Open Decisions

Thread merging and splitting are available within a mailbox. Workspace-scoped member administration, domain ownership verification and mailbox provisioning remain unfinished; broader sharing and agent access need separate product and permission design.
