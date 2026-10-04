---
name: magic-ui-motion
description: Use when adding Magic UI components, animated sections, hover effects, or microinteractions.
---

# Magic UI Motion

Use this skill for tasteful animated UI components and effects.

## Rules

- Motion must clarify hierarchy, state, or flow; avoid noisy ornament.
- Respect `prefers-reduced-motion` and avoid motion-heavy UI in admin workflows unless requested.
- Use Magic UI for accents: shimmer buttons, magic cards, border beams, reveal text, bento demos, particles, globes, and product mockups.
- Keep core controls on shadcn/Radix/Base UI; Magic UI should not replace accessible form, dialog, menu, or table primitives.
- If the Magic UI registry MCP is available, search it before inventing effects. Otherwise use the local source-pack index.

## Install Discipline

Do not run registry install commands blindly. Inspect dependencies, adapt tokens, preserve keyboard/focus behavior, and verify mobile layout.
