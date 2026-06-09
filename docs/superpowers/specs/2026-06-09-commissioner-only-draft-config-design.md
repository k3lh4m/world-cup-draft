# Commissioner-only draft configuration UI

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Frontend-only — `app/league/[id]/page.tsx`

## Problem

On the league home page, the draft-configuration block (mode selector,
picks/round, rounds, and the **Start draft** button — currently lines 107–134 of
`app/league/[id]/page.tsx`) renders for **every** league member. Only the
commissioner can actually start a draft: the backend mutations already enforce
this. A non-commissioner who clicks **Start draft** simply gets an error toast
("Only the commissioner can start the draft"). This is confusing UX — the UI
offers an action it will always reject.

## Goal

Show the draft-configuration controls only to the commissioner. Non-commissioners
see a short waiting message in their place until the draft starts.

## Non-goals / out of scope

- **No backend changes.** Authorization is already enforced server-side (see
  below). This change does not add or alter any trust boundary.
- No new Convex query or mutation.
- No gating of the **Invite friends** card, **Draft room**, or **Leaderboard**
  links — these stay visible to all members (confirmed with the user).
- No changes to the force-reveal / next-round admin controls (already gated in
  `components/BlindDraftRoom.tsx`).

## Existing authorization (already in place)

The relevant mutations call `requireMembership` and reject non-commissioners:

- `convex/draft.ts` → `startDraft`: throws `"Only the commissioner can start the
  draft"` when `me.role !== "commissioner"`.
- `convex/blindDraft.ts` → `startBlindDraft`, `forceReveal`, `nextRound`: same
  `me.role !== "commissioner"` guard.

A test already covers this: `convex/tests/draft.test.ts` — "only the commissioner
can start the draft" asserts a non-commissioner's `startDraft` call rejects.

**Consequence:** this work is purely a UX alignment. Security does not depend on
the client-side hiding; the server remains the enforcing boundary.

## Approach

### Commissioner detection (reuse existing idiom)

Mirror the pattern already used in `components/BlindDraftRoom.tsx` rather than
adding a new query:

```ts
const myLeagues = useQuery(api.leagues.listMyLeagues);
const myRole = myLeagues?.find((l) => l.league?._id === leagueId)?.membership.role;
const isCommissioner = myRole === "commissioner";
```

Rationale:

- Checks the same `role` field the backend gate uses, so the UI and server can
  never disagree about who is the commissioner.
- Adds no new Convex function; consistent with the established codebase pattern.

### Loading behavior

While `myLeagues` is `undefined` (still loading), render **neither** the
configuration controls **nor** the waiting message. This avoids a flicker where
the commissioner briefly sees the "waiting" message before their role resolves.

### Rendering rules for the `{!draft && ...}` block

| Viewer | `draft` exists | Shown |
| --- | --- | --- |
| Commissioner | no | mode selector, picks/round, rounds, **Start draft** (unchanged) |
| Non-commissioner | no | muted text: *"Waiting for the commissioner to start the draft."* |
| Anyone | yes | nothing (same as today) |
| Anyone, role loading | no | nothing (avoids flicker) |

The **Invite friends** card, **Draft room** link, and **Leaderboard** link are
unchanged and remain visible to all members.

## Testing (TDD)

Add a component test for the league page using the project's jsdom/RTL harness
(per the mixed-environment vitest setup), mocking `convex/react`'s `useQuery` so
`listMyLeagues` returns a controllable membership role:

1. **Commissioner role** → **Start draft** button is rendered; waiting message is
   absent.
2. **Member role** → **Start draft** button is absent; waiting message is present.

Follow Red → Green → Refactor, mirroring how `BlindDraftRoom` is tested. Because
this is a frontend-only change with no new Convex functions, no `convex codegen`
or build step is required for the test loop (convex-test / runtime resolution is
irrelevant here; the test mocks `convex/react` directly).

## Affected files

- `app/league/[id]/page.tsx` — add detection + conditional render.
- `app/league/[id]/__tests__/...` (or sibling `*.test.tsx`) — new component test.
