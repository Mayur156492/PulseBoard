---
name: react-next-modern
description: Use when writing or reviewing React or Next.js components, hooks, forms, or UI performance.
---

# React Next Modern

Use this skill for React and Next.js frontend implementation.

## Current Defaults

- Assume React 19-era docs unless the project pins an older version.
- Follow the existing project router, data fetching style, and component conventions.
- Keep server/client boundaries explicit in Next.js projects.
- Prefer accessible native semantics before custom ARIA.
- Avoid premature memoization; fix avoidable rerenders only when the component is shared, slow, or measured.
- Use project tests, lint, and browser verification when UI behavior changes.
