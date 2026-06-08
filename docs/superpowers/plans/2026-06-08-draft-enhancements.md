# Draft Experience Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six gameplay features on top of the core draft app — rich in-draft player filtering, a draft board, a pick clock with autopick, a pre-draft player queue, a "your players playing now" live ticker, and a per-matchday scoring breakdown.

**Architecture:** Each feature is built as a small pure helper (`convex/lib/*.ts`, unit-tested with Vitest) plus a thin Convex query/mutation and a React component that consumes Convex reactive queries. No new external dependencies. Where a feature needs server state, it adds a focused field/table to the existing schema rather than reshaping it.

**Tech Stack:** Same as core — Next.js 16 (App Router, TS), Convex (queries/mutations + `ctx.scheduler` for the autopick timer), Tailwind, Vitest + convex-test.

---

## Dependency on the core plan

This plan **extends** `docs/superpowers/plans/2026-06-08-worldcup-draft.md`. Every task here modifies a file that a core task creates. Execute the core plan first (Tasks 1–16), or at minimum the listed prerequisite task before each enhancement:

| Enh. task | Feature | Builds on core task(s) |
|---|---|---|
| 17 | Player filter (position/country/club/availability) | T14 (`components/PlayerPool.tsx`, `convex/players.ts`) |
| 18 | Draft board grid view | T10 (`convex/draft.ts`), T14 (draft room page) |
| 19 | Pre-draft player queue | T3 (schema), T8 (`requireMembership`), T14 (draft room) |
| 20 | Pick clock + autopick on timeout | T3 (schema), T10 (`convex/draft.ts`), T19 (queue), T14 |
| 21 | "Your players playing now" live ticker | T3 (schema), T12 (`convex/espn.ts` poller) |
| 22 | Per-matchday scoring breakdown | T5 (`convex/lib/scoring.ts`), T12 (poller/matches), T15 (leaderboard) |

**Recommended order:** 17 → 18 → 19 → 20 → 21 → 22. Task 19 (queue) must land before Task 20 (autopick reads the queue).

---

## File structure (new + modified)

```
convex/
  lib/
    playerFilter.ts   # NEW — pure filter + distinct (Task 17)
    draftBoard.ts     # NEW — pure board-grid builder (Task 18)
    queue.ts          # NEW — pure queue selection helpers (Tasks 19, 20)
    clock.ts          # NEW — pure pick-clock math (Task 20)
    live.ts           # NEW — pure live-match helpers (Task 21)
    matchday.ts       # NEW — pure per-date grouping (Task 22)
  schema.ts           # MODIFY — drafts fields + draftQueues table (Tasks 19, 20)
  draft.ts            # MODIFY — clock fields, autopick, shared applyPick (Task 20)
  queue.ts            # NEW — queue query + mutations (Task 19)
  espn.ts             # MODIFY — upsert matches rows during poll (Task 21)
  live.ts             # NEW — myLivePlayers query (Task 21)
  standings.ts        # MODIFY — matchdayBreakdown query (Task 22)
components/
  PlayerPool.tsx      # MODIFY — use filterPlayers + club/country selects + queue button (Tasks 17, 19)
  DraftBoard.tsx      # NEW — grid (Task 18)
  QueuePanel.tsx      # NEW — my queue (Task 19)
  PickClock.tsx       # NEW — countdown (Task 20)
  LiveTicker.tsx      # NEW — live players (Task 21)
  MatchdayBreakdown.tsx # NEW — per-matchday table (Task 22)
app/league/[id]/draft/page.tsx      # MODIFY — mount board, queue, clock (Tasks 18, 19, 20)
app/league/[id]/leaderboard/page.tsx# MODIFY — mount matchday breakdown (Task 22)
convex/tests/
  playerFilter.test.ts draftBoard.test.ts queue.test.ts clock.test.ts
  live.test.ts matchday.test.ts autopick.test.ts
```

---

## Task 17: Rich player filter (position / country / club / availability)

The core draft room (T14) filters by name/country and a position dropdown. This extracts a tested pure filter and adds **club** and **country** selects plus availability handling.

**Files:**
- Create: `convex/lib/playerFilter.ts`
- Test: `convex/tests/playerFilter.test.ts`
- Modify: `components/PlayerPool.tsx`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/playerFilter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { filterPlayers, distinct, type FilterablePlayer } from "../lib/playerFilter";

const players: FilterablePlayer[] = [
  { _id: "1", name: "Lionel Messi", position: "FWD", country: "Argentina", club: "Inter Miami" },
  { _id: "2", name: "Emiliano Martinez", position: "GK", country: "Argentina", club: "Aston Villa" },
  { _id: "3", name: "Jude Bellingham", position: "MID", country: "England", club: "Real Madrid" },
];

