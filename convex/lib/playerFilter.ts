export interface FilterablePlayer {
  _id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  country: string;
  club: string;
}

export interface PlayerFilter {
  query?: string;
  position?: string;
  country?: string;
  club?: string;
  takenIds?: Set<string>;
}

export function filterPlayers<T extends FilterablePlayer>(players: T[], f: PlayerFilter): T[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return players.filter((p) => {
    if (f.takenIds?.has(p._id)) return false;
    if (f.position && f.position !== "ALL" && p.position !== f.position) return false;
    if (f.country && f.country !== "ALL" && p.country !== f.country) return false;
    if (f.club && f.club !== "ALL" && p.club !== f.club) return false;
    if (q && !`${p.name} ${p.country} ${p.club}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function distinct<T extends FilterablePlayer>(players: T[], key: "country" | "club"): string[] {
  return [...new Set(players.map((p) => p[key]))].sort();
}
