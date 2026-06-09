# Blind-Collision Draft Mode — Design Spec

**Original design:** 2026-06-08 · **Revised (implementation-ready v1):** 2026-06-09
**Status:** approved (v1) · **Relates to:** `2026-06-08-worldcup-draft-design.md`,
`2026-06-08-draft-enhancements.md`

> **v1 revision note.** The original design predated the shipped snake core +
> enhancements (pick clock, autopick, queue; `drafts.status = lobby|active|complete`;
> shared `picks` requiring non-optional `round`+`overall`; one-draft-per-league via
> `getDraft().unique()`). This revision reconciles the design with that live core and
> locks the decisions the original left open. **v1 deliberately omits the auto-deadline
> timer** (see Scope) to remove the hardest concurrency surface; it is a clean later
> add-on.

## Purpose

Add a second, optional draft mode to the World Cup 2026 draft app. Alongside the existing
**snake draft**, a commissioner can choose a **blind-collision draft**: each round every
manager *secretly* picks several players at once; everyone reveals simultaneously; any
player chosen by two or more managers is **wiped out** — nobody gets him. It turns the
draft from a strategy exercise into a bluffing / game-theory game (grab the superstar
everyone wants and risk losing him, or take a safe pick nobody else is eyeing).

The mode is **selectable per draft** — the commissioner picks `snake` or `blind` when
starting the draft. Snake remains the default and is unchanged.

Success criteria:
- A commissioner can choose `blind` mode and set picks-per-round (X) and rounds (R).
- Members privately select up to X distinct players per round and lock in; opponents
  cannot see the selections until reveal.
- On reveal, single-picked players join the picker's roster; players picked by 2+ managers
  are destroyed for the whole league. Burned managers are simply a player short that round.
- Surviving rosters feed the **same** scoring/leaderboard as snake mode with no changes.

## Constraints & decisions

- **One app, two pluggable engines.** Everything below the draft engine — player pool,
  rosters (`picks`), ESPN scoring, leaderboard, auth, leagues, memberships — is **shared
  and unchanged**. Only the draft engine and the draft-room screen differ by mode.
- **Snake's `convex/draft.ts` is not touched.** Blind is built in new files; the draft
  room page branches on `draft.mode`.
- **One draft per league.** `drafts` is one-per-league (`getDraft().unique()`). `mode` is
  chosen at draft start and stored on that single draft row. Reused table, not a separate
  `blindDrafts` table, so existing `getDraft`/lookups work unchanged.
- **Blindness is server-enforced.** The round query never returns *other* managers'
  selections while `roundState = "selecting"`. Opponents literally cannot see your picks in
  the payload.
- **Reveal is held, commissioner-advanced.** After resolve, `roundState` stays
  `"revealing"` so everyone sees the carnage; the commissioner clicks **Next round** to
  return to `"selecting"`. No auto-advance timer.
- **Reveal trigger (v1).** A round reveals when **all participants lock in**, OR the
  commissioner clicks **Force reveal** (force-locks everyone's current partial selection
  as-is, including empty). No scheduled deadline.
- **Collisions cost headcount.** A wiped player is gone and the colliding managers get no
  replacement that round (max roster = X × R; actual may be less). Intentional.
- **No turn order.** Picks are simultaneous; snake's reversing turn order is irrelevant.
  `drafts.order` is reused purely as the list of participating memberships (order ignored).
- **Distinct picks.** Within a manager's selection, players must be distinct (no self-dupes).
- **Locked selections are final.** No unlock after lock-in in v1.
- **Build sequencing.** Snake shipped first (core + enhancements 17–22, on `main`). Blind is
  built second on top of the shared core.

## Architecture

```
League → Draft (mode: "snake" | "blind")
                 │
        ┌────────┴────────┐
   snake engine      blind engine     ← only this layer differs by mode
   (draft.ts)        (blindDraft.ts + lib/blindResolve.ts)
        └────────┬────────┘
                 ▼
   picks → rosters → scoring → leaderboard   ← identical for both modes
```

```
convex/
  lib/blindResolve.ts   NEW — pure resolveRound() (no I/O), unit-tested
  blindDraft.ts         NEW — mutations + queries (thin Convex layer)
  schema.ts             MODIFY — drafts +blind fields; +blindSelections, +draftWipes
components/
  BlindDraftRoom.tsx    NEW — selecting / revealing / complete views (+ small children)
app/league/[id]/draft/page.tsx   MODIFY — branch on draft.mode → Blind vs Snake room
app/league/[id]/<start-draft UI> MODIFY — Snake/Blind toggle + X/R inputs (blind)
```

