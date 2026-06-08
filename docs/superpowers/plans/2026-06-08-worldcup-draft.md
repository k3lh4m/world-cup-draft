# World Cup 2026 Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-tenant web app where friend groups run a live snake draft of World Cup 2026 players and see an auto-updating leaderboard from real match stats.

**Architecture:** Single Next.js 16 app with Convex in `convex/`. Convex reactive queries drive the realtime draft and leaderboard. A global player pool is seeded once from `test.html`; a single Convex cron polls ESPN's free JSON API into `playerMatchStats`; every league reads from Convex so multi-tenancy never multiplies API load. Tenant isolation is enforced in one helper, `requireMembership`.

**Tech Stack:** Next.js 16 (App Router, TS), Convex, Convex Auth (magic-link via Resend), Tailwind + shadcn/ui, Vitest + convex-test for tests.

---

## File structure

```
app/                          # Next.js routes (App Router)
  layout.tsx                  # wraps app in ConvexAuthNextjsProvider
  page.tsx                    # landing: your leagues + create
  join/[token]/page.tsx       # magic-link sign-in scoped to a league
  league/[id]/page.tsx        # league home (members, order, status)
  league/[id]/draft/page.tsx  # live draft room
  league/[id]/leaderboard/page.tsx
  ConvexClientProvider.tsx    # client provider component
components/                   # shadcn/ui + app components
  PlayerPool.tsx  PickFeed.tsx  RosterPanel.tsx  Standings.tsx
convex/
  schema.ts        # all tables
  auth.ts          # Convex Auth config (Resend magic link)
  auth.config.ts   # auth provider config (generated)
  http.ts          # auth http routes (generated)
  lib/membership.ts# requireMembership helper
  lib/snake.ts     # pure snake-order helpers
  lib/scoring.ts   # pure scoring math
  players.ts       # player queries
  seed.ts          # seeding action/mutations
  leagues.ts       # createLeague, joinLeague, league queries
  draft.ts         # startDraft, makePick, draft queries
  espn.ts          # ESPN API client (action) + upserts
  crons.ts         # poll schedule
  standings.ts     # leagueStandings query
scripts/
  parseEspnSquads.ts          # pure HTML parser (no I/O)
convex/tests/                 # vitest + convex-test
  snake.test.ts  scoring.test.ts  draft.test.ts  membership.test.ts
scripts/parseEspnSquads.test.ts
```

---

## Task 1: Install dependencies and test harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `convex/tsconfig.json` (via convex init)

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
npm install convex @convex-dev/auth @auth/core@0.37.0
npm install -D vitest @edge-runtime/vm convex-test
```
Expected: packages added, no errors.

- [ ] **Step 2: Initialize Convex (creates convex/ + .env.local)**

Run: `npx convex dev --once --configure=new`
Expected: prints "Convex functions ready", creates `convex/`, sets `CONVEX_DEPLOYMENT` + `NEXT_PUBLIC_CONVEX_URL` in `.env.local`. (If it prompts to log in, the user runs `! npx convex login` first.)

- [ ] **Step 3: Add vitest config for Convex tests**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/tests/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Add test script**

In `package.json` `"scripts"`, add: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts convex .env.local
git commit -m "chore: add convex, auth, and vitest harness"
```

---

## Task 2: Squad parser (pure, TDD)

The parser turns the ESPN HTML into structured squads. Pure function, no I/O — the highest-value unit to TDD.

**Files:**
- Create: `scripts/parseEspnSquads.ts`
- Test: `scripts/parseEspnSquads.test.ts`
- Read fixture: `test.html`

- [ ] **Step 1: Write the failing test**

Create `scripts/parseEspnSquads.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEspnSquads, normalizeName } from "./parseEspnSquads";

const html = readFileSync(new URL("../test.html", import.meta.url), "utf8");
const squads = parseEspnSquads(html);

describe("parseEspnSquads", () => {
  it("parses all 48 teams across 12 groups", () => {
    expect(squads).toHaveLength(48);
    expect(new Set(squads.map((s) => s.group)).size).toBe(12);
  });

  it("captures team metadata", () => {
    const mexico = squads.find((s) => s.team === "Mexico")!;
    expect(mexico.group).toBe("A");
    expect(mexico.espnTeamId).toBe(203);
    expect(mexico.manager).toBe("Javier Aguirre");
    expect(mexico.logo).toContain("/203.png");
  });

  it("parses players with position, club, and espnId when present", () => {
    const mexico = squads.find((s) => s.team === "Mexico")!;
    const ochoa = mexico.players.find((p) => p.name === "Guillermo Ochoa")!;
    expect(ochoa.pos).toBe("GK");
    expect(ochoa.club).toBe("AEL Limassol");
    expect(ochoa.espnId).toBe(137038);
  });

  it("keeps players that have no ESPN id (plain-text names)", () => {
    const korea = squads.find((s) => s.team === "South Korea")!;
    const joh = korea.players.find((p) => p.name === "Jo Hyun-Woo");
    expect(joh).toBeDefined();
    expect(joh!.pos).toBe("GK");
  });

  it("normalizes accents for matching", () => {
    expect(normalizeName("Vinícius Júnior")).toBe("vinicius junior");
  });

  it("dedupes repeated players within a squad", () => {
    const tunisia = squads.find((s) => s.team === "Tunisia")!;
    const saads = tunisia.players.filter((p) => normalizeName(p.name) === "elias saad");
    expect(saads).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scripts/parseEspnSquads.test.ts`
Expected: FAIL — "parseEspnSquads is not a function".

- [ ] **Step 3: Implement the parser**

