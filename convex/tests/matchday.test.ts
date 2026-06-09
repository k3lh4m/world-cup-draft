import { describe, it, expect } from "vitest";
import { groupByDate, type DatedPoints } from "../lib/matchday";

describe("groupByDate", () => {
  it("sums points per date and sorts ascending", () => {
    const rows: DatedPoints[] = [
      { date: "2026-06-13", points: 5 },
      { date: "2026-06-11", points: 3 },
      { date: "2026-06-13", points: 6 },
    ];
    expect(groupByDate(rows)).toEqual([
      { date: "2026-06-11", points: 3 },
      { date: "2026-06-13", points: 11 },
    ]);
  });
  it("returns an empty array for no rows", () => {
    expect(groupByDate([])).toEqual([]);
  });
});
