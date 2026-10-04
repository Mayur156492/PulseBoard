---
name: code-review
description: Performs adversarial senior-level code review focused on correctness, regressions, lifecycle, concurrency, performance, security, architecture, and maintainability.
license: MIT
metadata:
  category: development
  project: pulseboard
---

# PulseBoard Senior Code Review

You are performing a READ-ONLY code review.

Do not modify files while reviewing.

The goal is not to judge whether code looks clean. The goal is to determine whether the implementation is actually correct and whether the change introduced behavioral regressions.

## Core Principle

Never assume the current implementation is correct.

Trace the actual execution path through the repository.

Prefer concrete evidence over speculation.

Do not report hypothetical problems as confirmed bugs.

---

# 1. Understand the Change

Before reviewing:

1. Inspect git status.
2. Inspect the complete diff.
3. Identify every changed file.
4. Identify the purpose of the change.
5. Identify the expected behavior.
6. Identify tests associated with the change.

Do not review only the changed lines.

Inspect surrounding code whenever required to understand behavior.

---

# 2. Trace Every Caller and Consumer

For every changed function, class, hook, endpoint, component, or module:

- Find every caller.
- Find every consumer.
- Determine what assumptions callers make.
- Determine what assumptions the changed code makes.
- Check whether return values are still compatible.
- Check whether side effects still occur.
- Check whether ordering is preserved.

If a function is used in multiple places, review every usage.

Do not assume the first discovered call site is the only one.

---

# 3. State Ownership

Determine:

- Where state is created.
- Who owns it.
- Who mutates it.
- Who observes it.
- Whether multiple consumers can mutate it.
- Whether stale state can survive longer than intended.
- Whether a ref, store, React state, cache, singleton, or module-level variable is appropriate.

Pay particular attention to:

- global state
- mutable refs
- caches
- singleton services
- WebSocket state
- worker state
- browser APIs
- asynchronous state

---

# 4. Async and Concurrency Review

Explicitly inspect asynchronous boundaries.

Look for:

- race conditions
- stale closures
- stale references
- promises resolving after cleanup
- concurrent requests
- duplicate requests
- duplicate event listeners
- duplicate timers
- duplicate animation frames
- worker messages arriving after unmount
- reconnect races
- shared mutable state
- ordering assumptions

For every asynchronous operation, ask:

1. What starts it?
2. What can interrupt it?
3. What happens if the component/module disappears?
4. What happens if it completes twice?
5. What happens if a newer operation starts before it finishes?
6. Can it schedule additional work?
7. Can that work continue after cleanup?

---

# 5. Scheduling and Lifecycle

Pay special attention to:

- requestAnimationFrame
- setTimeout
- setInterval
- event listeners
- WebSocket callbacks
- worker messages
- observers
- subscriptions
- streams
- browser media APIs

For every recurring mechanism verify:

- exactly where it starts
- exactly where it schedules its next iteration
- exactly where it stops
- whether cleanup can actually stop it
- whether an early return prevents rescheduling
- whether multiple paths can schedule the same loop

A recurring callback must not accidentally fork itself.

For example, detect patterns that can produce:

    1 callback
       ↓
    2 callbacks
       ↓
    4 callbacks
       ↓
    8 callbacks

This is a critical correctness issue.

---

# 6. React Review

For React code inspect:

- effect dependencies
- cleanup functions
- state ownership
- render frequency
- unnecessary renders
- stale closures
- memoization correctness
- refs versus state
- external stores
- subscription lifecycle
- component identity
- conditional mounting
- Strict Mode behavior

Do not recommend memoization merely because a component renders frequently.

Determine whether the memoization can actually bail out.

Do not replace state with refs or stores without verifying all consumers.

---

# 7. TypeScript Review

Check:

- nullability
- type narrowing
- generic correctness
- unsafe casts
- `any`
- unreachable assumptions
- discriminated unions
- API contracts
- worker message types
- serialization types

Pay special attention to type narrowing across:

- `await`
- callbacks
- closures
- mutable references

