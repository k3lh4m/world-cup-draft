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


### Observation 5: Vendored/generated components can drop CSS positioning that hand-written wrappers silently depend on

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Spec-compliance + code-quality review of a shadcn/ui (base-nova / Base UI) integration into a Next.js 16 app
**Skill:** New skill candidate: design-system-integration-review (or addition to a code-review checklist)
**Type:** open-source
**Phase/Area:** Reviewing hand-written code that composes vendored/CLI-generated components

**Issue:** The hand-written `theme-toggle.tsx` overlays two icons using `absolute` positioning on the Moon icon, a pattern copied from canonical shadcn examples that assumes the trigger Button establishes a positioning context. The current vendored `base-nova` `button.tsx` base class no longer includes `relative`, so the absolute icon has no positioned ancestor on the button. The code typechecks and the page builds clean, so the defect is invisible to `tsc`/`yarn build` and only surfaces as a visual misplacement in dark mode. A false-positive grep (`grep -oE relative && echo ...` after a non-matching grep) nearly caused this to be reported as a non-issue.

**Suggested improvement:** When reviewing hand-written code that composes CLI-generated/vendored components, explicitly verify the CSS contract the hand-written code assumes (e.g. a `relative` ancestor for `absolute` children, expected slots/data-attrs) against the *actual current* vendored source, not against the canonical upstream example or training-data memory. Treat "copied a known shadcn snippet" as a signal to diff the snippet's assumptions against the installed component version. Also: never confirm presence/absence of a class via a chained `grep -oE pattern && echo` — verify the grep exit code (`rc=$?`) or use `grep -c`.

**Principle:** Build/typecheck success does not validate CSS layout contracts between hand-written wrappers and generated components. When a UI library is swapped or a non-default style is installed (here Base UI / base-nova instead of Radix), snippets ported from the library's canonical docs may rely on base-component CSS that the installed variant no longer provides. Verify the contract against the installed source.

### Observation 6: Self-referential `@theme inline` token aliases work but are a tautology trap worth flagging

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Same shadcn/ui + Tailwind v4 token-theming review
**Skill:** New skill candidate / addition to design-system-integration-review
**Type:** open-source
**Phase/Area:** Reviewing Tailwind v4 `@theme inline` token mappings

**Issue:** `globals.css` maps `--font-sans: var(--font-sans)` inside `@theme inline`, which only resolves correctly because `:root` separately defines `--font-sans: var(--font-geist-sans)`. The `@theme` line is effectively a no-op tautology; the real wiring lives in `:root`. It works (verified in compiled CSS) but reads as a mistake and would break silently if the `:root` line were ever removed or reordered. Confirming it actually resolved required inspecting the built CSS in `.next`, not reasoning from the source.

**Suggested improvement:** In a design-system-integration-review skill, add a check for self-referential `@theme inline` mappings (`--x: var(--x)`). Flag them as fragile-but-working and recommend either mapping directly to the underlying primitive (`--font-sans: var(--font-geist-sans)`) or documenting the indirection. When token resolution is non-obvious, verify against compiled output (`.next/static/**/*.css`) rather than reasoning about the cascade.

**Principle:** Tailwind v4 `@theme inline` resolves `var()` against the `:root` cascade, so `--x: var(--x)` silently aliases to the root definition. This "works" but couples two declarations implicitly; the most robust mapping points at the underlying primitive. Verify non-obvious CSS-variable resolution against compiled output, not source-level reasoning.

---

## 2026-06-08 — Task 13 frontend page review

### Observation 7: Base UI `render` prop pattern should be verified against installed component source, not against Radix/shadcn training data

**Status:** OPEN
**Date:** 2026-06-08
**Session context:** Reviewing three Next.js pages (page.tsx, join/[token]/page.tsx, league/[id]/page.tsx) written against a Base UI / base-nova shadcn install. The league page uses `<Button render={<Link href={...} />}>` as a polymorphic link button.
**Skill:** New skill candidate: design-system-integration-review (extends Observation 5)
**Type:** open-source
**Phase/Area:** Reviewing component usage that differs between Radix and Base UI

**Issue:** The `render` prop is Base UI's polymorphic slot pattern (equivalent to Radix's `asChild`). Code that uses `render={<Link />}` is correct for `@base-ui/react/button` but would fail for a Radix-based shadcn install. A reviewer using training-data knowledge of shadcn (Radix) would flag this as invalid; a reviewer checking the installed `components/ui/button.tsx` (which wraps `ButtonPrimitive` from `@base-ui/react/button`) correctly identifies it as valid. The build confirmed no error.

