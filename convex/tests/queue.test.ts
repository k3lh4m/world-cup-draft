import { describe, it, expect } from "vitest";
import { nextFromQueue, removeFromQueue, chooseAutoPick } from "../lib/queue";

describe("queue helpers", () => {
  it("nextFromQueue returns the first id that is not taken", () => {
    expect(nextFromQueue(["a", "b", "c"], new Set(["a"]))).toBe("b");
    expect(nextFromQueue(["a"], new Set(["a"]))).toBeNull();
    expect(nextFromQueue([], new Set())).toBeNull();
  });
  it("removeFromQueue drops the id, preserving order", () => {
    expect(removeFromQueue(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("chooseAutoPick prefers the queue, then falls back to first available", () => {
    expect(chooseAutoPick(["x", "y"], ["a", "x", "b"], new Set(["x"]))).toBe("y");
    expect(chooseAutoPick(["x"], ["a", "b"], new Set(["x"]))).toBe("a");
    expect(chooseAutoPick([], ["a", "b"], new Set(["a", "b"]))).toBeNull();
  });
});
