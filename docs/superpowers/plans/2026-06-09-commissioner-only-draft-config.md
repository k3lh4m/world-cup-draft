# Commissioner-only draft configuration UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the draft-configuration controls (mode, picks/round, rounds, "Start draft") only to the league commissioner; non-commissioners see a waiting message until the draft starts.

**Architecture:** Extract the inline draft-config block from `app/league/[id]/page.tsx` into a focused, testable `components/DraftSetup.tsx`. The component reads the current user's role via the existing `api.leagues.listMyLeagues` idiom (same `role` field the backend already gates on) and renders either the controls (commissioner) or a waiting message (everyone else). No backend changes — `startDraft` / `startBlindDraft` are already commissioner-gated server-side; this is a UX alignment only.

**Tech Stack:** Next.js (App Router, client component), Convex (`convex/react` hooks), React 19, vitest + @testing-library/react (jsdom), shadcn/ui `Button`.

**Spec:** `docs/superpowers/specs/2026-06-09-commissioner-only-draft-config-design.md`

---

## Prerequisites (run once in the worktree)

This worktree is a clean checkout with no `node_modules`. Before running any test step:

```bash
yarn install
```

No `convex codegen` or `yarn build` is required for this work: there are no new Convex functions (all referenced functions — `leagues.listMyLeagues`, `draft.startDraft`, `blindDraft.startBlindDraft` — already exist in the generated `api`), and the component test mocks `convex/react` directly. Defer any build/dev verification until the branch is merged, per project CLAUDE.md.

---

## File Structure

- **Create** `components/DraftSetup.tsx` — encapsulates draft-mode/options local state, the start mutations, the commissioner check, and the conditional render. One responsibility: "let the commissioner configure and start the draft."
- **Create** `components/DraftSetup.test.tsx` — jsdom component test mocking `convex/react`.
- **Modify** `app/league/[id]/page.tsx` — remove the inline draft-config block + its state/mutations; render `<DraftSetup .../>` in its place (still gated on `!draft`).

---

### Task 1: `DraftSetup` component (commissioner-gated draft config)

**Files:**
- Create: `components/DraftSetup.tsx`
- Test: `components/DraftSetup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/DraftSetup.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DraftSetup } from "./DraftSetup";
import { type Id } from "@/convex/_generated/dataModel";

// The component makes exactly one useQuery call (listMyLeagues); return the
// value held in `myLeagues`. useMutation is unused by these render assertions.
let myLeagues: unknown;
vi.mock("convex/react", () => ({
  useQuery: () => myLeagues,
  useMutation: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const leagueId = "lg1" as unknown as Id<"leagues">;
const memberIds = ["m1"] as unknown as Id<"memberships">[];

function leaguesWithRole(role: "commissioner" | "member") {
  return [{ league: { _id: "lg1" }, membership: { role } }];
}

beforeEach(() => {
  myLeagues = undefined;
});

describe("DraftSetup", () => {
  it("shows the draft config + Start draft button to the commissioner", () => {
    myLeagues = leaguesWithRole("commissioner");
    render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(screen.getByRole("button", { name: /start draft/i })).toBeInTheDocument();
    expect(screen.queryByText(/waiting for the commissioner/i)).not.toBeInTheDocument();
  });

  it("shows a waiting message (no controls) to a non-commissioner member", () => {
    myLeagues = leaguesWithRole("member");
    render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(screen.getByText(/waiting for the commissioner/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start draft/i })).not.toBeInTheDocument();
  });

  it("renders nothing while the role is still loading", () => {
    myLeagues = undefined;
    const { container } = render(<DraftSetup leagueId={leagueId} memberIds={memberIds} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run components/DraftSetup.test.tsx`
Expected: FAIL — cannot resolve `./DraftSetup` ("Failed to load url ./DraftSetup" / module not found). This is a valid RED: the implementation does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `components/DraftSetup.tsx`:

```tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function DraftSetup({
  leagueId,
  memberIds,
}: {
  leagueId: Id<"leagues">;
  memberIds: Id<"memberships">[];
}) {
  const myLeagues = useQuery(api.leagues.listMyLeagues);
  const startDraft = useMutation(api.draft.startDraft);
  const startBlindDraft = useMutation(api.blindDraft.startBlindDraft);
  const [mode, setMode] = useState<"snake" | "blind">("snake");
  const [picksPerRound, setPicksPerRound] = useState(3);
  const [rounds, setRounds] = useState(5);

  const isCommissioner =
    myLeagues?.find((l) => l.league?._id === leagueId)?.membership.role ===
    "commissioner";

  async function onStart() {
    try {
      if (mode === "blind") {
        await startBlindDraft({ leagueId, order: memberIds, picksPerRound, rounds });
      } else {
        await startDraft({ leagueId, order: memberIds });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start draft");
    }
  }

  // Role still loading — render nothing to avoid flashing the wrong UI.
  if (myLeagues === undefined) return null;

  if (!isCommissioner) {
    return (
      <p className="text-muted-foreground text-sm">
        Waiting for the commissioner to start the draft.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border px-2 py-1 text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value as "snake" | "blind")}
      >
        <option value="snake">Snake draft</option>
        <option value="blind">Blind-collision draft</option>
      </select>
      {mode === "blind" && (
        <>
          <label className="text-sm">
            Picks/round{" "}
            <input
              type="number"
              min={1}
              max={11}
              value={picksPerRound}
              className="w-14 rounded border px-1 py-0.5"
              onChange={(e) => setPicksPerRound(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Rounds{" "}
            <input
              type="number"
              min={1}
              max={20}
              value={rounds}
              className="w-14 rounded border px-1 py-0.5"
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <Button onClick={onStart} disabled={memberIds.length === 0}>
        Start draft
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn vitest run components/DraftSetup.test.tsx`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add components/DraftSetup.tsx components/DraftSetup.test.tsx
git commit -m "feat(league): commissioner-only DraftSetup component (TDD)"
```

---

### Task 2: Wire `DraftSetup` into the league page

**Files:**
- Modify: `app/league/[id]/page.tsx`

- [ ] **Step 1: Replace the inline draft-config block + its state with `<DraftSetup>`**

In `app/league/[id]/page.tsx`:

1. Change the `convex/react` import from `{ useMutation, useQuery }` to `{ useQuery }` (the page no longer calls a mutation directly).

2. Add the component import alongside the existing imports:

```tsx
import { DraftSetup } from "@/components/DraftSetup";
```

3. Delete these now-unused lines from the component body (currently near the top):

```tsx
  const startDraft = useMutation(api.draft.startDraft);
  const startBlindDraft = useMutation(api.blindDraft.startBlindDraft);
  const [mode, setMode] = useState<"snake" | "blind">("snake");
  const [picksPerRound, setPicksPerRound] = useState(3);
  const [rounds, setRounds] = useState(5);
```

4. Delete the entire `onStart` function:

```tsx
  async function onStart() {
    try {
      const order = members.map((m) => m._id);
      if (mode === "blind") {
        await startBlindDraft({ leagueId, order, picksPerRound, rounds });
      } else {
        await startDraft({ leagueId, order });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start draft");
    }
  }
```

5. Replace the inline draft-config block:

```tsx
        {!draft && (
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded border px-2 py-1 text-sm" value={mode}
              onChange={(e) => setMode(e.target.value as "snake" | "blind")}>
              <option value="snake">Snake draft</option>
              <option value="blind">Blind-collision draft</option>
            </select>
            {mode === "blind" && (
              <>
                <label className="text-sm">
                  Picks/round{" "}
                  <input type="number" min={1} max={11} value={picksPerRound}
                    className="w-14 rounded border px-1 py-0.5"
                    onChange={(e) => setPicksPerRound(Number(e.target.value))} />
                </label>
                <label className="text-sm">
                  Rounds{" "}
                  <input type="number" min={1} max={20} value={rounds}
                    className="w-14 rounded border px-1 py-0.5"
                    onChange={(e) => setRounds(Number(e.target.value))} />
                </label>
              </>
            )}
            <Button onClick={onStart} disabled={members.length === 0}>
              Start draft
            </Button>
          </div>
        )}
```

with:

```tsx
        {!draft && (
          <DraftSetup leagueId={leagueId} memberIds={members.map((m) => m._id)} />
        )}
```

6. Verify remaining usages are still imported: the page still uses `useQuery`, `toast` (in `copyInvite`), `Button` (the invite "Copy" button), and `buttonVariants` (the Draft room / Leaderboard links). Do **not** remove those imports. If `toast` is now flagged unused by your editor, double-check `copyInvite` still calls `toast.success` (it should) before removing anything.

- [ ] **Step 2: Type-check the change**

Run: `yarn tsc --noEmit`
Expected: no errors. (This does not touch Convex; it type-checks against the existing generated `api`.)

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

Run: `yarn vitest run`
Expected: PASS — all existing tests plus the 3 new `DraftSetup` tests pass. Output pristine.

- [ ] **Step 4: Commit**

```bash
git add "app/league/[id]/page.tsx"
git commit -m "feat(league): render commissioner-only DraftSetup on league page"
```

> Note: the path contains `[id]`, a zsh glob. Keep it double-quoted (as above), or use `git add -u`, to avoid "no matches found".

---

## Verification (after both tasks)

- `yarn vitest run` — all green, pristine output.
- `yarn tsc --noEmit` — clean.
- Manual (post-merge, or in a worktree with its own Convex deployment): as commissioner the config controls + "Start draft" appear; as a non-commissioner member they are replaced by "Waiting for the commissioner to start the draft."; once a draft exists neither role sees the block; the Invite / Draft room / Leaderboard controls remain for everyone.

When verified, use `superpowers:finishing-a-development-branch` to merge `worktree-commissioner-only-draft-config` into `main`.

---

## Self-review notes

- **Spec coverage:** commissioner-only controls (Task 1 render branch + Task 2 wiring); waiting message for non-commissioners (Task 1); no-flicker loading (Task 1 `myLeagues === undefined` → `null`); invite/draft-room/leaderboard unchanged (Task 2 leaves them untouched); no backend change (no Convex task); TDD component test (Task 1). All covered.
- **Type consistency:** `DraftSetup` props `{ leagueId: Id<"leagues">, memberIds: Id<"memberships">[] }` are produced by the page as `leagueId` and `members.map((m) => m._id)`; `startBlindDraft` receives `{ leagueId, order, picksPerRound, rounds }` and `startDraft` receives `{ leagueId, order }`, matching their existing signatures.
- **No placeholders:** every code/command step is concrete.
