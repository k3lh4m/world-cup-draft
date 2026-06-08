import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership, requireUserId } from "./lib/membership";
import { DEFAULT_SCORING } from "./lib/scoring";

function token() {
  return Math.random().toString(36).slice(2, 10);
}

export const getLeague = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return await ctx.db.get(leagueId);
  },
});

export const createLeague = mutation({
  args: { name: v.string(), displayName: v.string(), rosterSize: v.optional(v.number()) },
  handler: async (ctx, { name, displayName, rosterSize }) => {
    const userId = await requireUserId(ctx);
    const inviteToken = token();
    const leagueId = await ctx.db.insert("leagues", {
      name,
      commissionerUserId: userId,
      inviteToken,
      rosterSize: rosterSize ?? 15,
      scoringRules: DEFAULT_SCORING,
    });
    await ctx.db.insert("memberships", {
      leagueId,
      userId,
      displayName,
      role: "commissioner",
    });
    return { leagueId, inviteToken };
  },
});

export const joinLeague = mutation({
  args: { inviteToken: v.string(), displayName: v.string() },
  handler: async (ctx, { inviteToken, displayName }) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db
      .query("leagues")
      .withIndex("by_token", (q) => q.eq("inviteToken", inviteToken))
      .unique();
    if (!league) throw new Error("Invalid invite link");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_league_user", (q) =>
        q.eq("leagueId", league._id).eq("userId", userId),
      )
      .unique();
    if (existing) return { leagueId: league._id };
    await ctx.db.insert("memberships", {
      leagueId: league._id,
      userId,
      displayName,
      role: "member",
    });
    return { leagueId: league._id };
  },
});

export const listMyLeagues = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return Promise.all(
      memberships.map(async (m) => ({
        membership: m,
        league: await ctx.db.get(m.leagueId),
      })),
    );
  },
});

export const listMembers = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db
      .query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
  },
});
