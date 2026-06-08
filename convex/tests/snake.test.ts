import { describe, it, expect } from "vitest";
import { membershipForPick, isDraftComplete } from "../lib/snake";

// order = [A,B,C]; rosterSize 2 ⇒ overall picks 0..5
// round0 (fwd): A,B,C ; round1 (rev): C,B,A
describe("snake order", () => {
  const order = ["A", "B", "C"];
  it("goes forward on even rounds", () => {
    expect(membershipForPick(order, 0)).toBe("A");
    expect(membershipForPick(order, 2)).toBe("C");
  });
  it("reverses on odd rounds", () => {
    expect(membershipForPick(order, 3)).toBe("C");
    expect(membershipForPick(order, 5)).toBe("A");
  });
  it("knows when the draft is complete", () => {
    expect(isDraftComplete(3, 2, 5)).toBe(false); // 6th pick (overall 5) still valid
    expect(isDraftComplete(3, 2, 6)).toBe(true);
  });
});
