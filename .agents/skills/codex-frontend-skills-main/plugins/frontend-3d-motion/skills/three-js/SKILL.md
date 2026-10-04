---
name: three-js
description: Use when building or debugging Three.js, WebGL, WebGPU, shaders, particles, or GLTF scenes.
---

# Three.js

Use this skill for browser 3D and WebGL/WebGPU work.

## Rules

- Prefer the existing project renderer: vanilla Three.js for non-React, React Three Fiber for React.
- For broad compatibility, treat WebGLRenderer as stable and WebGPURenderer as a deliberate modern choice.
- If using WebGPU, include capability detection and a fallback path.
- Cap device pixel ratio and geometry/particle counts for mobile.
- Dispose geometries, materials, textures, controls, render targets, and renderer resources on teardown.
- Verify the canvas is nonblank, framed correctly, interactive, and free of console errors.
