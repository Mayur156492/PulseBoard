---
name: frontend-ui-engineering
description: Use when implementing production frontend UI architecture, component boundaries, keyboard states, responsive layout, or accessible interactions.
---

# Frontend UI Engineering

Use this skill when a UI must be robust as well as attractive.

## Checklist

- Keep components small and named around user-facing responsibility.
- Separate layout, data formatting, interaction state, and reusable primitives when the codebase already supports it.
- Preserve keyboard navigation, focus states, accessible names, loading states, disabled states, and error states.
- Prefer stable dimensions for toolbars, cards, grids, boards, and canvases so content changes do not shift the layout.
- Do not introduce a new state library, animation package, or component registry unless the existing stack cannot reasonably handle the task.