**Suggested improvement:** When reviewing code that uses a non-standard prop on a shadcn component (e.g. `render`, `asChild`, `renderRoot`), always read the installed `components/ui/<component>.tsx` first to confirm the underlying primitive before flagging or approving.

**Principle:** shadcn CLI-generated components are thin wrappers around swappable primitives (Radix, Base UI, Headless UI). API surface — especially polymorphic composition patterns — varies by primitive. Always verify prop usage against the installed component, not the canonical upstream docs.

---

## 2026-06-09 — Continue worldcup-draft plan (frontend T13–T16)

### Observation 8: Worktree isolation was skipped because CLAUDE.md framed it under "parallel work"

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** User asked to continue the worldcup-draft plan. I began investigation and decisions directly in the primary checkout; the user challenged it twice ("is this running on a worktree like I asked in the claude md", "you should be working from the main branch then on a worktree").
**Skill:** superpowers:using-git-worktrees (also devils-advocate: unchallenged process decision)
**Type:** open-source
**Phase/Area:** Session start — isolation check timing

**Issue:** CLAUDE.md mandates worktree isolation but presents it under a heading "Parallel work across terminals" / "work on multiple features at once." I read that framing as making worktrees *conditional* on parallel/multi-feature work and rationalized skipping it for a single continuation task. The using-git-worktrees skill's Step 0 (detect isolation / create worktree) should run at the START of any feature work, before reads/edits, unconditionally.

**Suggested improvement:** using-git-worktrees should state that the isolation check is the FIRST action of any implementation session and is not gated on whether the work is "parallel" — the parallel-terminals scenario is one motivation, not the trigger condition. Projects whose CLAUDE.md mandates worktrees should pair the instruction with a hook that warns when editing the primary checkout. (Mechanical-backstop pattern, cf. Observation 5 on TDD.)

**Principle:** When a convention's *motivation* (parallel work) is narrower than its *scope* (all feature work), the motivating framing causes the convention to be skipped in the non-motivating-but-in-scope cases. State the trigger condition separately from the motivation.

### Observation 9: Plan/doc text used `npm` but the project uses yarn — trust the lockfile, not prose

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** Establishing the worktree baseline. The worldcup-draft plan text says `npm install` / `npm test`, and settings allow `npm *`, so I ran `npm install` — which dropped a `package-lock.json` into a yarn project (`yarn.lock` present, Yarn 1.22). User corrected: "we are using yarn not npm."
**Skill:** superpowers:using-git-worktrees (Step 3 project setup) / executing-plans
**Type:** open-source
**Phase/Area:** Dependency install — package-manager detection

**Issue:** I followed the package manager named in the plan prose rather than detecting it from the repo. The project has `yarn.lock` (and CLAUDE.md/AGENTS.md were mid-migration to say yarn). Running npm created a competing lockfile and churned the resolved tree; cleanup required removing `package-lock.json` and reinstalling with `yarn --frozen-lockfile`.

