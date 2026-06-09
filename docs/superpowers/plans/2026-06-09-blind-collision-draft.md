# Blind-Collision Draft Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional second draft mode where each round every manager secretly picks up to X players, all reveal at once, and any player picked by 2+ managers is wiped out — feeding the same shared scoring/leaderboard as snake.

**Architecture:** A pure resolver (`convex/lib/blindResolve.ts`) plus a thin Convex layer (`convex/blindDraft.ts`) and a mode-branched draft room (`components/BlindDraftRoom.tsx`). Snake's `convex/draft.ts` is untouched. The single `drafts` table is reused with a `mode` discriminator + optional blind fields; surviving picks land in the shared `picks` table so scoring/leaderboard stay mode-agnostic. Two new tables: `blindSelections`, `draftWipes`.

**Tech Stack:** Next.js 16 (App Router, TS), Convex (queries/mutations), Tailwind + shadcn/ui, Vitest + convex-test. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-08-blind-collision-draft-design.md` (implementation-ready v1).

---

## Prerequisites (read before Task 1)

This work changes `convex/schema.ts` (new `mode` field + two tables), so per `CLAUDE.md` it **must** run in an isolated git worktree branched from `main`, with its **own** Convex dev deployment (a shared `convex dev` would clobber the other worktree's schema):

```bash
# from the main checkout (one-time guard already satisfied in this repo):
git worktree add .worktrees/blind-draft -b blind-draft
cd .worktrees/blind-draft && yarn install
yarn convex dev --once   # provisions THIS worktree's own dev deployment (rewrites its .env.local)
```

All `yarn …` commands below run inside that worktree. `yarn test` runs vitest fully isolated (never hits the live deployment), so the red/green loop works regardless.

---

## File structure (new + modified)

```
convex/
  lib/blindResolve.ts     NEW — pure resolveRound() (Task 1)
  schema.ts               MODIFY — drafts +blind fields; +blindSelections, +draftWipes (Task 2)
  blindDraft.ts           NEW — startBlindDraft, availablePlayers (T3); setSelection,
                                blindRoundState (T4); lockIn, forceReveal, nextRound,
                                resolveCurrentRound (T5)
  tests/
    blindResolve.test.ts  NEW — pure unit tests (Task 1)
    blindDraft.test.ts    NEW — integration tests (Tasks 3, 4, 5)
components/
  BlindDraftRoom.tsx      NEW — selecting/revealing/complete views (Task 6)
app/league/[id]/draft/page.tsx  MODIFY — branch on draft.mode (Task 6)
app/league/[id]/page.tsx        MODIFY — Snake/Blind start toggle + X/R inputs (Task 7)
```

---

## Task 1: Pure round resolver (`resolveRound`)

The collision logic, isolated and I/O-free. A player picked by exactly one manager is assigned to them; a player picked by 2+ managers is wiped (nobody gets him). Duplicates within one manager's list are deduped defensively so a self-dupe never self-collides.

**Files:**
- Create: `convex/lib/blindResolve.ts`
- Test: `convex/tests/blindResolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/blindResolve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveRound } from "../lib/blindResolve";

const byPlayer = (a: { playerId: string }, b: { playerId: string }) =>
  a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;

