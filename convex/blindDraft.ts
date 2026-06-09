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
