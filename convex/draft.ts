import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { membershipForPick, isDraftComplete } from "./lib/snake";

export const getDraft = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
  },
});

export const listPicks = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db
      .query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
  },
});

export const startDraft = mutation({
  args: { leagueId: v.id("leagues"), order: v.array(v.id("memberships")) },
  handler: async (ctx, { leagueId, order }) => {
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
      currentMembershipId: membershipForPick(order, 0),
    });
  },
});

export const makePick = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const league = await ctx.db.get(leagueId);
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
    if (!draft || draft.status !== "active") throw new Error("Draft is not active");

    const overall = draft.pickIndex;
    const onClock = membershipForPick(draft.order, overall);
    if (onClock !== me._id) throw new Error("It is not your turn");

    const taken = await ctx.db
      .query("picks")
      .withIndex("by_league_player", (q) =>
        q.eq("leagueId", leagueId).eq("playerId", playerId),
      )
      .unique();
    if (taken) throw new Error("That player is already drafted");

    const round = Math.floor(overall / draft.order.length);
    await ctx.db.insert("picks", {
      leagueId,
      draftId: draft._id,
      membershipId: me._id,
      playerId,
      round,
      overall,
    });

    const nextOverall = overall + 1;
    const complete = isDraftComplete(draft.order.length, league!.rosterSize, nextOverall);
    await ctx.db.patch(draft._id, {
      pickIndex: nextOverall,
      round: Math.floor(nextOverall / draft.order.length),
      status: complete ? "complete" : "active",
      currentMembershipId: complete
        ? undefined
        : membershipForPick(draft.order, nextOverall),
    });
  },
});
