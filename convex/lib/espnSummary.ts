/**
 * Pure parser: ESPN soccer match `summary` JSON -> per-player stat rows.
 *
 * Soccer summaries put per-player numbers under `rosters[].roster[].stats`
 * (NOT `boxscore.players`, which is empty for soccer). Verified against the
 * 2022 World Cup final feed: relevant stat names are
 *   totalGoals, goalAssists, redCards, goalsConceded, appearances.
 */
import { z } from "zod";

export const MatchStatSchema = z.object({
  espnPlayerId: z.number(),
  espnEventId: z.string(),
  goals: z.number(),
  assists: z.number(),
  cleanSheet: z.boolean(),
  minutes: z.number(),
  redCard: z.boolean(),
});
export type MatchStat = z.infer<typeof MatchStatSchema>;

const RawStatSchema = z.object({
  name: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
});
type RawStat = z.infer<typeof RawStatSchema>;

const RawRosterEntrySchema = z.object({
  athlete: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
  starter: z.boolean().optional(),
  subbedIn: z.boolean().optional(),
  stats: z.array(RawStatSchema).optional(),
});

// ESPN summaries carry many fields we ignore; only `rosters` is parsed here.
export const RawSummarySchema = z.object({
  rosters: z.array(z.object({ roster: z.array(RawRosterEntrySchema).optional() })).optional(),
});

function statVal(stats: RawStat[], name: string): number {
  const s = stats.find((x) => x.name === name);
  return s ? Number(s.value) || 0 : 0;
}

export function extractMatchStats(rawSummary: unknown, espnEventId: string): MatchStat[] {
  const summary = RawSummarySchema.parse(rawSummary);
  const rows: MatchStat[] = [];
  for (const team of summary.rosters ?? []) {
    for (const entry of team.roster ?? []) {
      const id = Number(entry.athlete?.id);
      if (!id) continue;
      const stats = entry.stats ?? [];
      const appeared = statVal(stats, "appearances") > 0 || !!entry.starter || !!entry.subbedIn;
      if (!appeared) continue; // unused sub — nothing to record
      const conceded = statVal(stats, "goalsConceded");
      rows.push({
        espnPlayerId: id,
        espnEventId,
        goals: statVal(stats, "totalGoals"),
        assists: statVal(stats, "goalAssists"),
        cleanSheet: conceded === 0, // scoring credits this only to GK/DEF
        minutes: 90, // appeared; ESPN soccer feed has no per-player minutes
        redCard: statVal(stats, "redCards") > 0,
      });
    }
  }
  return rows;
}