describe("resolveRound", () => {
  it("wipes players picked by 2+ managers, assigns uniquely-picked players (worked example)", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "alice", playerIds: ["mbappe", "bellingham", "saka"] },
      { membershipId: "bob", playerIds: ["mbappe", "pedri", "dias"] },
      { membershipId: "cara", playerIds: ["haaland", "pedri", "saka"] },
    ]);
    expect([...wiped].sort()).toEqual(["mbappe", "pedri", "saka"]);
    expect([...assignments].sort(byPlayer)).toEqual([
      { membershipId: "alice", playerId: "bellingham" },
      { membershipId: "bob", playerId: "dias" },
      { membershipId: "cara", playerId: "haaland" },
    ]);
  });

  it("assigns everyone when nothing collides", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1"] },
      { membershipId: "b", playerIds: ["p2"] },
    ]);
    expect(wiped).toEqual([]);
    expect([...assignments].sort(byPlayer)).toEqual([
      { membershipId: "a", playerId: "p1" },
      { membershipId: "b", playerId: "p2" },
    ]);
  });

  it("wipes everyone when all collide on the same players", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1", "p2"] },
      { membershipId: "b", playerIds: ["p1", "p2"] },
    ]);
    expect(assignments).toEqual([]);
    expect([...wiped].sort()).toEqual(["p1", "p2"]);
  });

  it("ignores empty selections and keeps partial picks", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: [] },
      { membershipId: "b", playerIds: ["p1"] },
    ]);
    expect(wiped).toEqual([]);
    expect(assignments).toEqual([{ membershipId: "b", playerId: "p1" }]);
  });

  it("does not self-collide on a manager's duplicate (defensive dedupe)", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1", "p1"] },
    ]);
    expect(wiped).toEqual([]);
    expect(assignments).toEqual([{ membershipId: "a", playerId: "p1" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test convex/tests/blindResolve.test.ts`
Expected: FAIL — "Failed to resolve import" / `resolveRound is not a function`.

- [ ] **Step 3: Implement the resolver**

Create `convex/lib/blindResolve.ts`:
```ts
export interface BlindSelection {
  membershipId: string;
  playerIds: string[];
}

export interface ResolveResult {
  assignments: { membershipId: string; playerId: string }[];
  wiped: string[];
}

/**
 * Pure round resolution. Counts each player across managers (deduped within a
 * single manager). count === 1 → assigned to that manager; count >= 2 → wiped.
 */
export function resolveRound(selections: BlindSelection[]): ResolveResult {
  const count = new Map<string, number>();
  const owner = new Map<string, string>();
  for (const sel of selections) {
    for (const playerId of new Set(sel.playerIds)) {
      count.set(playerId, (count.get(playerId) ?? 0) + 1);
      owner.set(playerId, sel.membershipId);
    }
  }
  const assignments: { membershipId: string; playerId: string }[] = [];
  const wiped: string[] = [];
  for (const [playerId, c] of count) {
    if (c === 1) assignments.push({ membershipId: owner.get(playerId)!, playerId });
    else wiped.push(playerId);
  }
  return { assignments, wiped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test convex/tests/blindResolve.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/blindResolve.ts convex/tests/blindResolve.test.ts
git commit -m "feat: pure blind-collision round resolver (TDD)"
```

---

## Task 2: Schema — blind fields + new tables

Add the `mode` discriminator and blind round-state fields to `drafts` (all optional; snake rows leave them null, absent `mode` ⇒ snake), plus the `blindSelections` and `draftWipes` tables.

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add blind fields to the `drafts` table**

In `convex/schema.ts`, replace the `drafts` table definition (currently lines ~72-82) with:
```ts
  drafts: defineTable({
    leagueId: v.id("leagues"),
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("complete")),
    round: v.number(),
    pickIndex: v.number(),
    order: v.array(v.id("memberships")),
    currentMembershipId: v.optional(v.id("memberships")),
    pickClockSeconds: v.optional(v.number()),
    pickStartedAt: v.optional(v.number()),
    autopickJobId: v.optional(v.id("_scheduled_functions")),
    // Blind-collision mode (absent ⇒ snake).
    mode: v.optional(v.union(v.literal("snake"), v.literal("blind"))),
    picksPerRound: v.optional(v.number()),
    rounds: v.optional(v.number()),
    currentRound: v.optional(v.number()),
    roundState: v.optional(
      v.union(
        v.literal("selecting"),
        v.literal("revealing"),
        v.literal("complete"),
      ),
    ),
  }).index("by_league", ["leagueId"]),
```

- [ ] **Step 2: Add the two new tables**

In `convex/schema.ts`, immediately after the `draftQueues` table (the last table, before the closing `});`), add:
```ts
  blindSelections: defineTable({
    leagueId: v.id("leagues"),
    draftId: v.id("drafts"),
    round: v.number(),
    membershipId: v.id("memberships"),
    playerIds: v.array(v.id("players")),
    lockedIn: v.boolean(),
  })
    .index("by_draft_round", ["draftId", "round"])
    .index("by_draft_round_membership", ["draftId", "round", "membershipId"]),

  draftWipes: defineTable({
    leagueId: v.id("leagues"),
    draftId: v.id("drafts"),
    round: v.number(),
    playerId: v.id("players"),
  })
    .index("by_league", ["leagueId"])
    .index("by_draft", ["draftId"]),
```

- [ ] **Step 3: Push the schema**

Run: `yarn convex dev --once`
Expected: "Convex functions ready", new tables created, no schema errors. (Existing snake drafts validate because every new `drafts` field is optional.)

- [ ] **Step 4: Confirm the suite still compiles/passes**

Run: `yarn test`
Expected: PASS — all existing suites green (the new optional fields/tables don't change existing behaviour).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: schema for blind draft (drafts.mode + blindSelections, draftWipes)"
```

---

## Task 3: `startBlindDraft` + `availablePlayers`

Create `convex/blindDraft.ts` with the file's shared helpers, the start mutation, and the availability query (pool − this league's picks − this league's wipes).

**Files:**
- Create: `convex/blindDraft.ts`
- Test: `convex/tests/blindDraft.test.ts`

- [ ] **Step 1: Write the failing test (creates the test file + shared seed)**

Create `convex/tests/blindDraft.test.ts`:
```ts
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

// Seeds a league with `names` members (index 0 = commissioner) and `playerCount`
// FWD players (espnPlayerId 100+i so they can score). Returns ids for tests.
async function seed(
  t: ReturnType<typeof convexTest>,
  names: string[],
  playerCount: number,
) {
  const userIds = await Promise.all(
    names.map((n) => t.run((ctx) => ctx.db.insert("users", { name: n }))),
  );
  const leagueId = await t.run((ctx) =>
    ctx.db.insert("leagues", {
      name: "L",
      commissionerUserId: userIds[0],
      inviteToken: "tk",
      rosterSize: 15,
      scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
    }),
  );
  const memberIds = await Promise.all(
    names.map((n, i) =>
      t.run((ctx) =>
        ctx.db.insert("memberships", {
          leagueId,
          userId: userIds[i],
          displayName: n,
          draftOrder: i,
          role: i === 0 ? "commissioner" : "member",
        }),
      ),
    ),
  );
  const espnIds: number[] = [];
  const players = await Promise.all(
    Array.from({ length: playerCount }, (_, i) => {
      const espnPlayerId = 100 + i;
      espnIds.push(espnPlayerId);
      return t.run((ctx) =>
        ctx.db.insert("players", {
          name: `P${i}`,
          normalizedName: `p${i}`,
          position: "FWD",
          club: "C",
          country: "X",
          group: "A",
          espnTeamId: 1,
          espnPlayerId,
        }),
      );
    }),
  );
  return { userIds, leagueId, memberIds, players, espnIds };
}

describe("blind draft — start & availability", () => {
  it("commissioner starts a blind draft with X/R and lists available players", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A", "B"], 3);
    const asA = t.withIdentity({ subject: userIds[0] });

    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId,
      order: memberIds,
      picksPerRound: 2,
      rounds: 4,
    });

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.mode).toBe("blind");
    expect(draft!.picksPerRound).toBe(2);
    expect(draft!.rounds).toBe(4);
    expect(draft!.currentRound).toBe(0);
    expect(draft!.roundState).toBe("selecting");

    const avail = await asA.query(api.blindDraft.availablePlayers, { leagueId });
    expect(avail).toHaveLength(3);
  });

  it("non-commissioner cannot start a blind draft", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A", "B"], 2);
    const asB = t.withIdentity({ subject: userIds[1] });
    await expect(
      asB.mutation(api.blindDraft.startBlindDraft, { leagueId, order: memberIds }),
    ).rejects.toThrow(/commissioner/i);
  });

  it("defaults X=3 and R=5 when not supplied", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A"], 1);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, { leagueId, order: memberIds });
    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.picksPerRound).toBe(3);
    expect(draft!.rounds).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: FAIL — `api.blindDraft` is undefined / module not found.

- [ ] **Step 3: Create `convex/blindDraft.ts` with helpers + start + availability**

Create `convex/blindDraft.ts`:
```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { resolveRound } from "./lib/blindResolve";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Loads the league's draft and asserts it is a blind draft. */
async function getBlindDraft(ctx: QueryCtx, leagueId: Id<"leagues">) {
  const draft = await ctx.db
    .query("drafts")
    .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
    .unique();
  if (!draft || draft.mode !== "blind") {
    throw new Error("No blind draft for this league");
  }
  return draft;
}

/** Player ids already drafted (picks) or wiped (draftWipes) in this league. */
async function takenAndWiped(ctx: QueryCtx, leagueId: Id<"leagues">) {
  const picks = await ctx.db
    .query("picks")
    .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
    .collect();
  const wipes = await ctx.db
    .query("draftWipes")
    .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
    .collect();
  return {
    taken: new Set<string>(picks.map((p) => p.playerId)),
    wiped: new Set<string>(wipes.map((w) => w.playerId)),
  };
}

// ---------------------------------------------------------------------------
// Public mutations / queries
// ---------------------------------------------------------------------------

export const startBlindDraft = mutation({
  args: {
    leagueId: v.id("leagues"),
    order: v.array(v.id("memberships")),
    picksPerRound: v.optional(v.number()),
    rounds: v.optional(v.number()),
  },
  handler: async (ctx, { leagueId, order, picksPerRound, rounds }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") {
      throw new Error("Only the commissioner can start the draft");
    }
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
    if (existing) throw new Error("Draft already exists");

    await ctx.db.insert("drafts", {
      leagueId,
      status: "active",
      round: 0,
      pickIndex: 0,
      order,
      mode: "blind",
      picksPerRound: picksPerRound ?? 3,
      rounds: rounds ?? 5,
      currentRound: 0,
      roundState: "selecting",
    });
  },
});

export const availablePlayers = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    const { taken, wiped } = await takenAndWiped(ctx, leagueId);
    const players = await ctx.db.query("players").collect();
    return players.filter(
      (p) => !taken.has(p._id) && !wiped.has(p._id),
    );
  },
});
```

> `MutationCtx`, `resolveRound`, and `Id` are imported now because Tasks 4 and 5 add functions to this same file that use them; importing here keeps the file's import block stable across tasks.

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/blindDraft.ts convex/tests/blindDraft.test.ts
git commit -m "feat: startBlindDraft + availablePlayers (TDD)"
```