Create `scripts/parseEspnSquads.ts`:
```ts
export type Pos = "GK" | "DEF" | "MID" | "FWD";
export interface ParsedPlayer { name: string; pos: Pos; club: string; espnId?: number }
export interface ParsedSquad {
  group: string; team: string; espnTeamId: number; logo: string;
  manager: string; players: ParsedPlayer[];
}

const POS_MAP: Record<string, Pos> = {
  goalkeeper: "GK", defender: "DEF", midfielder: "MID", forward: "FWD",
};

export function normalizeName(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
}

// Splits a section body on top-level commas (commas not inside <a ...> attributes are fine
// because we strip tags per-entry after splitting on the player anchor boundaries).
function parsePlayers(html: string, pos: Pos): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  // Each player is "Name (Club)" where Name may be an <a href=".../id/NNN/..">Name</a>.
  // Strategy: remove club-link tags' hrefs but keep text; then split entries on "),".
  // Work on the raw chunk: find name + optional player id, then the club in the first (...).
  const entryRegex = /(?:<a[^>]*\/id\/(\d+)\/[^>]*>([^<]+)<\/a>|<a[^>]*>([^<]+)<\/a>|([^<(,][^<(,]*?))\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(html)) !== null) {
    const espnId = m[1] ? Number(m[1]) : undefined;
    const name = stripTags((m[2] ?? m[3] ?? m[4] ?? "")).trim();
    const club = stripTags(m[5] ?? "").trim();
    if (!name) continue;
    players.push({ name, pos, club, espnId });
  }
  return players;
}

export function parseEspnSquads(html: string): ParsedSquad[] {
  const squads: ParsedSquad[] = [];
  // Track current group from "GROUP X" headings.
  // Split the document into team blocks. A team block starts at a logo <img .../NNN.png>
  // through the "Manager:" line.
  const groupRe = /GROUP\s+([A-L])\b/g;
  // Build an index of group positions to assign each team the most recent group.
  const groupMarks: { idx: number; group: string }[] = [];
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(html)) !== null) groupMarks.push({ idx: gm.index, group: gm[1] });
  const groupFor = (idx: number) =>
    [...groupMarks].reverse().find((g) => g.idx <= idx)?.group ?? "?";

  // Team block regex: logo id, team name (in following <h2><a ...>Name</a>), body up to Manager.
  const teamRe =
    /teamlogos\/soccer\/500\/(\d+)\.png[\s\S]*?<h2>(?:<strong>)?<a[^>]*>([^<]+)<\/a>[\s\S]*?(?=<strong>Manager)/g;
  let t: RegExpExecArray | null;
  while ((t = teamRe.exec(html)) !== null) {
    const espnTeamId = Number(t[1]);
    const team = stripTags(t[2]);
    const block = t[0];
    const logo = `https://a.espncdn.com/i/teamlogos/soccer/500/${espnTeamId}.png`;
    const managerMatch = html.slice(t.index).match(/Manager:\s*<?\/?[^>]*>?\s*([^<]+?)\s*<\/strong>/);
    const manager = managerMatch ? stripTags(managerMatch[1]) : "";

    const players: ParsedPlayer[] = [];
    for (const [label, pos] of Object.entries(POS_MAP)) {
      const secRe = new RegExp(
        `${label}s?\\s*:?\\s*<\\/strong>([\\s\\S]*?)(?=<strong>|<p><strong>|<\\/p>\\s*<p><strong>)`,
        "i"
      );
      const sec = block.match(secRe);
      if (sec) players.push(...parsePlayers(sec[1], pos as Pos));
    }

    // Dedupe by normalized name within the squad.
    const seen = new Set<string>();
    const deduped = players.filter((p) => {
      const k = normalizeName(p.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    squads.push({ group: groupFor(t.index), team, espnTeamId, logo, manager, players: deduped });
  }
  return squads;
}
```

- [ ] **Step 4: Run tests, iterate until green**

Run: `npm test -- scripts/parseEspnSquads.test.ts`
Expected: PASS all. If a regex misses (e.g. a section that uses `Goalkeepers</strong>` vs `Goalkeepers:</strong>`), adjust `secRe`/`entryRegex` against `test.html` until the 6 tests pass. Do not weaken the assertions.

- [ ] **Step 5: Add a coverage report step (non-blocking diagnostics)**

Add to the test file:
```ts
it("reports per-team counts (diagnostic, not a hard failure)", () => {
  const offenders = squads.filter((s) => s.players.length !== 26)
    .map((s) => `${s.team}:${s.players.length}`);
  // Known ESPN source glitches exist; assert we are in a sane range, log offenders.
  // eslint-disable-next-line no-console
  if (offenders.length) console.warn("non-26 squads:", offenders.join(", "));
  expect(squads.reduce((n, s) => n + s.players.length, 0)).toBeGreaterThan(1150);
});
```
Run again; expected PASS with a warning listing any non-26 squads.

- [ ] **Step 6: Commit**

```bash
git add scripts/parseEspnSquads.ts scripts/parseEspnSquads.test.ts
git commit -m "feat: parse ESPN squads HTML into structured pool (TDD)"
```

---

## Task 3: Convex schema

**Files:**
- Create/replace: `convex/schema.ts`

- [ ] **Step 1: Write the schema**

Create `convex/schema.ts`:
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const POSITIONS = v.union(
  v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD"),
);

export default defineSchema({
  ...authTables,

  players: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    position: POSITIONS,
    club: v.string(),
    country: v.string(),
    group: v.string(),
    espnTeamId: v.number(),
    espnPlayerId: v.optional(v.number()),
  })
    .index("by_country", ["country"])
    .index("by_position", ["position"])
    .index("by_espnPlayerId", ["espnPlayerId"]),

  matches: defineTable({
    espnEventId: v.string(),
    date: v.string(),
    homeTeamId: v.number(),
    awayTeamId: v.number(),
    status: v.string(),
    label: v.string(),
  }).index("by_espnEventId", ["espnEventId"]),

  playerMatchStats: defineTable({
    espnPlayerId: v.number(),
    espnEventId: v.string(),
    goals: v.number(),
    assists: v.number(),
    cleanSheet: v.boolean(),
    minutes: v.number(),
    redCard: v.boolean(),
  })
    .index("by_player", ["espnPlayerId"])
    .index("by_event_player", ["espnEventId", "espnPlayerId"]),

  leagues: defineTable({
    name: v.string(),
    commissionerUserId: v.id("users"),
    inviteToken: v.string(),
    rosterSize: v.number(),
    scoringRules: v.object({
      goal: v.number(), assist: v.number(), cleanSheet: v.number(),
      appearance: v.number(), redCard: v.number(),
    }),
  }).index("by_token", ["inviteToken"]),

  memberships: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    displayName: v.string(),
    draftOrder: v.optional(v.number()),
    role: v.union(v.literal("commissioner"), v.literal("member")),
  })
    .index("by_league", ["leagueId"])
    .index("by_user", ["userId"])
    .index("by_league_user", ["leagueId", "userId"]),

  drafts: defineTable({
    leagueId: v.id("leagues"),
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("complete")),
    round: v.number(),
    pickIndex: v.number(),
    order: v.array(v.id("memberships")),
    currentMembershipId: v.optional(v.id("memberships")),
    pickClockSeconds: v.optional(v.number()),
  }).index("by_league", ["leagueId"]),

  picks: defineTable({
    leagueId: v.id("leagues"),
    draftId: v.id("drafts"),
    membershipId: v.id("memberships"),
    playerId: v.id("players"),
    round: v.number(),
    overall: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_player", ["leagueId", "playerId"])
    .index("by_membership", ["membershipId"]),
});
```

- [ ] **Step 2: Push schema**

Run: `npx convex dev --once`
Expected: "Convex functions ready"; tables created, no validation errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: convex schema for players, leagues, drafts, picks, stats"
```

---

## Task 4: Snake-order helper (pure, TDD)

**Files:**
- Create: `convex/lib/snake.ts`
- Test: `convex/tests/snake.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/snake.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { membershipForPick, isDraftComplete } from "../lib/snake";

// order = [A,B,C]; rosterSize 2 ⇒ overall picks 0..5
// round0 (fwd): A,B,C ; round1 (rev): C,B,A
describe("snake order", () => {
  const order = ["A", "B", "C"];
  it("goes forward on even rounds", () => {
    expect(membershipForPick(order, 0)).toBe("A");
    expect(membershipForPick(order, 2)).toBe("C");
  });
  it("reverses on odd rounds", () => {
    expect(membershipForPick(order, 3)).toBe("C");
    expect(membershipForPick(order, 5)).toBe("A");
  });
  it("knows when the draft is complete", () => {
    expect(isDraftComplete(3, 2, 5)).toBe(false); // 6th pick (overall 5) still valid
    expect(isDraftComplete(3, 2, 6)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- convex/tests/snake.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `convex/lib/snake.ts`:
```ts
export function membershipForPick<T>(order: T[], overall: number): T {
  const n = order.length;
  const round = Math.floor(overall / n);
  const idxInRound = overall % n;
  const pos = round % 2 === 0 ? idxInRound : n - 1 - idxInRound;
  return order[pos];
}

export function isDraftComplete(teams: number, rosterSize: number, overallNextPick: number): boolean {
  return overallNextPick >= teams * rosterSize;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- convex/tests/snake.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/snake.ts convex/tests/snake.test.ts
git commit -m "feat: pure snake-order helpers (TDD)"
```

---

## Task 5: Scoring math (pure, TDD)

**Files:**
- Create: `convex/lib/scoring.ts`
- Test: `convex/tests/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scorePlayer, type ScoringRules, type Stat } from "../lib/scoring";

const rules: ScoringRules = { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 };

describe("scorePlayer", () => {
  it("sums goals, assists, appearance", () => {
    const stats: Stat[] = [{ goals: 2, assists: 1, cleanSheet: false, minutes: 90, redCard: false }];
    // 2*5 + 1*3 + 1 appearance = 14
    expect(scorePlayer(stats, "FWD", rules)).toBe(14);
  });
  it("awards clean sheet only to GK/DEF", () => {
    const s: Stat[] = [{ goals: 0, assists: 0, cleanSheet: true, minutes: 90, redCard: false }];
    expect(scorePlayer(s, "DEF", rules)).toBe(1 + 4);
    expect(scorePlayer(s, "FWD", rules)).toBe(1); // no clean-sheet bonus
  });
  it("subtracts red cards and counts an appearance only when minutes > 0", () => {
    const s: Stat[] = [{ goals: 0, assists: 0, cleanSheet: false, minutes: 0, redCard: true }];
    expect(scorePlayer(s, "MID", rules)).toBe(-2); // no appearance (0 min), red card -2
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- convex/tests/scoring.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `convex/lib/scoring.ts`:
```ts
export interface ScoringRules {
  goal: number; assist: number; cleanSheet: number; appearance: number; redCard: number;
}
export interface Stat {
  goals: number; assists: number; cleanSheet: boolean; minutes: number; redCard: boolean;
}
export type Position = "GK" | "DEF" | "MID" | "FWD";

export function scorePlayer(stats: Stat[], position: Position, rules: ScoringRules): number {
  const csEligible = position === "GK" || position === "DEF";
  return stats.reduce((total, s) => {
    let pts = s.goals * rules.goal + s.assists * rules.assist + (s.redCard ? rules.redCard : 0);
    if (s.minutes > 0) pts += rules.appearance;
    if (s.cleanSheet && csEligible) pts += rules.cleanSheet;
    return total + pts;
  }, 0);
}

export const DEFAULT_SCORING: ScoringRules = {
  goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2,
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- convex/tests/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/scoring.ts convex/tests/scoring.test.ts
git commit -m "feat: pure scoring math (TDD)"
```

---

## Task 6: Auth (Convex Auth magic-link via Resend)

**Files:**
- Create: `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts` (via initializer)
- Modify: `.env.local` (AUTH_RESEND_KEY)

- [ ] **Step 1: Run the Convex Auth initializer**

Run: `npx @convex-dev/auth`
Expected: generates `convex/auth.config.ts`, `convex/http.ts`, adds `SITE_URL` and auth keys to the Convex deployment, updates `convex/auth.ts` stub.

- [ ] **Step 2: Configure the Resend magic-link provider**

Replace `convex/auth.ts`:
```ts
import { convexAuth } from "@convex-dev/auth/server";
import Resend from "@auth/core/providers/resend";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      from: "World Cup Draft <onboarding@resend.dev>",
    }),
  ],
});
```

- [ ] **Step 3: Set the Resend key**

Run: `npx convex env set AUTH_RESEND_KEY <key>`
Expected: confirmation. (User supplies the key; free tier works. `onboarding@resend.dev` sends without domain verification for testing.)

- [ ] **Step 4: Verify deploy compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready", no auth config errors.

- [ ] **Step 5: Commit**

```bash
git add convex/auth.ts convex/auth.config.ts convex/http.ts
git commit -m "feat: convex auth with Resend magic-link"
```

---

## Task 7: Client providers + base layout

**Files:**
- Create: `app/ConvexClientProvider.tsx`
- Modify: `app/layout.tsx`
- Modify: `middleware.ts` (create at repo root)

- [ ] **Step 1: Create the client provider**

Create `app/ConvexClientProvider.tsx`:
```tsx
"use client";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
```

- [ ] **Step 2: Wrap the root layout**

In `app/layout.tsx`, import `ConvexAuthNextjsServerProvider` from `@convex-dev/auth/nextjs/server` and `ConvexClientProvider`, and wrap `<body>` children:
```tsx
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "./ConvexClientProvider";
// ...inside return:
<ConvexAuthNextjsServerProvider>
  <html lang="en"><body className={/* keep generated fonts */ ""}>
    <ConvexClientProvider>{children}</ConvexClientProvider>
  </body></html>
</ConvexAuthNextjsServerProvider>
```

- [ ] **Step 3: Add auth middleware**

Create `middleware.ts` at repo root:
```ts
import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
export default convexAuthNextjsMiddleware();
export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
```

- [ ] **Step 4: Verify the app boots**

Run: `npm run dev` (background), then `curl -sI http://localhost:3000 | head -1`
Expected: `HTTP/1.1 200 OK`. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/ConvexClientProvider.tsx app/layout.tsx middleware.ts
git commit -m "feat: wire Convex auth providers and middleware"
```

---

## Task 8: Membership helper (tenant isolation, TDD)

**Files:**
- Create: `convex/lib/membership.ts`
- Test: `convex/tests/membership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/tests/membership.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

describe("requireMembership isolation", () => {
  it("rejects a user who is not a member of the league", async () => {
    const t = convexTest(schema);
    const userA = await t.run(async (ctx) => ctx.db.insert("users", { name: "A" } as any));
    const userB = await t.run(async (ctx) => ctx.db.insert("users", { name: "B" } as any));
    const leagueId = await t.run(async (ctx) =>
      ctx.db.insert("leagues", {
        name: "L", commissionerUserId: userA, inviteToken: "tok", rosterSize: 2,
        scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: userA, displayName: "A", role: "commissioner" }),
    );
    // userA (member) can read; userB cannot.
    const asA = t.withIdentity({ subject: userA });
    const asB = t.withIdentity({ subject: userB });
    await expect(asA.query(api.leagues.getLeague, { leagueId })).resolves.toBeTruthy();
    await expect(asB.query(api.leagues.getLeague, { leagueId })).rejects.toThrow(/not a member/i);
  });
});
```

- [ ] **Step 2: Implement the helper**

Create `convex/lib/membership.ts`:
```ts
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export async function requireMembership(ctx: QueryCtx | MutationCtx, leagueId: Id<"leagues">) {
  const userId = await requireUserId(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_league_user", (q) => q.eq("leagueId", leagueId).eq("userId", userId))
    .unique();
  if (!membership) throw new Error("You are not a member of this league");
  return membership;
}
```

- [ ] **Step 3: Add the minimal `getLeague` query the test calls**

This is implemented fully in Task 9; for now add it so the test compiles. (Task 9 expands `leagues.ts`.) Create `convex/leagues.ts`:
```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";

export const getLeague = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return await ctx.db.get(leagueId);
  },
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- convex/tests/membership.test.ts`
Expected: PASS (member resolves, non-member throws "not a member").

- [ ] **Step 5: Commit**

```bash
git add convex/lib/membership.ts convex/tests/membership.test.ts convex/leagues.ts
git commit -m "feat: requireMembership tenant isolation (TDD)"
```

---

## Task 9: Leagues — create, join, queries

**Files:**
- Modify: `convex/leagues.ts`
- Create: `convex/players.ts`

- [ ] **Step 1: Add player pool query**

Create `convex/players.ts`:
```ts
import { query } from "./_generated/server";
export const listPlayers = query({
  args: {},
  handler: async (ctx) => ctx.db.query("players").collect(),
});
```

- [ ] **Step 2: Expand leagues.ts with create/join/listMine + members**

Append to `convex/leagues.ts`:
```ts
import { mutation } from "./_generated/server";
import { DEFAULT_SCORING } from "./lib/scoring";
import { requireUserId } from "./lib/membership";

function token() {
  return Math.random().toString(36).slice(2, 10);
}

export const createLeague = mutation({
  args: { name: v.string(), displayName: v.string(), rosterSize: v.optional(v.number()) },
  handler: async (ctx, { name, displayName, rosterSize }) => {
    const userId = await requireUserId(ctx);
    const inviteToken = token();
    const leagueId = await ctx.db.insert("leagues", {
      name, commissionerUserId: userId, inviteToken,
      rosterSize: rosterSize ?? 15, scoringRules: DEFAULT_SCORING,
    });
    await ctx.db.insert("memberships", {
      leagueId, userId, displayName, role: "commissioner",
    });
    return { leagueId, inviteToken };
  },
});

export const joinLeague = mutation({
  args: { inviteToken: v.string(), displayName: v.string() },
  handler: async (ctx, { inviteToken, displayName }) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db.query("leagues")
      .withIndex("by_token", (q) => q.eq("inviteToken", inviteToken)).unique();
    if (!league) throw new Error("Invalid invite link");
    const existing = await ctx.db.query("memberships")
      .withIndex("by_league_user", (q) => q.eq("leagueId", league._id).eq("userId", userId)).unique();
    if (existing) return { leagueId: league._id };
    await ctx.db.insert("memberships", {
      leagueId: league._id, userId, displayName, role: "member",
    });
    return { leagueId: league._id };
  },
});

export const listMyLeagues = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db.query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return Promise.all(memberships.map(async (m) => ({
      membership: m, league: await ctx.db.get(m.leagueId),
    })));
  },
});

