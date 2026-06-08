/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("requireMembership isolation", () => {
  it("rejects a user who is not a member of the league", async () => {
    const t = convexTest(schema, modules);
    const userA = await t.run(async (ctx) => ctx.db.insert("users", { name: "A" }));
    const userB = await t.run(async (ctx) => ctx.db.insert("users", { name: "B" }));
    const leagueId = await t.run(async (ctx) =>
      ctx.db.insert("leagues", {
        name: "L",
        commissionerUserId: userA,
        inviteToken: "tok",
        rosterSize: 2,
        scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("memberships", {
        leagueId,
        userId: userA,
        displayName: "A",
        role: "commissioner",
      }),
    );
    // userA (member) can read; userB cannot.
    const asA = t.withIdentity({ subject: userA });
    const asB = t.withIdentity({ subject: userB });
    await expect(asA.query(api.leagues.getLeague, { leagueId })).resolves.toBeTruthy();
    await expect(asB.query(api.leagues.getLeague, { leagueId })).rejects.toThrow(/not a member/i);
  });
});