---

## Task 4: `setSelection` (autosave + validation) and `blindRoundState` (server-enforced blindness)

`setSelection` autosaves a manager's picks, rejecting dupes / over-limit / unavailable / post-lock. `blindRoundState` returns round info, who is locked (not what), and the caller's **own** selection — never opponents' picks while `selecting`.

**Files:**
- Modify: `convex/blindDraft.ts`
- Test: `convex/tests/blindDraft.test.ts`

- [ ] **Step 1: Write the failing test (append a new describe block)**

Append to `convex/tests/blindDraft.test.ts`:
```ts
describe("blind draft — selection & blindness", () => {
  it("autosaves, enforces limit/distinct/availability, and hides opponents' picks", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    const asB = t.withIdentity({ subject: userIds[1] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 2, rounds: 3,
    });

    // Over the limit.
    await expect(
      asA.mutation(api.blindDraft.setSelection, {
        leagueId, playerIds: [players[0], players[1], players[2]],
      }),
    ).rejects.toThrow(/at most 2/i);

    // Duplicate within own list.
    await expect(
      asA.mutation(api.blindDraft.setSelection, {
        leagueId, playerIds: [players[0], players[0]],
      }),
    ).rejects.toThrow(/duplicate/i);

    // Valid selections (autosave).
    await asA.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[1]],
    });
    await asB.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[2]],
    });

    // A sees own picks, B shown only as not-locked, and B's playerIds never leak.
    const stateForA = await asA.query(api.blindDraft.blindRoundState, { leagueId });
    expect(stateForA!.mySelection).toEqual([players[0], players[1]]);
    expect(stateForA!.reveal).toBeNull();
    const bRow = stateForA!.participants.find((p) => p.membershipId === memberIds[1]);
    expect(bRow!.lockedIn).toBe(false);
    expect(JSON.stringify(stateForA)).not.toContain(players[2]);
  });

  it("rejects selecting a player that is not in this blind draft / wrong mode", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A"], 1);
    const asA = t.withIdentity({ subject: userIds[0] });
    // No draft yet → not a blind draft.
    await expect(
      asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [] }),
    ).rejects.toThrow(/no blind draft/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: FAIL — `api.blindDraft.setSelection` / `blindRoundState` undefined.

- [ ] **Step 3: Add `setSelection` and `blindRoundState` to `convex/blindDraft.ts`**

Append to `convex/blindDraft.ts` (after `availablePlayers`):
```ts
export const setSelection = mutation({
  args: { leagueId: v.id("leagues"), playerIds: v.array(v.id("players")) },
  handler: async (ctx, { leagueId, playerIds }) => {
    const me = await requireMembership(ctx, leagueId);
    const draft = await getBlindDraft(ctx, leagueId);
    if (draft.roundState !== "selecting") throw new Error("Selections are closed");

    const limit = draft.picksPerRound ?? 0;
    if (playerIds.length > limit) {
      throw new Error(`You may pick at most ${limit} players`);
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error("Duplicate players in selection");
    }

    const { taken, wiped } = await takenAndWiped(ctx, leagueId);
    for (const pid of playerIds) {
      const player = await ctx.db.get(pid);
      if (!player) throw new Error("Unknown player");
      if (taken.has(pid)) throw new Error("That player is already drafted");
      if (wiped.has(pid)) throw new Error("That player has been wiped out");
    }

    const round = draft.currentRound ?? 0;
    const doc = await ctx.db
      .query("blindSelections")
      .withIndex("by_draft_round_membership", (q) =>
        q.eq("draftId", draft._id).eq("round", round).eq("membershipId", me._id),
      )
      .unique();
    if (doc?.lockedIn) {
      throw new Error("You have locked in and cannot change your selection");
    }
    if (doc) {
      await ctx.db.patch(doc._id, { playerIds });
    } else {
      await ctx.db.insert("blindSelections", {
        leagueId, draftId: draft._id, round, membershipId: me._id, playerIds, lockedIn: false,
      });
    }
  },
});

