import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { extractMatchStats } from "./lib/espnSummary";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

const statArg = v.object({
  espnPlayerId: v.number(),
  espnEventId: v.string(),
  goals: v.number(),
  assists: v.number(),
  cleanSheet: v.boolean(),
  minutes: v.number(),
  redCard: v.boolean(),
});

export const upsertStat = internalMutation({
  args: { stat: statArg },
  handler: async (ctx, { stat }) => {
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

export const upsertMatch = internalMutation({
  args: { espnEventId: v.string(), date: v.string(), shortName: v.string(), state: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("matches")
      .withIndex("by_espnEventId", (q) => q.eq("espnEventId", args.espnEventId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("matches", args);
  },
});

/**
 * Poll ESPN: record fixtures from the scoreboard, and for any in-progress or
 * finished match pull the summary and upsert per-player stats. Safe to run on
 * an interval; upserts are idempotent and failures are swallowed per-match.
 */
export const pollScores = internalAction({
  args: {},
  handler: async (ctx): Promise<{ matches: number; statRows: number }> => {
    const sb: any = await fetch(`${BASE}/scoreboard`).then((r) => r.json());
    const events: any[] = sb.events ?? [];
    let statRows = 0;
    for (const event of events) {
      const state = event.status?.type?.state ?? "pre";
      await ctx.runMutation(internal.espn.upsertMatch, {
        espnEventId: String(event.id),
        date: event.date ?? "",
        shortName: event.shortName ?? "",
        state,
      });
      if (state === "pre") continue;
      try {
        const summary = await fetch(`${BASE}/summary?event=${event.id}`).then((r) => r.json());
        const rows = extractMatchStats(summary, String(event.id));
        for (const stat of rows) {
          await ctx.runMutation(internal.espn.upsertStat, { stat });
          statRows++;
        }
      } catch {
        /* skip this match; manual entry remains a fallback */
      }
    }
    return { matches: events.length, statRows };
  },
});