describe("filterPlayers", () => {
  it("excludes taken players", () => {
    const out = filterPlayers(players, { takenIds: new Set(["1"]) });
    expect(out.map((p) => p._id)).toEqual(["2", "3"]);
  });
  it("filters by position", () => {
    expect(filterPlayers(players, { position: "GK" }).map((p) => p._id)).toEqual(["2"]);
  });
  it("filters by country and club", () => {
    expect(filterPlayers(players, { country: "Argentina" }).map((p) => p._id)).toEqual(["1", "2"]);
    expect(filterPlayers(players, { club: "Real Madrid" }).map((p) => p._id)).toEqual(["3"]);
  });
  it("treats ALL as no filter", () => {
    expect(filterPlayers(players, { position: "ALL", country: "ALL", club: "ALL" })).toHaveLength(3);
  });
  it("matches the text query across name, country, and club", () => {
    expect(filterPlayers(players, { query: "villa" }).map((p) => p._id)).toEqual(["2"]);
    expect(filterPlayers(players, { query: "messi" }).map((p) => p._id)).toEqual(["1"]);
  });
  it("distinct returns sorted unique values for a key", () => {
    expect(distinct(players, "country")).toEqual(["Argentina", "England"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- convex/tests/playerFilter.test.ts`
Expected: FAIL — "filterPlayers is not a function".

- [ ] **Step 3: Implement the helper**

Create `convex/lib/playerFilter.ts`:
```ts
export interface FilterablePlayer {
  _id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  country: string;
  club: string;
}

export interface PlayerFilter {
  query?: string;
  position?: string; // "ALL" or a position
  country?: string;  // "ALL" or a country
  club?: string;     // "ALL" or a club
  takenIds?: Set<string>;
}

export function filterPlayers<T extends FilterablePlayer>(players: T[], f: PlayerFilter): T[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return players.filter((p) => {
    if (f.takenIds?.has(p._id)) return false;
    if (f.position && f.position !== "ALL" && p.position !== f.position) return false;
    if (f.country && f.country !== "ALL" && p.country !== f.country) return false;
    if (f.club && f.club !== "ALL" && p.club !== f.club) return false;
    if (q && !`${p.name} ${p.country} ${p.club}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function distinct<T extends FilterablePlayer>(players: T[], key: "country" | "club"): string[] {
  return [...new Set(players.map((p) => p[key]))].sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- convex/tests/playerFilter.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Rewrite PlayerPool to use the helper + add club/country selects**

Replace `components/PlayerPool.tsx`:
```tsx
"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMemo, useState } from "react";
import { filterPlayers, distinct } from "@/convex/lib/playerFilter";

export function PlayerPool({ leagueId, myTurn }: { leagueId: Id<"leagues">; myTurn: boolean }) {
  const players = useQuery(api.players.listPlayers) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const makePick = useMutation(api.draft.makePick);
  const addToQueue = useMutation(api.queue.addToQueue);
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("ALL");
  const [country, setCountry] = useState("ALL");
  const [club, setClub] = useState("ALL");

  const takenIds = useMemo(() => new Set(picks.map((p) => p.playerId as string)), [picks]);
  const countries = useMemo(() => distinct(players, "country"), [players]);
  const clubs = useMemo(() => distinct(players, "club"), [players]);
  const filtered = useMemo(
    () => filterPlayers(players, { query: q, position, country, club, takenIds }).slice(0, 200),
    [players, q, position, country, club, takenIds],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input className="border rounded px-2 py-1 flex-1 min-w-[10rem]" placeholder="Search name / country / club"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="border rounded px-2 py-1" value={position} onChange={(e) => setPosition(e.target.value)}>
          {["ALL", "GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={country} onChange={(e) => setCountry(e.target.value)}>
          {["ALL", ...countries].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="border rounded px-2 py-1" value={club} onChange={(e) => setClub(e.target.value)}>
          {["ALL", ...clubs].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <ul className="divide-y max-h-[60vh] overflow-auto border rounded">
        {filtered.map((p) => (
          <li key={p._id} className="flex justify-between items-center px-3 py-1">
            <span>{p.name} <span className="text-gray-500 text-sm">{p.position} · {p.country} · {p.club}</span></span>
            <span className="flex gap-1">
              <button className="text-sm border rounded px-2 py-0.5"
                onClick={() => addToQueue({ leagueId, playerId: p._id as Id<"players"> }).catch((e) => alert(e.message))}>
                ＋ Queue
              </button>
              <button disabled={!myTurn}
                className="text-sm bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-30"
                onClick={() => makePick({ leagueId, playerId: p._id as Id<"players"> }).catch((e) => alert(e.message))}>
                Draft
              </button>
            </span>
          </li>))}
      </ul>
    </div>
  );
}
```
> The `addToQueue` mutation is created in Task 19. If implementing Task 17 before Task 19, temporarily remove the "＋ Queue" button and re-add it in Task 19 Step 6.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/playerFilter.ts convex/tests/playerFilter.test.ts components/PlayerPool.tsx
git commit -m "feat: rich in-draft player filter (position/country/club/availability)"
```

---

## Task 18: Draft board grid view

A grid: columns = members in draft order, rows = rounds, each cell = the player that member drafted that round.

**Files:**
- Create: `convex/lib/draftBoard.ts`
- Test: `convex/tests/draftBoard.test.ts`
- Create: `components/DraftBoard.tsx`
- Modify: `app/league/[id]/draft/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/draftBoard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildDraftBoard, type BoardPick } from "../lib/draftBoard";

describe("buildDraftBoard", () => {
  const order = ["A", "B", "C"]; // membershipIds in draft order
  const picks: BoardPick[] = [
    { membershipId: "A", playerId: "p1", round: 0, overall: 0 },
    { membershipId: "B", playerId: "p2", round: 0, overall: 1 },
    { membershipId: "C", playerId: "p3", round: 0, overall: 2 },
    { membershipId: "C", playerId: "p4", round: 1, overall: 3 }, // snake: C picks first in round 1
  ];

  it("places each pick in [round][seat] by the picker's seat in the order", () => {
    const grid = buildDraftBoard(order, 2, picks);
    expect(grid).toHaveLength(2);
    expect(grid[0].map((c) => c?.playerId ?? null)).toEqual(["p1", "p2", "p3"]);
    expect(grid[1].map((c) => c?.playerId ?? null)).toEqual([null, null, "p4"]);
  });

  it("ignores picks for unknown members or out-of-range rounds", () => {
    const grid = buildDraftBoard(order, 1, [
      { membershipId: "Z", playerId: "x", round: 0, overall: 0 },
      { membershipId: "A", playerId: "p1", round: 5, overall: 99 },
    ]);
    expect(grid[0].every((c) => c === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- convex/tests/draftBoard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `convex/lib/draftBoard.ts`:
```ts
export interface BoardPick {
  membershipId: string;
  playerId: string;
  round: number;
  overall: number;
}

// grid[round][seat] = the pick made by order[seat] in that round, or null.
export function buildDraftBoard(
  order: string[],
  rounds: number,
  picks: BoardPick[],
): (BoardPick | null)[][] {
  const grid: (BoardPick | null)[][] = Array.from({ length: rounds }, () =>
    Array.from({ length: order.length }, () => null as BoardPick | null));
  const seatOf = new Map(order.map((id, i) => [id, i]));
  for (const p of picks) {
    const seat = seatOf.get(p.membershipId);
    if (seat === undefined || p.round < 0 || p.round >= rounds) continue;
    grid[p.round][seat] = p;
  }
  return grid;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- convex/tests/draftBoard.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the DraftBoard component**

Create `components/DraftBoard.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMemo } from "react";
import { buildDraftBoard } from "@/convex/lib/draftBoard";

export function DraftBoard({ leagueId }: { leagueId: Id<"leagues"> }) {
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const league = useQuery(api.leagues.getLeague, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers) ?? [];

  const order = (draft?.order ?? []) as string[];
  const rounds = league?.rosterSize ?? 0;
  const nameOfMember = (id: string) => members.find((m) => m._id === id)?.displayName ?? "?";
  const nameOfPlayer = (id: string) => players.find((p) => p._id === id)?.name ?? "—";

  const grid = useMemo(
    () => buildDraftBoard(order, rounds, picks.map((p) => ({
      membershipId: p.membershipId as string, playerId: p.playerId as string,
      round: p.round, overall: p.overall,
    }))),
    [order, rounds, picks],
  );

  if (!draft || rounds === 0) return <p className="text-sm text-gray-500">No draft yet.</p>;
  return (
    <div className="overflow-auto">
      <table className="text-xs border">
        <thead><tr className="bg-gray-100">
          <th className="p-1 border">Rnd</th>
          {order.map((id) => <th key={id} className="p-1 border whitespace-nowrap">{nameOfMember(id)}</th>)}
        </tr></thead>
        <tbody>{grid.map((row, r) => (
          <tr key={r}>
            <td className="p-1 border text-center font-semibold">{r + 1}</td>
            {row.map((cell, seat) => (
              <td key={seat} className="p-1 border whitespace-nowrap">{cell ? nameOfPlayer(cell.playerId) : ""}</td>
            ))}
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Mount the board in the draft room**

In `app/league/[id]/draft/page.tsx`, add the import `import { DraftBoard } from "@/components/DraftBoard";` and render it below the existing grid, before `</main>`:
```tsx
      <section className="mt-6">
        <h2 className="font-semibold mb-1">Draft board</h2>
        <DraftBoard leagueId={leagueId} />
      </section>
```

- [ ] **Step 7: Verify**

Run: `npm run dev`, open a league mid-draft in two browsers, make a pick. Expected: the board shows the pick in the correct member column and round row in both windows without refresh. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add convex/lib/draftBoard.ts convex/tests/draftBoard.test.ts components/DraftBoard.tsx "app/league/[id]/draft/page.tsx"
git commit -m "feat: live draft board grid (member x round)"
```

---

## Task 19: Pre-draft player queue

Each member keeps an ordered list of player ids. The queue powers autopick (Task 20) and lets people pre-rank.

**Files:**
- Modify: `convex/schema.ts` (add `draftQueues` table)
- Create: `convex/lib/queue.ts`
- Test: `convex/tests/queue.test.ts`
- Create: `convex/queue.ts`
- Create: `components/QueuePanel.tsx`
- Modify: `app/league/[id]/draft/page.tsx`, `components/PlayerPool.tsx`

- [ ] **Step 1: Add the schema table**

In `convex/schema.ts`, add this table inside `defineSchema({ ... })` (after `picks`):
```ts
  draftQueues: defineTable({
    leagueId: v.id("leagues"),
    membershipId: v.id("memberships"),
    playerIds: v.array(v.id("players")),
  })
    .index("by_membership", ["membershipId"])
    .index("by_league_membership", ["leagueId", "membershipId"]),
```

- [ ] **Step 2: Push schema**

Run: `npx convex dev --once`
Expected: "Convex functions ready", table created, no errors.

- [ ] **Step 3: Write the failing test for the pure helpers**

Create `convex/tests/queue.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nextFromQueue, removeFromQueue, chooseAutoPick } from "../lib/queue";

describe("queue helpers", () => {
  it("nextFromQueue returns the first id that is not taken", () => {
    expect(nextFromQueue(["a", "b", "c"], new Set(["a"]))).toBe("b");
    expect(nextFromQueue(["a"], new Set(["a"]))).toBeNull();
    expect(nextFromQueue([], new Set())).toBeNull();
  });
  it("removeFromQueue drops the id, preserving order", () => {
    expect(removeFromQueue(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("chooseAutoPick prefers the queue, then falls back to first available", () => {
    expect(chooseAutoPick(["x", "y"], ["a", "x", "b"], new Set(["x"]))).toBe("y");
    expect(chooseAutoPick(["x"], ["a", "b"], new Set(["x"]))).toBe("a"); // queue empty/taken -> fallback
    expect(chooseAutoPick([], ["a", "b"], new Set(["a", "b"]))).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- convex/tests/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the pure helpers**

Create `convex/lib/queue.ts`:
```ts
export function nextFromQueue(queue: string[], takenIds: Set<string>): string | null {
  for (const id of queue) if (!takenIds.has(id)) return id;
  return null;
}

export function removeFromQueue(queue: string[], id: string): string[] {
  return queue.filter((q) => q !== id);
}

// Pick from the queue first; if nothing in the queue is available, take the first
// available player from the full ordered id list. Returns null if nothing is left.
export function chooseAutoPick(
  queue: string[],
  allPlayerIds: string[],
  takenIds: Set<string>,
): string | null {
  const fromQueue = nextFromQueue(queue, takenIds);
  if (fromQueue) return fromQueue;
  for (const id of allPlayerIds) if (!takenIds.has(id)) return id;
  return null;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- convex/tests/queue.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Implement the queue query + mutations**

Create `convex/queue.ts`:
```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { removeFromQueue } from "./lib/queue";
import { Id } from "./_generated/dataModel";

async function getQueueDoc(
  ctx: any,
  leagueId: Id<"leagues">,
  membershipId: Id<"memberships">,
) {
  return ctx.db
    .query("draftQueues")
    .withIndex("by_league_membership", (q: any) =>
      q.eq("leagueId", leagueId).eq("membershipId", membershipId))
    .unique();
}

export const getMyQueue = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    const doc = await getQueueDoc(ctx, leagueId, me._id);
    return doc?.playerIds ?? [];
  },
});

export const setQueue = mutation({
  args: { leagueId: v.id("leagues"), playerIds: v.array(v.id("players")) },
  handler: async (ctx, { leagueId, playerIds }) => {
    const me = await requireMembership(ctx, leagueId);
    const doc = await getQueueDoc(ctx, leagueId, me._id);
    if (doc) await ctx.db.patch(doc._id, { playerIds });
    else await ctx.db.insert("draftQueues", { leagueId, membershipId: me._id, playerIds });
  },
});

export const addToQueue = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const doc = await getQueueDoc(ctx, leagueId, me._id);
    const current = doc?.playerIds ?? [];
    if (current.includes(playerId)) return;
    const playerIds = [...current, playerId];
    if (doc) await ctx.db.patch(doc._id, { playerIds });
    else await ctx.db.insert("draftQueues", { leagueId, membershipId: me._id, playerIds });
  },
});

export const removeFromMyQueue = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const doc = await getQueueDoc(ctx, leagueId, me._id);
    if (!doc) return;
    await ctx.db.patch(doc._id, { playerIds: removeFromQueue(doc.playerIds, playerId) as Id<"players">[] });
  },
});
```

- [ ] **Step 8: Write the integration test for the queue round-trip**

Create `convex/tests/queueIntegration.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

describe("draft queue", () => {
  it("adds, reads, and removes players for the calling member only", async () => {
    const t = convexTest(schema);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "A" } as any));
    const leagueId = await t.run((ctx) => ctx.db.insert("leagues", {
      name: "L", commissionerUserId: userId, inviteToken: "tk", rosterSize: 2,
      scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
    }));
    await t.run((ctx) => ctx.db.insert("memberships", {
      leagueId, userId, displayName: "A", role: "commissioner",
    }));
    const p1 = await t.run((ctx) => ctx.db.insert("players", {
      name: "P1", normalizedName: "p1", position: "FWD", club: "C", country: "X", group: "A", espnTeamId: 1 }));
    const p2 = await t.run((ctx) => ctx.db.insert("players", {
      name: "P2", normalizedName: "p2", position: "MID", club: "C", country: "X", group: "A", espnTeamId: 1 }));

    const asA = t.withIdentity({ subject: userId });
    await asA.mutation(api.queue.addToQueue, { leagueId, playerId: p1 });
    await asA.mutation(api.queue.addToQueue, { leagueId, playerId: p2 });
    expect(await asA.query(api.queue.getMyQueue, { leagueId })).toEqual([p1, p2]);
    await asA.mutation(api.queue.removeFromMyQueue, { leagueId, playerId: p1 });
    expect(await asA.query(api.queue.getMyQueue, { leagueId })).toEqual([p2]);
  });
});
```

- [ ] **Step 9: Run to verify it passes**

Run: `npm test -- convex/tests/queueIntegration.test.ts`
Expected: PASS.

- [ ] **Step 10: Build the QueuePanel component**

Create `components/QueuePanel.tsx`:
```tsx
"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function QueuePanel({ leagueId }: { leagueId: Id<"leagues"> }) {
  const queue = useQuery(api.queue.getMyQueue, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const remove = useMutation(api.queue.removeFromMyQueue);
  const nameOf = (id: string) => players.find((p) => p._id === id)?.name ?? "?";
  const takenIds = new Set(picks.map((p) => p.playerId as string));

  if (queue.length === 0) return <p className="text-sm text-gray-500">Queue empty — use ＋ Queue on a player.</p>;
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {queue.map((id, i) => (
        <li key={id} className="flex justify-between items-center">
          <span className={takenIds.has(id) ? "line-through text-gray-400" : ""}>{i + 1}. {nameOf(id)}</span>
          <button className="text-xs underline text-red-600"
            onClick={() => remove({ leagueId, playerId: id as Id<"players"> })}>remove</button>
        </li>))}
    </ol>
  );
}
```

- [ ] **Step 11: Mount the queue in the draft room and confirm the ＋ Queue button**

In `app/league/[id]/draft/page.tsx`, import `import { QueuePanel } from "@/components/QueuePanel";` and add inside the right column (next to `PickFeed`):
```tsx
      <div><h2 className="font-semibold mb-1">My queue</h2><QueuePanel leagueId={leagueId} /></div>
```
Confirm the `addToQueue` button added to `components/PlayerPool.tsx` in Task 17 Step 5 is present (re-add it if it was removed while implementing 17 before 19).

- [ ] **Step 12: Verify**

Run: `npm run dev`, open the draft room, click ＋ Queue on a few players. Expected: they appear in "My queue" in order; "remove" drops them; a taken player shows struck through. Stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add convex/schema.ts convex/lib/queue.ts convex/queue.ts convex/tests/queue.test.ts convex/tests/queueIntegration.test.ts components/QueuePanel.tsx "app/league/[id]/draft/page.tsx" components/PlayerPool.tsx
git commit -m "feat: pre-draft player queue (table, mutations, panel)"
```

---

## Task 20: Pick clock + autopick on timeout

Add a per-pick timer. When the clock expires, the server auto-picks from the on-clock member's queue (falling back to first available). Implemented with `ctx.scheduler`: each time the clock is armed, a delayed `autopick` mutation is scheduled; making a pick before the deadline cancels and re-arms it.

**Files:**
- Modify: `convex/schema.ts` (drafts: `pickStartedAt`, `pickClockSeconds`, `autopickJobId`)
- Create: `convex/lib/clock.ts`
- Test: `convex/tests/clock.test.ts`, `convex/tests/autopick.test.ts`
- Modify: `convex/draft.ts`
- Create: `components/PickClock.tsx`
- Modify: `app/league/[id]/draft/page.tsx`

- [ ] **Step 1: Extend the drafts table**

In `convex/schema.ts`, the `drafts` table already has `pickClockSeconds: v.optional(v.number())`. Add two fields to it:
```ts
    pickStartedAt: v.optional(v.number()),
    autopickJobId: v.optional(v.id("_scheduled_functions")),
```
Run: `npx convex dev --once`
Expected: ready, no errors.

- [ ] **Step 2: Write the failing test for clock math**

Create `convex/tests/clock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deadlineMs, secondsRemaining, isExpired } from "../lib/clock";

describe("pick clock", () => {
  const started = 1_000_000;
  it("computes the deadline", () => {
    expect(deadlineMs(started, 60)).toBe(started + 60_000);
  });
  it("computes whole seconds remaining, never negative", () => {
    expect(secondsRemaining(started, 60, started)).toBe(60);
    expect(secondsRemaining(started, 60, started + 30_000)).toBe(30);
    expect(secondsRemaining(started, 60, started + 90_000)).toBe(0);
  });
  it("knows when the deadline has passed", () => {
    expect(isExpired(started, 60, started + 59_999)).toBe(false);
    expect(isExpired(started, 60, started + 60_000)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- convex/tests/clock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement clock math**

Create `convex/lib/clock.ts`:
```ts
export function deadlineMs(pickStartedAt: number, clockSeconds: number): number {
  return pickStartedAt + clockSeconds * 1000;
}

export function secondsRemaining(pickStartedAt: number, clockSeconds: number, now: number): number {
  return Math.max(0, Math.ceil((deadlineMs(pickStartedAt, clockSeconds) - now) / 1000));
}

export function isExpired(pickStartedAt: number, clockSeconds: number, now: number): boolean {
  return now >= deadlineMs(pickStartedAt, clockSeconds);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- convex/tests/clock.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Rewrite `convex/draft.ts` with a shared applyPick + clock arming + autopick**

Replace `convex/draft.ts` with the following. It keeps the core queries (`getDraft`, `listPicks`) and the public `startDraft`/`makePick` behaviour, refactors the pick-and-advance into `applyPick`, arms a scheduled `autopick` whenever a member goes on the clock, and cancels/re-arms it on each manual pick.

```ts
import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/membership";
import { membershipForPick, isDraftComplete } from "./lib/snake";
import { chooseAutoPick } from "./lib/queue";

const DEFAULT_CLOCK_SECONDS = 60;

export const getDraft = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db.query("drafts").withIndex("by_league", (q) => q.eq("leagueId", leagueId)).unique();
  },
});

export const listPicks = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db.query("picks").withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();
  },
});

// Cancels any pending autopick, then schedules a fresh one for the current pick.
async function armClock(ctx: MutationCtx, draftId: Id<"drafts">) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.status !== "active") return;
  if (draft.autopickJobId) await ctx.scheduler.cancel(draft.autopickJobId);
  const clock = draft.pickClockSeconds ?? DEFAULT_CLOCK_SECONDS;
  const jobId = await ctx.scheduler.runAfter(clock * 1000, internal.draft.autopick, { draftId });
  await ctx.db.patch(draftId, { pickStartedAt: Date.now(), autopickJobId: jobId });
}

// Records a pick for `membershipId`, advances snake state, and re-arms or stops the clock.
async function applyPick(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  membershipId: Id<"memberships">,
  playerId: Id<"players">,
) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.status !== "active") throw new Error("Draft is not active");
  const league = (await ctx.db.get(draft.leagueId))!;
  const overall = draft.pickIndex;
  const onClock = membershipForPick(draft.order, overall);
  if (onClock !== membershipId) throw new Error("It is not your turn");

  const taken = await ctx.db.query("picks")
    .withIndex("by_league_player", (q) => q.eq("leagueId", draft.leagueId).eq("playerId", playerId)).unique();
  if (taken) throw new Error("That player is already drafted");

  const round = Math.floor(overall / draft.order.length);
  await ctx.db.insert("picks", {
    leagueId: draft.leagueId, draftId, membershipId, playerId, round, overall,
  });

  const nextOverall = overall + 1;
  const complete = isDraftComplete(draft.order.length, league.rosterSize, nextOverall);
  if (draft.autopickJobId) await ctx.scheduler.cancel(draft.autopickJobId);
  await ctx.db.patch(draftId, {
    pickIndex: nextOverall,
    round: Math.floor(nextOverall / draft.order.length),
    status: complete ? "complete" : "active",
    currentMembershipId: complete ? undefined : membershipForPick(draft.order, nextOverall),
    autopickJobId: undefined,
  });
  if (!complete) await armClock(ctx, draftId);
}

export const startDraft = mutation({
  args: {
    leagueId: v.id("leagues"),
    order: v.array(v.id("memberships")),
    pickClockSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { leagueId, order, pickClockSeconds }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") throw new Error("Only the commissioner can start the draft");
    const existing = await ctx.db.query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).unique();
    if (existing) throw new Error("Draft already exists");
    const draftId = await ctx.db.insert("drafts", {
      leagueId, status: "active", round: 0, pickIndex: 0, order,
      currentMembershipId: membershipForPick(order, 0),
      pickClockSeconds: pickClockSeconds ?? DEFAULT_CLOCK_SECONDS,
    });
    await armClock(ctx, draftId);
  },
});

export const makePick = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const draft = await ctx.db.query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).unique();
    if (!draft) throw new Error("Draft is not active");
    await applyPick(ctx, draft._id, me._id, playerId);
  },
});

// Scheduled by armClock. Fires at the deadline; if the same pick is still on the
// clock, it auto-picks from that member's queue (or first available).
export const autopick = internalMutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft || draft.status !== "active") return;
    const onClock = draft.currentMembershipId;
    if (!onClock) return;

    const picks = await ctx.db.query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", draft.leagueId)).collect();
    const takenIds = new Set(picks.map((p) => p.playerId as string));

    const queueDoc = await ctx.db.query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", draft.leagueId).eq("membershipId", onClock)).unique();
    const queue = (queueDoc?.playerIds ?? []) as string[];

    const allPlayers = await ctx.db.query("players").collect();
    const allIds = allPlayers.map((p) => p._id as string);

    const chosen = chooseAutoPick(queue, allIds, takenIds);
    if (!chosen) return; // pool exhausted; leave the draft as-is
    await applyPick(ctx, draftId, onClock, chosen as Id<"players">);
  },
});
```

- [ ] **Step 7: Write the autopick integration test**

Create `convex/tests/autopick.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";

describe("autopick", () => {
  it("auto-picks the on-clock member's top queued player when the clock fires", async () => {
    const t = convexTest(schema);
    const users = await Promise.all(["A", "B"].map((n) =>
      t.run((ctx) => ctx.db.insert("users", { name: n } as any))));
    const leagueId = await t.run((ctx) => ctx.db.insert("leagues", {
      name: "L", commissionerUserId: users[0], inviteToken: "tk", rosterSize: 1,
      scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
    }));
    const members = await Promise.all(["A", "B"].map((n, i) =>
      t.run((ctx) => ctx.db.insert("memberships", {
        leagueId, userId: users[i], displayName: n, draftOrder: i,
        role: i === 0 ? "commissioner" : "member",
      }))));
    const p1 = await t.run((ctx) => ctx.db.insert("players", {
      name: "P1", normalizedName: "p1", position: "FWD", club: "C", country: "X", group: "A", espnTeamId: 1 }));
    const p2 = await t.run((ctx) => ctx.db.insert("players", {
      name: "P2", normalizedName: "p2", position: "MID", club: "C", country: "X", group: "A", espnTeamId: 1 }));

    const asA = t.withIdentity({ subject: users[0] });
    // A queues p2 as their top choice, then the draft starts (A on the clock).
    await asA.mutation(api.queue.setQueue, { leagueId, playerIds: [p2] });
    await asA.mutation(api.draft.startDraft, { leagueId, order: members, pickClockSeconds: 60 });

    // Fire the scheduled autopick directly (deterministic; no timers needed).
    const draft = await asA.query(api.draft.getDraft, { leagueId });
    await t.mutation(internal.draft.autopick, { draftId: draft!._id });

    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks).toHaveLength(1);
    expect(picks[0].playerId).toBe(p2);          // took the queued player, not p1
    expect(picks[0].membershipId).toBe(members[0]); // on behalf of A
  });
});
```

- [ ] **Step 8: Run to verify it passes**

Run: `npm test -- convex/tests/autopick.test.ts`
Expected: PASS (autopick records A's queued player p2 and advances).

- [ ] **Step 9: Run the full draft suite to confirm no regression**

Run: `npm test -- convex/tests/draft.test.ts convex/tests/autopick.test.ts`
Expected: PASS. (The core `draft.test.ts` from T10 still passes: `startDraft`/`makePick`/turn/dedupe behaviour is unchanged; the new optional `pickClockSeconds` arg defaults.)

- [ ] **Step 10: Build the PickClock component**

Create `components/PickClock.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { secondsRemaining } from "@/convex/lib/clock";

