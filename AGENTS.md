# Project conventions

## Tooltips

- Prefer the existing UnaUI tooltip components (especially `NTooltip`) for contextual help and hover details.
- Avoid native `title` tooltips when an UnaUI tooltip is suitable; use a native tooltip only when a concrete technical or UX constraint calls for it.

## Vue template modularity

- When a Vue template becomes large or contains a cohesive UI section, consider extracting that section into a focused component with a clear props and events API. Extract when it improves readability or responsibility boundaries; do not split markup solely to reduce line count.
