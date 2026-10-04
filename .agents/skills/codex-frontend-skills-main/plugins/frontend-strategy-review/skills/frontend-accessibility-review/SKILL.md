---
name: frontend-accessibility-review
description: Use when checking keyboard, screen-reader, focus, WCAG, form, dialog, or menu behavior.
---

# Frontend Accessibility Review

Use this when UI must be accessible, not just visually complete.

## Workflow

1. Traverse with keyboard: Tab, Shift+Tab, Enter, Space, Escape, arrows.
2. Check focus order, focus visibility, traps, restore, and obscured focus.
3. Verify names, headings, landmarks, labels, hints, errors, and status messages.
4. Check zoom/reflow, reduced motion, color-only meaning, and target sizes.

## Lens

Prefer semantic HTML before ARIA. Dialogs, menus, forms, and async updates need explicit behavior and user impact.

## Output

Report blockers first, then important issues and suggestions. Include affected element, expected behavior, impact, and fix direction. Read `../../references/current-sources.md` for exact WCAG/MDN criteria.