import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const POSITION = v.union(
  v.literal("GK"),
  v.literal("DEF"),
  v.literal("MID"),
  v.literal("FWD"),
);

// Data layer only (player pool + match stats). League/draft/auth tables are
// added when app logic is built.
export default defineSchema({
  players: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    position: POSITION,
    club: v.string(),
    country: v.string(),
    group: v.string(),
    espnTeamId: v.number(),
    espnPlayerId: v.optional(v.number()),
  })
    .index("by_country", ["country"])
    .index("by_position", ["position"])
    .index("by_espnPlayerId", ["espnPlayerId"]),

  matches: defineTable({
    espnEventId: v.string(),
    date: v.string(),
    shortName: v.string(),
    state: v.string(), // pre | in | post
  }).index("by_espnEventId", ["espnEventId"]),

  playerMatchStats: defineTable({
    espnPlayerId: v.number(),
    espnEventId: v.string(),
    goals: v.number(),
    assists: v.number(),
    cleanSheet: v.boolean(),
    minutes: v.number(),
    redCard: v.boolean(),
  })
    .index("by_player", ["espnPlayerId"])
    .index("by_event_player", ["espnEventId", "espnPlayerId"]),
});
