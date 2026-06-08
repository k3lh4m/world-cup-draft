/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

async function seedLeague(t: ReturnType<typeof convexTest>, names: string[]) {
  const userIds = await Promise.all(
    names.map((n) => t.run((ctx) => ctx.db.insert("users", { name: n }))),
  );
  const leagueId = await t.run((ctx) =>
    ctx.db.insert("leagues", {
      name: "L",
      commissionerUserId: userIds[0],
      inviteToken: "tk",
      rosterSize: 1,
      scoringRules: { goal: 5, assist: 3, cleanSheet: 4, appearance: 1, redCard: -2 },
    }),
  );
  const memberIds = await Promise.all(
    names.map((n, i) =>
      t.run((ctx) =>
        ctx.db.insert("memberships", {
          leagueId,
          userId: userIds[i],
          displayName: n,
          draftOrder: i,
          role: i === 0 ? "commissioner" : "member",
        }),
      ),
    ),
  );
  const p1 = await t.run((ctx) =>
    ctx.db.insert("players", {
      name: "P1", normalizedName: "p1", position: "FWD", club: "C", country: "X", group: "A", espnTeamId: 1,
    }),
  );
  const p2 = await t.run((ctx) =>
    ctx.db.insert("players", {
      name: "P2", normalizedName: "p2", position: "MID", club: "C", country: "X", group: "A", espnTeamId: 1,
    }),
  );
  return { userIds, leagueId, memberIds, p1, p2 };
}

describe("draft engine", () => {
  it("enforces turn order, prevents double-picks, advances snake, completes", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, p1, p2 } = await seedLeague(t, ["A", "B"]);
    const asA = t.withIdentity({ subject: userIds[0] });
    const asB = t.withIdentity({ subject: userIds[1] });

    await asA.mutation(api.draft.startDraft, { leagueId, order: memberIds });

    // It's A's turn. B cannot pick.
    await expect(asB.mutation(api.draft.makePick, { leagueId, playerId: p1 })).rejects.toThrow(
      /not your turn/i,
    );

    // A picks p1.
    await asA.mutation(api.draft.makePick, { leagueId, playerId: p1 });
    // A cannot pick again (now B's turn), and p1 is taken.
    await expect(asA.mutation(api.draft.makePick, { leagueId, playerId: p2 })).rejects.toThrow(
      /not your turn/i,
    );
    await expect(asB.mutation(api.draft.makePick, { leagueId, playerId: p1 })).rejects.toThrow(
      /already drafted/i,
    );

    // B picks p2 ⇒ rosterSize 1, 2 teams ⇒ draft complete.
    await asB.mutation(api.draft.makePick, { leagueId, playerId: p2 });
    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.status).toBe("complete");
  });

  it("only the commissioner can start the draft", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seedLeague(t, ["A", "B"]);
    const asB = t.withIdentity({ subject: userIds[1] });
    await expect(
      asB.mutation(api.draft.startDraft, { leagueId, order: memberIds }),
    ).rejects.toThrow(/commissioner/i);
  });
});