export const blindRoundState = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
    if (!draft || draft.mode !== "blind") return null;

    const round = draft.currentRound ?? 0;
    const sels = await ctx.db
      .query("blindSelections")
      .withIndex("by_draft_round", (q) =>
        q.eq("draftId", draft._id).eq("round", round),
      )
      .collect();
    const byMember = new Map(sels.map((s) => [s.membershipId as string, s]));

    const participants = draft.order.map((mid) => ({
      membershipId: mid,
      lockedIn: byMember.get(mid as string)?.lockedIn ?? false,
    }));
    const mySelection =
      (byMember.get(me._id as string)?.playerIds ?? []) as Id<"players">[];

    // Opponents' selections are exposed ONLY once the round is revealing.
    let reveal: {
      selections: { membershipId: Id<"memberships">; playerIds: Id<"players">[] }[];
      assignments: { membershipId: string; playerId: string }[];
      wiped: string[];
    } | null = null;
    if (draft.roundState === "revealing") {
      const locked = sels.filter((s) => s.lockedIn);
      const { assignments, wiped } = resolveRound(
        locked.map((s) => ({
          membershipId: s.membershipId as string,
          playerIds: s.playerIds as string[],
        })),
      );
      reveal = {
        selections: locked.map((s) => ({
          membershipId: s.membershipId,
          playerIds: s.playerIds,
        })),
        assignments,
        wiped,
      };
    }

    return {
      mode: draft.mode,
      status: draft.status,
      currentRound: round,
      rounds: draft.rounds ?? 0,
      picksPerRound: draft.picksPerRound ?? 0,
      roundState: draft.roundState,
      participants,
      mySelection,
      reveal,
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: PASS (now 5 tests across both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add convex/blindDraft.ts convex/tests/blindDraft.test.ts
git commit -m "feat: blind setSelection + server-enforced blindRoundState (TDD)"
```

---

## Task 5: Reveal & resolve — `lockIn`, `forceReveal`, `nextRound`

Lock-in reveals automatically when all participants are locked; the commissioner can force-reveal partials or advance to the next round. Resolution writes survivors to the shared `picks` table and collisions to `draftWipes`, guarded by `roundState` for idempotency.

**Files:**
- Modify: `convex/blindDraft.ts`
- Test: `convex/tests/blindDraft.test.ts`

- [ ] **Step 1: Write the failing test (append a new describe block)**

Append to `convex/tests/blindDraft.test.ts`:
```ts
describe("blind draft — reveal, resolve & lifecycle", () => {
  it("auto-reveals when all lock in: unique picks become roster picks, collisions are wiped", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B", "C"], 6);
    const [asA, asB, asC] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 3, rounds: 2,
    });

    // Collisions on 0 (A,B), 3 (B,C), 2 (A,C); survivors 1→A, 4→B, 5→C.
    await asA.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[1], players[2]],
    });
    await asB.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[3], players[4]],
    });
    await asC.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[5], players[3], players[2]],
    });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asB.mutation(api.blindDraft.lockIn, { leagueId });
    await asC.mutation(api.blindDraft.lockIn, { leagueId }); // last lock → reveal

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("revealing");

    const picks = await asA.query(api.draft.listPicks, { leagueId });
    const rosterOf = (mid: string) =>
      picks.filter((p) => p.membershipId === mid).map((p) => p.playerId);
    expect(rosterOf(memberIds[0])).toEqual([players[1]]);
    expect(rosterOf(memberIds[1])).toEqual([players[4]]);
    expect(rosterOf(memberIds[2])).toEqual([players[5]]);

    // Wiped players gone from availability next.
    const availIds = (await asA.query(api.blindDraft.availablePlayers, { leagueId })).map((p) => p._id);
    expect(availIds).not.toContain(players[0]);
    expect(availIds).not.toContain(players[2]);
    expect(availIds).not.toContain(players[3]);

    // Reveal payload now exposes every locked selection + the wiped set.
    const state = await asB.query(api.blindDraft.blindRoundState, { leagueId });
    expect(state!.reveal).not.toBeNull();
    expect([...state!.reveal!.wiped].sort()).toEqual(
      [players[0], players[2], players[3]].sort(),
    );
  });

  it("force reveal locks partial/empty selections as-is and resolves", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B"], 4);
    const [asA] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 2, rounds: 2,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    // B never selects. Commissioner forces the reveal.
    await asA.mutation(api.blindDraft.forceReveal, { leagueId });

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("revealing");
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks.map((p) => p.playerId)).toEqual([players[0]]); // A got p0; B got nothing
  });

  it("nextRound advances rounds and completes after R", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 2,
    });

    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId }); // solo → reveal
    await asA.mutation(api.blindDraft.nextRound, { leagueId });
    let draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.currentRound).toBe(1);
    expect(draft!.roundState).toBe("selecting");

    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[1]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asA.mutation(api.blindDraft.nextRound, { leagueId });
    draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("complete");
    expect(draft!.status).toBe("complete");
  });

  it("is idempotent: locking in again after reveal is rejected and does not double-resolve", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 2,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await expect(asA.mutation(api.blindDraft.lockIn, { leagueId })).rejects.toThrow(/closed/i);
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks).toHaveLength(1);
  });

  it("a second league is isolated from a blind draft", async () => {
    const t = convexTest(schema, modules);
    const a = await seed(t, ["A"], 2);
    const b = await seed(t, ["Z"], 2);
    const asA = t.withIdentity({ subject: a.userIds[0] });
    const asZ = t.withIdentity({ subject: b.userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId: a.leagueId, order: a.memberIds, picksPerRound: 1, rounds: 1,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId: a.leagueId, playerIds: [a.players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId: a.leagueId });

    // League B untouched: no draft, full availability.
    expect(await asZ.query(api.draft.getDraft, { leagueId: b.leagueId })).toBeNull();
    const availB = await asZ.query(api.blindDraft.availablePlayers, { leagueId: b.leagueId });
    expect(availB).toHaveLength(2);
  });

  it("scores a blind-drafted roster through the shared leaderboard (mode-agnostic)", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players, espnIds } = await seed(t, ["A", "B"], 2);
    const [asA, asB] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 1,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asB.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[1]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asB.mutation(api.blindDraft.lockIn, { leagueId }); // no collision → both survive

    // A's player scores a goal (FWD: goal 5 + appearance 1 = 6).
    await t.run((ctx) =>
      ctx.db.insert("playerMatchStats", {
        espnPlayerId: espnIds[0], espnEventId: "e1",
        goals: 1, assists: 0, cleanSheet: false, minutes: 90, redCard: false,
      }),
    );
    const rows = await asA.query(api.standings.leagueStandings, { leagueId });
    const aRow = rows.find((r) => r.membershipId === memberIds[0]);
    expect(aRow!.points).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: FAIL — `api.blindDraft.lockIn` / `forceReveal` / `nextRound` undefined.

- [ ] **Step 3: Add the resolver + lifecycle mutations to `convex/blindDraft.ts`**

Append to `convex/blindDraft.ts` (after `blindRoundState`):
```ts
/**
 * Resolves the current round: assigns uniquely-picked players into the shared
 * `picks` table, records collisions in `draftWipes`, and flips the round to
 * "revealing". Guarded on roundState === "selecting" so concurrent last-lock-ins
 * (OCC-retried) cannot double-resolve.
 */
async function resolveCurrentRound(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
): Promise<void> {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.mode !== "blind" || draft.roundState !== "selecting") return;
  const round = draft.currentRound ?? 0;

  const sels = await ctx.db
    .query("blindSelections")
    .withIndex("by_draft_round", (q) =>
      q.eq("draftId", draftId).eq("round", round),
    )
    .collect();
  const locked = sels.filter((s) => s.lockedIn);
  const { assignments, wiped } = resolveRound(
    locked.map((s) => ({
      membershipId: s.membershipId as string,
      playerIds: s.playerIds as string[],
    })),
  );

  // Synthetic `overall` = running count of this league's picks at insert time.
  const existing = await ctx.db
    .query("picks")
    .withIndex("by_league", (q) => q.eq("leagueId", draft.leagueId))
    .collect();
  let overall = existing.length;
  for (const a of assignments) {
    await ctx.db.insert("picks", {
      leagueId: draft.leagueId,
      draftId,
      membershipId: a.membershipId as Id<"memberships">,
      playerId: a.playerId as Id<"players">,
      round,
      overall: overall++,
    });
  }
  for (const playerId of wiped) {
    await ctx.db.insert("draftWipes", {
      leagueId: draft.leagueId,
      draftId,
      round,
      playerId: playerId as Id<"players">,
    });
  }

  await ctx.db.patch(draftId, { roundState: "revealing" });
}

export const lockIn = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    const draft = await getBlindDraft(ctx, leagueId);
    if (draft.roundState !== "selecting") throw new Error("Selections are closed");

    const round = draft.currentRound ?? 0;
    const doc = await ctx.db
      .query("blindSelections")
      .withIndex("by_draft_round_membership", (q) =>
        q.eq("draftId", draft._id).eq("round", round).eq("membershipId", me._id),
      )
      .unique();
    if (!doc || doc.playerIds.length < 1) {
      throw new Error("Select at least one player before locking in");
    }
    if (doc.lockedIn) throw new Error("You have already locked in");
    await ctx.db.patch(doc._id, { lockedIn: true });

    // Auto-reveal once every participant is locked.
    const sels = await ctx.db
      .query("blindSelections")
      .withIndex("by_draft_round", (q) =>
        q.eq("draftId", draft._id).eq("round", round),
      )
      .collect();
    const lockedCount = sels.filter((s) => s.lockedIn).length;
    if (lockedCount === draft.order.length) {
      await resolveCurrentRound(ctx, draft._id);
    }
  },
});

export const forceReveal = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") {
      throw new Error("Only the commissioner can force a reveal");
    }
    const draft = await getBlindDraft(ctx, leagueId);
    if (draft.roundState !== "selecting") {
      throw new Error("Round is not in the selecting phase");
    }
    const round = draft.currentRound ?? 0;

    // Force-lock every participant's current selection as-is (incl. empty).
    for (const membershipId of draft.order) {
      const doc = await ctx.db
        .query("blindSelections")
        .withIndex("by_draft_round_membership", (q) =>
          q.eq("draftId", draft._id).eq("round", round).eq("membershipId", membershipId),
        )
        .unique();
      if (!doc) {
        await ctx.db.insert("blindSelections", {
          leagueId, draftId: draft._id, round, membershipId, playerIds: [], lockedIn: true,
        });
      } else if (!doc.lockedIn) {
        await ctx.db.patch(doc._id, { lockedIn: true });
      }
    }
    await resolveCurrentRound(ctx, draft._id);
  },
});

export const nextRound = mutation({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") {
      throw new Error("Only the commissioner can advance the round");
    }
    const draft = await getBlindDraft(ctx, leagueId);
    if (draft.roundState !== "revealing") {
      throw new Error("Round is not ready to advance");
    }
    const round = draft.currentRound ?? 0;
    const totalRounds = draft.rounds ?? 0;
    if (round + 1 >= totalRounds) {
      await ctx.db.patch(draft._id, { roundState: "complete", status: "complete" });
    } else {
      await ctx.db.patch(draft._id, { currentRound: round + 1, roundState: "selecting" });
    }
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test convex/tests/blindDraft.test.ts`
Expected: PASS (all 11 tests across the three describe blocks).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `yarn test`
Expected: PASS — snake (draft, snake, autopick, clock, queue, draftBoard, draftView), scoring, standings, leagues, membership, live, matchday, playerFilter, and the new blind suites all green.

- [ ] **Step 6: Commit**

```bash
git add convex/blindDraft.ts convex/tests/blindDraft.test.ts
git commit -m "feat: blind lockIn/forceReveal/nextRound + idempotent resolve (TDD)"
```

---

## Task 6: Blind draft room UI + mode branch

A client component for the three phases, mounted from the draft page when `draft.mode === "blind"`. Snake rendering is unchanged.

**Files:**
- Create: `components/BlindDraftRoom.tsx`
- Modify: `app/league/[id]/draft/page.tsx`

- [ ] **Step 1: Build the BlindDraftRoom component**

Create `components/BlindDraftRoom.tsx`:
```tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { distinct, filterPlayers } from "@/convex/lib/playerFilter";

export function BlindDraftRoom({ leagueId }: { leagueId: Id<"leagues"> }) {
  const state = useQuery(api.blindDraft.blindRoundState, { leagueId });
  const available = useQuery(api.blindDraft.availablePlayers, { leagueId }) ?? [];
  const allPlayers = useQuery(api.players.listPlayers) ?? [];
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const myLeagues = useQuery(api.leagues.listMyLeagues);

  const setSelection = useMutation(api.blindDraft.setSelection);
  const lockIn = useMutation(api.blindDraft.lockIn);
  const forceReveal = useMutation(api.blindDraft.forceReveal);
  const nextRound = useMutation(api.blindDraft.nextRound);

  const [q, setQ] = useState("");
  const [position, setPosition] = useState("ALL");
  const [country, setCountry] = useState("ALL");
  const [club, setClub] = useState("ALL");

  const myMembership = myLeagues?.find((l) => l.league?._id === leagueId)?.membership;
  const isCommissioner = myMembership?.role === "commissioner";
  const memberName = (id: string) => members.find((m) => m._id === id)?.displayName ?? "?";
  const playerName = (id: string) => allPlayers.find((p) => p._id === id)?.name ?? id;

  const countries = useMemo(() => distinct(available, "country"), [available]);
  const clubs = useMemo(() => distinct(available, "club"), [available]);
  const filtered = useMemo(
    () => filterPlayers(available, { query: q, position, country, club }).slice(0, 200),
    [available, q, position, country, club],
  );

  if (state === undefined) return <p className="text-muted-foreground">Loading…</p>;
  if (state === null) return <p>This league is not running a blind draft.</p>;

  const selected = state.mySelection as string[];
  const X = state.picksPerRound;
  const iAmLocked =
    state.participants.find((p) => p.membershipId === myMembership?._id)?.lockedIn ?? false;
  const wiped = new Set(state.reveal?.wiped ?? []);

  async function toggle(playerId: string) {
    const next = selected.includes(playerId)
      ? selected.filter((id) => id !== playerId)
      : [...selected, playerId];
    if (next.length > X) {
      toast.error(`You may pick at most ${X} players`);
      return;
    }
    try {
      await setSelection({ leagueId, playerIds: next as Id<"players">[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save selection");
    }
  }

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallback);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          Round {state.currentRound + 1} of {state.rounds} —{" "}
          <span className="capitalize">{state.roundState}</span>
        </p>
        {isCommissioner && state.roundState === "selecting" && (
          <Button variant="outline" size="sm"
            onClick={() => run(() => forceReveal({ leagueId }), "Could not force reveal")}>
            Force reveal
          </Button>
        )}
        {isCommissioner && state.roundState === "revealing" && (
          <Button size="sm"
            onClick={() => run(() => nextRound({ leagueId }), "Could not advance")}>
            Next round
          </Button>
        )}
      </div>

      {/* Status bar: who is locked. */}
      <ul className="flex flex-wrap gap-3 text-sm">
        {state.participants.map((p) => (
          <li key={p.membershipId}>
            {p.lockedIn ? "✓" : "…"} {memberName(p.membershipId)}
          </li>
        ))}
      </ul>

      {state.roundState === "selecting" && (
        <>
          <p className="text-sm">
            Selected <b>{selected.length}</b>/{X}
            {iAmLocked && " — locked in"}
          </p>
          <div className="flex flex-wrap gap-2">
            <input className="flex-1 min-w-[10rem] rounded border px-2 py-1"
              placeholder="Search name / country / club"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded border px-2 py-1" value={position}
              onChange={(e) => setPosition(e.target.value)}>
              {["ALL", "GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}
            </select>
            <select className="rounded border px-2 py-1" value={country}
              onChange={(e) => setCountry(e.target.value)}>
              {["ALL", ...countries].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="rounded border px-2 py-1" value={club}
              onChange={(e) => setClub(e.target.value)}>
              {["ALL", ...clubs].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <ul className="max-h-[55vh] divide-y overflow-auto rounded border">
            {filtered.map((p) => {
              const isSel = selected.includes(p._id);
              return (
                <li key={p._id} className="flex items-center justify-between px-3 py-1">
                  <span>
                    {p.name}{" "}
                    <span className="text-muted-foreground text-sm">
                      {p.position} · {p.country} · {p.club}
                    </span>
                  </span>
                  <Button size="sm" variant={isSel ? "default" : "outline"}
                    disabled={iAmLocked}
                    onClick={() => toggle(p._id)}>
                    {isSel ? "Selected" : "Pick"}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button disabled={iAmLocked || selected.length < 1}
            onClick={() => run(() => lockIn({ leagueId }), "Could not lock in")}>
            Lock in
          </Button>
        </>
      )}

      {state.roundState === "revealing" && state.reveal && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Reveal</h3>
          {state.reveal.selections.map((s) => (
            <div key={s.membershipId}>
              <p className="text-sm font-medium">{memberName(s.membershipId)}</p>
              <ul className="flex flex-wrap gap-x-3 text-sm">
                {s.playerIds.map((pid) => (
                  <li key={pid}
                    className={wiped.has(pid) ? "text-red-600 line-through" : "text-green-700"}>
                    {playerName(pid)}
                  </li>
                ))}
                {s.playerIds.length === 0 && <li className="text-muted-foreground">(no pick)</li>}
              </ul>
            </div>
          ))}
          {state.reveal.wiped.length > 0 && (
            <p className="text-sm text-red-600">
              ⚰ Graveyard: {state.reveal.wiped.map(playerName).join(", ")}
            </p>
          )}
        </div>
      )}

      {state.roundState === "complete" && (
        <p className="font-semibold">Blind draft complete.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Branch the draft page on mode**

In `app/league/[id]/draft/page.tsx`, add the import after the existing component imports (e.g. after the `PlayerPool` import):
```tsx
import { BlindDraftRoom } from "@/components/BlindDraftRoom";
```
Then, immediately **before** the existing `return (` of `DraftRoom` (after the `const myTurn = isMyTurn({ … });` line — all hooks above run unconditionally, so this early return is safe), insert:
```tsx
  if (draft?.mode === "blind") {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <h1 className="mb-2 text-xl font-bold">Blind draft</h1>
        <BlindDraftRoom leagueId={leagueId} />
      </main>
    );
  }
```

- [ ] **Step 3: Type-check / build**

Run: `yarn build`
Expected: build succeeds, no type errors. (The snake path is unchanged; the blind branch type-checks against the new queries.)

- [ ] **Step 4: Verify manually**

Run: `yarn convex dev --once` (ensure functions deployed), then `yarn dev -p 3001`. Create a league, then in the next task you'll wire the start toggle; for now confirm `yarn build` passes and the snake draft room still renders for a snake draft. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add components/BlindDraftRoom.tsx "app/league/[id]/draft/page.tsx"
git commit -m "feat: blind draft room UI + mode branch in draft page"
```

---

## Task 7: Start-draft mode toggle (league home)

Let the commissioner choose Snake or Blind (with X/R inputs) when starting the draft. Snake remains the default and calls the existing `startDraft` unchanged.

**Files:**
- Modify: `app/league/[id]/page.tsx`

- [ ] **Step 1: Wire the blind mutation + form state**

In `app/league/[id]/page.tsx`, after the existing `const startDraft = useMutation(api.draft.startDraft);` line, add:
```tsx
  const startBlindDraft = useMutation(api.blindDraft.startBlindDraft);
  const [mode, setMode] = useState<"snake" | "blind">("snake");
  const [picksPerRound, setPicksPerRound] = useState(3);
  const [rounds, setRounds] = useState(5);
```
(`useState` is already imported in this file.)

- [ ] **Step 2: Branch `onStart` on the chosen mode**

Replace the existing `onStart` function with:
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

- [ ] **Step 3: Render the mode controls**

In the same file, replace the existing start-draft block:
```tsx
        {!draft && (
          <Button onClick={onStart} disabled={members.length === 0}>
            Start draft
          </Button>
        )}
```
with:
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

- [ ] **Step 4: Build**

Run: `yarn build`
Expected: build succeeds, no type errors.

- [ ] **Step 5: Verify end-to-end**

Run: `yarn convex dev --once`, then `yarn dev -p 3001`. Create a league, invite a second browser/member, choose **Blind-collision draft** (X=2, R=2), Start. In two browsers: each selects players (confirm you cannot see the other's picks during selecting), both Lock in → the reveal shows survivors and a struck-through graveyard for collisions; commissioner clicks **Next round**; after the last round it shows "complete". Open the leaderboard and confirm surviving picks score. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add "app/league/[id]/page.tsx"
git commit -m "feat: snake/blind mode toggle on start-draft"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `yarn test`
Expected: all suites pass — existing (parser, snake, draft, autopick, clock, queue, draftBoard, draftView, scoring, standings, leagues, membership, live, matchday, playerFilter) plus new (blindResolve, blindDraft).

- [ ] **Production build**

Run: `yarn build`
Expected: build succeeds, no type errors.

- [ ] **Merge the worktree branch** (per `superpowers:finishing-a-development-branch`)

Confirm `git status` is clean and all tasks committed, then integrate `blind-draft` back into `main`.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — pure `resolveRound` (T1); schema `mode`+`blindSelections`+`draftWipes` (T2); `startBlindDraft`/`availablePlayers` (T3); `setSelection`/`blindRoundState` server-enforced blindness (T4); `lockIn`/`forceReveal`/`nextRound`/idempotent resolve, survivors→`picks`, wiped→`draftWipes`, mode-agnostic scoring, isolation (T5); UI + mode branch (T6); start toggle (T7). The deferred auto-deadline timer is intentionally absent (YAGNI per spec).
- **No placeholders:** every code step shows complete code; every run step gives the exact command + expected result.
- **Type consistency:** `resolveRound(BlindSelection[]) → {assignments:{membershipId,playerId}[], wiped:string[]}` is defined in T1 and consumed identically in `resolveCurrentRound` and `blindRoundState` (T4/T5). Helpers `getBlindDraft`/`takenAndWiped` (T3) are reused by T4/T5. `blindRoundState` shape (`participants`, `mySelection`, `reveal`, `picksPerRound`, `roundState`) matches the component's reads in T6. `startBlindDraft` args match the T7 caller.
- **Decision flagged:** synthetic `picks.overall = existing-picks count` keeps blind survivors in the shared scoring table with no `picks` schema change; it is monotonic per league but not globally meaningful for blind (acceptable — `overall` only orders the pick feed, which blind doesn't use).
- **Idempotency:** with the timer removed, the sole guard is `resolveCurrentRound` early-returning unless `roundState === "selecting"`; `lockIn`/`forceReveal` also reject outside `selecting`. Convex OCC retries make this sufficient.
