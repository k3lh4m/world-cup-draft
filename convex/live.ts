import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { eventByTeam, type LiveMatch } from "./lib/live";

export const myLivePlayers = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    const me = await requireMembership(ctx, leagueId);

    const matches = await ctx.db.query("matches").collect();
    const teamToEvent = eventByTeam(matches as LiveMatch[]);

    if (teamToEvent.size === 0) return [];

    const myPicks = await ctx.db
      .query("picks")
      .withIndex("by_membership", (q) => q.eq("membershipId", me._id))
      .collect();

    const results: {
      name: string;
      position: string;
      country: string;
      goals: number;
      assists: number;
    }[] = [];

    for (const pick of myPicks) {
      const player = await ctx.db.get(pick.playerId);
      if (!player) continue;
      if (!teamToEvent.has(player.espnTeamId)) continue;

      const espnEventId = teamToEvent.get(player.espnTeamId)!;
      let goals = 0;
      let assists = 0;

      if (player.espnPlayerId !== undefined) {
        const stat = await ctx.db
          .query("playerMatchStats")
          .withIndex("by_event_player", (q) =>
            q
              .eq("espnEventId", espnEventId)
              .eq("espnPlayerId", player.espnPlayerId!),
          )
          .unique();
        if (stat) {
          goals = stat.goals;
          assists = stat.assists;
        }
      }

      results.push({
        name: player.name,
        position: player.position,
        country: player.country,
        goals,
        assists,
      });
    }

    return results;
  },
});
