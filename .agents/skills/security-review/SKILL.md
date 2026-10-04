---
name: security-review
description: Performs a security-focused review of PulseBoard APIs, authentication, authorization, WebSockets, data handling, dependencies, and browser-facing surfaces.
license: MIT
metadata:
  category: security
  project: pulseboard
---

# PulseBoard Security Review

Perform a READ-ONLY security review unless explicitly instructed otherwise.

Do not modify files.

The goal is to identify concrete security weaknesses and explain how they could be exploited or abused.

Prefer evidence from the actual repository over generic security warnings.

---

# 1. Authentication

Inspect:

- login
- session management
- token handling
- expiration
- refresh
- logout
- password handling if applicable
- service authentication

Determine whether protected resources can be accessed without valid authentication.

---

# 2. Authorization

Authentication is not authorization.

For every protected resource ask:

- Who is allowed to access it?
- Where is authorization enforced?
- Can the client choose its own role?
- Can a user access another user's resource?
- Can one service access another service's data?
- Are administrative operations protected?

Look specifically for:

- IDOR
- privilege escalation
- role confusion
- client-controlled authorization fields

---

# 3. API Input Validation

Inspect every externally controlled input.

Check:

- body
- query parameters
- route parameters
- headers
- WebSocket messages
- uploaded data
- service telemetry

Validate:

- type
- size
- range
- format
- allowed values

Do not trust TypeScript types as runtime validation.

---

# 4. Injection

Look for:

- SQL injection
- command injection
- shell execution
- path traversal
- template injection
- unsafe HTML
- unsafe dynamic queries
- unsafe regular expressions

Verify that external data is handled through safe APIs.

---

# 5. WebSockets

Inspect:

- authentication during connection
- authorization for subscriptions
- message validation
- origin handling
- connection limits
- rate limits
- disconnect cleanup
- resource ownership

Check whether a client can subscribe to data it should not see.

---

# 6. Secrets

Look for:

- API keys
- passwords
- tokens
- private keys
- credentials

Check:

- source code
- environment configuration
- client bundles
- logs
- error messages

Never recommend committing secrets to the repository.

---

# 7. Sensitive Data

Determine whether the application exposes:

- user information
- credentials
- internal service information
- infrastructure details
- database information
- stack traces
- internal identifiers

Check both API responses and frontend-visible data.

---

# 8. Browser Security

Inspect:

- CORS
- CSP where applicable
- cookie configuration
- CSRF protections where applicable
- XSS risks
- unsafe DOM operations
- localStorage/sessionStorage usage

Do not recommend disabling security controls simply to make development easier.

---

# 9. Rate Limiting and Abuse

Inspect public and expensive endpoints.

Look for:

- unlimited login attempts
- unlimited telemetry ingestion
- unlimited WebSocket connections
- expensive queries without limits
- oversized payloads
- resource exhaustion

Consider both malicious and accidental abuse.

---

# 10. Dependency Security

Inspect important dependencies and configuration.

Look for:

- unnecessary dependencies
- known vulnerable packages where tooling can verify them
- packages with excessive privileges
- outdated security-sensitive components

Do not claim a dependency is vulnerable without evidence.

---

# 11. Error Handling

Errors should not unnecessarily reveal:

- database structure
- filesystem paths
- credentials
- stack traces
- internal network information
- implementation details

Development diagnostics should not accidentally become production data leaks.

---

# 12. Service Telemetry

PulseBoard accepts telemetry from monitored services.

Treat telemetry as untrusted input.

Never assume:

- service names are safe
- timestamps are valid
- numeric values are finite
- payload sizes are reasonable
- metadata is trustworthy

Validate and constrain telemetry before processing or storing it.

---

# Finding Severity

## CRITICAL

Likely enables:

- full system compromise
- authentication bypass
- arbitrary code execution
- severe sensitive-data exposure

## HIGH

Significant unauthorized access, privilege escalation, injection, or resource-exhaustion vulnerability.

## MEDIUM

Meaningful security weakness requiring specific conditions or limited impact.

## LOW

Minor defense-in-depth issue.

## INFORMATIONAL

Security improvement that is not a confirmed vulnerability.

---

# Required Finding Format

### [SEVERITY] Security issue

**File:**

`path/to/file`

**Attack surface:**

Explain what is exposed.

**Vulnerability:**

Explain the exact mechanism.

**Attack scenario:**

Describe a realistic abuse case.

**Impact:**

Explain what an attacker could accomplish.

**Evidence:**

Reference the actual implementation.

**Recommended mitigation:**

Provide the smallest appropriate fix.

---

# Security Review Rules

Do not:

- invent vulnerabilities
- report generic OWASP items without connecting them to code
- modify production code
- expose real secrets discovered during review
- recommend disabling security controls as a fix

Always distinguish:

- confirmed vulnerability
- probable weakness
- hardening recommendation

---

# Completion Criteria

Review:

- authentication
- authorization
- API inputs
- WebSockets
- secrets
- sensitive data
- browser security
- injection
- rate limiting
- error handling
- dependencies

Do not claim the system is secure.

Report remaining uncertainty explicitly.
