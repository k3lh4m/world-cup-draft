/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

// Seeds a league with `names` members (index 0 = commissioner) and `playerCount`
// FWD players (espnPlayerId 100+i so they can score). Returns ids for tests.
async function seed(
  t: ReturnType<typeof convexTest>,
  names: string[],
  playerCount: number,
) {
  const userIds = await Promise.all(
    names.map((n) => t.run((ctx) => ctx.db.insert("users", { name: n }))),
  );
  const leagueId = await t.run((ctx) =>
    ctx.db.insert("leagues", {
      name: "L",
      commissionerUserId: userIds[0],
      inviteToken: "tk",
      rosterSize: 15,
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
  const espnIds: number[] = [];
  const players = await Promise.all(
    Array.from({ length: playerCount }, (_, i) => {
      const espnPlayerId = 100 + i;
      espnIds.push(espnPlayerId);
      return t.run((ctx) =>
        ctx.db.insert("players", {
          name: `P${i}`,
          normalizedName: `p${i}`,
          position: "FWD",
          club: "C",
          country: "X",
          group: "A",
          espnTeamId: 1,
          espnPlayerId,
        }),
      );
    }),
  );
  return { userIds, leagueId, memberIds, players, espnIds };
}

describe("blind draft — start & availability", () => {
  it("commissioner starts a blind draft with X/R and lists available players", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A", "B"], 3);
    const asA = t.withIdentity({ subject: userIds[0] });

    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId,
      order: memberIds,
      picksPerRound: 2,
      rounds: 4,
    });

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.mode).toBe("blind");
    expect(draft!.picksPerRound).toBe(2);
    expect(draft!.rounds).toBe(4);
    expect(draft!.currentRound).toBe(0);
    expect(draft!.roundState).toBe("selecting");

    const avail = await asA.query(api.blindDraft.availablePlayers, { leagueId });
    expect(avail).toHaveLength(3);
  });

  it("non-commissioner cannot start a blind draft", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A", "B"], 2);
    const asB = t.withIdentity({ subject: userIds[1] });
    await expect(
      asB.mutation(api.blindDraft.startBlindDraft, { leagueId, order: memberIds }),
    ).rejects.toThrow(/commissioner/i);
  });

  it("defaults X=3 and R=5 when not supplied", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A"], 1);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, { leagueId, order: memberIds });
    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.picksPerRound).toBe(3);
    expect(draft!.rounds).toBe(5);
  });
});

describe("blind draft — selection & blindness", () => {
  it("autosaves, enforces limit/distinct/availability, and hides opponents' picks", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    const asB = t.withIdentity({ subject: userIds[1] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 2, rounds: 3,
    });

    // Over the limit.
    await expect(
      asA.mutation(api.blindDraft.setSelection, {
        leagueId, playerIds: [players[0], players[1], players[2]],
      }),
    ).rejects.toThrow(/at most 2/i);

    // Duplicate within own list.
    await expect(
      asA.mutation(api.blindDraft.setSelection, {
        leagueId, playerIds: [players[0], players[0]],
      }),
    ).rejects.toThrow(/duplicate/i);

    // Valid selections (autosave).
    await asA.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[1]],
    });
    await asB.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[2]],
    });

    // A sees own picks, B shown only as not-locked, and B's playerIds never leak.
    const stateForA = await asA.query(api.blindDraft.blindRoundState, { leagueId });
    expect(stateForA!.mySelection).toEqual([players[0], players[1]]);
    expect(stateForA!.reveal).toBeNull();
    const bRow = stateForA!.participants.find((p) => p.membershipId === memberIds[1]);
    expect(bRow!.lockedIn).toBe(false);
    expect(JSON.stringify(stateForA)).not.toContain(players[2]);
  });

  it("rejects selecting a player that is not in this blind draft / wrong mode", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds } = await seed(t, ["A"], 1);
    const asA = t.withIdentity({ subject: userIds[0] });
    // No draft yet → not a blind draft.
    await expect(
      asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [] }),
    ).rejects.toThrow(/no blind draft/i);
  });
});
