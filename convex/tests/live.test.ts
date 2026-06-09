import { describe, it, expect } from "vitest";
import { isLive, liveTeamIds, eventByTeam } from "../lib/live";

const matches = [
  { espnEventId: "e1", homeTeamId: 10, awayTeamId: 20, state: "in" },
  { espnEventId: "e2", homeTeamId: 30, awayTeamId: 40, state: "post" },
  { espnEventId: "e3", homeTeamId: 50, awayTeamId: 60, state: "pre" },
];

describe("live helpers", () => {
  it("isLive true only for in-progress", () => {
    expect(isLive("in")).toBe(true);
    expect(isLive("post")).toBe(false);
    expect(isLive("pre")).toBe(false);
  });

  it("liveTeamIds collects both teams of in-progress matches only", () => {
    expect([...liveTeamIds(matches)].sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it("eventByTeam maps each live team to its event id", () => {
    const m = eventByTeam(matches);
    expect(m.get(10)).toBe("e1");
    expect(m.get(20)).toBe("e1");
    expect(m.has(30)).toBe(false);
  });
});