export const listMembers = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db.query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();
  },
});
```

- [ ] **Step 3: Verify compile**

Run: `npx convex dev --once`
Expected: ready, no type errors.

- [ ] **Step 4: Commit**

```bash
git add convex/leagues.ts convex/players.ts
git commit -m "feat: league create/join/list + player pool query"
```

---

## Task 10: Draft engine (convex-test TDD)

**Files:**
- Create: `convex/draft.ts`
- Test: `convex/tests/draft.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `convex/tests/draft.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

async function seedLeague(t: any, names: string[]) {
  const userIds = await Promise.all(names.map((n) =>
    t.run((ctx: any) => ctx.db.insert("users", { name: n }))));
  const leagueId = await t.run((ctx: any) => ctx.db.insert("leagues", {
    name: "L", commissionerUserId: userIds[0], inviteToken: "tk", rosterSize: 1,
    scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
  }));
  const memberIds = await Promise.all(names.map((n, i) =>
    t.run((ctx: any) => ctx.db.insert("memberships", {
      leagueId, userId: userIds[i], displayName: n, draftOrder: i,
      role: i === 0 ? "commissioner" : "member",
    }))));
  // two players to draft
  const p1 = await t.run((ctx: any) => ctx.db.insert("players", {
    name: "P1", normalizedName: "p1", position: "FWD", club: "C", country: "X", group: "A", espnTeamId: 1 }));
  const p2 = await t.run((ctx: any) => ctx.db.insert("players", {
    name: "P2", normalizedName: "p2", position: "MID", club: "C", country: "X", group: "A", espnTeamId: 1 }));
  return { userIds, leagueId, memberIds, p1, p2 };
}

describe("draft engine", () => {
  it("enforces turn order, prevents double-picks, advances snake, completes", async () => {
    const t = convexTest(schema);
    const { userIds, leagueId, memberIds, p1, p2 } = await seedLeague(t, ["A", "B"]);
    const asA = t.withIdentity({ subject: userIds[0] });
    const asB = t.withIdentity({ subject: userIds[1] });

    await asA.mutation(api.draft.startDraft, { leagueId, order: memberIds });

    // It's A's turn. B cannot pick.
    await expect(asB.mutation(api.draft.makePick, { leagueId, playerId: p1 }))
      .rejects.toThrow(/not your turn/i);

    // A picks p1.
    await asA.mutation(api.draft.makePick, { leagueId, playerId: p1 });
    // A cannot pick again (now B's turn), and p1 is taken.
    await expect(asA.mutation(api.draft.makePick, { leagueId, playerId: p2 }))
      .rejects.toThrow(/not your turn/i);
    await expect(asB.mutation(api.draft.makePick, { leagueId, playerId: p1 }))
      .rejects.toThrow(/already drafted/i);

    // B picks p2 ⇒ rosterSize 1, 2 teams ⇒ draft complete.
    await asB.mutation(api.draft.makePick, { leagueId, playerId: p2 });
    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.status).toBe("complete");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- convex/tests/draft.test.ts`
