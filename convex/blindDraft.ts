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
