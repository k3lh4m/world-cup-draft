/**
 * Build a complete player pool JSON from the ESPN squads HTML, backfilling
 * missing ESPN player ids from ESPN's per-team roster API.
 *
 * Run: npx tsx scripts/buildPlayers.ts
 * Output: data/players.json
 *
 * No Convex dependency — pure data pipeline.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEspnSquads, normalizeName, type Pos } from "./parseEspnSquads";

export interface PoolPlayer {
  name: string;
  normalizedName: string;
  position: Pos;
  club: string;
  country: string;
  group: string;
  espnTeamId: number;
  espnPlayerId?: number;
}

const ROSTER_URL = (teamId: number) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${teamId}/roster`;

/** Looser key: accent-free, hyphen/apostrophe-insensitive (e.g. "Al-Owais" == "Al Owais"). */
function matchKey(raw: string): string {
  return normalizeName(raw).replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();
}
const surnameOf = (raw: string) => matchKey(raw).split(" ").pop() ?? "";

interface RosterIndex {
  byKey: Map<string, number>;
  bySurname: Map<string, number[]>; // surname -> ids (only unique ones are usable)
}

/** Fetch a team roster and index ids by full key and by surname. */
async function fetchRosterIndex(teamId: number): Promise<RosterIndex> {
  const byKey = new Map<string, number>();
  const bySurname = new Map<string, number[]>();
  try {
    const res = await fetch(ROSTER_URL(teamId));
    if (!res.ok) return { byKey, bySurname };
    const json: any = await res.json();
    for (const a of json.athletes ?? []) {
      const id = Number(a?.id);
      if (!id) continue;
      const names = [a.displayName, a.fullName, `${a.firstName ?? ""} ${a.lastName ?? ""}`].filter(
        (n): n is string => !!n && n.trim().length > 0,
      );
      for (const n of names) byKey.set(matchKey(n), id);
      const sn = surnameOf(a.displayName ?? a.fullName ?? "");
      if (sn) bySurname.set(sn, [...new Set([...(bySurname.get(sn) ?? []), id])]);
    }
  } catch {
    /* leave empty; HTML ids still apply */
  }
  return { byKey, bySurname };
}

/** Resolve a missing player's id via exact key, then unambiguous surname. */
function resolveId(name: string, idx: RosterIndex): number | undefined {
  const direct = idx.byKey.get(matchKey(name));
  if (direct) return direct;
  const sn = surnameOf(name);
  const candidates = idx.bySurname.get(sn);
  if (candidates && candidates.length === 1) return candidates[0];
  return undefined;
}

/** Run async tasks with a small concurrency cap (polite to ESPN). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function buildPool(html: string): Promise<{ players: PoolPlayer[]; report: string[] }> {
  const squads = parseEspnSquads(html);
  const report: string[] = [];

  const rosterMaps = await pool(squads, 5, (s) => fetchRosterIndex(s.espnTeamId));

  const players: PoolPlayer[] = [];
  let backfilled = 0;
  let stillMissing = 0;
  squads.forEach((sq, i) => {
    const roster = rosterMaps[i];
    let teamMissing = 0;
    for (const p of sq.players) {
      let espnPlayerId = p.espnId;
      if (!espnPlayerId) {
        const hit = resolveId(p.name, roster);
        if (hit) {
          espnPlayerId = hit;
          backfilled++;
        } else {
          teamMissing++;
          stillMissing++;
        }
      }
      players.push({
        name: p.name,
        normalizedName: normalizeName(p.name),
        position: p.pos,
        club: p.club,
        country: sq.team,
        group: sq.group,
        espnTeamId: sq.espnTeamId,
        espnPlayerId,
      });
    }
    if (teamMissing) report.push(`${sq.team}: ${teamMissing} without id`);
  });

  const withId = players.filter((p) => p.espnPlayerId).length;
  report.unshift(
    `players: ${players.length}, with id: ${withId} (${Math.round((withId / players.length) * 100)}%), ` +
      `backfilled from roster: ${backfilled}, still missing: ${stillMissing}`,
  );
  return { players, report };
}

// Run when invoked directly.
if (process.argv[1] && process.argv[1].endsWith("buildPlayers.ts")) {
  const html = readFileSync(new URL("../test.html", import.meta.url), "utf8");
  buildPool(html).then(({ players, report }) => {
    mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../data/players.json", import.meta.url), JSON.stringify(players, null, 2));
    report.forEach((line) => console.log(line));
    console.log(`wrote data/players.json (${players.length} players)`);
  });
}
