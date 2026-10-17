# Courrier — refonte de la messagerie

## Surface

- Mode: Operate
- Build path: code-first, explicitly chosen by the user
- Scope: the shared mail shell, mailbox lists, Screener, dedicated thread reader, and the full-screen composer and its reduced and popup states

## Product truth and preserved behavior

Courrier lets one person move between several personal mailboxes, explicitly screen unfamiliar senders, organize messages, and read each conversation on its own route. A message leaves the list when opened; the composer remains a full-screen workspace with existing minimize and detached-popup options.

Keep the existing dedicated pages for Inbox, Screener, Feed, Paper, Reply Later, Set Aside, and Trash. Keep the message route, thread grouping and selection, sender classification, attachments, search and command palette, keyboard shortcuts, account and settings navigation, and the compose/minimize/popup/send/draft flows. Do not add a persistent list beside an open message or a dashboard column of widgets.

## Direction contract

**Approved direction: IMPECCABLE’S PICK — Papeterie numérique.**

### Approval provenance

- Source: user reply to the direction-selection question, item 0 (`call_7318ee16e4de4131b5a54cb77cc5dd71`).
- Choice label: `IMPECCABLE’S PICK — Papeterie numérique`.
- Seed key: none was included with the approved choice in the available selection record. Do not infer one from earlier, unapproved concept boards.

- **World:** a quiet digital writing desk: precise editorial hierarchy, tactile but restrained surfaces, and small ink-like cues that make each mailbox and message state easy to recognize. The paper quality is conveyed through warm light, whitespace, fine rules, and soft corners; avoid paper textures, stationery illustrations, fake postage, or other literal decoration.
- **First viewport:** keep the slim shared navigation and account control. Give the active mailbox a clear heading and a single chronological list with generous breathing room, readable sender/subject hierarchy, and only a few functional status cues. Keep Screener actions findable without turning each message into a card. On thread routes, replace the list with one centered reading column, a compact return/action toolbar, quiet sender metadata, and an uninterrupted message body.
- **Visitor path:** move between separate mailbox pages; opening a thread commits the viewport to that thread, and the return action restores the list. The existing full-screen compose flow remains a focused writing surface; minimize and popup remain available.
- **Signature interaction:** preserve the keyboard-first command palette and route/message shortcuts. Keep shortcut labels contextual in the reader and Screener; leave navigation visually quiet until it is opened.
- **Palette:** warm paper `#F6F5F0`, clean sheet `#FFFEFB`, deep graphite-green ink `#25302E`, quiet readable secondary ink `#68736F`, soft rule `#E3E6DF`, muted teal `#496F69`, and pale sage `#EAF1ED`. Reserve restrained warm red and amber for destructive and caution states. Keep equivalent contrast and hierarchy in dark and system themes.
- **Typography:** self-host a single variable sans family with a human, open shape; use weight and scale rather than an additional display face. Keep message text comfortable and headings clear without the current poster-like weight.
- **Shape and depth:** use 12–16px corners for substantial surfaces and softer radii for controls. Prefer one quiet rule or one soft surface per group. Shadows belong only to overlays that need elevation; no glass blur or nested card stacks.
- **Motion:** preserve the short route transition and existing meaningful state transitions. Keep content visible at rest, avoid motion that delays reading, and honor reduced-motion preferences.
- **Honest risk:** warm neutrals can make controls and quiet text too faint. Maintain readable contrast, visible keyboard focus, and distinct status colors at desktop and mobile widths.
- **Cross-surface reach:** apply the same tokens to Inbox, Screener, Feed, Paper, thread reading, composer, account/settings menus, dialogs, and mobile layouts without changing their information architecture or behavior.

## Anti-reference

The existing violet/mint styling is evidence of the incumbent UI, not an instruction for the approved identity. The Modern Mail App screenshot informs its gentle corner radii, light surfaces, type and spacing; its simultaneous list/message/widgets columns are explicitly excluded. Previous unapproved concept boards are not design input.

## Verification

Inspect the existing local server on port 3000. Verify the Inbox list, a dedicated thread route, Screener navigation/actions, full-screen compose and its existing minimize/popup controls at desktop and mobile widths in Ego Browser. Verify keyboard navigation/shortcuts still work. Do not submit a message or change sender classification while verifying.
