import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { removeFromQueue } from "./lib/queue";

export const getMyQueue = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const membership = await requireMembership(ctx, leagueId);
    const row = await ctx.db
      .query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", leagueId).eq("membershipId", membership._id),
      )
      .unique();
    return row?.playerIds ?? [];
  },
});

export const setQueue = mutation({
  args: { leagueId: v.id("leagues"), playerIds: v.array(v.id("players")) },
  handler: async (ctx, { leagueId, playerIds }) => {
    const membership = await requireMembership(ctx, leagueId);
    const row = await ctx.db
      .query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", leagueId).eq("membershipId", membership._id),
      )
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { playerIds });
    } else {
      await ctx.db.insert("draftQueues", {
        leagueId,
        membershipId: membership._id,
        playerIds,
      });
    }
  },
});

export const addToQueue = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const membership = await requireMembership(ctx, leagueId);
    const row = await ctx.db
      .query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", leagueId).eq("membershipId", membership._id),
      )
      .unique();
    if (row) {
      if (row.playerIds.includes(playerId)) return; // already queued — no-op
      await ctx.db.patch(row._id, { playerIds: [...row.playerIds, playerId] });
    } else {
      await ctx.db.insert("draftQueues", {
        leagueId,
        membershipId: membership._id,
        playerIds: [playerId],
      });
    }
  },
});

export const removeFromMyQueue = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const membership = await requireMembership(ctx, leagueId);
    const row = await ctx.db
      .query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", leagueId).eq("membershipId", membership._id),
      )
      .unique();
    if (!row) return;
    const updated = removeFromQueue(row.playerIds as string[], playerId as string) as typeof row.playerIds;
    await ctx.db.patch(row._id, { playerIds: updated });
  },
});
