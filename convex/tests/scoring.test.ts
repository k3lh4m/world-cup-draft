import { describe, it, expect } from "vitest";
import { scorePlayer, type ScoringRules, type Stat } from "../lib/scoring";

const rules: ScoringRules = { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 };

describe("scorePlayer", () => {
  it("sums goals, assists, appearance", () => {
    const stats: Stat[] = [{ goals: 2, assists: 1, cleanSheet: false, minutes: 90, redCard: false }];
    // 2*5 + 1*3 + 1 appearance = 14
    expect(scorePlayer(stats, "FWD", rules)).toBe(14);
  });
  it("awards clean sheet only to GK/DEF", () => {
    const s: Stat[] = [{ goals: 0, assists: 0, cleanSheet: true, minutes: 90, redCard: false }];
    expect(scorePlayer(s, "DEF", rules)).toBe(1 + 4);
    expect(scorePlayer(s, "FWD", rules)).toBe(1); // no clean-sheet bonus
  });
  it("subtracts red cards and counts an appearance only when minutes > 0", () => {
    const s: Stat[] = [{ goals: 0, assists: 0, cleanSheet: false, minutes: 0, redCard: true }];
    expect(scorePlayer(s, "MID", rules)).toBe(-2); // no appearance (0 min), red card -2
  });
});
