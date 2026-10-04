---
name: ui-ux-pro-max
description: Use when designing, auditing, or polishing UI/UX with the local searchable design database; uses bundled Python when available and falls back to CSV reading.
---

# UI/UX Pro Max

Use this skill for UI/UX direction, design systems, visual polish, accessibility checks, layout choices, charts, and stack-specific frontend guidance.

Local database is updated from upstream `nextlevelbuilder/ui-ux-pro-max-skill` v2.5.0. It includes 161 product/color/reasoning rows, 84 style rows, 73 typography rows, 99 UX guidelines, 25 chart types, and stack guidance including React, Next.js, shadcn, Angular, Laravel, and Three.js.

## Runtime Rule

- Do not ask the user to install Python in Codex Desktop.
- Use `scripts/run-search.ps1`; it automatically tries the Codex bundled Python runtime, then `python`/`python3` if available.
- If the wrapper cannot run, use no-Python fallback: inspect the CSV files under `data/` with `rg`/`Get-Content` and synthesize manually.

## Required First Pass

Resolve this skill directory, then run:

```powershell
powershell -ExecutionPolicy Bypass -File "<skill-root>\scripts\run-search.ps1" "<product type> <industry> <style keywords>" --design-system -p "<Project Name>"
```

## Follow-Up Searches

```powershell
powershell -ExecutionPolicy Bypass -File "<skill-root>\scripts\run-search.ps1" "animation accessibility" --domain ux
powershell -ExecutionPolicy Bypass -File "<skill-root>\scripts\run-search.ps1" "layout responsive form" --stack html-tailwind
powershell -ExecutionPolicy Bypass -File "<skill-root>\scripts\run-search.ps1" "3d product preview" --stack threejs
```

Useful domains: `product`, `style`, `typography`, `color`, `landing`, `chart`, `ux`, `react`, `web`, `prompt`.

Useful stacks include `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `astro`, `shadcn`, `angular`, `laravel`, `threejs`, `react-native`, `flutter`, and `swiftui`.

## No-Python Fallback

If all Python execution fails, do not stop. Use `scripts/run-search.ps1` first; it extracts `assets/ui-ux-pro-max-data.zip` to a local cache when `data/` is not present. If execution still fails, inspect the extracted cache path from `UI_UX_PRO_MAX_DATA_DIR`, or unzip the asset locally and read the CSV files with `rg`/`Get-Content`.

## Output

Return a practical design brief: product pattern, palette, typography, spacing, component style, motion rules, UX/accessibility risks, anti-patterns, component decisions, and verification checklist.

## Quality Rules

- Use real icon libraries such as Lucide; do not use emoji as UI icons.
- Buttons need clear action verbs, loading/disabled/focus states, and stable dimensions.
- Forms need labels, hints, validation, error copy, submit state, and keyboard flow.
- Avoid hover transforms that shift layout.
- Respect `prefers-reduced-motion`.
- Check 375px, 768px, 1024px, and 1440px widths before delivery when UI is built.
