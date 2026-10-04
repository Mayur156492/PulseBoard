---
name: frontend-component-craft
description: Use when building React components, buttons, forms, dashboards, agent UI, or choosing a component registry.
---

# Frontend Component Craft

Use this for product components, not decorative snippets.

## Pick The Source

- Existing project primitives and tokens first.
- shadcn/Radix/Base UI for buttons, forms, dialogs, menus, tabs, tables, navigation, toasts, and command palettes.
- Origin UI for broader app patterns.
- Magic UI or Motion Primitives for tasteful accents, landing sections, demos, and delight.
- Vercel AI Elements or 21st Agent Elements for agent chat, tool cards, plans, diffs, reasoning, attachments, and streaming states.
- New community skills stay review-only until source, license, deps, and behavior are checked.

## Quality Bar

- Cover default, hover, active, focus-visible, loading, disabled, selected, error, empty, skeleton, and reduced-motion states.
- Buttons need action-verb copy, stable size, hit area, optional icon, loading affordance, destructive variant, and no overflow.
- Forms need labels, hints, validation, error summary, keyboard flow, submit state, and recovery copy.
- Complex components need API shape, composition slots, examples, and tests when risk warrants it.
- Avoid casual edits to shared `components/ui`; compose wrappers unless doing design-system work.

## Workflow

Inspect stack, choose source, adapt to local tokens, then verify responsive layout, keyboard path, focus, console, and visual fit. Read `../../references/ui-source-map.md` only for deep source context.