## Data model (additions only)

Snake's tables (`leagues`, `memberships`, `picks`, `draftQueues`) are unchanged. The
shared `picks` table is reused for surviving blind picks, so scoring and the leaderboard
are mode-agnostic.

`drafts` gains optional fields (snake rows leave them null; absent `mode` ⇒ snake):

```
mode:          v.optional("snake" | "blind")
picksPerRound: v.optional(number)   // X (blind only)
rounds:        v.optional(number)   // R (blind only)
currentRound:  v.optional(number)   // 0-based (blind only)
roundState:    v.optional("selecting" | "revealing" | "complete")  // blind only
```
(The existing required `round`/`pickIndex` fields are set to 0 on blind drafts and unused.
The snake-only `currentMembershipId`/clock fields stay null on blind rows.)

Two new tables:

```
blindSelections   leagueId, draftId, round, membershipId,
                  playerIds: Id<"players">[]   ← this manager's ≤ X picks, autosaved
                  lockedIn: boolean             ← hidden from others until reveal
   .index("by_draft_round", ["draftId", "round"])
   .index("by_draft_round_membership", ["draftId", "round", "membershipId"])

draftWipes        leagueId, draftId, round, playerId
                  ← the "graveyard": players destroyed by collisions
   .index("by_league", ["leagueId"])   ← powers availability
   .index("by_draft", ["draftId"])
```

- **Surviving picks** land in the shared `picks` table: `round = currentRound`,
  `overall =` a synthetic monotonic value (count of league picks at insert time). **No
  schema change to `picks`.**
- **Availability for a league** = global `players` pool − this league's `picks` − this
  league's `draftWipes`.

## Round lifecycle (state machine)

`status: "active"` throughout the draft; `roundState` drives the within-round phase:

```
selecting ──(all participants locked-in  OR  commissioner Force-reveal)──▶ revealing
revealing ──(commissioner Next round)──▶ selecting        (while currentRound < R-1)
                                       └▶ roundState = "complete", status = "complete"
                                          (after round R)
```

For each of R rounds:

1. **selecting** — every manager privately toggles up to X distinct *available* players.
   Selections autosave on every toggle (disconnect-safe). Then **Lock In**.
