---
name: design-system-integration-review
description: >
  Use when reviewing or writing hand-authored code that composes CLI-generated or
  vendored design-system components (shadcn/ui, Base UI, Radix, Tailwind v4 tokens),
  or when installing/initializing such a library. Catches defects that typecheck and
  build clean but break visually or rely on stale upstream assumptions. Trigger on
  shadcn install/init, Tailwind `@theme` token work, polymorphic component props
  (`render`/`asChild`), or PR review of `components/ui/*` consumers.
---

# Design-System Integration Review

Build/typecheck success does **not** validate the contracts between hand-written code and
generated/vendored components. These defects are invisible to `tsc` and `yarn build` and only
surface at runtime (wrong layout, wrong dark-mode position) or on a different primitive. When
reviewing or writing code that composes a design system, verify against the **installed
component source**, never against training-data memory of the canonical upstream library.

## The core rule

shadcn CLI components are thin wrappers around **swappable primitives** (Radix, Base UI,
Headless UI). API surface and CSS contracts vary by primitive. Before flagging or approving
any non-trivial usage, **read the installed `components/ui/<component>.tsx`** to see which
primitive it wraps and what classes/props it actually provides.

## Checklist

- **CSS positioning contracts.** A hand-written `absolute` child (e.g. overlaid icons in a
  theme toggle) needs a positioned ancestor. Confirm the *installed* base component still sets
  `relative` — canonical shadcn snippets assume the Radix button does, but `base-nova`/Base UI
  buttons may not. Verify against the current vendored class list, not the upstream example.
- **Polymorphic composition.** Base UI uses `render={<Link/>}`; Radix uses `asChild`. Code is
  correct only for the primitive actually installed. Read the wrapper before judging.
- **Tailwind v4 `@theme inline` token mappings.** Flag self-referential aliases like
  `--font-sans: var(--font-sans)` — they only resolve via a separate `:root` definition and
  break silently if that line moves. Prefer mapping to the underlying primitive
  (`--font-sans: var(--font-geist-sans)`). When token resolution is non-obvious, verify
  against **compiled** CSS (`.next/static/**/*.css`), not source-level cascade reasoning.
- **shadcn CLI version drift.** CLI flags change across majors. As of shadcn v4 there is no
  `--base-color` (it lives in `components.json`); use `--defaults` for fully non-interactive,
  or `--base radix|base` + `--preset <name>`. `--yes` only skips confirmations, not selection
  prompts. When a flag errors, check `--help` rather than inventing a workaround.

## Verification discipline

- Confirm class presence/absence with `grep -c` or by checking the exit code (`rc=$?`) — never
  a chained `grep -oE pattern && echo "present"` after a non-matching grep (false positives).
- "It builds" proves types and bundling, not layout. For visual contracts, inspect the
  installed source and/or compiled output; ideally eyeball the rendered component.

## Source

Distilled from task-observer observations #3, #5 (CSS contract), #6, #7.
