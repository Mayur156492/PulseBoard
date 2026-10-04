---
name: r3f-model-viewer
description: Use when building R3F model viewers, GLTF loaders, product previews, or 3D inspection UI.
---

# R3F Model Viewer

Use this skill for React model viewers and product previews.

## Rules

- Use `@react-three/fiber` and Drei helpers when the project already uses React.
- Include loading progress, empty/error states, environment lighting, camera framing, and touch controls.
- Use `useGLTF` and preloading where appropriate, but do not block the rest of the UI.
- Provide alternate text or a non-3D fallback when the model is essential content.
- Test mouse, touch, resize, and reduced motion behavior.
