---
name: security-implementation-review
description: >
  Use when designing or reviewing features that introduce new persistent secret state —
  auth tokens, magic/invite/reset links, API keys, rate-limit counters, sessions. Applies
  at BOTH the spec/design stage and post-implementation review. Catches lifecycle gaps
  (cleanup, expiry, rotation, revocation) and cross-task integration gaps that per-task
  reviews miss. Trigger on auth/security work, new credential tables, or "is this secure
  enough?" questions.
---

# Security Implementation Review

Security features routinely introduce new **persistent state** (tokens, counters, sessions)
whose *operational lifecycle* — cleanup, expiry, rotation, revocation — must be verified as a
distinct concern from the security logic itself. A per-task review can verify each fix yet
miss systemic gaps that only appear when all new state is enumerated together.

## Apply at the design/spec stage (cheapest)

The lifecycle of secret state is cheapest to address while the data model is still on paper.
**Whenever a spec introduces a new credential/token, require the spec to state its
expiry / rotation / revocation story — or explicitly mark it an accepted risk** with
cheapest-first post-MVP mitigations recorded in the spec (e.g. a "Known risks (accepted for
MVP)" section). Surface this as a devils-advocate challenge before implementation: a leaked
no-expiry bearer link = permanent silent takeover; name-only joins = no admin recovery;
reusable invite links.

## Post-implementation checklist (audit all new state together)

- **Cleanup / TTL coverage for every new table.** Does a cron/cleanup path cover *each* new
  persistent table (including unauthenticated rate-limit tables)? Unbounded growth is a common
  miss when one cron covers the authenticated table but not a new sibling.
- **Expiry re-checked on every token lookup path.** A derived secret (e.g. a `reset_ticket`)
  validated with a timing-safe compare must ALSO re-check the underlying token's expiry, so an
  expired-but-present token can't be exercised.
- **Generated types / codices updated.** Changed return shapes (e.g. `signUp` now returns only
  `{ userId }`) must propagate to callers and any index/codex; stale shapes compile fine.
- **Test fixtures include security-sensitive fields.** Mocks that forward an object can pass
  while omitting a newly-required field (e.g. `refreshSecret`); assert the new field is present.

## Provider-specific note (Convex Auth magic-link)

Email/magic-link verification is a fresh, possibly cross-device request that trusts only the
verified identifier — extra form fields (e.g. a name typed when requesting the link) are
**dropped across the round-trip** (`verifyCodeAndSignIn` builds the profile as `{ email, phone }`).
Collect additional profile fields in a separate post-sign-in mutation gated on the
authenticated session. Verify provider param-persistence against the *installed* library
source, not training-data assumptions.

## Source

Distilled from task-observer observations #1 and #2.
