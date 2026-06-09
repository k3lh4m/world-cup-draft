import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/membership";
import { scorePlayer, type Stat } from "./lib/scoring";
import { groupByDate } from "./lib/matchday";

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

export const matchdayBreakdown = query({
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
    const matches = await ctx.db.query("matches").collect();
    const dateOf = new Map(matches.map((m) => [m.espnEventId, m.date]));

    return Promise.all(
      members.map(async (m) => {
        const myPicks = picks.filter((p) => p.membershipId === m._id);
        const rows: { date: string; points: number }[] = [];
        for (const pk of myPicks) {
          const player = await ctx.db.get(pk.playerId);
          if (!player?.espnPlayerId) continue;
          const stats = await ctx.db
            .query("playerMatchStats")
            .withIndex("by_player", (q) =>
              q.eq("espnPlayerId", player.espnPlayerId!),
            )
            .collect();
          for (const s of stats) {
            const statArr: Stat[] = [
              {
                goals: s.goals,
                assists: s.assists,
                cleanSheet: s.cleanSheet,
                minutes: s.minutes,
                redCard: s.redCard,
              },
            ];
            const pts = scorePlayer(statArr, player.position, league.scoringRules);
            rows.push({ date: dateOf.get(s.espnEventId) ?? s.espnEventId, points: pts });
          }
        }
        return {
          membershipId: m._id,
          displayName: m.displayName,
          matchdays: groupByDate(rows),
        };
      }),
    );
  },
});

// Commissioner fallback for entering match stats by hand when the ESPN poller
// has no data (e.g. a friendly, or an event ESPN doesn't cover). Upserts on
// (espnEventId, espnPlayerId) so re-entering corrects rather than duplicates.
export const manualStat = mutation({
  args: {
    leagueId: v.id("leagues"),
    espnPlayerId: v.number(),
    espnEventId: v.string(),
    goals: v.number(),
    assists: v.number(),
    cleanSheet: v.boolean(),
    minutes: v.number(),
    redCard: v.boolean(),
  },
  handler: async (ctx, args) => {
    const member = await requireMembership(ctx, args.leagueId);
    if (member.role !== "commissioner") {
      throw new Error("Only the commissioner can enter stats");
    }
    const { leagueId: _leagueId, ...stat } = args;
    const existing = await ctx.db
      .query("playerMatchStats")
      .withIndex("by_event_player", (q) =>
        q.eq("espnEventId", stat.espnEventId).eq("espnPlayerId", stat.espnPlayerId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, stat);
    else await ctx.db.insert("playerMatchStats", stat);
  },
});
