# Multi-Tenant Leagues & League Admin — Design Spec

**Date:** 2026-06-08 · **Parent spec:** `2026-06-08-worldcup-draft-design.md` · **Status:** approved

## Purpose

Let independent friend groups each create and run their own World Cup draft "league" as a
self-contained tenant. The person who creates a league is its **admin**. This spec defines the
tenancy model, the identity/auth approach, and the admin's powers — the layer marked
"Next (not started)" in the parent spec.

This spec **supersedes the tenant/auth decisions** in the parent spec's "Tenant/auth layer" unit
and "Auth" constraint: we are **not** using Convex Auth magic-link. Identity is **siloed per league**
with **name-only joins + an admin secret link** (decisions below).

## Decisions (locked)

- **Identity is siloed per league.** No global user/account table. Each league is a fully isolated
  world. There is intentionally no cross-league "my leagues" page.
- **Members join name-only.** An invitee clicks the invite link, picks a display name, and is in —
  no email, no password.
- **Admin is proved by a secret link.** League creation mints a private admin link; holding it (or
  being the admin membership) is the only proof of admin.
- **Admin powers in scope:** league setup, manage members & draft order, run the draft.
  **Out of scope here:** manual scoring fallback (remains a separate, deferred concern).

## Approach (chosen: A — opaque token-per-identity)

Each league carries its own random `inviteToken` and `adminToken`; each membership carries its own
random `memberToken`. Tokens are opaque, `crypto`-grade random strings stored in the browser
(`localStorage`, keyed by league id) and looked up via dedicated indexes — never scanned. Every
tenant-scoped Convex function takes a token and runs through a single authorization helper, so
isolation and auth live in exactly one auditable place.

Rejected alternatives: **B** (human-friendly join code + admin PIN) — guessable PIN, code collisions,
weaker isolation; could be layered on later as a code that maps to `inviteToken`. **C** (Convex Auth
magic-link) — most robust but contradicts the siloed + name-only decisions and is the most to build
before the Saturday deadline.

## Data model (Convex)

Global tables (`players`, `matches`, `playerMatchStats`) are unchanged. New/changed tables:

```ts
leagues: defineTable({
  name: v.string(),
  inviteToken: v.string(),        // random; shareable join secret
  adminToken: v.string(),         // random; the admin credential
  rosterSize: v.number(),         // rounds = rosterSize
  scoringRules: v.object({        // editable until draft starts
    goal: v.number(), assist: v.number(),
    cleanSheet: v.number(), appearance: v.number(), redCard: v.number(),
  }),
  status: v.union(v.literal("setup"), v.literal("drafting"), v.literal("done")),
  createdAt: v.number(),
}).index("by_inviteToken", ["inviteToken"])
  .index("by_adminToken", ["adminToken"]),

memberships: defineTable({
  leagueId: v.id("leagues"),
  displayName: v.string(),
  memberToken: v.string(),        // random; this person's seat credential
  isAdmin: v.boolean(),           // the creator's membership = true
  draftOrder: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_league", ["leagueId"])
  .index("by_memberToken", ["memberToken"]),
```

The `drafts` / `picks` tables arrive with the draft-engine work (parent spec). This design's
requirement on them: every row is keyed by `leagueId` and every accessor is gated by the token
helpers below.

Notes:
- The **creator gets membership #1 with `isAdmin: true`**, *and* the league stores a separate
  `adminToken`. Admin power is therefore provable two ways — holding the admin link, or being the
  admin membership. The admin link is the recovery path if the browser-stored member token is lost.
- `scoringRules` lives on the league so it is editable in `setup` and frozen once `drafting`.

## Authorization — one chokepoint

Every tenant-scoped function takes a `token` arg and begins with one helper. No function reads or
writes league data without going through one of these:

```ts
// Resolves a member token → membership; asserts it belongs to this league. Throws otherwise.
requireMember(ctx, leagueId, token) → membership

// Asserts caller is admin: token matches league.adminToken
// OR resolves to a membership with isAdmin: true. Throws otherwise.
requireAdmin(ctx, leagueId, token) → league
```

A wrong/foreign/absent token throws a single generic `"not authorized"` error — no leak about
whether a league exists.

## Secret lifecycle

