# PulseBoard

> Real-Time Observability & Incident Intelligence Platform

PulseBoard is a production-style observability platform designed to answer three questions:

1. **What is happening right now?**
2. **Why is it happening?**
3. **What changed?**

It monitors services, collects real-time telemetry, processes metrics, detects anomalies and incidents, tracks service dependencies, and presents the system state through a real-time dashboard.

PulseBoard is also being developed as an engineering benchmark for evaluating an AI coding agent's ability to build, test, debug, review, and maintain a non-trivial software system from scratch.

---

## Project Status

**Status:** Initial development

**Current Phase:** Project initialization

The repository currently contains the project specification and agent skills. Application implementation has not yet begun.

---

# 1. Product Vision

PulseBoard is intended to be a small but serious observability platform rather than a generic CRUD dashboard.

The platform should provide:

- service monitoring
- health checks
- heartbeat monitoring
- real-time telemetry
- metric aggregation
- anomaly detection
- deterministic incident detection
- service dependency visualization
- incident history
- incident recovery tracking
- real-time dashboard updates
- service detail views
- authentication and authorization
- persistent storage
- automated testing
- browser/end-to-end testing
- security validation

The system should make operational problems understandable rather than simply displaying raw metrics.

---

# 2. Core Product Question

The primary purpose of PulseBoard is to help an operator understand:

> **What is happening, why it is happening, and what changed?**

For example:

A payment service begins experiencing increased latency.

PulseBoard should be able to show:

```text
Payment API
    ↓
Latency increased
    ↓
Error rate increased
    ↓
Database latency increased
    ↓
Payment service degraded
    ↓
Incident detected
```
