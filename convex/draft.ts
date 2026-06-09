import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireMembership } from "./lib/membership";
import { membershipForPick, isDraftComplete } from "./lib/snake";
import { chooseAutoPick } from "./lib/queue";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Arms (or re-arms) the pick clock for the current turn.
 * Cancels any existing scheduled autopick job, schedules a new one, and
 * records pickStartedAt + autopickJobId on the draft.
 */
async function armClock(ctx: MutationCtx, draftId: Id<"drafts">): Promise<void> {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.status !== "active") return;

  // Cancel any outstanding autopick job from the previous turn.
  if (draft.autopickJobId) {
    await ctx.scheduler.cancel(draft.autopickJobId);
  }

  const clockMs = (draft.pickClockSeconds ?? 60) * 1000;
  const jobId = await ctx.scheduler.runAfter(clockMs, internal.draft.autopick, {
    draftId,
    expectedPickIndex: draft.pickIndex,
  });

  await ctx.db.patch(draftId, {
    pickStartedAt: Date.now(),
    autopickJobId: jobId,
  });
}

/**
 * Records a pick and advances draft state. Used by both makePick and autopick.
 * Throws if it is not membershipId's turn or the player is already taken.
 */
async function applyPick(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  membershipId: Id<"memberships">,
  playerId: Id<"players">,
): Promise<void> {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.status !== "active") throw new Error("Draft is not active");

  const overall = draft.pickIndex;
  const onClock = membershipForPick(draft.order, overall);
  if (onClock !== membershipId) throw new Error("It is not your turn");

  const taken = await ctx.db
    .query("picks")
    .withIndex("by_league_player", (q) =>
      q.eq("leagueId", draft.leagueId).eq("playerId", playerId),
    )
    .unique();
  if (taken) throw new Error("That player is already drafted");

  const league = await ctx.db.get(draft.leagueId);
  const round = Math.floor(overall / draft.order.length);
  await ctx.db.insert("picks", {
    leagueId: draft.leagueId,
    draftId: draft._id,
    membershipId,
    playerId,
    round,
    overall,
  });

  const nextOverall = overall + 1;
  const complete = isDraftComplete(draft.order.length, league!.rosterSize, nextOverall);

  // Cancel the in-flight autopick job for this turn (if any).
  if (draft.autopickJobId) {
    await ctx.scheduler.cancel(draft.autopickJobId);
  }

  await ctx.db.patch(draftId, {
    pickIndex: nextOverall,
    round: Math.floor(nextOverall / draft.order.length),
    status: complete ? "complete" : "active",
    currentMembershipId: complete
      ? undefined
      : membershipForPick(draft.order, nextOverall),
    autopickJobId: undefined,
    pickStartedAt: undefined,
  });

  // Arm the clock for the next pick if the draft is still running.
  if (!complete) {
    await armClock(ctx, draftId);
  }
}

// ---------------------------------------------------------------------------
// Public mutations
// ---------------------------------------------------------------------------

export const getDraft = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
  },
});

export const listPicks = query({
  args: { leagueId: v.id("leagues") },
  handler: async (ctx, { leagueId }) => {
    await requireMembership(ctx, leagueId);
    return ctx.db
      .query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
  },
});

export const startDraft = mutation({
  args: {
    leagueId: v.id("leagues"),
    order: v.array(v.id("memberships")),
    pickClockSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { leagueId, order, pickClockSeconds }) => {
    const me = await requireMembership(ctx, leagueId);
    if (me.role !== "commissioner") {
      throw new Error("Only the commissioner can start the draft");
    }
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
    if (existing) throw new Error("Draft already exists");
    const draftId = await ctx.db.insert("drafts", {
      leagueId,
      status: "active",
      round: 0,
      pickIndex: 0,
      order,
      currentMembershipId: membershipForPick(order, 0),
      pickClockSeconds,
    });

    // Only arm the clock if a clock duration was provided.
    if (pickClockSeconds !== undefined) {
      await armClock(ctx, draftId);
    }
  },
});

export const makePick = mutation({
  args: { leagueId: v.id("leagues"), playerId: v.id("players") },
  handler: async (ctx, { leagueId, playerId }) => {
    const me = await requireMembership(ctx, leagueId);
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .unique();
    if (!draft || draft.status !== "active") throw new Error("Draft is not active");

    await applyPick(ctx, draft._id, me._id, playerId);
  },
});

// ---------------------------------------------------------------------------
// Internal mutation — called by the scheduler when a pick clock expires
// ---------------------------------------------------------------------------

export const autopick = internalMutation({
  args: {
    draftId: v.id("drafts"),
    expectedPickIndex: v.number(),
  },
  handler: async (ctx, { draftId, expectedPickIndex }) => {
    const draft = await ctx.db.get(draftId);
    // Stale or cancelled job: draft inactive, no on-clock member, or pick
    // index has already advanced (a manual pick beat the clock).
    if (!draft || draft.status !== "active" || !draft.currentMembershipId) return;
    if (draft.pickIndex !== expectedPickIndex) return;

    // Gather taken player ids.
    const picksRaw = await ctx.db
      .query("picks")
      .withIndex("by_league", (q) => q.eq("leagueId", draft.leagueId))
      .collect();
    const takenIds = new Set<string>(picksRaw.map((p) => p.playerId));

    // Load the on-clock member's queue.
    const queueDoc = await ctx.db
      .query("draftQueues")
      .withIndex("by_league_membership", (q) =>
        q.eq("leagueId", draft.leagueId).eq("membershipId", draft.currentMembershipId!),
      )
      .unique();
    const queue: string[] = queueDoc?.playerIds ?? [];

    // Load all player ids available in this league's player pool.
    const allPlayers = await ctx.db.query("players").collect();
    const allPlayerIds = allPlayers.map((p) => p._id as string);

    const chosen = chooseAutoPick(queue, allPlayerIds, takenIds);
    if (!chosen) return; // no player available — nothing to do

    await applyPick(ctx, draftId, draft.currentMembershipId, chosen as Id<"players">);
  },
});
