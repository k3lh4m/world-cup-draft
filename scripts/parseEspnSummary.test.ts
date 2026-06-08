// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractMatchStats } from "./parseEspnSummary";

// Fixture mirrors the verified ESPN soccer `summary.rosters` shape.
const summary = {
  rosters: [
    {
      roster: [
        {
          athlete: { id: "45843" }, // scorer
          starter: true,
          stats: [
            { name: "appearances", value: 1 },
            { name: "totalGoals", value: 2 },
            { name: "goalAssists", value: 1 },
            { name: "goalsConceded", value: 3 },
            { name: "redCards", value: 0 },
          ],
        },
        {
          athlete: { id: "999" }, // unused sub — should be skipped
          starter: false,
          subbedIn: false,
          stats: [{ name: "appearances", value: 0 }],
        },
      ],
    },
    {
      roster: [
        {
          athlete: { id: "158626" }, // keeper, clean sheet
          starter: true,
          stats: [
            { name: "appearances", value: 1 },
            { name: "totalGoals", value: 0 },
            { name: "goalAssists", value: 0 },
            { name: "goalsConceded", value: 0 },
            { name: "redCards", value: 1 },
          ],
        },
      ],
    },
  ],
};

describe("extractMatchStats", () => {
  const rows = extractMatchStats(summary, "EVT1");

  it("skips unused subs (no appearance)", () => {
    expect(rows.find((r) => r.espnPlayerId === 999)).toBeUndefined();
    expect(rows).toHaveLength(2);
  });

  it("reads goals and assists", () => {
    const scorer = rows.find((r) => r.espnPlayerId === 45843)!;
    expect(scorer.goals).toBe(2);
    expect(scorer.assists).toBe(1);
    expect(scorer.cleanSheet).toBe(false); // conceded 3
    expect(scorer.espnEventId).toBe("EVT1");
  });

  it("flags clean sheet (0 conceded) and red cards", () => {
    const keeper = rows.find((r) => r.espnPlayerId === 158626)!;
    expect(keeper.cleanSheet).toBe(true);
    expect(keeper.redCard).toBe(true);
  });
});
