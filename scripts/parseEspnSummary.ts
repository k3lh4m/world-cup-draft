/**
 * Pure parser: ESPN soccer match `summary` JSON -> per-player stat rows.
 *
 * Soccer summaries put per-player numbers under `rosters[].roster[].stats`
 * (NOT `boxscore.players`, which is empty for soccer). Verified against the
 * 2022 World Cup final feed: relevant stat names are
 *   totalGoals, goalAssists, redCards, goalsConceded, appearances.
 */
export interface MatchStat {
  espnPlayerId: number;
  espnEventId: string;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  minutes: number;
  redCard: boolean;
}

interface RawStat {
  name: string;
  value?: number | string;
}
interface RawRosterEntry {
  athlete?: { id?: string | number };
  starter?: boolean;
  subbedIn?: boolean;
  stats?: RawStat[];
}
interface RawSummary {
  rosters?: { roster?: RawRosterEntry[] }[];
}

function statVal(stats: RawStat[], name: string): number {
  const s = stats.find((x) => x.name === name);
  return s ? Number(s.value) || 0 : 0;
}

export function extractMatchStats(summary: RawSummary, espnEventId: string): MatchStat[] {
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
        cleanSheet: conceded === 0, // scoring.ts credits this only to GK/DEF
        minutes: 90, // appeared; ESPN soccer feed has no per-player minutes
        redCard: statVal(stats, "redCards") > 0,
      });
    }
  }
  return rows;
}
