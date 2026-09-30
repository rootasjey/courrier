# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Nuxt, Vue, UnoCSS and Una UI; deployed on Cloudflare Workers with D1 and R2.

## Users

Initially one person managing email addresses across several personal domains. Multi-user access and agent-owned inboxes are later possibilities, not part of the first release.

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
- The first release is mono-user and protected by Cloudflare Access.
- Sending, cross-user sharing and agents require later validation and explicit permission design.

## Brand Commitments

The product name is Courrier. The interface is in French while the mailbox names Imbox, The Feed and Paper Trail remain in English. The user wants the interface to take clear inspiration from HEY's spacious, chronological mail-list and focused reading experience, while giving Courrier its own visual personality.

## Evidence on Hand

The repository contains a working Cloudflare email-receive pilot for `courrier-test@verbatims.cc` and local synthetic email fixtures. Local and remote messages must remain distinguishable; illustrative content must never be presented as real mail.

## Product Principles

- Preserve original messages and attachments.
- Make sender classification explicit and understandable.
- Keep the inbox quiet by default; notifications are opt-in.
- Validate receiving and reading before adding sending or agent capabilities.
- Keep local development isolated from production data unless a deliberate read-only connection is configured.

## Open Decisions

The long-term mailbox, user and conversation data model remains to be designed before multi-user use or thread merging.
