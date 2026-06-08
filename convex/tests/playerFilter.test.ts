import { describe, it, expect } from "vitest";
import { filterPlayers, distinct, type FilterablePlayer } from "../lib/playerFilter";

const players: FilterablePlayer[] = [
  { _id: "1", name: "Lionel Messi", position: "FWD", country: "Argentina", club: "Inter Miami" },
  { _id: "2", name: "Emiliano Martinez", position: "GK", country: "Argentina", club: "Aston Villa" },
  { _id: "3", name: "Jude Bellingham", position: "MID", country: "England", club: "Real Madrid" },
];

describe("filterPlayers", () => {
  it("excludes taken players", () => {
    expect(filterPlayers(players, { takenIds: new Set(["1"]) }).map((p) => p._id)).toEqual(["2", "3"]);
  });
  it("filters by position", () => {
    expect(filterPlayers(players, { position: "GK" }).map((p) => p._id)).toEqual(["2"]);
  });
  it("filters by country and club", () => {
    expect(filterPlayers(players, { country: "Argentina" }).map((p) => p._id)).toEqual(["1", "2"]);
    expect(filterPlayers(players, { club: "Real Madrid" }).map((p) => p._id)).toEqual(["3"]);
  });
  it("treats ALL as no filter", () => {
    expect(filterPlayers(players, { position: "ALL", country: "ALL", club: "ALL" })).toHaveLength(3);
  });
  it("matches the text query across name, country, and club", () => {
    expect(filterPlayers(players, { query: "villa" }).map((p) => p._id)).toEqual(["2"]);
    expect(filterPlayers(players, { query: "messi" }).map((p) => p._id)).toEqual(["1"]);
  });
  it("distinct returns sorted unique values for a key", () => {
    expect(distinct(players, "country")).toEqual(["Argentina", "England"]);
  });
});
