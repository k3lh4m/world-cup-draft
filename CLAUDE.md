@AGENTS.md

# Git commits

Do **not** add a `Co-Authored-By: Claude …` trailer (or any "Generated with Claude
Code" line) to commit messages. Keep commit messages clean with no AI attribution.

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
`npx convex ai-files install`.

<!-- convex-ai-end -->
