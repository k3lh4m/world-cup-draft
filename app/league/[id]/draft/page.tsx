"use client";

import { useQuery } from "convex/react";
import { use, useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { isMyTurn } from "@/convex/lib/draftView";
import { PickFeed } from "@/components/PickFeed";
import { PlayerPool } from "@/components/PlayerPool";

export default function DraftRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const leagueId = id as Id<"leagues">;
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const myLeagues = useQuery(api.leagues.listMyLeagues);

  const myMembershipId = useMemo(
    () =>
      myLeagues?.find((l) => l.league?._id === leagueId)?.membership._id,
    [myLeagues, leagueId],
  );

  const onClock = draft?.currentMembershipId;
  const onClockName = members.find((m) => m._id === onClock)?.displayName;
  const myTurn = isMyTurn({
    status: draft?.status ?? "",
    currentMembershipId: onClock,
    myMembershipId,
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <h1 className="mb-2 text-xl font-bold">Draft room</h1>
      {draft === undefined ? (
        <p className="text-muted-foreground mb-3">Loading…</p>
      ) : draft === null ? (
        <p className="mb-3">The draft hasn&apos;t started yet.</p>
      ) : draft.status === "complete" ? (
        <p className="mb-3 font-semibold">Draft complete.</p>
      ) : (
        <p className="mb-3">
          On the clock: <b>{onClockName ?? "—"}</b>
          {myTurn && " — your pick!"}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
        <PlayerPool leagueId={leagueId} myTurn={myTurn} />
        <div>
          <h2 className="mb-1 font-semibold">Picks</h2>
          <PickFeed leagueId={leagueId} />
        </div>
      </div>
    </main>
  );
}
