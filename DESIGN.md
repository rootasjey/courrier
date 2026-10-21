---
name: Courrier
description: A quiet digital writing desk for focused mail work.
colors:
  canvas: "#f5f4ef"
  paper: "#fffefa"
  sheet: "#fffefa"
  ink: "#28332f"
  muted: "#5f6d67"
  quiet: "#66736d"
  line: "#e1e5dd"
  accent: "#3c6b64"
  accent-hover: "#315850"
  accent-wash: "#eaf1ed"
  sage: "#dcebe4"
  sage-ink: "#31574d"
  error: "#a74740"
  surface-soft: "#f7f7f2"
  message-body: "#3e4a45"
  reply-later: "#66779a"
typography:
  brand:
    fontFamily: "Playwrite FR Moderne, cursive"
    fontSize: "20px"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  display:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(28px, 3.7vw, 44px)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "clamp(28px, 3.25vw, 39px)"
    fontWeight: 620
    lineHeight: 1.18
    letterSpacing: "-0.035em"
  title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 680
    letterSpacing: "-0.018em"
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.8
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "13px"
    fontWeight: 620
rounded:
  control: "9px"
  field: "10px"
  menu: "15px"
  reader: "16px"
  screener: "13px"
  pill: "999px"
  circle: "50%"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.accent-wash}"
  input-subject:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "100%"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  thread-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "11px 8px"
  chip-mailbox:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  reader-surface:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.reader}"
    padding: "clamp(24px, 4vw, 42px)"
    width: "min(100%, 816px)"
  screener-allow:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.screener}"
    width: "62px"
    height: "62px"
  screener-block:
    backgroundColor: "#f7eae7"
    textColor: "#91433c"
    typography: "{typography.label}"
    rounded: "{rounded.screener}"
    width: "62px"
    height: "62px"
  composer-surface:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    width: "100%"
    height: "calc(100vh - 76px)"
  activity-menu:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.menu}"
    padding: "14px"
    width: "min(380px, calc(100vw - 24px))"
---

# Design System: Courrier

## Overview

**Creative North Star: "IMPECCABLE’S PICK — Papeterie numérique"**

Courrier is an Operate workspace for personal mail: people move between dedicated mailbox pages, screen unfamiliar senders, and read each conversation on its own route. The approved identity is IMPECCABLE’S PICK — Papeterie numérique. Warm, quiet surfaces, fine rules, a single open sans family, and restrained theme-specific accents make the interface feel like a digital writing desk without literal paper decoration.

A mailbox stays a single chronological list with flat rows. Opening a thread replaces the list with one centered reading column; the full-screen composer remains a focused writing workspace, with its existing popup and minimized modes. Light and dark themes keep the same hierarchy while using theme-specific values.

**Key Characteristics:**
- Warm, low-chroma surfaces with fine separators.
- DM Sans Variable supplies the interface and message hierarchy; Playwrite FR Moderne is reserved for the Courrier wordmark.
- Chronological mailbox rows stay flat; an open thread gets its own reading surface.
- Muted teal marks primary action, selection, and focus; status colors stay semantic.

## Colors

The light palette pairs warm paper neutrals with graphite-green ink and one muted teal action color. The CSS custom properties in `app/assets/css/main.css` are the canonical light-theme values; `paper` and `sheet` currently share the same value.