Expected: FAIL — `api.draft.*` undefined.

- [ ] **Step 3: Implement the draft engine**

Create `convex/draft.ts`:
```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { membershipForPick, isDraftComplete } from "./lib/snake";

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

export const startDraft = mutation({
  args: { leagueId: v.id("leagues"), order: v.array(v.id("memberships")) },
  handler: async (ctx, { leagueId, order }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") throw new Error("Only the commissioner can start the draft");
    const existing = await ctx.db.query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).unique();
    if (existing) throw new Error("Draft already exists");
    await ctx.db.insert("drafts", {
      leagueId, status: "active", round: 0, pickIndex: 0, order,
      currentMembershipId: membershipForPick(order, 0),
    });
  },
});

export const makePick = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const league = await ctx.db.get(leagueId);
    const draft = await ctx.db.query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).unique();
    if (!draft || draft.status !== "active") throw new Error("Draft is not active");

    const overall = draft.pickIndex;
    const onClock = membershipForPick(draft.order, overall);
    if (onClock !== me._id) throw new Error("It is not your turn");

    const taken = await ctx.db.query("picks")
      .withIndex("by_league_player", (q) => q.eq("leagueId", leagueId).eq("playerId", playerId)).unique();
    if (taken) throw new Error("That player is already drafted");

    const round = Math.floor(overall / draft.order.length);
    await ctx.db.insert("picks", {
      leagueId, draftId: draft._id, membershipId: me._id, playerId, round, overall,
    });

    const nextOverall = overall + 1;
    const complete = isDraftComplete(draft.order.length, league!.rosterSize, nextOverall);
    await ctx.db.patch(draft._id, {
      pickIndex: nextOverall,
      round: Math.floor(nextOverall / draft.order.length),
      status: complete ? "complete" : "active",
      currentMembershipId: complete ? undefined : membershipForPick(draft.order, nextOverall),
    });
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- convex/tests/draft.test.ts`
Expected: PASS (turn enforcement, double-pick guard, completion).

