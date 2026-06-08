import { z } from "zod";

export const PosSchema = z.enum(["GK", "DEF", "MID", "FWD"]);
export type Pos = z.infer<typeof PosSchema>;

export const ParsedPlayerSchema = z.object({
  name: z.string(),
  pos: PosSchema,
  club: z.string(),
  espnId: z.number().optional(),
});
export type ParsedPlayer = z.infer<typeof ParsedPlayerSchema>;

export const ParsedSquadSchema = z.object({
  group: z.string(),
  team: z.string(),
  espnTeamId: z.number(),
  logo: z.string(),
  manager: z.string(),
  players: z.array(ParsedPlayerSchema),
});
export type ParsedSquad = z.infer<typeof ParsedSquadSchema>;

const POS_LABELS: { label: string; pos: Pos }[] = [
  { label: "Goalkeepers", pos: "GK" },
  { label: "Defenders", pos: "DEF" },
  { label: "Midfielders", pos: "MID" },
  { label: "Forwards", pos: "FWD" },
];

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Collapse Prettier-wrapped HTML into a compact single-spaced form. */
function normalizeHtml(html: string): string {
  return html
    .replace(/\s+/g, " ") // newlines + runs of spaces → single space
    .replace(/<\s+/g, "<") // "< a" → "<a"
    .replace(/\s+>/g, ">") // "</a >" → "</a>"
    .replace(/\s+\/>/g, "/>");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Parse one position section's inner HTML into players.
 * Player-name anchors carry an ESPN id in `/player/.../id/NNN/`; club/team
 * anchors carry an id under `/team/` or `/club/` and are NOT players.
 */
function parsePlayers(sectionHtml: string, pos: Pos): ParsedPlayer[] {
  // 1. Replace player anchors with a sentinel that preserves id + name.
  const withMarkers = sectionHtml.replace(
    /<a\b[^>]*\/player\/[^>"]*?\/id\/(\d+)\/[^>]*>([^<]+)<\/a>/g,
    (_m, id, name) => `«${id}»${name.trim()}¬`,
  );
  // 2. Strip all remaining tags (club anchors collapse to their text).
  const text = stripTags(withMarkers);

  const players: ParsedPlayer[] = [];
  // Each entry is "<name> (<club>)" where <name> is either a marker or plain text.
  const entryRe = /(?:«(\d+)»([^¬]+)¬|([^(),«»¬]+))\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text)) !== null) {
    const espnId = m[1] ? Number(m[1]) : undefined;
    const name = (m[2] ?? m[3] ?? "").trim();
    const club = (m[4] ?? "").trim();
    if (!name || name.length < 2) continue;
    players.push({ name, pos, club, espnId });
  }
  return players;
}

export function parseEspnSquads(rawHtml: string): ParsedSquad[] {
  const html = normalizeHtml(rawHtml);

  // Index group headings so each team inherits the most recent group.
  const groupMarks: { idx: number; group: string }[] = [];
  const groupRe = /GROUP\s+([A-L])\b/g;
  let gm: RegExpExecArray | null;
  while ((gm = groupRe.exec(html)) !== null) {
    groupMarks.push({ idx: gm.index, group: gm[1] });
  }
  const groupFor = (idx: number) =>
    [...groupMarks].reverse().find((g) => g.idx <= idx)?.group ?? "?";

  // Find every team by its logo; a team block runs to the next logo.
  const logoRe = /teamlogos\/soccer\/500\/(\d+)\.png/g;
  const starts: { idx: number; espnTeamId: number }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = logoRe.exec(html)) !== null) {
    starts.push({ idx: lm.index, espnTeamId: Number(lm[1]) });
  }

  const squads: ParsedSquad[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].idx : html.length;
    const block = html.slice(start.idx, end);

    const nameMatch = block.match(/<h2>\s*(?:<strong>\s*)?<a\b[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue; // not a real team block
    const team = stripTags(nameMatch[1]);

    const managerMatch = block.match(/Manager:\s*(?:<a\b[^>]*>)?\s*([^<]+)/);
    const manager = managerMatch ? stripTags(managerMatch[1]) : "";

    const players: ParsedPlayer[] = [];
    for (const { label, pos } of POS_LABELS) {
      const secRe = new RegExp(
        `<strong>\\s*${label}\\b\\s*:?\\s*</strong>\\s*:?([\\s\\S]*?)` +
          `(?=<strong>\\s*(?:Goalkeepers|Defenders|Midfielders|Forwards|Manager)|</p>)`,
        "i",
      );
      const sec = block.match(secRe);
      if (sec) players.push(...parsePlayers(sec[1], pos));
    }

    // Dedupe by normalized name within the squad.
    const seen = new Set<string>();
    const deduped = players.filter((p) => {
      const k = normalizeName(p.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    squads.push({
      group: groupFor(start.idx),
      team,
      espnTeamId: start.espnTeamId,
      logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${start.espnTeamId}.png`,
      manager,
      players: deduped,
    });
  }

  return squads;
}