| Action | Who | Flow |
|---|---|---|
| `createLeague(name, rosterSize, scoringRules)` | anyone | mints `inviteToken` + `adminToken`; creates league (`status: setup`) + admin membership; returns `{ leagueId, adminToken, memberToken }`. Client stores both. |
| `joinLeague(inviteToken, displayName)` | invitee | resolves invite token → league; rejects if `status !== setup`; creates membership; mints `memberToken`; returns it. Client stores it. |
| admin / member actions | per role | pass the stored token; `requireAdmin` / `requireMember` gate it. |

## Admin powers → mutations

- **League setup** — `updateLeagueSettings(name, rosterSize, scoringRules)`. `requireAdmin` +
  asserts `status === "setup"` so rules can't change mid-draft.
- **Manage members & draft order** — `removeMember`, `renameMember`, `setDraftOrder(order[])`,
  `randomizeDraftOrder`. All `requireAdmin`, all `setup`-only.
- **Run the draft** — `startDraft` (locks settings → `drafting`), `pauseDraft` / `resumeDraft`,
  `undoLastPick`, `pickForMember(membershipId, playerId)`. `requireAdmin`; the turn/snake logic
  itself stays in the draft engine (parent spec).

## Routing

All league state lives behind a URL + a stored token; there is no global "my leagues" page by design.

| Route | Purpose |
|---|---|
| `/` | Create-a-league form. On success → league home, shows shareable invite link. |
| `/league/[id]?admin=<adminToken>` | First visit consumes the query param, stores `adminToken` in `localStorage`, strips it from the URL. Later visits read from storage. |
| `/join/[inviteToken]` | Enter display name → join. Stores `memberToken`. Rejects gracefully if draft already started. |
| `/league/[id]` | League home: members list, settings, invite link. Admin sees setup/management controls; members read-only. |
| `/league/[id]/draft` · `/league/[id]/leaderboard` | (Draft-engine work) — both call `requireMember`. |

## Error handling

- Unknown/foreign token → single generic `"not authorized"` (no existence leak).
- `joinLeague` when `status !== "setup"` → friendly "this draft has already started."
- Admin mutations assert `status === "setup"` where settings/order must be frozen; mid-draft admin
  actions (pause/undo/pick-for) are explicitly allowed in `drafting`.
- Token minting uses `crypto`-grade randomness; lookups are indexed, never scanned.
- The admin link is sensitive — the create screen labels it "keep this private; it's your admin key."

## Browser-stored credentials

`memberToken` (always) and `adminToken` (creator only) are kept in `localStorage`, keyed by league
id, so a reload keeps your seat. Clearing the browser loses the seat — the admin recovers via their
admin link; a member would need a fresh invite (acceptable for Saturday; no recovery email by design).

## Testing / verification

- **Unit (Convex):** `requireMember`/`requireAdmin` accept correct tokens, reject foreign/absent
  ones; `joinLeague` rejects post-setup; `updateLeagueSettings` rejects in `drafting`.
- **Isolation:** a member token from league X cannot read or mutate league Y — the core multi-tenant
  guarantee.
- **Two-browser:** create league (browser 1 = admin) → join via invite (browser 2 = member); admin
  sees controls, member doesn't; randomize order reflects in both; `startDraft` freezes settings.
- **Recovery:** clear browser 1's storage → re-visit admin link → admin powers restored.

## Known risks (accepted for MVP, revisit post-Saturday)

Tokens (`adminToken`, `inviteToken`, `memberToken`) are **bearer secrets with no expiry,
rotation, or revocation**. Accepted for a trusted friend group at launch, but:

- A leaked admin link is a silent, permanent league takeover with no way to rotate the key or
  lock the holder out. Admin links leak easily (browser history, shared-screen shoulder-surfing,
  chat paste, `Referer` headers).
- Name-only joins mean the legitimate admin can't be re-proven, so there is no recovery story.
- The invite link is reusable, so anyone holding it can keep filling seats.

**Post-MVP mitigations** (cheapest first): `rotateAdminToken` / `rotateInviteToken` mutations to
invalidate a leaked link; cap memberships at `rosterSize` and/or make invites single-use-per-seat;
consume the admin token into an httpOnly cookie instead of URL/`localStorage`. Add rotation before
the `drafts`/`picks` tables harden, since retrofitting revocation later is the expensive path.

## Scope discipline (YAGNI for Saturday)

No global accounts; no email/magic-link; no member self-recovery; no manual-scoring admin power; no
human-friendly join codes (token links only). One admin per league (the creator).
