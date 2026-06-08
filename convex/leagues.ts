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
