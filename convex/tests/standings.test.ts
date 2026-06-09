/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("leagueStandings", () => {
  it("ranks members by total points from their drafted players' stats", async () => {
    const t = convexTest(schema, modules);
    const [uA, uB] = await Promise.all([
      t.run((ctx) => ctx.db.insert("users", { name: "A" })),
      t.run((ctx) => ctx.db.insert("users", { name: "B" })),
    ]);
    const leagueId = await t.run((ctx) =>
      ctx.db.insert("leagues", {
        name: "L",
        commissionerUserId: uA,
        inviteToken: "tk",
        rosterSize: 1,
        scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
      }),
    );
    const mA = await t.run((ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: uA, displayName: "A", role: "commissioner" }),
    );
    const mB = await t.run((ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: uB, displayName: "B", role: "member" }),
    );
    const draftId = await t.run((ctx) =>
      ctx.db.insert("drafts", { leagueId, status: "complete", round: 1, pickIndex: 2, order: [mA, mB] }),
    );

    // A's player: FWD, 1 goal + appearance = 6
    const fwd = await t.run((ctx) =>
      ctx.db.insert("players", {
        name: "Striker", normalizedName: "striker", position: "FWD", club: "C",
        country: "X", group: "A", espnTeamId: 1, espnPlayerId: 100,
      }),
    );
    // B's player: DEF, 1 assist + appearance + clean sheet = 8
    const def = await t.run((ctx) =>
      ctx.db.insert("players", {
        name: "Defender", normalizedName: "defender", position: "DEF", club: "C",
        country: "X", group: "A", espnTeamId: 1, espnPlayerId: 200,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("picks", { leagueId, draftId, membershipId: mA, playerId: fwd, round: 0, overall: 0 });
      await ctx.db.insert("picks", { leagueId, draftId, membershipId: mB, playerId: def, round: 0, overall: 1 });
      await ctx.db.insert("playerMatchStats", {
        espnPlayerId: 100, espnEventId: "e1", goals: 1, assists: 0, cleanSheet: false, minutes: 90, redCard: false,
      });
      await ctx.db.insert("playerMatchStats", {
        espnPlayerId: 200, espnEventId: "e1", goals: 0, assists: 1, cleanSheet: true, minutes: 90, redCard: false,
      });
    });

    const rows = await t.withIdentity({ subject: uA }).query(api.standings.leagueStandings, { leagueId });
    expect(rows.map((r) => r.displayName)).toEqual(["B", "A"]); // B (8) ranks above A (6)
    expect(rows[0].points).toBe(8);
    expect(rows[1].points).toBe(6);
    expect(rows[0].breakdown[0]).toMatchObject({ player: "Defender", points: 8 });
  });

  it("requires membership", async () => {
    const t = convexTest(schema, modules);
    const owner = await t.run((ctx) => ctx.db.insert("users", { name: "O" }));
    const outsider = await t.run((ctx) => ctx.db.insert("users", { name: "Z" }));
    const leagueId = await t.run((ctx) =>
      ctx.db.insert("leagues", {
        name: "L", commissionerUserId: owner, inviteToken: "tk", rosterSize: 1,
        scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: owner, displayName: "O", role: "commissioner" }),
    );
    await expect(
      t.withIdentity({ subject: outsider }).query(api.standings.leagueStandings, { leagueId }),
    ).rejects.toThrow(/not a member/i);
  });
});

describe("manualStat", () => {
  const SCORING = { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 };
  const STAT = {
    espnPlayerId: 100, espnEventId: "e1", goals: 1, assists: 0,
    cleanSheet: false, minutes: 90, redCard: false,
  };

  async function setup() {
    const t = convexTest(schema, modules);
    const commish = await t.run((ctx) => ctx.db.insert("users", { name: "C" }));
    const member = await t.run((ctx) => ctx.db.insert("users", { name: "M" }));
    const leagueId = await t.run((ctx) =>
      ctx.db.insert("leagues", {
        name: "L", commissionerUserId: commish, inviteToken: "tk",
        rosterSize: 1, scoringRules: SCORING,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: commish, displayName: "C", role: "commissioner" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("memberships", { leagueId, userId: member, displayName: "M", role: "member" }),
    );
    return { t, commish, member, leagueId };
  }

  it("lets the commissioner insert a stat", async () => {
    const { t, commish, leagueId } = await setup();
    await t.withIdentity({ subject: commish }).mutation(api.standings.manualStat, { leagueId, ...STAT });
    const rows = await t.run((ctx) => ctx.db.query("playerMatchStats").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ espnPlayerId: 100, goals: 1, minutes: 90 });
  });

  it("rejects non-commissioners", async () => {
    const { t, member, leagueId } = await setup();
    await expect(
      t.withIdentity({ subject: member }).mutation(api.standings.manualStat, { leagueId, ...STAT }),
    ).rejects.toThrow(/commissioner/i);
  });

  it("upserts on the same event+player instead of duplicating", async () => {
    const { t, commish, leagueId } = await setup();
    const id = t.withIdentity({ subject: commish });
    await id.mutation(api.standings.manualStat, { leagueId, ...STAT });
    await id.mutation(api.standings.manualStat, { leagueId, ...STAT, goals: 2 });
    const rows = await t.run((ctx) => ctx.db.query("playerMatchStats").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].goals).toBe(2);
  });
});
