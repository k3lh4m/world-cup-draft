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

describe("blind draft — reveal, resolve & lifecycle", () => {
  it("auto-reveals when all lock in: unique picks become roster picks, collisions are wiped", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B", "C"], 6);
    const [asA, asB, asC] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 3, rounds: 2,
    });

    // Collisions on 0 (A,B), 3 (B,C), 2 (A,C); survivors 1→A, 4→B, 5→C.
    await asA.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[1], players[2]],
    });
    await asB.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[0], players[3], players[4]],
    });
    await asC.mutation(api.blindDraft.setSelection, {
      leagueId, playerIds: [players[5], players[3], players[2]],
    });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asB.mutation(api.blindDraft.lockIn, { leagueId });
    await asC.mutation(api.blindDraft.lockIn, { leagueId }); // last lock → reveal

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("revealing");

    const picks = await asA.query(api.draft.listPicks, { leagueId });
    const rosterOf = (mid: string) =>
      picks.filter((p) => p.membershipId === mid).map((p) => p.playerId);
    expect(rosterOf(memberIds[0])).toEqual([players[1]]);
    expect(rosterOf(memberIds[1])).toEqual([players[4]]);
    expect(rosterOf(memberIds[2])).toEqual([players[5]]);

    // Wiped players gone from availability next.
    const availIds = (await asA.query(api.blindDraft.availablePlayers, { leagueId })).map((p) => p._id);
    expect(availIds).not.toContain(players[0]);
    expect(availIds).not.toContain(players[2]);
    expect(availIds).not.toContain(players[3]);

    // Reveal payload now exposes every locked selection + the wiped set.
    const state = await asB.query(api.blindDraft.blindRoundState, { leagueId });
    expect(state!.reveal).not.toBeNull();
    expect([...state!.reveal!.wiped].sort()).toEqual(
      [players[0], players[2], players[3]].sort(),
    );
  });

  it("force reveal locks partial/empty selections as-is and resolves", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A", "B"], 4);
    const [asA] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 2, rounds: 2,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    // B never selects. Commissioner forces the reveal.
    await asA.mutation(api.blindDraft.forceReveal, { leagueId });

    const draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("revealing");
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks.map((p) => p.playerId)).toEqual([players[0]]); // A got p0; B got nothing
  });

  it("nextRound advances rounds and completes after R", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 2,
    });

    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId }); // solo → reveal
    await asA.mutation(api.blindDraft.nextRound, { leagueId });
    let draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.currentRound).toBe(1);
    expect(draft!.roundState).toBe("selecting");

    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[1]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asA.mutation(api.blindDraft.nextRound, { leagueId });
    draft = await asA.query(api.draft.getDraft, { leagueId });
    expect(draft!.roundState).toBe("complete");
    expect(draft!.status).toBe("complete");
  });

  it("is idempotent: locking in again after reveal is rejected and does not double-resolve", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players } = await seed(t, ["A"], 4);
    const asA = t.withIdentity({ subject: userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 2,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await expect(asA.mutation(api.blindDraft.lockIn, { leagueId })).rejects.toThrow(/closed/i);
    const picks = await asA.query(api.draft.listPicks, { leagueId });
    expect(picks).toHaveLength(1);
  });

  it("a second league is isolated from a blind draft", async () => {
    const t = convexTest(schema, modules);
    const a = await seed(t, ["A"], 2);
    const b = await seed(t, ["Z"], 2);
    const asA = t.withIdentity({ subject: a.userIds[0] });
    const asZ = t.withIdentity({ subject: b.userIds[0] });
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId: a.leagueId, order: a.memberIds, picksPerRound: 1, rounds: 1,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId: a.leagueId, playerIds: [a.players[0]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId: a.leagueId });

    // League B untouched: no draft, full availability (all 4 global players; none wiped/picked in B).
    expect(await asZ.query(api.draft.getDraft, { leagueId: b.leagueId })).toBeNull();
    const availB = await asZ.query(api.blindDraft.availablePlayers, { leagueId: b.leagueId });
    expect(availB).toHaveLength(4);
  });

  it("scores a blind-drafted roster through the shared leaderboard (mode-agnostic)", async () => {
    const t = convexTest(schema, modules);
    const { userIds, leagueId, memberIds, players, espnIds } = await seed(t, ["A", "B"], 2);
    const [asA, asB] = userIds.map((u) => t.withIdentity({ subject: u }));
    await asA.mutation(api.blindDraft.startBlindDraft, {
      leagueId, order: memberIds, picksPerRound: 1, rounds: 1,
    });
    await asA.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[0]] });
    await asB.mutation(api.blindDraft.setSelection, { leagueId, playerIds: [players[1]] });
    await asA.mutation(api.blindDraft.lockIn, { leagueId });
    await asB.mutation(api.blindDraft.lockIn, { leagueId }); // no collision → both survive

    // A's player scores a goal (FWD: goal 5 + appearance 1 = 6).
    await t.run((ctx) =>
      ctx.db.insert("playerMatchStats", {
        espnPlayerId: espnIds[0], espnEventId: "e1",
        goals: 1, assists: 0, cleanSheet: false, minutes: 90, redCard: false,
      }),
    );
    const rows = await asA.query(api.standings.leagueStandings, { leagueId });
    const aRow = rows.find((r) => r.membershipId === memberIds[0]);
    expect(aRow!.points).toBe(6);
  });
});