- [ ] **Step 5: Commit**

```bash
git add convex/draft.ts convex/tests/draft.test.ts
git commit -m "feat: snake draft engine with turn + dedupe guards (TDD)"
```

---

## Task 11: Seeder action

**Files:**
- Create: `convex/seed.ts`
- Create: `scripts/seedRun.ts` (reads test.html, calls the action)

- [ ] **Step 1: Implement the seed mutation + ESPN roster backfill action**

Create `convex/seed.ts`:
```ts
"use node";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const playerArg = v.object({
  name: v.string(), normalizedName: v.string(),
  position: v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD")),
  club: v.string(), country: v.string(), group: v.string(),
  espnTeamId: v.number(), espnPlayerId: v.optional(v.number()),
});

export const upsertPlayers = internalMutation({
  args: { players: v.array(playerArg) },
  handler: async (ctx, { players }) => {
    for (const p of players) {
      // de-dupe across runs by normalizedName + country
      const existing = await ctx.db.query("players")
        .withIndex("by_country", (q) => q.eq("country", p.country)).collect();
      const dup = existing.find((e) => e.normalizedName === p.normalizedName);
      if (dup) await ctx.db.patch(dup._id, p);
      else await ctx.db.insert("players", p);
    }
    return players.length;
  },
});

export const seedFromSquads = action({
  args: { squads: v.array(v.object({
    group: v.string(), team: v.string(), espnTeamId: v.number(),
    players: v.array(v.object({
      name: v.string(), pos: v.union(v.literal("GK"), v.literal("DEF"), v.literal("MID"), v.literal("FWD")),
      club: v.string(), espnId: v.optional(v.number()),
    })),
  })) },
  handler: async (ctx, { squads }) => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ").trim().toLowerCase();
    let total = 0;
    for (const sq of squads) {
      // Backfill missing espnIds from ESPN roster endpoint.
      let roster: Record<string, number> = {};
      const missing = sq.players.some((p) => !p.espnId);
      if (missing) {
        try {
          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${sq.espnTeamId}/roster`);
          const json: any = await res.json();
          for (const item of json.athletes ?? []) {
            const a = item.athlete ?? item;
            if (a?.displayName && a?.id) roster[norm(a.displayName)] = Number(a.id);
          }
        } catch { /* leave ids missing; manual scoring still works */ }
      }
      const players = sq.players.map((p) => ({
        name: p.name, normalizedName: norm(p.name), position: p.pos,
        club: p.club, country: sq.team, group: sq.group, espnTeamId: sq.espnTeamId,
        espnPlayerId: p.espnId ?? roster[norm(p.name)],
      }));
      total += await ctx.runMutation(internal.seed.upsertPlayers, { players });
    }
    return total;
  },
});
```

- [ ] **Step 2: Create the runner that feeds parsed squads to the action**

Create `scripts/seedRun.ts`:
```ts
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { parseEspnSquads } from "./parseEspnSquads";

const html = readFileSync(new URL("../test.html", import.meta.url), "utf8");
const squads = parseEspnSquads(html).map((s) => ({
  group: s.group, team: s.team, espnTeamId: s.espnTeamId,
  players: s.players.map((p) => ({ name: p.name, pos: p.pos, club: p.club, espnId: p.espnId })),
}));

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
client.action(api.seed.seedFromSquads, { squads }).then((n) => {
  console.log(`seeded ${n} players across ${squads.length} teams`);
  process.exit(0);
});
```

- [ ] **Step 3: Run the seeder**

Run: `npx convex dev --once && npx tsx scripts/seedRun.ts`
Expected: prints `seeded <~1248> players across 48 teams`. (Install tsx if needed: `npm i -D tsx`.)

- [ ] **Step 4: Verify in Convex**

Run: `npx convex run players:listPlayers --limit 1` (or open the dashboard data tab)
Expected: returns player rows; dashboard shows ~1248 in `players`.

- [ ] **Step 5: Commit**

```bash
git add convex/seed.ts scripts/seedRun.ts package.json package-lock.json
git commit -m "feat: seed player pool from test.html with ESPN id backfill"
```

---

## Task 12: ESPN scoring poller + standings

**Files:**
- Create: `convex/espn.ts`, `convex/crons.ts`, `convex/standings.ts`

- [ ] **Step 1: Implement the poller action + upsert mutation**

Create `convex/espn.ts`:
```ts
"use node";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const upsertStat = internalMutation({
  args: { stat: v.object({
    espnPlayerId: v.number(), espnEventId: v.string(), goals: v.number(), assists: v.number(),
    cleanSheet: v.boolean(), minutes: v.number(), redCard: v.boolean(),
  }) },
  handler: async (ctx, { stat }) => {
    const existing = await ctx.db.query("playerMatchStats")
      .withIndex("by_event_player", (q) =>
        q.eq("espnEventId", stat.espnEventId).eq("espnPlayerId", stat.espnPlayerId)).unique();
    if (existing) await ctx.db.patch(existing._id, stat);
    else await ctx.db.insert("playerMatchStats", stat);
  },
});

