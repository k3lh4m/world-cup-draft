import { describe, it, expect } from "vitest";
import { sortPicksByOverallDesc, isMyTurn } from "../lib/draftView";

describe("sortPicksByOverallDesc", () => {
  it("orders picks most-recent (highest overall) first", () => {
    const picks = [
      { overall: 0, playerId: "a" },
      { overall: 2, playerId: "c" },
      { overall: 1, playerId: "b" },
    ];
    expect(sortPicksByOverallDesc(picks).map((p) => p.playerId)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("does not mutate the input array", () => {
    const picks = [{ overall: 0 }, { overall: 1 }];
    const copy = [...picks];
    sortPicksByOverallDesc(picks);
    expect(picks).toEqual(copy);
  });
});

describe("isMyTurn", () => {
  it("is true when active and the clock is on my membership", () => {
    expect(
      isMyTurn({ status: "active", currentMembershipId: "m1", myMembershipId: "m1" }),
    ).toBe(true);
  });

  it("is false when the clock is on someone else", () => {
    expect(
      isMyTurn({ status: "active", currentMembershipId: "m2", myMembershipId: "m1" }),
    ).toBe(false);
  });

  it("is false when the draft is not active even if ids match", () => {
    expect(
      isMyTurn({ status: "complete", currentMembershipId: "m1", myMembershipId: "m1" }),
    ).toBe(false);
  });

  it("is false when there is no membership on the clock or no viewer", () => {
    expect(isMyTurn({ status: "active", currentMembershipId: undefined, myMembershipId: "m1" })).toBe(false);
    expect(isMyTurn({ status: "active", currentMembershipId: "m1", myMembershipId: undefined })).toBe(false);
  });
});
