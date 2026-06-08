import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { POSITION } from "./schema";

const playerArg = v.object({
  name: v.string(),
  normalizedName: v.string(),
  position: POSITION,
  club: v.string(),
  country: v.string(),
  group: v.string(),
  espnTeamId: v.number(),
  espnPlayerId: v.optional(v.number()),
});

/**
 * Idempotent upsert of a batch of players, keyed by (country, normalizedName).
 * Called in batches by scripts/seedRun.ts (reads data/players.json).
 */
export const seedPlayers = mutation({
  args: { players: v.array(playerArg) },
  handler: async (ctx, { players }) => {
    let inserted = 0;
    let updated = 0;
    for (const p of players) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_country", (q) => q.eq("country", p.country))
        .collect();
      const dup = existing.find((e) => e.normalizedName === p.normalizedName);
      if (dup) {
        await ctx.db.patch(dup._id, p);
        updated++;
      } else {
        await ctx.db.insert("players", p);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});
