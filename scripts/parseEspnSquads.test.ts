// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseEspnSquads, normalizeName } from "./parseEspnSquads";

const html = readFileSync(new URL("../test.html", import.meta.url), "utf8");
const squads = parseEspnSquads(html);

describe("parseEspnSquads", () => {
  it("parses all 48 teams across 12 groups", () => {
    expect(squads).toHaveLength(48);
    expect(new Set(squads.map((s) => s.group)).size).toBe(12);
  });

  it("captures team metadata", () => {
    const mexico = squads.find((s) => s.team === "Mexico")!;
    expect(mexico.group).toBe("A");
    expect(mexico.espnTeamId).toBe(203);
    expect(mexico.manager).toBe("Javier Aguirre");
    expect(mexico.logo).toContain("/203.png");
  });

  it("parses players with position, club, and espnId when present", () => {
    const mexico = squads.find((s) => s.team === "Mexico")!;
    const ochoa = mexico.players.find((p) => p.name === "Guillermo Ochoa")!;
    expect(ochoa.pos).toBe("GK");
    expect(ochoa.club).toBe("AEL Limassol");
    expect(ochoa.espnId).toBe(137038);
  });

  it("keeps players that have no ESPN id (plain-text names)", () => {
    const korea = squads.find((s) => s.team === "South Korea")!;
    const joh = korea.players.find((p) => p.name === "Jo Hyun-Woo");
    expect(joh).toBeDefined();
    expect(joh!.pos).toBe("GK");
    expect(joh!.club).toBe("Ulsan HD");
    expect(joh!.espnId).toBeUndefined();
  });

  it("handles team names wrapped in <strong> (Colombia, Group K in source)", () => {
    const col = squads.find((s) => s.team === "Colombia")!;
    expect(col.group).toBe("K");
    expect(col.players.length).toBeGreaterThan(20);
  });

  it("handles a manager rendered as a link (Netherlands → Ronald Koeman)", () => {
    const ned = squads.find((s) => s.team === "Netherlands")!;
    expect(ned.manager).toBe("Ronald Koeman");
  });

  it("normalizes accents for matching", () => {
    expect(normalizeName("Vinícius Júnior")).toBe("vinicius junior");
  });

  it("dedupes repeated players within a squad (Tunisia Elias Saad)", () => {
    const tunisia = squads.find((s) => s.team === "Tunisia")!;
    const saads = tunisia.players.filter((p) => normalizeName(p.name) === "elias saad");
    expect(saads).toHaveLength(1);
  });

  it("reports per-team counts (diagnostic) and seeds a large pool", () => {
    const offenders = squads
      .filter((s) => s.players.length !== 26)
      .map((s) => `${s.team}:${s.players.length}`);
    // eslint-disable-next-line no-console
    if (offenders.length) console.warn("non-26 squads:", offenders.join(", "));
    const total = squads.reduce((n, s) => n + s.players.length, 0);
    // eslint-disable-next-line no-console
    console.warn("total players parsed:", total);
    expect(total).toBeGreaterThan(1150);
  });
});
