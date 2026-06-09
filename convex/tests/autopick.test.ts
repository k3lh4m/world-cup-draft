/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

async function seedLeague(t: ReturnType<typeof convexTest>) {
  const userA = await t.run((ctx) => ctx.db.insert("users", { name: "A" }));
  const userB = await t.run((ctx) => ctx.db.insert("users", { name: "B" }));

  const leagueId = await t.run((ctx) =>
    ctx.db.insert("leagues", {
      name: "TestLeague",
      commissionerUserId: userA,
      inviteToken: "tok",
      rosterSize: 1,
      scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
    }),
  );

  const memberA = await t.run((ctx) =>
    ctx.db.insert("memberships", {
      leagueId,
      userId: userA,
      displayName: "A",
      draftOrder: 0,
      role: "commissioner",
    }),
  );
  const memberB = await t.run((ctx) =>
    ctx.db.insert("memberships", {
      leagueId,
      userId: userB,
      displayName: "B",
      draftOrder: 1,
      role: "member",
    }),
  );

  const p1 = await t.run((ctx) =>
    ctx.db.insert("players", {
      name: "P1",
      normalizedName: "p1",
      position: "FWD",
      club: "C",
      country: "X",
      group: "A",
      espnTeamId: 1,
    }),
  );
  const p2 = await t.run((ctx) =>
    ctx.db.insert("players", {
      name: "P2",
      normalizedName: "p2",
      position: "MID",
      club: "C",
      country: "X",
      group: "A",
      espnTeamId: 1,
    }),
  );

  return { userA, userB, leagueId, memberA, memberB, p1, p2 };
}

describe("autopick", () => {
  it("picks the queued player (p2) for the on-clock member when called directly", async () => {
    const t = convexTest(schema, modules);
    const { userA, leagueId, memberA, memberB, p1, p2 } = await seedLeague(t);

    // Member A sets a queue favouring p2.
    await t.run((ctx) =>
      ctx.db.insert("draftQueues", {
        leagueId,
        membershipId: memberA,
        playerIds: [p2],
      }),
    );

    // Commissioner (A) starts draft with a 60-second pick clock.
    const asA = t.withIdentity({ subject: userA });
    await asA.mutation(api.draft.startDraft, {
      leagueId,
      order: [memberA, memberB],
      pickClockSeconds: 60,
    });

    // Verify A is on the clock at pick index 0.
    const draftBefore = await asA.query(api.draft.getDraft, { leagueId });
    expect(draftBefore?.currentMembershipId).toBe(memberA);
    expect(draftBefore?.pickIndex).toBe(0);

    // Call autopick directly (deterministic — no real timer needed).
    await t.mutation(internal.draft.autopick, {
      draftId: draftBefore!._id,
      expectedPickIndex: 0,
    });

    // Assert exactly one pick exists, it is p2 (queued player), and it belongs to A.
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks).toHaveLength(1);
    expect(picks[0].playerId).toBe(p2);
    expect(picks[0].membershipId).toBe(memberA);
  });

  it("is a no-op when expectedPickIndex does not match (stale job)", async () => {
    const t = convexTest(schema, modules);
    const { userA, leagueId, memberA, memberB, p1, p2 } = await seedLeague(t);

    const asA = t.withIdentity({ subject: userA });
    await asA.mutation(api.draft.startDraft, {
      leagueId,
      order: [memberA, memberB],
      pickClockSeconds: 60,
    });

    const draftBefore = await asA.query(api.draft.getDraft, { leagueId });

    // Simulate a stale job that carries a wrong pick index.
    await t.mutation(internal.draft.autopick, {
      draftId: draftBefore!._id,
      expectedPickIndex: 99,
    });

    // No picks should have been made.
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks).toHaveLength(0);
  });
});
