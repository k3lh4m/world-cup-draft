# Blind-Collision Draft Mode — Design Spec

**Date:** 2026-06-08 · **Status:** approved (design) · **Relates to:** `2026-06-08-worldcup-draft-design.md`

## Purpose

Add a second, optional draft mode to the World Cup 2026 draft app. Alongside the existing
**snake draft**, a commissioner can choose a **blind-collision draft**: each round every
manager *secretly* picks several players at once; everyone reveals simultaneously; any player
chosen by two or more managers is **wiped out** — nobody gets him. It turns the draft from a
strategy exercise into a bluffing / game-theory game (grab the superstar everyone wants and risk
losing him, or take a safe pick nobody else is eyeing).

The mode is **selectable per draft** — the commissioner picks `snake` or `blind` when starting
the draft. Snake remains the default and is unchanged.

Success criteria:
- A commissioner can choose `blind` mode and set picks-per-round (X) and rounds (R).
- Members privately select X distinct players per round and lock in; opponents cannot see the
  selections until reveal.
- On reveal, single-picked players join the picker's roster; players picked by 2+ managers are
  destroyed for the whole league. Burned managers are simply a player short that round.
- Surviving rosters feed the **same** scoring/leaderboard as snake mode with no changes.

## Constraints & decisions

- **One app, two pluggable engines.** Everything below the draft engine — player pool, rosters
  (`picks`), ESPN scoring, leaderboard, auth, leagues, memberships — is **shared and unchanged**.
  Only the draft engine and the draft-room screen differ by mode.
- **Blindness is server-enforced.** Convex queries run on the server; the round query never
  returns *other* managers' selections while `roundState = "selecting"`. Opponents literally
  cannot see your picks in the payload.
- **Collisions cost headcount.** A wiped player is gone and the colliding managers get no
  replacement that round (max roster = X × R; actual may be less). This is intentional.
- **No turn order.** Because picks are simultaneous, snake's reversing turn order is irrelevant
  in blind mode. The "snake" label does not apply; this is a pure simultaneous/blind draft.
- **Distinct picks.** Within a single manager's X selections, players must be distinct (no
  self-dupes).
- **Build sequencing.** Snake ships first (already specced + planned, Tasks 6–16). Blind mode is
  built second on top of the shared core, so a working app ships even if blind runs tight against
  the 2026-06-13 deadline.

## Architecture

```
League → Draft (mode: "snake" | "blind")
                 │
        ┌────────┴────────┐
   snake engine      blind engine     ← only this layer differs by mode
        └────────┬────────┘
                 ▼
   picks → rosters → scoring → leaderboard   ← identical for both modes
```

## Round lifecycle (blind mode)

**Setup (commissioner):** chooses `picksPerRound` (X, default 3) and `rounds` (R, default 5).

For each of R rounds:

1. **selecting** — every manager privately selects exactly X distinct *available* players and
   locks in. Selections autosave on every toggle (disconnect-safe). A round timer
   (`roundDeadline`) auto-locks anyone still picking.
2. **revealing** — triggered when all managers have locked in *or* the deadline fires. All
   selections flip face-up at once.
3. **resolve** — count each `playerId` across all locked selections for the round:
   - count **== 1** → player is added to that manager's roster (`picks`).
   - count **>= 2** → player is **wiped** (`draftWipes`); nobody gets him; removed from the pool
     for all future rounds.
4. Advance `currentRound`; back to **selecting** until R rounds complete, then `roundState =
   "complete"`.

**Deadline behaviour:** if a manager is short of X at lock time, their **partial selection is
locked as-is** (no random auto-fill) — "you snooze you lose."

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

## Data model (additions only)

Snake's tables (`leagues`, `memberships`, `drafts`, `picks`) are unchanged. Blind mode adds:

