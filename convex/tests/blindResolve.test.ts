import { describe, it, expect } from "vitest";
import { resolveRound } from "../lib/blindResolve";

const byPlayer = (a: { playerId: string }, b: { playerId: string }) =>
  a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;

describe("resolveRound", () => {
  it("wipes players picked by 2+ managers, assigns uniquely-picked players (worked example)", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "alice", playerIds: ["mbappe", "bellingham", "saka"] },
      { membershipId: "bob", playerIds: ["mbappe", "pedri", "dias"] },
      { membershipId: "cara", playerIds: ["haaland", "pedri", "saka"] },
    ]);
    expect([...wiped].sort()).toEqual(["mbappe", "pedri", "saka"]);
    expect([...assignments].sort(byPlayer)).toEqual([
      { membershipId: "alice", playerId: "bellingham" },
      { membershipId: "bob", playerId: "dias" },
      { membershipId: "cara", playerId: "haaland" },
    ]);
  });

  it("assigns everyone when nothing collides", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1"] },
      { membershipId: "b", playerIds: ["p2"] },
    ]);
    expect(wiped).toEqual([]);
    expect([...assignments].sort(byPlayer)).toEqual([
      { membershipId: "a", playerId: "p1" },
      { membershipId: "b", playerId: "p2" },
    ]);
  });

  it("wipes everyone when all collide on the same players", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1", "p2"] },
      { membershipId: "b", playerIds: ["p1", "p2"] },
    ]);
    expect(assignments).toEqual([]);
    expect([...wiped].sort()).toEqual(["p1", "p2"]);
  });

  it("ignores empty selections and keeps partial picks", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: [] },
      { membershipId: "b", playerIds: ["p1"] },
    ]);
    expect(wiped).toEqual([]);
    expect(assignments).toEqual([{ membershipId: "b", playerId: "p1" }]);
  });

  it("does not self-collide on a manager's duplicate (defensive dedupe)", () => {
    const { assignments, wiped } = resolveRound([
      { membershipId: "a", playerIds: ["p1", "p1"] },
    ]);
    expect(wiped).toEqual([]);
    expect(assignments).toEqual([{ membershipId: "a", playerId: "p1" }]);
  });
});
