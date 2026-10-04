---
name: testing-strategy
description: Designs and implements deterministic unit, integration, API, real-time, failure, and end-to-end tests for PulseBoard.
license: MIT
metadata:
  category: testing
  project: pulseboard
---

# PulseBoard Testing Strategy

The purpose of testing is to prove behavior, not to maximize test count.

Tests must provide evidence that the system works under normal conditions, failure conditions, and important boundary conditions.

---

# Core Principles

1. Every meaningful behavioral change should have a test.
2. Bugs should receive regression tests.
3. Prefer deterministic tests.
4. Test externally observable behavior.
5. Test failure paths, not only happy paths.
6. Do not weaken assertions merely to make tests pass.
7. Do not change production behavior solely to satisfy a weak test.
8. A test that cannot fail when the bug exists is not a useful regression test.

---

# Test Pyramid

Prefer:

    Unit tests
        ↓
    Integration tests
        ↓
    API / real-time tests
        ↓
    End-to-end tests

Use the smallest test capable of proving the behavior.

Do not use an end-to-end test when a deterministic unit test can prove the same invariant.

---

# Unit Tests

Unit-test:

- metric calculations
- rolling statistics
- anomaly detection
- incident rules
- validation
- data transformations
- status calculations
- utility functions
- state machines

Test:

- normal values
- minimum values
- maximum values
- empty input
- malformed input
- boundary values
- duplicate input
- out-of-order input
- invalid timestamps
- unexpected states

---

# Metrics Testing

Metrics should be tested for:

- normal values
- zero
- negative values where invalid
- very large values
- NaN
- Infinity
- missing fields
- duplicate samples
- out-of-order samples
- timestamp gaps

Verify that aggregation behavior is deterministic.

---

# Incident Detection Testing

Test at minimum:

1. No incident.
2. Single anomaly.
3. Multiple simultaneous anomalies.
4. Sustained anomaly.
5. Short transient spike.
6. Service recovery.
7. Dependency failure.
8. Multiple dependent services failing.
9. Repeated identical events.
10. Events arriving out of order.

The incident engine must not create duplicate incidents for the same underlying condition unless the specification explicitly requires it.

---

# API Testing

For every API endpoint test:

- valid request
- missing fields
- invalid fields
- malformed input
- unauthorized request
- forbidden request
- not-found resource
- duplicate request
- server-side failure

Verify both:

- HTTP status
- response body/schema

Do not test only that a request returns HTTP 200.

---

# WebSocket Testing

Test:

- connection
- authentication
- subscription
- message delivery
- malformed messages
- disconnect
- reconnect
- duplicate connections
- server restart
- client restart
- stale subscriptions
- unauthorized subscriptions

Verify that disconnecting a client stops resources associated with that client.

---

# Lifecycle Testing

For anything with setup/cleanup, test:

    create
    ↓
    use
    ↓
    cleanup

Also test:

    create
    ↓
    initialization failure
    ↓
    cleanup

And:

    create
    ↓
    unmount/disconnect
    ↓
    asynchronous operation completes

No asynchronous operation should unexpectedly resurrect destroyed state.

---

# Concurrency Testing

For concurrent systems test:

- duplicate execution
- overlapping operations
- cancellation
- race conditions
- stale results
- out-of-order completion
- cleanup during execution

Prefer deterministic scheduling or mocked clocks where practical.

Avoid tests that rely on arbitrary sleeps such as:

    await sleep(1000)

unless unavoidable.

---

# Regression Tests

When a bug is discovered:

1. Reproduce the bug.
2. Write a regression test.
3. Confirm the regression test fails against the broken implementation.
4. Fix the implementation.
5. Confirm the test passes.
6. Run the broader test suite.

Do not skip step 3 for important bugs.

---

# Property and Invariant Testing

Where appropriate test invariants such as:

- latency cannot be negative
- uptime cannot exceed 100%
- duplicate events do not create duplicate incidents
- service status transitions are valid
- timestamps remain ordered after normalization
- metric aggregation is deterministic
- cleanup removes subscriptions
- one recurring loop produces at most one successor callback

---

# Frontend Tests

Test:

- loading state
- empty state
- error state
- healthy state
- degraded state
- critical state
- filtering
- navigation
- dialogs
- keyboard interaction
- responsive behavior where practical

Do not test implementation details when user-visible behavior is sufficient.

---

# Browser / E2E Tests

Use browser tests for critical user workflows.

At minimum:

1. Load dashboard.
2. Display services.
3. Open service details.
4. Receive live metric updates.
5. Display incident.
6. Open incident details.
7. Recover a service.
8. Verify dashboard reflects recovery.

If a browser test fails, inspect the actual browser behavior rather than assuming the application code is wrong.

---

# Test Quality

A passing test suite does not automatically mean the implementation is correct.

Review tests for:

- meaningful assertions
- correct fixtures
- realistic data
- missing edge cases
- false positives
- accidental mocking of the behavior being tested

Avoid excessive mocking.

---

# Completion Criteria

Before declaring a feature complete:

- relevant unit tests pass
- relevant integration tests pass
- API tests pass
- real-time tests pass where applicable
- regression tests exist for discovered bugs
- build/typecheck passes where available
- critical browser workflows pass where applicable

Report anything that could not be executed.

Never claim a test passed if it was not actually run.