export function PickClock({ pickStartedAt, clockSeconds }: { pickStartedAt?: number; clockSeconds?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!pickStartedAt || !clockSeconds) return null;
  const left = secondsRemaining(pickStartedAt, clockSeconds, now);
  return (
    <span className={`font-mono ${left <= 10 ? "text-red-600 font-bold" : ""}`}>
      ⏱ {left}s
    </span>
  );
}
```

- [ ] **Step 11: Show the clock in the draft room**

In `app/league/[id]/draft/page.tsx`, import `import { PickClock } from "@/components/PickClock";` and render the clock next to the "On the clock" line:
```tsx
      {draft?.status === "active" && (
        <PickClock pickStartedAt={draft.pickStartedAt} clockSeconds={draft.pickClockSeconds} />
      )}
```

- [ ] **Step 12: Verify end-to-end**

Run: `npm run dev`. Start a draft with a short clock (call `startDraft` with `pickClockSeconds: 15` via the league home, or temporarily default lower). Queue a player as the on-clock member, then wait without picking. Expected: at 0s the server auto-picks the queued player (or first available if the queue is empty/taken), the board/pick feed update, and the clock re-arms for the next member. Stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add convex/schema.ts convex/lib/clock.ts convex/draft.ts convex/tests/clock.test.ts convex/tests/autopick.test.ts components/PickClock.tsx "app/league/[id]/draft/page.tsx"
git commit -m "feat: pick clock with scheduled autopick from queue"
```