```
drafts            + mode: "snake" | "blind"
                  + (blind only) picksPerRound, rounds, currentRound,
                    roundState: "selecting" | "revealing" | "complete",
                    roundDeadline?: number

blindSelections   leagueId, draftId, round, membershipId,
                  playerIds: number[]   ← this manager's X picks, autosaved as they toggle
                  lockedIn: boolean      ← hidden from other managers until reveal
                  (index by draftId+round; uniqueness per membership+round)

draftWipes        leagueId, draftId, round, playerId
                  ← the "graveyard": players destroyed by collisions
```

- Surviving picks land in the **shared `picks`/roster table** snake already uses, so scoring and
  the leaderboard are mode-agnostic.
- **Availability for a league** = global `players` pool − this league's drafted picks − this
  league's `draftWipes`.

## Units (each independently testable)

1. **`resolveRound(selections) → { assignments, wiped }`** — pure function. Input: map of
   membershipId → playerIds[] for the round. Output: per-player assignment (count 1) and wiped
   set (count ≥ 2). No I/O; the core of the engine and trivially unit-tested.
2. **Blind draft mutations** (`convex/blindDraft.ts`) — `startBlindDraft(X, R)`,
   `setSelection(playerIds)` (autosave, validates distinct + available + count ≤ X),
   `lockIn()` (sets `lockedIn`, then triggers reveal if all locked), and a scheduled
   `resolveDeadline()` via `ctx.scheduler.runAfter(roundDeadline)`. On reveal, calls
   `resolveRound`, writes `picks` + `draftWipes`, advances the round.
3. **Availability query** (`availablePlayers(leagueId)`) — global pool minus drafted minus wiped;
   reactive, shared shape with snake's board.
4. **Blind round query** (`blindRoundState(leagueId)`) — returns round number, state, deadline,
   *who* is locked (not what), and — only once `revealing` — every manager's selections + the
   resolution result. Server-side gate enforces blindness.
5. **Draft room UI** (`/league/[id]/draft`, blind variant) — player grid with search + team/
   position filters, select up to X, **Lock In**, a status bar (✓ locked / picking… + countdown),
   and a reveal animation (collisions strike through into a graveyard; survivors animate to
   rosters).

## Error handling

- **Out-of-spec selection:** `setSelection` rejects duplicates within a manager's own list, more
  than X players, already-drafted/wiped players, and selections after the manager has locked in.
- **Deadline:** `resolveDeadline` is idempotent — if all managers lock in first, the scheduled
  resolve becomes a no-op (guard on `roundState`). Partial selections lock as-is.
- **Disconnect:** selections persist server-side on every toggle; reconnect resumes mid-round.
- **Pool exhaustion:** with 1246 players this is a non-issue, but resolve/availability guard the
  edge where fewer than X distinct players remain (cap the round's required picks to what's left).
- **Isolation:** all blind functions go through the existing `requireMembership(ctx, leagueId)`;
  selections and wipes are league-scoped.

## Testing / verification

- **Unit (`resolveRound`):** the worked example; all-collide (everyone wiped, nobody drafted);
  none-collide (everyone drafted); mixed; distinct/count validation.
- **Realtime:** 3 browser sessions in one blind league — selections stay hidden during
  `selecting`; reveal shows correct assignments + wipes; wiped players gone from the pool next
  round; rosters update live; a second league stays isolated.
- **Deadline:** a manager who never locks in is auto-locked with their partial selection when the
  timer fires; resolve still runs correctly.
- **Mode-agnostic scoring:** a roster produced by blind mode scores and ranks identically to a
  snake roster (leaderboard unchanged).

## Scope discipline (YAGNI)

No random auto-fill on timeout (lock partial as-is). No re-pick / backup-list fallback for
collisions (burned = down a player). No per-pick collision sub-rounds. No mode-switching
mid-draft. Snake remains the default; blind is purely additive.

## To confirm at implementation

- Default `picksPerRound` (X = 3) and `rounds` (R = 5) — surfaced as commissioner inputs.
- Round timer length (`roundDeadline`) default and whether it's commissioner-configurable.
- Graveyard UI prominence (full panel vs. inline strike-through) — cosmetic, decide during build.
