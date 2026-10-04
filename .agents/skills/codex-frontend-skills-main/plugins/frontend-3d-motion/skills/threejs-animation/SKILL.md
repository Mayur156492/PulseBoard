---
name: threejs-animation
description: Use when creating Three.js animation mixers, GLTF playback, morph targets, or crossfades.
---

# Three.js Animation

Use this skill for animation beyond simple object rotation.

## Rules

- Use `AnimationMixer` for GLTF clips and rigged animation.
- Name actions, manage weights, and crossfade between states intentionally.
- Keep procedural animation deterministic when screenshots, video capture, or repeatable tests matter.
- Avoid updating React state every frame; keep frame-loop state inside refs or Three objects.
- Verify animation start, pause, cleanup, and route-change teardown.
