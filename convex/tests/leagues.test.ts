/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("leagues", () => {
  it("creates a league with the creator as commissioner", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "Boss" }));
    const asUser = t.withIdentity({ subject: userId });

    const { leagueId, inviteToken } = await asUser.mutation(api.leagues.createLeague, {
      name: "My League",
      displayName: "Boss",
    });

    const league = await asUser.query(api.leagues.getLeague, { leagueId });
    expect(league?.name).toBe("My League");
    expect(inviteToken).toBeTruthy();

    const members = await asUser.query(api.leagues.listMembers, { leagueId });
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("commissioner");
    expect(members[0].displayName).toBe("Boss");
  });

  it("lets another user join by invite token, idempotently", async () => {
    const t = convexTest(schema, modules);
    const boss = await t.run((ctx) => ctx.db.insert("users", { name: "Boss" }));
    const friend = await t.run((ctx) => ctx.db.insert("users", { name: "Friend" }));
    const { leagueId, inviteToken } = await t
      .withIdentity({ subject: boss })
      .mutation(api.leagues.createLeague, { name: "L", displayName: "Boss" });

    const asFriend = t.withIdentity({ subject: friend });
    await asFriend.mutation(api.leagues.joinLeague, { inviteToken, displayName: "Friend" });
    // joining again must not create a duplicate membership
    await asFriend.mutation(api.leagues.joinLeague, { inviteToken, displayName: "Friend" });

    const members = await asFriend.query(api.leagues.listMembers, { leagueId });
    expect(members).toHaveLength(2);
  });

  it("rejects an invalid invite token", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", { name: "X" }));
    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(api.leagues.joinLeague, { inviteToken: "nope", displayName: "X" }),
    ).rejects.toThrow(/invalid invite/i);
  });

  it("lists only the leagues a user belongs to", async () => {
    const t = convexTest(schema, modules);
    const a = await t.run((ctx) => ctx.db.insert("users", { name: "A" }));
    const b = await t.run((ctx) => ctx.db.insert("users", { name: "B" }));
    await t.withIdentity({ subject: a }).mutation(api.leagues.createLeague, {
      name: "A-league",
      displayName: "A",
    });
    const mineA = await t.withIdentity({ subject: a }).query(api.leagues.listMyLeagues);
    const mineB = await t.withIdentity({ subject: b }).query(api.leagues.listMyLeagues);
    expect(mineA).toHaveLength(1);
    expect(mineB).toHaveLength(0);
  });
});
