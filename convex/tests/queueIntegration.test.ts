/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("draftQueue integration", () => {
  it("addToQueue twice → getMyQueue returns both in order → removeFromMyQueue leaves the remaining", async () => {
    const t = convexTest(schema, modules);

    // Set up a user
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Alice" }));
    const asAlice = t.withIdentity({ subject: userId });

    // Create a league and membership
    const leagueId = await t.run((ctx) =>
      ctx.db.insert("leagues", {
        name: "Test League",
        commissionerUserId: userId,
        inviteToken: "tok1",
        rosterSize: 5,
        scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        leagueId,
        userId,
        displayName: "Alice",
        role: "commissioner",
      }),
    );

    // Insert two players
    const p1 = await t.run((ctx) =>
      ctx.db.insert("players", {
        name: "Player One",
        normalizedName: "player one",
        position: "FWD",
        club: "Club A",
        country: "Country X",
        group: "A",
        espnTeamId: 1,
      }),
    );
    const p2 = await t.run((ctx) =>
      ctx.db.insert("players", {
        name: "Player Two",
        normalizedName: "player two",
        position: "MID",
        club: "Club B",
        country: "Country Y",
        group: "B",
        espnTeamId: 2,
      }),
    );

    // Queue starts empty
    const initial = await asAlice.query(api.queue.getMyQueue, { leagueId });
    expect(initial).toEqual([]);

    // Add both players
    await asAlice.mutation(api.queue.addToQueue, { leagueId, playerId: p1 });
    await asAlice.mutation(api.queue.addToQueue, { leagueId, playerId: p2 });

    const afterAdds = await asAlice.query(api.queue.getMyQueue, { leagueId });
    expect(afterAdds).toEqual([p1, p2]);

    // Adding p1 again is a no-op
    await asAlice.mutation(api.queue.addToQueue, { leagueId, playerId: p1 });
    const afterDupe = await asAlice.query(api.queue.getMyQueue, { leagueId });
    expect(afterDupe).toEqual([p1, p2]);

    // Remove p1
    await asAlice.mutation(api.queue.removeFromMyQueue, { leagueId, playerId: p1 });
    const afterRemove = await asAlice.query(api.queue.getMyQueue, { leagueId });
    expect(afterRemove).toEqual([p2]);
  });
});