---

## Task 21: "Your players playing now" live ticker

A panel showing which of my drafted players are in a currently-live match, with their live goals/assists. Requires the poller to record `matches` rows with state.

**Files:**
- Modify: `convex/espn.ts` (upsert `matches` during poll)
- Create: `convex/lib/live.ts`
- Test: `convex/tests/live.test.ts`
- Create: `convex/live.ts`
- Create: `components/LiveTicker.tsx`
- Modify: `app/league/[id]/leaderboard/page.tsx`

- [ ] **Step 1: Write the failing test for live helpers**

Create `convex/tests/live.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isLive, liveTeamIds, eventByTeam } from "../lib/live";

const matches = [
  { espnEventId: "e1", homeTeamId: 10, awayTeamId: 20, status: "in" },
  { espnEventId: "e2", homeTeamId: 30, awayTeamId: 40, status: "post" },
  { espnEventId: "e3", homeTeamId: 50, awayTeamId: 60, status: "pre" },
];

describe("live helpers", () => {
  it("isLive is true only for in-progress", () => {
    expect(isLive("in")).toBe(true);
    expect(isLive("post")).toBe(false);
    expect(isLive("pre")).toBe(false);
  });
  it("liveTeamIds collects both teams of in-progress matches only", () => {
    expect([...liveTeamIds(matches)].sort((a, b) => a - b)).toEqual([10, 20]);
  });
  it("eventByTeam maps each live team to its event id", () => {
    const map = eventByTeam(matches);
    expect(map.get(10)).toBe("e1");
    expect(map.get(20)).toBe("e1");
    expect(map.has(30)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- convex/tests/live.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement live helpers**

Create `convex/lib/live.ts`:
```ts
export interface LiveMatch {
  espnEventId: string;
  homeTeamId: number;
  awayTeamId: number;
  status: string;
}

