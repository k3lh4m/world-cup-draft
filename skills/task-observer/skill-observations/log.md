# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## 2026-04-29 — Auth Security Fixes Implementation Review

### Observation 1: Security implementation produces cross-cutting gap patterns worth capturing

**Status:** OPEN
**Date:** 2026-04-29
**Session context:** Full cross-task security audit review of 15-task auth security implementation
**Skill:** New skill candidate: security-implementation-review
**Type:** open-source
**Phase/Area:** Cross-task integration gaps and secondary coverage gaps

**Issue:** During a multi-task security implementation, several patterns emerged that a reviewer must check holistically even when per-task reviews were done. Specifically: (1) A DB cleanup cron covers authenticated rate limits but not the new unauthenticated `auth_rate_limits` table — the table will grow unbounded. (2) A `reset_ticket` is validated via timing-safe compare but the token's own expiry isn't re-checked in `completePasswordReset`, meaning a reset_ticket on an expired-but-used token could theoretically be tested. (3) The `signUp` action return type changed (now returns only `{ userId }`) but callers and the index codex weren't updated. (4) Test mocks for `ResetPasswordScreen` omit `refreshSecret` in the sessionData fixture — the mock still passes because `signInWithTicket` just forwards the object, but the test doesn't assert the new field is present.

**Suggested improvement:** For a security-implementation-review skill: include a post-implementation checklist that specifically audits (a) cleanup/TTL coverage for every new database table, (b) that expiry checks are applied to every token lookup path that validates a derived secret, (c) that generated API types and codex indexes are updated, and (d) that test fixtures for security-sensitive return shapes include all fields.

**Principle:** Security implementations frequently introduce new persistent state (tokens, rate limit counters) whose operational lifecycle — cleanup, expiry, revocation — must be explicitly verified as a separate phase from the security logic itself. A per-task review may verify each fix but miss systemic gaps that only surface when all new state is enumerated together.

