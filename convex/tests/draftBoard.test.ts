import { describe, it, expect } from "vitest";
import { buildDraftBoard, type BoardPick } from "../lib/draftBoard";

describe("buildDraftBoard", () => {
  const order = ["A", "B", "C"];
  const picks: BoardPick[] = [
    { membershipId: "A", playerId: "p1", round: 0, overall: 0 },
    { membershipId: "B", playerId: "p2", round: 0, overall: 1 },
    { membershipId: "C", playerId: "p3", round: 0, overall: 2 },
    { membershipId: "C", playerId: "p4", round: 1, overall: 3 },
  ];
  it("places each pick in [round][seat] by the picker's seat in the order", () => {
    const grid = buildDraftBoard(order, 2, picks);
    expect(grid).toHaveLength(2);
    expect(grid[0].map((c) => c?.playerId ?? null)).toEqual(["p1", "p2", "p3"]);
    expect(grid[1].map((c) => c?.playerId ?? null)).toEqual([null, null, "p4"]);
  });
  it("ignores picks for unknown members or out-of-range rounds", () => {
    const grid = buildDraftBoard(order, 1, [
      { membershipId: "Z", playerId: "x", round: 0, overall: 0 },
      { membershipId: "A", playerId: "p1", round: 5, overall: 99 },
    ]);
    expect(grid[0].every((c) => c === null)).toBe(true);
  });
});