export const pollScores = action({
  args: {},
  handler: async (ctx) => {
    const sb = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard").then((r) => r.json());
    for (const event of (sb as any).events ?? []) {
      const state = event.status?.type?.state; // pre | in | post
      if (state === "pre") continue;
      const summary = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${event.id}`)
        .then((r) => r.json());
      // ESPN "summary.boxscore.players[].statistics[].athletes[]" carries per-player numbers;
      // shape varies by sport feed, so read defensively.
      const teams = (summary as any).boxscore?.players ?? [];
      for (const team of teams) {
        for (const group of team.statistics ?? []) {
          for (const a of group.athletes ?? []) {
            const id = Number(a.athlete?.id);
            if (!id) continue;
            const stats: Record<string, string> = {};
            (group.keys ?? group.labels ?? []).forEach((k: string, i: number) => {
              stats[k.toLowerCase()] = a.stats?.[i];
            });
            const num = (k: string) => Number(stats[k] ?? 0) || 0;
            await ctx.runMutation(internal.espn.upsertStat, { stat: {
              espnPlayerId: id, espnEventId: String(event.id),
              goals: num("goals"), assists: num("assists"),
              cleanSheet: false, minutes: num("minutes") || num("min"),
              redCard: num("redcards") > 0,
            }});
          }
        }
      }
    }
    return "ok";
  },
});
```

> Note: ESPN's summary shape is undocumented and may differ from the keys above. During Step 4 verification, log one `summary` JSON and adjust the key names (`goals`, `assists`, `minutes`, `redcards`) to match the live feed. The manual-entry fallback (Task 13) covers any feed gaps.

- [ ] **Step 2: Schedule the cron**

Create `convex/crons.ts`:
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("poll espn scores", { minutes: 1 }, internal.espn.pollScores, {});
export default crons;
```
(If `pollScores` should be internal, change `export const pollScores = action` to `internalAction` and import accordingly; keep it public-action while testing so it can be triggered by hand.)

- [ ] **Step 3: Implement standings query**

Create `convex/standings.ts`:
```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { scorePlayer, type Stat } from "./lib/scoring";

export const leagueStandings = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    const league = (await ctx.db.get(leagueId))!;
    const members = await ctx.db.query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();
    const picks = await ctx.db.query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId)).collect();

    const rows = await Promise.all(members.map(async (m) => {
      const myPicks = picks.filter((p) => p.membershipId === m._id);
      let points = 0;
      const breakdown = await Promise.all(myPicks.map(async (pk) => {
        const player = (await ctx.db.get(pk.playerId))!;
        const stats: Stat[] = player.espnPlayerId
          ? (await ctx.db.query("playerMatchStats")
              .withIndex("by_player", (q) => q.eq("espnPlayerId", player.espnPlayerId!)).collect())
              .map((s) => ({ goals: s.goals, assists: s.assists, cleanSheet: s.cleanSheet,
                             minutes: s.minutes, redCard: s.redCard }))
          : [];
        const pts = scorePlayer(stats, player.position, league.scoringRules);
        points += pts;
        return { player: player.name, position: player.position, points: pts };
      }));
      return { membershipId: m._id, displayName: m.displayName, points, breakdown };
    }));

    return rows.sort((a, b) => b.points - a.points);
  },
});
```

- [ ] **Step 4: Verify end-to-end on a finished fixture**

Run: `npx convex run espn:pollScores` (after WC matches have started), then
`npx convex run standings:leagueStandings '{"leagueId":"<id>"}'` (use a real seeded league id).
Expected: `playerMatchStats` populated; standings return ranked rows. If keys are wrong, inspect a logged `summary` and fix key names in `espn.ts`, re-run.

- [ ] **Step 5: Commit**

```bash
git add convex/espn.ts convex/crons.ts convex/standings.ts
git commit -m "feat: ESPN poller + reactive league standings"
```

---

## Task 13: Frontend — auth gate, landing, join, league home

**Files:**
- Modify: `app/page.tsx`
- Create: `app/join/[token]/page.tsx`, `app/league/[id]/page.tsx`
- Create: `components/SignIn.tsx`

- [ ] **Step 1: Sign-in form (magic link)**

Create `components/SignIn.tsx`:
```tsx
"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function SignIn({ next }: { next?: string }) {
  const { signIn } = useAuthActions();
  const [sent, setSent] = useState(false);
  if (sent) return <p className="p-4">Check your email for a sign-in link.</p>;
  return (
    <form className="flex flex-col gap-2 p-4 max-w-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (next) fd.set("redirectTo", next);
        await signIn("resend", fd);
        setSent(true);
      }}>
      <input name="email" type="email" required placeholder="you@example.com"
        className="border rounded px-3 py-2" />
      <button className="bg-black text-white rounded px-3 py-2" type="submit">
        Email me a sign-in link
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Landing page — list leagues + create**