export function isLive(status: string): boolean {
  return status === "in";
}

export function liveTeamIds(matches: LiveMatch[]): Set<number> {
  const ids = new Set<number>();
  for (const m of matches) {
    if (!isLive(m.status)) continue;
    ids.add(m.homeTeamId);
    ids.add(m.awayTeamId);
  }
  return ids;
}

export function eventByTeam(matches: LiveMatch[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const m of matches) {
    if (!isLive(m.status)) continue;
    map.set(m.homeTeamId, m.espnEventId);
    map.set(m.awayTeamId, m.espnEventId);
  }
  return map;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- convex/tests/live.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Make the poller upsert `matches` rows**

In `convex/espn.ts`, add an internal mutation and call it from `pollScores`. Add this mutation (alongside `upsertStat`):
```ts
export const upsertMatch = internalMutation({
  args: { match: v.object({
    espnEventId: v.string(), date: v.string(), homeTeamId: v.number(),
    awayTeamId: v.number(), status: v.string(), label: v.string(),
  }) },
  handler: async (ctx, { match }) => {
    const existing = await ctx.db.query("matches")
      .withIndex("by_espnEventId", (q) => q.eq("espnEventId", match.espnEventId)).unique();
    if (existing) await ctx.db.patch(existing._id, match);
    else await ctx.db.insert("matches", match);
  },
});
```
Then, inside `pollScores`, at the top of the `for (const event of ...)` loop (before the `if (state === "pre") continue;`), upsert the match:
```ts
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      await ctx.runMutation(internal.espn.upsertMatch, { match: {
        espnEventId: String(event.id),
        date: String(event.date ?? ""),
        homeTeamId: Number(home?.team?.id ?? 0),
        awayTeamId: Number(away?.team?.id ?? 0),
        status: state ?? "pre",
        label: String(event.shortName ?? event.name ?? ""),
      }});
```
> The `matches` schema fields (`homeTeamId`, `awayTeamId`, `status`, `label`, `date`, `espnEventId`) already exist from core Task 3. If the live feed nests competitors differently, log one `event` JSON during Step 9 and adjust the paths.

- [ ] **Step 6: Implement the `myLivePlayers` query**

Create `convex/live.ts`:
```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { eventByTeam, type LiveMatch } from "./lib/live";

export const myLivePlayers = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);
    const matches = (await ctx.db.query("matches").collect()) as unknown as LiveMatch[];
    const teamToEvent = eventByTeam(matches);
    if (teamToEvent.size === 0) return [];

    const picks = await ctx.db.query("picks")
      .withIndex("by_membership", (q) => q.eq("membershipId", me._id)).collect();

    const out: { name: string; position: string; country: string; goals: number; assists: number }[] = [];
    for (const pick of picks) {
      const player = await ctx.db.get(pick.playerId);
      if (!player) continue;
      const eventId = teamToEvent.get(player.espnTeamId);
      if (!eventId) continue; // player's team is not currently playing
      let goals = 0, assists = 0;
      if (player.espnPlayerId) {
        const stat = await ctx.db.query("playerMatchStats")
          .withIndex("by_event_player", (q) =>
            q.eq("espnEventId", eventId).eq("espnPlayerId", player.espnPlayerId!)).unique();
        if (stat) { goals = stat.goals; assists = stat.assists; }
      }
      out.push({ name: player.name, position: player.position, country: player.country, goals, assists });
    }
    return out;
  },
});
```

- [ ] **Step 7: Build the LiveTicker component**

Create `components/LiveTicker.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function LiveTicker({ leagueId }: { leagueId: Id<"leagues"> }) {
  const live = useQuery(api.live.myLivePlayers, { leagueId }) ?? [];
  if (live.length === 0) return <p className="text-sm text-gray-500">None of your players are on the pitch right now.</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {live.map((p, i) => (
        <li key={i} className="flex justify-between">
          <span>🟢 {p.name} <span className="text-gray-500">{p.position} · {p.country}</span></span>
          <span>{p.goals}G {p.assists}A</span>
        </li>))}
    </ul>
  );
}
```

- [ ] **Step 8: Mount the ticker on the leaderboard page**

In `app/league/[id]/leaderboard/page.tsx`, import `import { LiveTicker } from "@/components/LiveTicker";` and add above `<Standings .../>`:
```tsx
    <section className="mb-4">
      <h2 className="font-semibold mb-1">Playing now</h2>
      <LiveTicker leagueId={id as Id<"leagues">} />
    </section>
```

- [ ] **Step 9: Verify**

Run: `npx convex run espn:pollScores` during a live WC match window, then open the leaderboard for a league whose roster includes a player on a live team. Expected: `matches` has rows with `status: "in"`; the ticker lists your live players with their current G/A and updates without refresh. If empty during a live match, log an `event` JSON in `pollScores` and confirm the competitor team-id paths.

- [ ] **Step 10: Commit**

```bash
git add convex/espn.ts convex/lib/live.ts convex/live.ts convex/tests/live.test.ts components/LiveTicker.tsx "app/league/[id]/leaderboard/page.tsx"
git commit -m "feat: live 'your players playing now' ticker"
```

---

## Task 22: Per-matchday scoring breakdown

The leaderboard shows total points; this adds a per-matchday (per-date) breakdown of where a member's points came from.

**Files:**
- Create: `convex/lib/matchday.ts`
- Test: `convex/tests/matchday.test.ts`
- Modify: `convex/standings.ts` (add `matchdayBreakdown` query)
- Create: `components/MatchdayBreakdown.tsx`
- Modify: `app/league/[id]/leaderboard/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/matchday.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { groupByDate, type DatedPoints } from "../lib/matchday";

describe("groupByDate", () => {
  it("sums points per date and sorts ascending", () => {
    const rows: DatedPoints[] = [
      { date: "2026-06-13", points: 5 },
      { date: "2026-06-11", points: 3 },
      { date: "2026-06-13", points: 6 },
    ];
    expect(groupByDate(rows)).toEqual([
      { date: "2026-06-11", points: 3 },
      { date: "2026-06-13", points: 11 },
    ]);
  });
  it("returns an empty array for no rows", () => {
    expect(groupByDate([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- convex/tests/matchday.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `convex/lib/matchday.ts`:
```ts
export interface DatedPoints {
  date: string; // ISO date string; sorts lexicographically
  points: number;
}

export function groupByDate(rows: DatedPoints[]): DatedPoints[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.points);
  return [...map.entries()]
    .map(([date, points]) => ({ date, points }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- convex/tests/matchday.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `matchdayBreakdown` query**

Append to `convex/standings.ts`:
```ts
import { groupByDate, type DatedPoints } from "./lib/matchday";
import { scorePlayer } from "./lib/scoring";

export const matchdayBreakdown = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    const league = (await ctx.db.get(leagueId))!;
    const members = await ctx.db.query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();
    const picks = await ctx.db.query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();

    // Map event id -> date for labelling matchdays.
    const matches = await ctx.db.query("matches").collect();
    const dateOf = new Map(matches.map((m) => [m.espnEventId, m.date]));

    return Promise.all(members.map(async (m) => {
      const myPicks = picks.filter((p) => p.membershipId === m._id);
      const rows: DatedPoints[] = [];
      for (const pk of myPicks) {
        const player = await ctx.db.get(pk.playerId);
        if (!player?.espnPlayerId) continue;
        const stats = await ctx.db.query("playerMatchStats")
          .withIndex("by_player", (q) => q.eq("espnPlayerId", player.espnPlayerId!)).collect();
        for (const s of stats) {
          const pts = scorePlayer(
            [{ goals: s.goals, assists: s.assists, cleanSheet: s.cleanSheet, minutes: s.minutes, redCard: s.redCard }],
            player.position, league.scoringRules,
          );
          rows.push({ date: dateOf.get(s.espnEventId) ?? s.espnEventId, points: pts });
        }
      }
      return { membershipId: m._id, displayName: m.displayName, matchdays: groupByDate(rows) };
    }));
  },
});
```

- [ ] **Step 6: Build the MatchdayBreakdown component**

Create `components/MatchdayBreakdown.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function MatchdayBreakdown({ leagueId }: { leagueId: Id<"leagues"> }) {
  const rows = useQuery(api.standings.matchdayBreakdown, { leagueId }) ?? [];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.membershipId}>
          <h3 className="font-semibold text-sm">{r.displayName}</h3>
          {r.matchdays.length === 0
            ? <p className="text-xs text-gray-500">No points yet.</p>
            : <ul className="text-xs flex flex-wrap gap-x-4">
                {r.matchdays.map((md) => (
                  <li key={md.date}>{md.date}: <b>{md.points}</b></li>))}
              </ul>}
        </div>))}
    </div>
  );
}
```

- [ ] **Step 7: Mount it on the leaderboard page**

In `app/league/[id]/leaderboard/page.tsx`, import `import { MatchdayBreakdown } from "@/components/MatchdayBreakdown";` and add below `<Standings .../>`:
```tsx
    <section className="mt-6">
      <h2 className="font-semibold mb-2">By matchday</h2>
      <MatchdayBreakdown leagueId={id as Id<"leagues">} />
    </section>
```

- [ ] **Step 8: Verify**

Run: enter a couple of `manualStat` rows (or run the poller) for drafted players across two different event dates, then open the leaderboard. Expected: each member shows points grouped by date, summing to their total in the standings table. Updates live.

- [ ] **Step 9: Commit**

```bash
git add convex/lib/matchday.ts convex/tests/matchday.test.ts convex/standings.ts components/MatchdayBreakdown.tsx "app/league/[id]/leaderboard/page.tsx"
git commit -m "feat: per-matchday scoring breakdown on leaderboard"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npm test`
Expected: all suites pass — core (parser, snake, scoring, membership, draft) plus new (playerFilter, draftBoard, queue, queueIntegration, clock, autopick, live, matchday).

- [ ] **Production build**

Run: `npm run build`
Expected: build succeeds, no type errors.

---

## Self-review notes

- **Spec coverage:** all six requested features are covered — player filter (T17), draft board (T18), queue (T19), pick clock + autopick (T20), live ticker (T21), per-matchday breakdown (T22). Each has a pure tested helper plus a thin Convex accessor and a component.
- **Placeholders:** none — every code step shows complete code. Two ESPN-shape caveats (competitor team-id paths in T21, summary keys inherited from core T12) are explicit with concrete fallbacks.
- **Type consistency:** `chooseAutoPick`/`nextFromQueue`/`removeFromQueue` (T19 `lib/queue.ts`) reused by the engine (T20). `secondsRemaining` (T20 `lib/clock.ts`) reused by `PickClock`. `filterPlayers`/`distinct` (T17) reused by `PlayerPool`. `scorePlayer` (core T5) reused by T22. `armClock`/`applyPick` are internal to `draft.ts`. New schema fields (`pickStartedAt`, `autopickJobId`, `draftQueues`) are additive to core T3.
- **Ordering dependency:** T20 imports from `lib/queue.ts` (T19) and reads the `draftQueues` table (T19) — keep 19 before 20. T17's "＋ Queue" button calls `api.queue.addToQueue` (T19); if 17 lands first, the button is added in 19.
- **Decision to flag:** autopick uses `ctx.scheduler` (delayed mutation, cancel-and-re-arm) rather than a 1-min cron. Cleaner latency, but it relies on cancelling the prior job on every pick; the `autopick` handler also re-checks `currentMembershipId` so a stale job can't double-pick.
```