2. **revealing** — entered when all participants are locked, or the commissioner clicks
   **Force reveal** (force-locks everyone's current partial as-is). `resolveRound` runs;
   picks + wipes are written; the reveal is **held** for all to see.
3. **resolve** — count each `playerId` across all locked selections for the round:
   - count **== 1** → player added to that manager's roster (`picks`).
   - count **>= 2** → player **wiped** (`draftWipes`); nobody gets him; removed from the
     pool for all future rounds.
4. **Next round** (commissioner) → `currentRound++`, back to `selecting`; after round R,
   `roundState`/`status` = `complete`.

**Idempotency (the sole guard):** resolve runs only when `roundState === "selecting"`,
then flips it. Because Convex serializes mutations with OCC retries, two concurrent
last-lock-ins cannot double-resolve — the retried one re-reads `roundState` as `revealing`
and no-ops. Removing the auto-deadline timer means this single guard is sufficient.

### Worked example (X = 3, round 1)

```
Alice:  Mbappé, Bellingham, Saka
Bob:    Mbappé, Pedri,      Rúben Dias
Cara:   Haaland, Pedri,     Saka

Mbappé     → Alice & Bob   → WIPED
Pedri      → Bob & Cara    → WIPED
Saka       → Alice & Cara  → WIPED
Bellingham → Alice only    → Alice ✓
Haaland    → Cara only     → Cara ✓
Rúben Dias → Bob only      → Bob ✓

After round 1: Alice 1, Bob 1, Cara 1 (each wanted 3; collisions cost the rest)
```

## Units (each independently testable)

1. **`resolveRound(selections, X) → { assignments, wiped }`** — pure function.
   Input: `Map<membershipId, playerId[]>` for the round. Output: `assignments`
   (`{membershipId, playerId}[]`, count == 1) and `wiped` (`playerId[]`, count ≥ 2). No
   I/O; the core of the engine, trivially unit-tested.
2. **Blind draft mutations** (`convex/blindDraft.ts`):
   - `startBlindDraft(leagueId, order, picksPerRound = 3, rounds = 5)` — commissioner only;
     no existing draft; creates blind draft at `currentRound: 0`, `roundState: "selecting"`.
   - `setSelection(leagueId, playerIds)` — autosave; validates distinct + available +
     count ≤ X; rejects after lock-in or wrong state.
   - `lockIn(leagueId)` — requires 1..X selections; sets `lockedIn`; if all participants
     are now locked, runs resolve.
   - `forceReveal(leagueId)` — commissioner only; force-locks every member's current
     partial (incl. empty), then runs resolve.
   - `nextRound(leagueId)` — commissioner only; `revealing → selecting` (or `complete`
     after round R).
   - (internal `resolve` helper — guarded by `roundState === "selecting"`; calls
     `resolveRound`, writes `picks` + `draftWipes`, sets `roundState = "revealing"`.)
3. **Availability query** (`availablePlayers(leagueId)`) — global pool minus this league's
   picks minus wipes; reactive; shaped to reuse the existing player-filter UI
   (`filterPlayers`/`distinct`).
4. **Blind round query** (`blindRoundState(leagueId)`) — returns round number, state, X, R,
   **who** is locked (not what), and **my own** current selection. Only once `revealing`
   does it return every manager's selections + the resolution result. Server-side gate
   enforces blindness.
5. **Draft room UI** (`components/BlindDraftRoom.tsx`, mounted when `draft.mode === "blind"`)
   — player grid with search + position/country/club filters (reused) over
   `availablePlayers`, select up to X, **Lock In**, a status bar (✓ locked / picking… per
   member), commissioner **Force reveal** (selecting) / **Next round** (revealing), and a
   reveal view (collisions strike through into a graveyard; survivors animate to rosters).

## Error handling

- **Out-of-spec selection:** `setSelection` rejects duplicates within a manager's own list,
  more than X players, already-drafted/wiped/nonexistent players, selections after lock-in,
  and any call when `roundState !== "selecting"` or the draft is not blind.
- **Lock-in:** rejects fewer than 1 selection or a second lock-in; `forceReveal` may lock
  empties.
- **Idempotent resolve:** guarded on `roundState`; concurrent last-lock-ins can't
  double-resolve.
- **Disconnect:** selections persist server-side on every toggle; reconnect resumes
  mid-round.
- **Pool exhaustion:** with 1246 players this is a non-issue; availability naturally caps a
  round to the players that remain.
- **Isolation:** all blind functions go through `requireMembership(ctx, leagueId)`;
  selections and wipes are league + draft scoped.

## Testing / verification

- **Unit (`resolveRound`):** the worked example; all-collide (everyone wiped); none-collide
  (everyone drafted); mixed; distinct/count validation; partial (< X) and empty selections.
- **Integration (convex-test):** `startBlindDraft`; `setSelection` autosave + validation;
  **blindness** (member B cannot see A's picks during `selecting` via `blindRoundState`);
  all-locked auto-reveal resolves correctly; `forceReveal` locks partials + resolves;
  survivors land in `picks` and wiped land in `draftWipes` + disappear from
  `availablePlayers` next round; `nextRound` advances and completes at round R;
  **idempotency** (double/concurrent lock-in does not double-resolve); **isolation** (a
  second league is unaffected); **mode-agnostic scoring** (a blind roster scores and ranks
  identically to a snake roster).

## Scope discipline (YAGNI) — deferred from v1

- **No auto-deadline timer** (no `roundDeadline`, no scheduled `resolveDeadline`). Reveal is
  all-locked or commissioner Force-reveal. The timer is a clean later add-on (adds a
  `roundDeadline` field + one scheduled job, reusing the same `roundState` idempotency
  guard).
- No random auto-fill on reveal (partials lock as-is). No re-pick / backup-list fallback for
  collisions (burned = down a player). No per-pick collision sub-rounds. No mode-switching
  mid-draft. No unlock after lock-in. Snake remains the default; blind is purely additive.

## Confirmed at implementation (was "to confirm")

- Default `picksPerRound` X = 3 and `rounds` R = 5, surfaced as commissioner inputs on the
  blind start-draft form. ✔
- Round timer: **omitted in v1** (commissioner Force-reveal instead). ✔
- Reveal advance: **held on `revealing`; commissioner clicks Next round.** ✔
- Graveyard UI prominence (full panel vs inline strike-through) — cosmetic, decided during
  build.