A value narrowed before an `await` must not automatically be assumed to remain narrowed afterward.

Prefer capturing a stable local value when appropriate.

Do not silence TypeScript errors with:

- `as any`
- `@ts-ignore`
- `@ts-expect-error`

unless there is a documented and justified reason.

---

# 8. Resource Management

For every resource, verify ownership and cleanup.

Resources include:

- workers
- WebSockets
- timers
- animation frames
- media streams
- event listeners
- subscriptions
- observers
- database connections
- file handles

Ask:

    Who creates it?
    Who owns it?
    Who destroys it?
    What happens if creation partially succeeds?
    What happens if initialization fails?
    What happens if the owner unmounts?

---

# 9. API and Data Contracts

Inspect:

- request schemas
- response schemas
- validation
- serialization
- deserialization
- database types
- WebSocket messages
- frontend/backend contracts

Look for silent contract changes.

A change is not safe merely because TypeScript compiles.

Runtime data can still violate assumptions.

---

# 10. Performance

Identify hot paths.

Pay particular attention to:

- per-frame work
- high-frequency React renders
- WebSocket message handlers
- large arrays
- repeated allocations
- serialization
- cloning
- database queries
- expensive calculations
- repeated parsing
- repeated network requests

Do not optimize based solely on intuition.

Explain:

1. Why the operation is expensive.
2. How frequently it occurs.
3. What work is duplicated.
4. What the proposed change removes.
5. Whether observable behavior remains equivalent.

---

# 11. Error Handling

Check:

- thrown errors
- rejected promises
- network failures
- malformed input
- worker failures
- WebSocket failures
- database failures
- partial initialization
- retry behavior
- cleanup after failure

Do not allow error handling to create infinite retry loops.

---

# 12. Security

Look for security problems even when the review is not primarily a security audit.

Check:

- authentication
- authorization
- input validation
- injection
- secrets
- CORS
- WebSocket authorization
- sensitive information leakage
- unsafe file access
- unsafe command execution

If a security problem is found, classify it appropriately.

---

# 13. Tests

Determine whether the existing tests actually prove the changed behavior.

Do not count tests.

Evaluate their strength.

A strong regression test should fail on the old broken behavior and pass on the new behavior.

For concurrency or lifecycle bugs, prefer deterministic tests or simulations over timing-dependent tests.

---

# 14. Behavioral Equivalence

When a change claims to be an optimization or refactor:

Compare:

- outputs
- side effects
- ordering
- error behavior
- diagnostics
- state transitions
- call counts
- resource lifecycle

The implementation may change internally, but externally observable behavior should remain unchanged unless the specification explicitly requires a behavior change.

---

# Finding Classification

Use these severity levels:

## CRITICAL

The system is likely to:

- fail completely
- corrupt important state
- create runaway work
- expose sensitive data
- break a critical workflow

## HIGH

A significant correctness, security, performance, or reliability problem.

## MEDIUM

A meaningful issue that does not normally prevent the primary workflow from functioning.

## LOW

Minor maintainability, robustness, or quality issue.

## INFORMATIONAL

Observation or improvement that is not a confirmed defect.

---

# Required Finding Format

For every confirmed issue provide:

### [SEVERITY] Short title

**File:** `path/to/file.ts`

**Location:** line/function if known

**Mechanism:**

Explain exactly what the code does.

**Consequence:**

Explain what happens at runtime.

**Reproduction:**

Give deterministic steps or a minimal scenario when possible.

**Evidence:**

Reference the relevant code path, caller, test, or execution behavior.

**Minimal fix:**

Describe the smallest safe correction.

---

# Review Completion Criteria

Before finishing:

- Trace every changed symbol.
- Inspect every relevant caller.
- Inspect every relevant consumer.
- Check lifecycle.
- Check async boundaries.
- Check cleanup.
- Check scheduling.
- Check type contracts.
- Check performance-sensitive paths.
- Check error paths.
- Check tests.
- Check behavioral equivalence where applicable.

Do not modify the repository.

Do not install dependencies.

Do not fix issues during the review.