### Primary
- **Muted ink-teal** (#3c6b64): Primary actions, active navigation, selection, links, and keyboard focus. Hover deepens to #315850.
- **Pale teal wash** (#eaf1ed): Quiet selected and hover surfaces; it should not replace a visible focus outline.

### Neutral
- **Warm desk canvas** (#f5f4ef): The page and full-screen writing workspace.
- **Clean paper / reader sheet** (#fffefa): Menus, focused reading surfaces, and other clean surfaces.
- **Graphite-green ink** (#28332f): Main interface text.
- **Reading ink** (#3e4a45): Message body text, kept to a comfortable measure.
- **Muted ink** (#5f6d67) and **quiet ink** (#66736d): Supporting text and metadata.
- **Soft rule** (#e1e5dd): Row separators, field rules, and surface borders.
- **Soft surface** (#f7f7f2): Secondary quiet fills.

### Semantic States
- **Sage surface** (#dcebe4) and **sage ink** (#31574d): Gentle Screener callouts and quiet affirmative states.
- **Rust error** (#a74740): Destructive and error states.
- **Reply Later blue** (#66779a): Reserved for the Reply Later state; it is not a general brand accent.
- The current implementation has no amber design token. Add one only when a real caution state needs it.

Appearance mode and palette are separate settings. Mode can follow the system, stay light, or stay dark; the palette selector previews the available colors, supports search, and applies the first match with Enter. Available palettes are Papeterie, Forêt, Graphite, Lavande, Ayu Dark, One Dark Pro, SynthWave ’84, Shades of Purple, and Min Dark. The values in the frontmatter above describe the base Papeterie light palette. `app/assets/css/main.css` is canonical: it applies the selected mode and palette through `data-theme` and `data-theme-variant`; the neutral dark base and each named palette override the shared color tokens there. Keep semantic states distinguishable across every palette.

## Typography

**Brand Font:** Playwrite FR Moderne (fallback: cursive), used only for the Courrier wordmark.

**Display Font:** DM Sans Variable (fallback: sans-serif)

**Body Font:** DM Sans Variable (fallback: sans-serif)
**Label/Mono Font:** DM Sans Variable for interface labels; ui-monospace, SFMono-Regular, Menlo, monospace for keyboard hints.

**Character:** DM Sans keeps the interface open and practical. Playwrite FR Moderne adds a small handwritten signature to the brand without entering message copy; keyboard hints use a compact system mono.

### Hierarchy
- **Display** (650, clamp(28px, 3.7vw, 44px), 1.12): Mailbox headings; on narrow screens the heading reduces to a 28–34px clamp.
- **Headline** (620, clamp(28px, 3.25vw, 39px), 1.18): Thread subjects in the focused reader.
- **Title** (680, 15px, natural line height): Thread subjects in the list; previews sit at 12px with a 1.5 line height.
- **Body** (500, 15px, 1.8): Message content, with a maximum reading measure of 68ch; the mobile body uses 14px with a 1.75 line height.
- **Label** (620, 13px): Primary controls and compact actions. Small metadata steps down to 10–12px.
- **Brand** (300, 20px): The Courrier wordmark in the top bar; auth pages use 23px, and the mobile top bar uses 18px.

Use weight and scale within DM Sans Variable for interface headings. Keep message copy at a comfortable reading measure.

## Layout

The shared header is 70px high on desktop and 66px at widths of 720px and below. It holds the quiet Courrier mailbox switcher on the left and account control on the right. Mailbox content is centered at a maximum width of 1000px, with page gutters that scale from 18px to 64px. The chronological list uses 74px rows with a fine bottom rule; at 720px and below it tightens to 69px rows while preserving sender, subject, preview, and date.

A thread route replaces the list with one reading column. The reader is capped at 816px, uses a clean sheet with 24–42px responsive padding, and keeps message text within 68ch. Opening a thread commits the viewport to the conversation; the return action restores the mailbox. The composer remains a full-screen writing surface with existing popup and minimized modes.

**The One Reader Rule.** A mailbox route shows its chronological list; opening a thread replaces it with a focused reader route.

## Elevation & Depth

The interface is mostly flat: a fine rule or a quiet tonal fill separates ordinary content. Reader and mailbox rows do not use decorative shadows. Shadows mark controls that float above content, including menus, Screener popovers, dialogs, the message action dock, and the existing floating mail stacks. The final reader action dock has no backdrop blur.

### Shadow Vocabulary
- **Menu surfaces** (`0 12px 30px rgb(33 43 38 / 11%)`): Mailbox and account menus.
- **Screener popover** (`0 14px 32px rgb(33 43 38 / 14%)`): Sender classification choices.
- **Confirmation dialogs** (`0 18px 48px rgb(37 48 44 / 17%)`): Focused blocking choices.
- **Floating mail stack** (`0 8px 24px rgb(33 25 54 / 18%)`): The functional Set Aside stack above the mailbox list.

**The Functional Depth Rule.** Let tonal changes and fine rules do most of the grouping; reserve shadows for menus, popovers, dialogs, and floating controls that need separation.

## Shapes

Controls use soft but compact corners: the common menu row and field are 9–10px, Screener choice buttons are 13px, menus and dialogs are 15px, and the reader sheet is 16px. Pills and avatars use fully rounded shapes. Mailbox rows stay flat with a single separator instead of individual card borders. Surface borders use the existing 1px soft rule.

## Components

### Buttons
The controls feel quiet at rest and gain a clear ink-teal response on hover or keyboard focus.

- **Shape:** Primary actions are pill-shaped (999px); return controls are also pills, while compact fields use 9–10px corners.
- **Primary:** Compose and send use the muted teal action color, with white text in light mode; the compact mailbox action is 42px high with 16px horizontal padding.
- **Hover / Focus:** Hover deepens the teal. Keyboard focus remains a visible 3px outline with 3px offset; focused custom fields use their defined 2px teal treatment.
- **Secondary / Ghost:** Return and secondary actions use a fine rule or transparent fill, muted text, and a pale teal response on hover.
- **Disabled:** Use the existing pale teal wash and muted text to keep disabled controls visibly distinct.

### Chips
- **Style:** Quiet state labels use a pale teal wash with teal text; mailbox search labels use 1px 7px padding, and recipient chips use a pill silhouette.
- **State:** Distinguish classification and history states by label and text as well as color.

### Cards / Containers
- **Corner Style:** The reader uses a 16px sheet; dialogs and menus use 15px.
- **Background:** The reader uses the clean sheet against the warm desk canvas.
- **Shadow Strategy:** Keep the reader flat; use the Elevation vocabulary for controls that float above it.
- **Border:** The reader surface has a 1px soft rule.
- **Internal Padding:** The reader uses clamp(24px, 4vw, 42px); full-screen composition fields use fine bottom rules rather than boxed cards.

### Inputs / Fields
- **Style:** The thread subject editor is a paper field with a 1px rule, 10px corners, and 10px 12px padding. Composer recipient and subject rows stay open and use fine bottom rules.
- **Focus:** Keep the visible teal keyboard ring; the thread subject editor uses its defined teal border and outline.
- **Error / Disabled:** Error copy uses rust; disabled actions use the pale teal wash and muted ink.

### Navigation
- **Style:** Keep a 70px desktop header (66px at the mobile breakpoint), a quiet brand switcher, and a separate account control.
- **Default / Hover / Active:** The switcher stays transparent at rest; opened and hovered rows use a quiet fill, and the current mailbox uses teal text. Navigation remains tucked into the switcher rather than taking a permanent rail.
- **Mobile:** Keep the switcher and account control in the header; each route remains one focused surface.

### Signature Patterns
**Chronological thread row.** A sender badge sits under the bold subject, followed by the preview; date and sender avatar stay aligned in the same 74px row. A fine rule separates rows, while hover and selection use the active palette's quiet wash.

**Focused reader.** The thread route has a compact return toolbar, a centered 816px sheet, quiet sender metadata, and an uninterrupted message body.

**Screener choice.** Allow and block actions are easy to distinguish at a glance: affirmative uses teal wash, while blocking uses a restrained warm red treatment.

**Composer workspace.** Keep the full-screen writing surface with ruled recipient fields, a generous editor, and its current popup and minimized forms.

**Action history.** Keep the recent-actions menu near the account control and the complete history on its own route. The menu keeps a fixed width and opens vertically; action rows remain compact, with undo presented as a separate control.

## Do's and Don'ts

### Do:
- **Do** build mailbox pages as one chronological list with flat rows and fine dividers.
- **Do** keep each open thread on its own reading route in a centered 816px maximum sheet.
- **Do** use DM Sans Variable for interface and message content, with size and weight for hierarchy.
- **Do** keep Playwrite FR Moderne limited to the Courrier wordmark.
- **Do** keep keyboard focus visible and respect reduced-motion preferences.
- **Do** keep the recent-actions menu width fixed while its height expands and contracts.

### Don't:
- **Don't** add paper textures, fake postage, or decorative stationery to suggest paper.
- **Don't** keep a persistent message list beside an open thread or wrap ordinary mail rows in nested cards.
- **Don't** use glass blur on the reader action dock.
- **Don't** introduce a second display font for page headings or use semantic red and blue as brand accents.
