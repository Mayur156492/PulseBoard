---
name: react-bits
description: Use when selectively adapting React Bits components, animated cards, text effects, or subtle backgrounds.
metadata:
  short-description: Use when selectively adapting React Bits components, animated cards, text effects, subtle backgrounds, hover effects, or the bundled React Bits archive into a React UI without importing a full repository.
---

# React Bits

Use this skill to selectively adapt components from an optional local React Bits archive. The goal is to improve a React UI with tasteful motion and creative interaction while avoiding dependency bloat and visual noise.

## Core Rules

- Do not install or import the entire React Bits repo by default.
- Prefer extracting one component at a time from `assets/react-bits-main.zip`.
- If the archive is missing, run `scripts/fetch-react-bits.ps1` only after confirming the upstream React Bits license fits the project.
- Match the host project first: JS vs TS, CSS vs Tailwind, existing dependency set, accessibility, and visual language.
- For serious dashboards, prefer restrained motion: reveal, count, glow, focus, hover, subtle background texture.
- Avoid cursor toys, loud glitch effects, 3D backgrounds, physics, or WebGL unless the user explicitly asks for an expressive/experimental screen.
- Never leave demo copy, English labels, or React Bits branding in the product UI.
- Check license fit before broad redistribution. React Bits identifies as MIT + Commons Clause.

## Recommended Workflow

1. Inspect the current app: framework, `package.json`, CSS strategy, existing components, dark/light tokens, and target page.
2. Search `references/component-catalog.md` for candidates. If `assets/react-bits-main.zip` is missing and the user wants live extraction, run `scripts/fetch-react-bits.ps1`.
3. Use `scripts/extract-react-bits.ps1 -List` or `-Search <term>` when you need a fresh local lookup.
4. Pick the lightest variant:
   - `JS-CSS` for plain Vite/React with CSS files.
   - `JS-TW` only when Tailwind is already used.
   - `TS-CSS` or `TS-TW` only in TypeScript projects.
5. Extract only the selected component:
   ```powershell
   powershell -ExecutionPolicy Bypass -File <skill>/scripts/extract-react-bits.ps1 -Component SpotlightCard -Variant JS-CSS -Destination src/runtime/react-bits
   ```
6. Read the extracted code before integrating. Rename classes if they collide, adapt colors to project CSS variables, and remove unused props/demo assumptions.
7. Install missing dependencies only if the component is worth the cost. Prefer no-dependency components for production dashboards.
8. Verify with build and browser checks: no overlay, no console errors, no layout shift, keyboard/focus still usable, and `prefers-reduced-motion` is respected where relevant.

## Good Defaults For Government/Data Dashboards

- KPI numbers: `CountUp` or `Counter`, but keep animation short and non-distracting.
- Cards: `SpotlightCard`, `BorderGlow`, `GlareHover` with low opacity and project colors.
- Lists: `AnimatedList`, `FadeContent`, `AnimatedContent` for staged entry.
- Backgrounds: only subtle `Noise`, `DotGrid`, `SoftAurora`, `Threads`; avoid heavy WebGL for core admin pages.
- Text effects: `BlurText`, `SplitText`, `GradientText` only for landing/hero screens, not dense tables.

## References

- `references/component-catalog.md`: generated catalog of bundled components, categories, dependencies, and source folders.
- `references/usage-guide.md`: variant selection, dependency triage, and adaptation checklist.
- `scripts/extract-react-bits.ps1`: local extractor for copying a selected component from the archive.
- `scripts/fetch-react-bits.ps1`: optional downloader for the upstream archive.
