# React Bits Component Catalog

Use `scripts/extract-react-bits.ps1 -List` for the full generated list from `assets/react-bits-main.zip`.
Use `-Search <term>` to locate a component without loading this catalog.

Curated low-risk picks:

| Category | Component | Dependencies | Use for |
|---|---|---|---|
| Components | SpotlightCard | none | Subtle hover spotlight on cards |
| Components | BorderGlow | none | Interactive border highlight |
| Components | Stepper | motion | Multi-step flows |
| Components | AnimatedList | none | Lightweight list reveal |
| Components | ProfileCard | none | Polished profile cards |
| TextAnimations | ShinyText | none | Small accent text |
| TextAnimations | DecryptedText | none | One-off reveal effect |
| Backgrounds | DotGrid | gsap | Subtle interactive dot field |
| Backgrounds | SoftAurora | none | Soft page background when appropriate |
| Animations | Magnet | none | Small magnetic hover affordance |

Curated high-impact / higher-risk picks:

| Category | Component | Dependencies | Use for |
|---|---|---|---|
| Components | ModelViewer | @react-three/fiber, @react-three/drei, three | 3D model viewer |
| Components | FluidGlass | @react-three/fiber, @react-three/drei, maath, three | Hero-level glass distortion |
| Backgrounds | Beams | @react-three/fiber, @react-three/drei, three | 3D ribbons |
| Backgrounds | Ballpit | gsap, three | Physics background |
| Backgrounds | Hyperspeed | postprocessing, three | Full-screen motion scene |
| Animations | PixelTrail | @react-three/fiber, @react-three/drei, three | Cursor trail |

Selection rules:

- Prefer no-dependency components first.
- Avoid WebGL, face-api, physics, and postprocessing in dashboards unless explicitly requested.
- Extract one component at a time and adapt it to the local design system.
- Run browser QA after adding animated or canvas-heavy components.