**Suggested improvement:** Project-setup steps should detect the package manager from the lockfile (`yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm) and ignore the command names written in plans/docs, which drift. Add to using-git-worktrees Step 3 and any executing-plans setup.

**Principle:** The lockfile is ground truth for the package manager; plan/doc prose is a lagging indicator. Detect from repo state, not from instructions, and never introduce a second lockfile.

### Observation 10: A "scaffold auth" commit looked complete but was non-functional (providers: [])

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** Reconciling the plan against the backend before building the frontend. A prior commit "scaffold Convex Auth with email sign-in" had `convex/auth.ts` with `providers: []`, while `components/SignIn.tsx` already called `signIn("resend", …)`. No provider was wired and no `AUTH_RESEND_KEY` existed, so `<Authenticated>` could never become true and every end-to-end verification step was silently blocked.
**Skill:** convex-setup-auth (or new: scaffold-completeness-review)
**Type:** open-source
**Phase/Area:** Verifying that scaffolding is wired end-to-end, not merely present

**Issue:** The presence of auth files (auth.ts, auth.config.ts, http.ts, SignIn.tsx, middleware) read as "auth done," but the provider array was empty — a functional gap invisible to file-existence checks and to typecheck/build (empty providers compiles fine). It only surfaces at runtime as "can never sign in."

**Suggested improvement:** When a task depends on scaffolded infrastructure (auth, payments, env-backed clients), verify the wiring is complete — non-empty provider/route arrays, referenced provider ids actually registered, required env vars present — before building features on top. A scaffold-completeness check should enumerate the runtime preconditions, not just the files.

**Principle:** "Files exist" and "typecheck/build pass" do not imply "functional." Configuration arrays that are syntactically valid when empty (auth providers, route lists, middleware matchers) are a common silent-gap location; verify them against their runtime contract.

---

## 2026-06-09 — Draft board + pre-draft queue (enh 18, 19)

### Observation 11: zsh glob expansion breaks git add for paths containing square brackets

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** Committing new components and updated pages after implementing draft board and queue. Running `git add app/league/[id]/draft/page.tsx` failed with "no matches found: app/league/[id]/draft/page.tsx" on zsh because zsh expands `[id]` as a character class glob.
**Skill:** New skill candidate: git-worktree-operations / executing-plans (commit step)
**Type:** open-source
**Phase/Area:** Commit — staging files with special characters in paths

**Issue:** zsh expands `[...]` in bare arguments as a glob character class. A path like `app/league/[id]/draft/page.tsx` causes "no matches found" unless the path is quoted or `noglob` is used. The same issue affects any Next.js dynamic-segment path (`[id]`, `[token]`, `[slug]`, etc.).

**Suggested improvement:** In any skill covering git commits (executing-plans, using-git-worktrees), add: "Always double-quote file paths containing square brackets when using git add on zsh. Alternatively, use `git add -u` (stages all tracked modified files) or `git add <directory>/` to stage by directory."

**Principle:** zsh treats `[...]` in unquoted arguments as glob character classes, which silently breaks file paths common in Next.js (dynamic route segments). Quote all paths with square brackets or use directory-level staging.

---

## 2026-06-09 — Fix untimed-draft autopick bug (enh 20)

### Observation 12: convex-test doesn't fire scheduled jobs, so scheduler-arm bugs need explicit assertion on autopickJobId

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** Bug fix: `armClock` was being called for drafts without `pickClockSeconds`, arming unwanted 60-second autopick jobs. The existing test suite had 53 tests and none caught it.
**Skill:** superpowers:test-driven-development (also relevant to convex test patterns)
**Type:** open-source
**Phase/Area:** Test coverage for scheduler-side effects in Convex mutations

**Issue:** `convex-test` never fires scheduled jobs, so a bug where `ctx.scheduler.runAfter(...)` is called for untimed drafts was invisible to all existing tests. The scheduler call succeeds silently; no error is thrown, and no downstream effects appear in test assertions. The bug only manifests in a real deployed environment where the scheduler actually fires.

**Suggested improvement:** When writing Convex mutations that conditionally arm a scheduler job, include a test that asserts `doc.jobId === undefined` for the case where no job should be armed. This provides coverage against the class of bug where a scheduler call is made unconditionally rather than conditionally, even though convex-test won't simulate the job firing.

**Principle:** In convex-test, scheduler calls are accepted but never executed — so scheduler-related bugs require tests that assert absence (e.g. `autopickJobId === undefined`) not just presence. Any Convex feature that conditionally schedules a job should have at least one test for the "no job should be scheduled" path.

---

## 2026-06-09 — Live ticker (enh 21)

### Observation 13: ESPN competitor shape is undocumented — parse as deeply optional to survive TBD fixtures

**Status:** OPEN
**Date:** 2026-06-09
**Session context:** Implementing the "your players playing now" live ticker (enhancement 21). Needed homeTeamId/awayTeamId from ESPN scoreboard `events[].competitions[].competitors[]`.
**Skill:** New skill candidate: convex-espn-integration (or addition to a defensive-parsing skill)
**Type:** open-source
**Phase/Area:** ESPN API schema design — deeply optional parsing

**Issue:** The ESPN public scoreboard API does not publish a schema. Fields like `competitions`, `competitors`, `homeAway`, and `team.id` are absent for placeholder fixtures (TBD opponents in knockout stages). Parsing these with `z.object({ ... })` rather than `z.object({ ... }).optional()` at every level would throw on valid but incomplete event data. The solution is to use `?.` chains everywhere and default 0 → `undefined` for the numeric ID, which maps cleanly to `v.optional(v.number())` in the Convex schema.

**Suggested improvement:** Any skill covering ESPN API integration should recommend marking all fields beyond `id`, `date`, and top-level `status` as optional, and using numeric defaults (0 → undefined) for team/player IDs rather than throwing when absent.

**Principle:** Public sports APIs routinely include structurally incomplete rows for future/placeholder fixtures. The safe default is to treat every field after the event identifier as optional and to make absence explicit (undefined/null) rather than letting a parse failure discard the entire batch.
