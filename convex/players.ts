import { query } from "./_generated/server";
import { v } from "convex/values";

export const listPlayers = query({
  args: { country: v.optional(v.string()) },
  handler: async (ctx, { country }) => {
    if (country) {
      return ctx.db
        .query("players")
        .withIndex("by_country", (q) => q.eq("country", country))
        .collect();
    }
    return ctx.db.query("players").collect();
  },
});

export const playerCount = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("players").collect();
    return {
      total: all.length,
      withEspnId: all.filter((p) => p.espnPlayerId !== undefined).length,
      countries: new Set(all.map((p) => p.country)).size,
    };
  },
});