Replace `app/page.tsx`:
```tsx
"use client";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SignIn } from "@/components/SignIn";
import { useState } from "react";
import Link from "next/link";

export default function Home() {
  return (<main className="max-w-2xl mx-auto p-6">
    <h1 className="text-2xl font-bold mb-4">World Cup Draft</h1>
    <Unauthenticated><SignIn /></Unauthenticated>
    <Authenticated><Dashboard /></Authenticated>
  </main>);
}

function Dashboard() {
  const leagues = useQuery(api.leagues.listMyLeagues) ?? [];
  const createLeague = useMutation(api.leagues.createLeague);
  const [name, setName] = useState(""); const [display, setDisplay] = useState("");
  return (<div className="flex flex-col gap-6">
    <section>
      <h2 className="font-semibold mb-2">Your leagues</h2>
      <ul className="flex flex-col gap-1">
        {leagues.map(({ league, membership }) => league && (
          <li key={league._id}>
            <Link className="text-blue-600 underline" href={`/league/${league._id}`}>
              {league.name}</Link> — joined as {membership.displayName}
          </li>
        ))}
      </ul>
    </section>
    <form className="flex flex-col gap-2 max-w-sm"
      onSubmit={async (e) => { e.preventDefault();
        const { leagueId } = await createLeague({ name, displayName: display });
        window.location.href = `/league/${leagueId}`; }}>
      <h2 className="font-semibold">Create a league</h2>
      <input className="border rounded px-3 py-2" placeholder="League name"
        value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="border rounded px-3 py-2" placeholder="Your display name"
        value={display} onChange={(e) => setDisplay(e.target.value)} required />
      <button className="bg-black text-white rounded px-3 py-2">Create</button>
    </form>
  </div>);
}
```

- [ ] **Step 3: Join page**

Create `app/join/[token]/page.tsx`:
```tsx
"use client";
import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SignIn } from "@/components/SignIn";
import { use, useState } from "react";

export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (<main className="max-w-md mx-auto p-6">
    <h1 className="text-xl font-bold mb-4">Join league</h1>
    <Unauthenticated><SignIn next={`/join/${token}`} /></Unauthenticated>
    <Authenticated><JoinForm token={token} /></Authenticated>
  </main>);
}

function JoinForm({ token }: { token: string }) {
  const join = useMutation(api.leagues.joinLeague);
  const [display, setDisplay] = useState("");
  return (<form className="flex flex-col gap-2"
    onSubmit={async (e) => { e.preventDefault();
      const { leagueId } = await join({ inviteToken: token, displayName: display });
      window.location.href = `/league/${leagueId}`; }}>
    <input className="border rounded px-3 py-2" placeholder="Your display name"
      value={display} onChange={(e) => setDisplay(e.target.value)} required />
    <button className="bg-black text-white rounded px-3 py-2">Join</button>
  </form>);
}
```

- [ ] **Step 4: League home — members, invite link, start draft, nav**

Create `app/league/[id]/page.tsx`:
```tsx
"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { use } from "react";
import Link from "next/link";

export default function LeagueHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const leagueId = id as Id<"leagues">;
  const league = useQuery(api.leagues.getLeague, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const startDraft = useMutation(api.draft.startDraft);
  if (!league) return <main className="p-6">Loading…</main>;
  const inviteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/join/${league.inviteToken}` : "";
  return (<main className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
    <h1 className="text-2xl font-bold">{league.name}</h1>
    <p className="text-sm">Invite link: <code className="bg-gray-100 px-1">{inviteUrl}</code></p>
    <section><h2 className="font-semibold">Members</h2>
      <ul>{members.map((m) => <li key={m._id}>{m.displayName} ({m.role})</li>)}</ul></section>
    <div className="flex gap-3">
      <Link className="underline text-blue-600" href={`/league/${id}/draft`}>Draft room</Link>
      <Link className="underline text-blue-600" href={`/league/${id}/leaderboard`}>Leaderboard</Link>
    </div>
    {!draft && (
      <button className="bg-black text-white rounded px-3 py-2 w-fit"
        onClick={() => startDraft({ leagueId, order: members.map((m) => m._id) })}>
        Start draft
      </button>)}
  </main>);
}
```

- [ ] **Step 5: Verify the flow boots**

Run: `npm run dev` (background). Visit `/`, send a magic link (check Resend dashboard/email), sign in, create a league, open league home, copy invite link. Stop the dev server.
Expected: league created, members list shows you as commissioner, invite link renders.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/join components/SignIn.tsx "app/league/[id]/page.tsx"
git commit -m "feat: auth gate, landing, join, and league home pages"
```

---

## Task 14: Frontend — live draft room

**Files:**
- Create: `app/league/[id]/draft/page.tsx`, `components/PlayerPool.tsx`, `components/PickFeed.tsx`

- [ ] **Step 1: Player pool component (search/filter, pick)**

Create `components/PlayerPool.tsx`:
```tsx
"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMemo, useState } from "react";

export function PlayerPool({ leagueId, myTurn }: { leagueId: Id<"leagues">; myTurn: boolean }) {
  const players = useQuery(api.players.listPlayers) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const makePick = useMutation(api.draft.makePick);
  const [q, setQ] = useState(""); const [pos, setPos] = useState("ALL");
  const takenIds = new Set(picks.map((p) => p.playerId));
  const filtered = useMemo(() => players.filter((p) =>
    !takenIds.has(p._id) &&
    (pos === "ALL" || p.position === pos) &&
    (q === "" || p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.country.toLowerCase().includes(q.toLowerCase()))).slice(0, 200),
    [players, picks, q, pos]);
  return (<div className="flex flex-col gap-2">
    <div className="flex gap-2">
      <input className="border rounded px-2 py-1 flex-1" placeholder="Search name or country"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="border rounded px-2 py-1" value={pos} onChange={(e) => setPos(e.target.value)}>
        {["ALL", "GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}
      </select>
    </div>
    <ul className="divide-y max-h-[60vh] overflow-auto border rounded">
      {filtered.map((p) => (
        <li key={p._id} className="flex justify-between items-center px-3 py-1">
          <span>{p.name} <span className="text-gray-500 text-sm">{p.position} · {p.country}</span></span>
          <button disabled={!myTurn}
            className="text-sm bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-30"
            onClick={() => makePick({ leagueId, playerId: p._id }).catch((e) => alert(e.message))}>
            Draft
          </button>
        </li>))}
    </ul>
  </div>);
}
```

- [ ] **Step 2: Pick feed component**

Create `components/PickFeed.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function PickFeed({ leagueId }: { leagueId: Id<"leagues"> }) {
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers) ?? [];
  const nameOf = (id: string) => members.find((m) => m._id === id)?.displayName ?? "?";
  const playerOf = (id: string) => players.find((p) => p._id === id)?.name ?? "?";
  return (<ol className="flex flex-col gap-1 text-sm">
    {[...picks].sort((a, b) => b.overall - a.overall).map((p) => (
      <li key={p._id}>#{p.overall + 1} {nameOf(p.membershipId)} → {playerOf(p.playerId)}</li>))}
  </ol>);
}
```

- [ ] **Step 3: Draft room page**

