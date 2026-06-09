export type LiveMatch = {
  espnEventId: string;
  homeTeamId?: number;
  awayTeamId?: number;
  state: string;
};

export function isLive(state: string): boolean {
  return state === "in";
}

export function liveTeamIds(matches: LiveMatch[]): Set<number> {
  const ids = new Set<number>();
  for (const m of matches) {
    if (!isLive(m.state)) continue;
    if (m.homeTeamId) ids.add(m.homeTeamId);
    if (m.awayTeamId) ids.add(m.awayTeamId);
  }
  return ids;
}

export function eventByTeam(matches: LiveMatch[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const m of matches) {
    if (!isLive(m.state)) continue;
    if (m.homeTeamId) map.set(m.homeTeamId, m.espnEventId);
    if (m.awayTeamId) map.set(m.awayTeamId, m.espnEventId);
  }
  return map;
}
