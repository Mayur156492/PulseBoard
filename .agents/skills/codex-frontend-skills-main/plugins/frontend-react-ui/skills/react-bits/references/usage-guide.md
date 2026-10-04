# React Bits Usage Guide

1. Search first: `scripts/extract-react-bits.ps1 -Search <term>`.
2. Prefer `TS-TW` for React + TypeScript + Tailwind projects.
3. Extract one component into a local folder, then adapt imports, tokens, and accessibility labels.
4. Check package dependencies before adding them.
5. Verify in browser at desktop and mobile widths.

Avoid importing the whole archive or adding heavy WebGL effects to operational screens unless the user explicitly asks for an expressive 3D/experimental UI.
