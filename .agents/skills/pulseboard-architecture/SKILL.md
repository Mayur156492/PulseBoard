---
name: pulseboard-architecture
description: Architectural rules and invariants for the PulseBoard observability platform.
license: MIT
metadata:
  category: project
---

# PulseBoard Architecture

## Core Rules

1. UI never accesses the database directly.

2. API boundaries must validate external input.

3. WebSocket messages must use explicit schemas.

4. Incident detection must be deterministic in v1.

5. Do not introduce an LLM into the critical incident-detection path.

6. Every asynchronous resource requires cleanup.

7. Global state must have an explicit owner.

8. Metrics must have server-normalized timestamps.

9. New API endpoints require automated tests.

10. Concurrency-sensitive changes require regression tests.

11. Do not introduce dependencies without justification.

12. Do not modify unrelated modules to solve a localized problem.

13. Preserve existing behavior unless the specification explicitly changes it.
