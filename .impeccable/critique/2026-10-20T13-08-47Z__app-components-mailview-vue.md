---
target: HEY-inspired newsletter Feed reading flow
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:/Users/rootasjey/GitHub/courrier/app/components/MailView.vue"
target_fingerprint: "sha256:362ae248e7403294e03c18304424faca7b5ebf568710de464644fbedd78ea4be"
target_path: /Users/rootasjey/GitHub/courrier/app/components/MailView.vue
timestamp: 2026-10-20T13-08-47Z
slug: app-components-mailview-vue
closed: true
---
# Critique UX — The Feed

Method: dual-agent (A: /root/feed_review · B: /root/feed_evidence)

Target: `app/components/MailView.vue`, `/mail/feed`
Scope: current Feed and the proposed HEY-inspired newsletter reading flow.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | No position across Feed issues. |
| 2 | Match System / Real World | 2/4 | “Feed” implies newsletter issues, while the current UI organizes conversation threads. |
| 3 | User Control and Freedom | 3/4 | Back and Escape work; there is no adjacent-issue navigation yet. |
| 4 | Consistency and Standards | 3/4 | Familiar list and reader patterns; Feed has no distinct reading behavior. |
| 5 | Error Prevention | 2/4 | Opening a thread marks unread messages read; an accidental advance could do the same. |
| 6 | Recognition Rather Than Recall | 2/4 | Sender/subject/date aid recognition, but Feed position and next-issue cues are absent. |
| 7 | Flexibility and Efficiency | 2/4 | Keyboard movement exists, but current horizontal navigation is only within a thread. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Calm and uncluttered, though structurally generic for newsletters. |
| 9 | Error Recognition and Recovery | 2/4 | Back and error feedback exist; accidental issue advancement needs a defined recovery model. |
| 10 | Help and Documentation | 1/4 | No Feed-specific cue explains swipe, keyboard, or adjacent-issue navigation. |
| **Total** | | **22/40** | **Acceptable (55%); significant room to improve the Feed reading flow.** |

Scores assess the Feed reading experience, not the whole mail application.

## Design Specificity Verdict

The current Feed inherits Courrier’s warm, restrained “Papeterie numérique” style, but its structure is the same thread-summary list used by the other mailboxes. Newsletter content stays behind a separate reader action, so the screen does not yet feel like a place to read newsletters. The proposed direction can make it more specific while preserving Courrier’s visual identity.

The strongest concept is to assign one axis to each task: move horizontally between Feed items, then scroll vertically through the selected email or its thread. Make the horizontal controls explicit; treat touch swipe as an optional accelerator. Avoid nested horizontal carousels for both Feed items and messages within a thread.

**Deterministic scan:** `impeccable detect --json app/components/MailView.vue` returned zero findings (`[]`), with no rules or locations and no false positives. Browser console output was `[impeccable] No anti-patterns found.` No highlight overlay appeared because there were no findings.

## Overall Impression

Yes, this is a strong direction for The Feed. It turns newsletters into something to read rather than a queue of subjects to open. I recommend one newsletter issue or thread at a time, with its full content in the reading surface, vertical scrolling inside that item, and visible Previous/Next controls between items. Keep the issue position visible and make the reading order predictable.

The key product decision is whether a Feed item represents an individual newsletter issue or a conversation thread. Courrier currently groups messages by thread and opens the latest message. Reusing that exact unit without deciding its meaning could produce a confusing reader, especially if a thread already has its own horizontal message carousel.

## What’s Working

- The warm, low-chroma identity suits a focused reading surface and can distinguish Courrier from HEY without copying its styling.
- Existing sender, subject, preview, and date metadata make the current list easy to scan before opening an item.
- The current reader already provides a return action, Escape behavior, and a position indicator with previous/next controls inside a thread. Those are useful patterns to adapt for Feed-wide navigation.

## Priority Issues

1. **[P1] Define whether a Feed item is an issue or a thread.** Current rows group messages by `threadId`, and opening a row selects the latest message. Decide whether each newsletter issue is a separate item or whether a sender’s conversation is one item. If it is a thread, keep its messages in a single vertical reading flow and reserve horizontal movement for adjacent Feed items. This avoids two competing meanings for the same gesture. **Suggested command:** `$impeccable shape`.

2. **[P1] Add Feed-wide orientation and navigation.** Show clearly labeled Previous/Next controls and a position such as “4 of 18,” including disabled first/last states. Preserve chronological order and move each newly selected item to its start. **Suggested command:** `$impeccable shape`.

3. **[P1] Make horizontal movement discoverable and accessible.** Keep swipe optional. Provide buttons, a keyboard alternative, visible focus, and a screen-reader announcement of the new subject and position without announcing the full email body. Scope arrow-key behavior so it is clear whether it changes Feed items or messages inside the current thread. **Suggested command:** `$impeccable adapt`.

4. **[P2] Define read-state and recovery behavior.** Opening a thread currently marks its unread messages as read. Decide whether a Feed item becomes read on open, after reading, or when advancing; provide a clear undo path for an accidental change. **Suggested command:** `$impeccable harden`.

5. **[P2] Protect vertical reading from horizontal gestures on mobile.** Keep normal vertical page/content scroll, recognize only deliberate horizontal intent, and retain visible navigation controls for one-handed use. **Suggested command:** `$impeccable adapt`.

## Persona Red Flags

- **Alex, keyboard-first power user:** Left/Right currently navigate within a thread. Reusing them for Feed items without context-specific behavior and a visible hint makes the shortcut unpredictable.
- **Sam, screen-reader and zoom user:** Swipe gestures can conflict with assistive gestures and vertical reading. Labeled controls, announced issue position, visible focus, and layouts that survive zoom are needed.

## Minor Observations

- Keep sender, date, subject, and issue position near the top of the reading surface; the long email body should remain the visual focus.
- Returning to the Feed should restore the prior item and list position rather than forcing the reader to search again.
- A compact issue index could be an optional escape hatch for jumping, but it should not compete with the single-item reading view.

## Questions to Consider

- Should one Feed item be each newsletter issue, or should issues be grouped into a sender series?
- Should Previous/Next move through every issue or only unread issues?
- At what point should an issue become read, and how should readers undo an accidental advance?
