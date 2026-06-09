"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function DraftSetup({
  leagueId,
  memberIds,
}: {
  leagueId: Id<"leagues">;
  memberIds: Id<"memberships">[];
}) {
  const myLeagues = useQuery(api.leagues.listMyLeagues);
  const startDraft = useMutation(api.draft.startDraft);
  const startBlindDraft = useMutation(api.blindDraft.startBlindDraft);
  const [mode, setMode] = useState<"snake" | "blind">("snake");
  const [picksPerRound, setPicksPerRound] = useState(3);
  const [rounds, setRounds] = useState(5);

  const isCommissioner =
    myLeagues?.find((l) => l.league?._id === leagueId)?.membership.role ===
    "commissioner";

  async function onStart() {
    try {
      if (mode === "blind") {
        await startBlindDraft({ leagueId, order: memberIds, picksPerRound, rounds });
      } else {
        await startDraft({ leagueId, order: memberIds });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start draft");
    }
  }

  // Role still loading — render nothing to avoid flashing the wrong UI.
  if (myLeagues === undefined) return null;

  if (!isCommissioner) {
    return (
      <p className="text-muted-foreground text-sm">
        Waiting for the commissioner to start the draft.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border px-2 py-1 text-sm"
        value={mode}
        onChange={(e) => setMode(e.target.value as "snake" | "blind")}
      >
        <option value="snake">Snake draft</option>
        <option value="blind">Blind-collision draft</option>
      </select>
      {mode === "blind" && (
        <>
          <label className="text-sm">
            Picks/round{" "}
            <input
              type="number"
              min={1}
              max={11}
              value={picksPerRound}
              className="w-14 rounded border px-1 py-0.5"
              onChange={(e) => setPicksPerRound(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Rounds{" "}
            <input
              type="number"
              min={1}
              max={20}
              value={rounds}
              className="w-14 rounded border px-1 py-0.5"
              onChange={(e) => setRounds(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <Button onClick={onStart} disabled={memberIds.length === 0}>
        Start draft
      </Button>
    </div>
  );
}
