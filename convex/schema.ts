import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const POSITION = v.union(
  v.literal("GK"),
  v.literal("DEF"),
  v.literal("MID"),
  v.literal("FWD"),
);

export default defineSchema({
  ...authTables,

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

  leagues: defineTable({
    name: v.string(),
    commissionerUserId: v.id("users"),
    inviteToken: v.string(),
    rosterSize: v.number(),
    scoringRules: v.object({
      goal: v.number(), assist: v.number(), cleanSheet: v.number(),
      appearance: v.number(), redCard: v.number(),
    }),
  }).index("by_token", ["inviteToken"]),

  memberships: defineTable({
    leagueId: v.id("leagues"),
    userId: v.id("users"),
    displayName: v.string(),
    draftOrder: v.optional(v.number()),
    role: v.union(v.literal("commissioner"), v.literal("member")),
  })
    .index("by_league", ["leagueId"])
    .index("by_user", ["userId"])
    .index("by_league_user", ["leagueId", "userId"]),

  drafts: defineTable({
    leagueId: v.id("leagues"),
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("complete")),
    round: v.number(),
    pickIndex: v.number(),
    order: v.array(v.id("memberships")),
    currentMembershipId: v.optional(v.id("memberships")),
    pickClockSeconds: v.optional(v.number()),
  }).index("by_league", ["leagueId"]),

  picks: defineTable({
    leagueId: v.id("leagues"),
    draftId: v.id("drafts"),
    membershipId: v.id("memberships"),
    playerId: v.id("players"),
    round: v.number(),
    overall: v.number(),
  })
    .index("by_league", ["leagueId"])
    .index("by_league_player", ["leagueId", "playerId"])
    .index("by_membership", ["membershipId"]),
});