Create `app/league/[id]/draft/page.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { use } from "react";
import { PlayerPool } from "@/components/PlayerPool";
import { PickFeed } from "@/components/PickFeed";

export default function DraftRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const leagueId = id as Id<"leagues">;
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  // Determine "my membership" by matching the on-clock id against my membership.
  const myMembership = useQuery(api.leagues.listMyLeagues)?.find((l) => l.league?._id === leagueId)?.membership;
  const onClock = draft?.currentMembershipId;
  const myTurn = !!onClock && onClock === myMembership?._id && draft?.status === "active";
  const onClockName = members.find((m) => m._id === onClock)?.displayName;
  return (<main className="max-w-4xl mx-auto p-6">
    <h1 className="text-xl font-bold mb-2">Draft room</h1>
    {draft?.status === "complete"
      ? <p className="mb-3 font-semibold">Draft complete.</p>
      : <p className="mb-3">On the clock: <b>{onClockName ?? "—"}</b>{myTurn && " (you!)"}</p>}
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
      <PlayerPool leagueId={leagueId} myTurn={myTurn} />
      <div><h2 className="font-semibold mb-1">Picks</h2><PickFeed leagueId={leagueId} /></div>
    </div>
  </main>);
}
```

- [ ] **Step 4: Verify realtime with two browsers**

Run: `npm run dev`. Open the league in two browser profiles signed in as two members. Start the draft from the commissioner. Confirm: the on-clock indicator matches, only the on-clock user can draft, picks appear in both windows instantly, the order reverses each round, and a taken player can't be re-picked. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add "app/league/[id]/draft" components/PlayerPool.tsx components/PickFeed.tsx
git commit -m "feat: realtime draft room (player pool + pick feed)"
```

---

## Task 15: Frontend — leaderboard + manual-scoring fallback

**Files:**
- Create: `app/league/[id]/leaderboard/page.tsx`, `components/Standings.tsx`
- Modify: `convex/espn.ts` (add public manual-entry mutation)

- [ ] **Step 1: Manual-entry mutation (commissioner fallback)**

Append to `convex/espn.ts` (outside the `"use node"` action file is fine since mutations can live here; if the bundler complains about `"use node"`, move this mutation to `convex/standings.ts`):
```ts
import { mutation } from "./_generated/server";
import { requireMembership } from "./lib/membership";

export const manualStat = mutation({
  args: { leagueId: v.id("leagues"), espnPlayerId: v.number(), espnEventId: v.string(),
    goals: v.number(), assists: v.number(), cleanSheet: v.boolean(),
    minutes: v.number(), redCard: v.boolean() },
  handler: async (ctx, args) => {
    const m = await requireMembership(ctx, args.leagueId);
    if (m.role !== "commissioner") throw new Error("Only the commissioner can enter stats");
    const { leagueId, ...stat } = args;
    const existing = await ctx.db.query("playerMatchStats")
      .withIndex("by_event_player", (q) =>
        q.eq("espnEventId", stat.espnEventId).eq("espnPlayerId", stat.espnPlayerId)).unique();
    if (existing) await ctx.db.patch(existing._id, stat);
    else await ctx.db.insert("playerMatchStats", stat);
  },
});
```
(If `manualStat` cannot be in a `"use node"` file, place it in `convex/standings.ts` and import there instead.)

- [ ] **Step 2: Standings component**

Create `components/Standings.tsx`:
```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function Standings({ leagueId }: { leagueId: Id<"leagues"> }) {
  const rows = useQuery(api.standings.leagueStandings, { leagueId }) ?? [];
  return (<table className="w-full text-sm border">
    <thead><tr className="bg-gray-100 text-left"><th className="p-2">#</th>
      <th className="p-2">Member</th><th className="p-2">Points</th></tr></thead>
    <tbody>{rows.map((r, i) => (
      <tr key={r.membershipId} className="border-t">
        <td className="p-2">{i + 1}</td><td className="p-2">{r.displayName}</td>
        <td className="p-2 font-semibold">{r.points}</td></tr>))}
    </tbody></table>);
}
```

- [ ] **Step 3: Leaderboard page**

Create `app/league/[id]/leaderboard/page.tsx`:
```tsx
"use client";
import { Id } from "@/convex/_generated/dataModel";
import { use } from "react";
import { Standings } from "@/components/Standings";

export default function Leaderboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (<main className="max-w-2xl mx-auto p-6">
    <h1 className="text-xl font-bold mb-3">Leaderboard</h1>
    <Standings leagueId={id as Id<"leagues">} />
  </main>);
}
```

- [ ] **Step 4: Verify scoring renders**

Run: seed a stat via `npx convex run espn:manualStat '{...}'` for a drafted player's `espnPlayerId`, open the leaderboard, confirm the member's points update live without refresh.

- [ ] **Step 5: Commit**

```bash
git add "app/league/[id]/leaderboard" components/Standings.tsx convex/espn.ts convex/standings.ts
git commit -m "feat: live leaderboard + commissioner manual-scoring fallback"
```

---

## Task 16: Deploy to Vercel + Convex prod

**Files:** none (config/CLI)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all suites pass (parser, snake, scoring, membership, draft).

- [ ] **Step 2: Production build locally**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Deploy Convex to prod and capture URL**

Run: `npx convex deploy`
Expected: prints prod deployment URL. Set the same `AUTH_RESEND_KEY` and `SITE_URL` on the prod deployment (`npx convex env set ... --prod`).

- [ ] **Step 4: Deploy to Vercel**

Run: `npx vercel --prod` (set `NEXT_PUBLIC_CONVEX_URL` to the prod Convex URL and `CONVEX_DEPLOY_KEY` in Vercel project env; set Vercel build command to `npx convex deploy --cmd 'npm run build'`).
Expected: live URL.

- [ ] **Step 5: End-to-end smoke on the deployed URL**

Open the Vercel URL, sign in via magic link, create a league, open a second browser, join via invite link, run a 2-person draft, confirm leaderboard. Confirm a second league created by a different account is invisible to the first.

- [ ] **Step 6: Commit any config**

```bash
git add vercel.json .env.example
git commit -m "chore: production deploy config for Vercel + Convex"
```

---

## Self-review notes

- **Spec coverage:** live snake draft (T4,T10,T14), individual-player pool seeded from `test.html`
  (T2,T11), multi-tenant leagues + magic-link join (T6,T7,T9,T13), tenant isolation (T8), automatic
  ESPN scoring + reactive leaderboard (T5,T12,T15), manual fallback (T15), deploy (T16). All covered.
- **Placeholders:** none — every code step contains full code. The two ESPN-shape caveats (summary
  keys, `"use node"` mutation placement) are explicit, with concrete fallback instructions, not TBDs.
- **Type consistency:** `ScoringRules`/`Stat`/`Position` (T5) reused in T12/T15; `membershipForPick`
  /`isDraftComplete` (T4) reused in T10; `requireMembership` (T8) reused in T9/T10/T12/T15;
  `scoringRules` object shape matches between `schema.ts` (T3), `DEFAULT_SCORING` (T5), and usage.
```
