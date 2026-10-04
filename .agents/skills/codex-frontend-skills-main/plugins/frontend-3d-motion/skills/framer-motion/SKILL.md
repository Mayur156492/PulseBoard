---
name: framer-motion
description: Use when adding Framer Motion animations, transitions, gestures, or microinteractions.
---

# Framer Motion

Use this skill for React UI animation.

## Rules

- Animate opacity and transform before layout-affecting properties.
- Keep durations mostly between 150ms and 300ms for UI feedback.
- Use layout animations only when they clarify object continuity.
- Respect `prefers-reduced-motion`.
- Do not animate large lists or expensive shadows without measuring the result.
