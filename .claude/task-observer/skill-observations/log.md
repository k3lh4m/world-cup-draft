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

### Observation 2: Token-lifecycle gap should be challenged at design stage, not just implementation review

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Brainstorming the multi-tenant leagues + league-admin design for WorldCupDraft (spec `docs/superpowers/specs/2026-06-08-multi-tenant-leagues-design.md`)
**Skill:** devils-advocate (also reinforces new-skill candidate `security-implementation-review` from Observation 1)
**Type:** open-source
**Phase/Area:** Decision challenge — security model / new persistent secret state

**Issue:** The approved design introduces three bearer tokens (admin/invite/member) in localStorage with no expiry, rotation, or revocation. The gap was caught at the design stage by applying Observation 1's lifecycle principle to a new spec (not just to an implementation diff). A devils-advocate challenge was surfaced (leaked admin link = permanent silent takeover; name-only joins = no admin recovery; reusable invite link). The user consciously accepted the risk for an MVP trusted friend group and a Saturday deadline; the spec now carries an explicit "Known risks (accepted for MVP)" section with cheapest-first post-MVP mitigations (token rotation, single-use invites, httpOnly cookie).

**Suggested improvement:** Observation 1's `security-implementation-review` checklist (cleanup/TTL/expiry/revocation for every new persistent secret) should explicitly apply at the *design/spec* stage too, not only post-implementation. Add a design-review trigger: whenever a spec introduces a new credential/token, require the spec to state its rotation/revocation/expiry story or explicitly mark it an accepted risk.

**Principle:** The lifecycle of new secret state is cheapest to address when the data model is still on paper. Pulling the security-lifecycle check forward to the spec stage (and recording accepted risks in the spec itself) prevents the far more expensive retrofit once dependent tables and code exist.

---

## 2026-06-08 — shadcn/ui Task 1: init and starter components

### Observation 3: shadcn v4 CLI has breaking changes vs v1 — `--base-color` flag does not exist

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Installing shadcn/ui (Task 1 of 6) into a Next.js 16 / React 19 / Tailwind v4 project
**Skill:** New skill candidate: shadcn-setup (or improvement to vercel:shadcn)
**Type:** open-source
**Phase/Area:** CLI initialization — flag/option changes between major versions

**Issue:** A plan written for shadcn v1 specified `npx shadcn@latest init --base-color stone --yes`. In shadcn v4 (the current latest as of 2026-06), the `--base-color` flag does not exist — it produces `error: unknown option '--base-color'`. The v4 CLI uses `--base radix|base` (component library choice) and `--preset [name|code]` instead, with `baseColor` living in `components.json`. Additionally, `--yes` alone does not suppress all prompts (component library and preset selections still block). The fully non-interactive flag is `--defaults` (maps to next template + base-nova preset). The `--base radix --yes` combination still blocks on preset selection.

**Suggested improvement:** Any skill covering shadcn setup should document the v4 CLI surface: `--defaults` for fully non-interactive, `--base radix|base` + `--preset <name>` for controlled non-interactive, and note that `--yes` only skips confirmation prompts (not selection prompts). Also note `baseColor` is set in `components.json` not via a CLI flag.

**Principle:** CLI flags for major-version npm packages change significantly. Plans that reference specific CLI flags should either pin the version or be tested against `@latest`. When a CLI flag is missing, check `--help` output before attempting workarounds — the correct path is usually a different flag combination, not a workaround.

---

## 2026-06-08 — Task A: Install deps + extend Convex schema

### Observation 4: `...authTables` spread requires existing `users` table from @convex-dev/auth — new tables referencing `v.id("users")` work because authTables injects it

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Adding @convex-dev/auth + new league/draft tables to convex/schema.ts
**Skill:** convex (or new skill candidate: convex-auth-setup)
**Type:** open-source
**Phase/Area:** Schema extension — authTables spread interaction with custom tables

**Issue:** When spreading `...authTables` into `defineSchema`, the `users` table (and other auth tables) are injected into the schema automatically. New tables that use `v.id("users")` (e.g. `leagues.commissionerUserId`, `memberships.userId`) work correctly because the `users` table is already registered via authTables. Developers unfamiliar with this pattern may try to define a `users` table manually and hit a "duplicate table" error, or may be confused about why `v.id("users")` is valid when no explicit `users` table appears in the file.

**Suggested improvement:** Any Convex auth setup skill should note that `...authTables` registers `users` and related tables automatically, and that custom tables may reference `v.id("users")` without a separate `users: defineTable(...)` declaration. Also note that manually defining a `users` table after spreading authTables will cause a runtime schema conflict.

**Principle:** When a framework helper (like authTables) implicitly registers named tables into the schema, document it explicitly — the implicit contract is invisible to code reviewers and new team members, and "duplicate table" errors without this context are confusing.

---

## 2026-06-08 — Add TDD convention to CLAUDE.md

### Observation 5: CLAUDE.md conventions are behavioral, not enforced — pair process mandates with a mechanical backstop

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** User asked to make all code TDD-based using `superpowers:test-driven-development` and to record the convention in CLAUDE.md. Added a `# Test-driven development (required)` section.
**Skill:** task-observer (also relevant to `superpowers:test-driven-development` and a possible new `enforcing-conventions` skill)
**Type:** open-source
**Phase/Area:** Convention enforcement — instruction vs. gate

**Issue:** A rule written into CLAUDE.md is a *behavioral* instruction loaded into the agent's context; it relies on the agent's discipline every session and is silently bypassable (the agent can rationalize "skip TDD just this once," or a future session may under-weight it). It is not an enforced gate. For a high-value discipline like "no production code without a failing test first," the durable form is mechanical: a pre-commit hook or CI check that fails when changed source files have no corresponding test changes. This makes the convention hold regardless of which agent (or human) touches the code, and regardless of whether the instruction was read that session.

**Suggested improvement:** When a user codifies a process discipline into CLAUDE.md/AGENTS.md, proactively offer the mechanical backstop alongside the behavioral instruction — e.g. a pre-commit hook or CI job that diff-checks changed source paths against changed test paths and fails when tests are missing. Note the tradeoff (path-heuristic gates produce false positives for refactors/renames; allow an explicit override/skip token). A `superpowers:test-driven-development` skill or an `enforcing-conventions` skill could ship a reference hook script.

**Principle:** Behavioral instructions (CLAUDE.md) and mechanical gates (hooks/CI) sit at different points on the reliability curve. Instructions are cheap and flexible but discipline-dependent and bypassable; gates are rigid but guarantee the invariant. For any convention whose violation is costly or hard to detect after the fact, recommend pairing the instruction with a gate rather than relying on the instruction alone.

