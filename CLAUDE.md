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
