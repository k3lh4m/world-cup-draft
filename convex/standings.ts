import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { scorePlayer, type Stat } from "./lib/scoring";

export const leagueStandings = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    const league = (await ctx.db.get(leagueId))!;
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const picks = await ctx.db
      .query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();

    const rows = await Promise.all(
      members.map(async (m) => {
        const myPicks = picks.filter((p) => p.membershipId === m._id);
        let points = 0;
        const breakdown = await Promise.all(
          myPicks.map(async (pk) => {
            const player = (await ctx.db.get(pk.playerId))!;
            const stats: Stat[] = player.espnPlayerId
              ? (
                  await ctx.db
                    .query("playerMatchStats")
                    .withIndex("by_player", (q) =>
                      q.eq("espnPlayerId", player.espnPlayerId!),
                    )
                    .collect()
                ).map((s) => ({
                  goals: s.goals,
                  assists: s.assists,
                  cleanSheet: s.cleanSheet,
                  minutes: s.minutes,
                  redCard: s.redCard,
                }))
              : [];
            const pts = scorePlayer(stats, player.position, league.scoringRules);
            points += pts;
            return { player: player.name, position: player.position, points: pts };
          }),
        );
        return { membershipId: m._id, displayName: m.displayName, points, breakdown };
      }),
    );

    return rows.sort((a, b) => b.points - a.points);
  },
});
