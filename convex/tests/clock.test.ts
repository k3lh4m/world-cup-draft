import { describe, it, expect } from "vitest";
import { deadlineMs, secondsRemaining, isExpired } from "../lib/clock";

describe("pick clock", () => {
  const started = 1_000_000;
  it("computes the deadline", () => {
    expect(deadlineMs(started, 60)).toBe(started + 60_000);
  });
  it("computes whole seconds remaining, never negative", () => {
    expect(secondsRemaining(started, 60, started)).toBe(60);
    expect(secondsRemaining(started, 60, started + 30_000)).toBe(30);
    expect(secondsRemaining(started, 60, started + 90_000)).toBe(0);
  });
  it("knows when the deadline has passed", () => {
    expect(isExpired(started, 60, started + 59_999)).toBe(false);
    expect(isExpired(started, 60, started + 60_000)).toBe(true);
  });
});
