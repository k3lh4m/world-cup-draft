@AGENTS.md

# Git commits

Do **not** add a `Co-Authored-By: Claude …` trailer (or any "Generated with Claude
Code" line) to commit messages. Keep commit messages clean with no AI attribution.

# Worktree isolation (git worktrees)

ALL feature work runs in an isolated **git worktree** branched from `main` — not in the
primary checkout. This is the **first action of any implementation session**, before any
read/edit, and is **not gated on whether the work is "parallel"** (parallel terminals are
one motivation, not the trigger condition). Follow the `superpowers:using-git-worktrees` skill.

> **One worktree = one branch = one directory = one terminal = one Claude session.**

Prefer the native `EnterWorktree` tool (creates the worktree under `.claude/worktrees/`,
which is gitignored). `worktree.baseRef` is set to `head`, so it branches from local HEAD;
still confirm intent (`git rev-list --count origin/main..HEAD`). If the native default ever
branches from the wrong ref, fall back to
`git worktree add .worktrees/<feature> -b <feature> HEAD` then enter by path.

Setup rules that bite in practice:
- **Package manager: this repo uses `yarn`.** Detect from the lockfile (`yarn.lock`), never
  from plan/doc prose — running `npm install` drops a competing `package-lock.json`. Run
  `yarn install` in the worktree.
- **`.env.local` is NOT carried into a native worktree** (it's gitignored; `EnterWorktree`
  makes a clean checkout). Copy it before *any* `convex` command:
  `cp <primary-checkout>/.env.local .env.local`.
- **`git add` with Next.js dynamic-segment paths**: zsh expands `[id]` as a glob, so
  `git add app/league/[id]/draft/page.tsx` fails with "no matches found". Quote the path,
  or use `git add -u` / stage by directory.
- Give each dev server its own port (`yarn dev -p 3001`) to avoid clashes.

## Dispatching subagents into a worktree

Agent-tool subagents **do not inherit** the session's `EnterWorktree`-switched directory —
their shell is pinned to the primary checkout and resets between Bash calls. A subagent told
to "work in the worktree" with relative paths + a one-off `cd` will silently write and
**commit on `main`**. When delegating worktree work, give an explicit contract: prefix every
Bash command with `cd <abs-worktree> && …`, use absolute worktree paths for Read/Write/Edit,
run git via that prefix (or `git -C <worktree>`), and require the subagent to prove its commit
is on the worktree branch (`git branch --show-current` + `git log -1`) before reporting done.
**Verify after each task that `main` did not advance.**

## Convex isolation caveat (important)

Worktrees isolate **code only**. A shared local **anonymous dev deployment**
(`CONVEX_DEPLOYMENT`, port 3210) is reached by every worktree whose `.env.local` points at
it. **Every `convex` CLI subcommand pushes to that deployment — including `convex codegen`**,
which downloads deployment state and *uploads functions + schema* (it is NOT local-only).
Two sessions touching one deployment **clobber each other's schema**, and a `convex dev`
watching `main` will re-push and drop another worktree's in-progress schema. Pick one:

- **Shared backend (default)** — run `convex`/`convex dev` in only *one* worktree at a time.
  Other worktrees still run `yarn test` (vitest) fully isolated, and **need no codegen at
  all**: the generated `api` is the `anyApi` proxy and `convex-test` resolves functions via an
  `import.meta.glob` modules list, so `api.<newModule>.*` resolves at runtime without a push.
  The TDD red/green loop works in parallel regardless. **Prefer this: do the whole TDD build
  with vitest only, and defer all codegen / `yarn build` / `yarn dev` until the branch is merged.**
- **Separate backend** — for live build/UI verification inside the worktree, provision its
  OWN deployment first (`yarn convex dev --once` in the worktree rewrites its `.env.local`).
  Only then is it safe to run convex commands there.

Note: `yarn build` type-checks against `convex/_generated/api.d.ts`, so it needs codegen for
new Convex functions — which is why build/UI verification belongs to the "separate backend"
path or post-merge, not the isolated vitest loop.

# Project skills (always-on)

This project ships two behavioral skills that are **not** auto-discovered by the
Skill tool. At the **start of any task-oriented session** — any interaction where you
will use tools and produce deliverables — load and follow both before beginning work
by reading their definitions:

- **task-observer** → `.claude/task-observer/SKILL.md`
- **devils-advocate** → `.claude/devils-advocate/SKILL.md`

(Read these with the Read tool — do not invoke them via the Skill tool; they are not
registered there. The same files are mirrored under `skills/` if `.claude/` is unavailable.)

## task-observer activation

At the start of any task-oriented session — any interaction where you will use tools
and produce deliverables — invoke the task-observer skill before beginning work. This
ensures skill improvement opportunities are captured throughout the session.

When loading any skill, check the observation log for OPEN observations tagged to that
skill. Apply their insights to the current work, even if the skill file hasn't been
updated yet. This enables immediate application of observations before they're
permanently integrated during the weekly review.

- Observation log: `.claude/task-observer/skill-observations/log.md`
- Last weekly-review timestamp: `.claude/task-observer/skill-observations/last-review-date.txt`
- Log observations **silently** in the standard `### Observation N:` format; surface a
  grouped summary at session end. Do not interrupt the user to log.

## devils-advocate activation

When starting any task-oriented session, invoke the devils-advocate skill. It runs in
the background alongside task-observer to surface counter-arguments at significant
decision points.

- It is **always on**, not a mode to switch into on request.
- Challenge only high-impact, hard-to-reverse decisions (tech/library/framework choices,
  data model/schema, API contracts, architecture/module boundaries, security model,
  scope additions, assumptions stated as fact). Rule of thumb: if getting it wrong costs
  >30 min to undo, challenge it. Do not challenge naming, formatting, or easily reversed
  micro-choices.
- One challenge, four lines: `Decision` / `Counter` / `Risk` / `Alternative`. Surface
  before implementation (or at the next checkpoint if mid-task); never interrupt mid-file.
- At session end, run the silent review for decisions accepted without challenge and, if
  task-observer is active, log unchallenged decisions as observations.

# Test-driven development (required)

All production code in this repo is written **test-first**, following the
`superpowers:test-driven-development` skill. Invoke that skill before writing any
feature or bugfix and follow its Red → Green → Refactor cycle exactly:

1. **RED** — write one minimal failing test for the next behavior.
2. **Verify RED** — run it and confirm it fails for the *expected* reason (feature
   missing, not a typo). If you didn't watch it fail, you don't know it tests anything.
3. **GREEN** — write the simplest code that passes. No extra features (YAGNI).
4. **Verify GREEN** — run the suite; all green, output pristine.
5. **REFACTOR** — clean up while staying green.

**The Iron Law:** no production code without a failing test first. Wrote code before
the test? Delete it and reimplement from the test — don't "adapt" or keep it as reference.

## Because AI writes most of the code here

A test written by the same agent, in the same pass as the implementation, only encodes
the AI's *assumptions* — it is not an independent check. To keep the test an honest spec:

- **The human owns the behavior spec.** Before implementing, state (or confirm) the
  concrete cases: inputs → expected outputs, and the edge cases that matter. The AI
  writes tests against *those* cases, then implements. When the spec is unclear, ask —
  don't invent assertions that just ratify a guess.
- **External-boundary code is the highest-value target.** ESPN parsers, Convex
  functions, and anything consuming `fetch`/files/`JSON.parse` is where AI's assumptions
  about data shapes go wrong. Pair TDD with the Zod `.parse()` boundary validation that
  AGENTS.md already requires — test the parse failures, not just the happy path.

## Exemptions (allowed without a failing test)

- Throwaway spikes / exploration — but throw the spike away and reimplement with TDD.
- Generated code (e.g. `convex/_generated/`).
- Config files and pure scaffolding.

Anything that survives into the product gets tests. If a piece of code is "too simple to
test," it's a 30-second test — write it.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`yarn convex ai-files install`.

<!-- convex-ai-end -->
