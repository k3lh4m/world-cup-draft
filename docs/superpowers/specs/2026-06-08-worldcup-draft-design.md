# World Cup 2026 Draft — Design Spec

**Date:** 2026-06-08 · **Target ship:** Saturday 2026-06-13 (WC opening weekend) · **Status:** approved

## Purpose

A multi-tenant web app where independent friend groups ("leagues") run a **live snake draft of
individual players** from the 48 World Cup 2026 squads, then earn points **automatically** from
real match performance (goals / assists / clean sheets). Built by Claude; used by humans.

Success criteria for Saturday:
- A commissioner can create a league and invite friends by a magic link.
- 4–12 members join, set draft order, and complete a live snake draft where every pick appears
  in every member's browser in real time.
- Once matches play, a leaderboard updates automatically from real stats with no manual entry
  (manual entry exists only as a fallback).

## Constraints & decisions

- **Frontend:** Next.js 16 (App Router, TS) on Vercel.
- **Backend/realtime:** Convex, living in `convex/` inside the single Next app (no Turborepo).
- **Auth:** Convex Auth, **magic-link (email)** via Resend — required because people sign up to
  join a specific league.
- **UI:** Tailwind + shadcn/ui.
- **Data source:** ESPN. The full "all 48 squads" article is saved at **`app/test.html`** (verified
  48 teams, groups A–L; per-player name/position/club/group/team-id and an **ESPN player-id** for
  ~75% of players, plus logos and managers). ESPN's free, no-key JSON API
  (`site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/...`) serves live scores and per-player
  match stats keyed by the **same** player ids → one ecosystem, no name-matching, no key, no cost.
  Manual entry is the fallback if the unofficial API misbehaves.

## Architecture

```
test.html ──(one-time seed)──▶ Convex `players` (global pool, shared by all leagues)
ESPN JSON API ──(Convex cron ~60s during match windows)──▶ Convex `playerMatchStats`
                                                                       │
League (tenant) ─ memberships ─ draft (snake state) ─ picks ─▶ rosters │
                                                                       ▼
                                       scoring engine joins picks ↔ playerMatchStats ↔ scoringRules
                                                                       │
                              Next.js (reactive useQuery) renders draft room + live leaderboard
```

Why this shape: Convex reactive queries push each pick to all subscribers with no websocket code —
ideal for a live snake draft. A **single** central poller writes match stats to Convex and every
league reads from Convex, so multi-tenancy never multiplies external API load.

## Units (each independently testable)

1. **Squad parser** (`scripts/parseEspnSquads.ts`) — pure function: ESPN HTML string → array of
   `{group, team, espnTeamId, logo, manager, players:[{name,pos,club,espnId?}]}`. No I/O; unit-tested
   against `test.html`. Dedupes, normalizes accents, asserts 26/team (logs mismatches).
2. **Seeder** (`convex/seed.ts`) — takes parser output, backfills missing `espnPlayerId` from ESPN's
   per-team roster endpoint by normalized-name match, idempotent-upserts into `players`.
3. **Tenant/auth layer** (`convex/leagues.ts`, `convex/auth.ts`) — magic-link auth; `createLeague`,
   `joinLeague(token)`; a single `requireMembership(ctx, leagueId)` helper that every tenant-scoped
   function calls so isolation lives in one place.
4. **Draft engine** (`convex/draft.ts`) — pure-ish state machine: `startDraft`, `makePick(playerId)`
   validates turn + availability, records the pick, advances **snake** order, completes at
   `rounds × members`. All turn logic server-side; clients only subscribe.
5. **Scoring** (`convex/espn.ts`, `convex/crons.ts`, `leagueStandings` query) — poller upserts
   `playerMatchStats`; `leagueStandings(leagueId)` joins a league's picks → stats → `scoringRules`
   and returns ranked members + per-player breakdown. Reactive.
6. **Frontend** (`app/` routes) — `/` (your leagues / create), `/join/[token]`,
   `/league/[id]` (home), `/league/[id]/draft` (live room), `/league/[id]/leaderboard`.

## Data model (Convex)

Global: `players` (name, normalizedName, position, club, country, espnTeamId, espnPlayerId?, group),
`matches` (espnEventId, date, teams, status), `playerMatchStats` (espnPlayerId, espnEventId, goals,
assists, cleanSheet, minutes, redCard; idempotent upsert, indexed by espnPlayerId).

Tenant-scoped: `leagues` (name, commissionerUserId, inviteToken, rosterSize, scoringRules, createdAt),
`memberships` (leagueId, userId, displayName, draftOrder, role), `drafts` (leagueId, status, round,
pickIndex, currentMembershipId, order[], pickClockSeconds?), `picks` (leagueId, draftId, membershipId,
playerId, round, overall; unique guard so a player can't be taken twice **within a league**).

## Error handling

- **Parser:** any team ≠ 26 players is logged with team name (not a hard failure — a few ESPN source
  glitches are known: Tunisia double-entry, Egypt 4 GKs); accents normalized for matching.
- **Draft:** `makePick` rejects out-of-turn picks and already-taken players with explicit errors;
  the client surfaces them inline. Snake/turn state is authoritative on the server.
- **Scoring poller:** wraps ESPN calls in try/catch, logs and skips on failure (never throws into
  cron); upserts are idempotent so retries are safe. Commissioner has a manual-entry fallback.
- **Isolation:** `requireMembership` throws if the caller isn't a member of the target league.

## Testing / verification

- **Parser:** unit test against `test.html` → 48 teams, ~1248 players, per-team counts logged;
  spot-check accents (e.g. "Vinícius Júnior", "Gvardiol").
- **Draft realtime:** two browser sessions, one league — picks appear instantly in both; snake order
  reverses each round; taken player rejected; a second league is fully isolated.
- **Scoring:** point poller at a finished group-stage fixture → goals/assists land in
  `playerMatchStats`; `leagueStandings` ranks correctly; leaderboard updates without refresh.
- **Deploy:** Vercel preview + `npx convex deploy`; magic-link sign-up works end-to-end on the URL.

## Scope discipline (YAGNI for Saturday)

One draft per league; email magic-link only (no Google); no trades/waivers; manual-scoring fallback
button for the commissioner.

## To confirm at implementation

- **Scoring defaults** (tunable per league): goal +5, assist +3, clean sheet (GK/DEF) +4,
  appearance +1, red card −2.
- **Resend API key** for magic-link email (free tier fine).
- Live-scoring source = ESPN free API (ids match the seed); API-Football free tier is the
  documented-API alternative if preferred (would need a name/id cross-map).

## Current state

Next.js 16 + Tailwind app scaffolded in `app/` (initial commit `ecaf894`). `test.html` present.
No Convex/auth/draft code yet.
