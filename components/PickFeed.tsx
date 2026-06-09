"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { sortPicksByOverallDesc } from "@/convex/lib/draftView";

export function PickFeed({ leagueId }: { leagueId: Id<"leagues"> }) {
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers, {}) ?? [];

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m._id as string, m.displayName]));
    return (id: string) => map.get(id) ?? "—";
  }, [members]);
  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p._id as string, p.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [players]);

  const ordered = sortPicksByOverallDesc(picks);

  if (ordered.length === 0) {
    return <p className="text-muted-foreground text-sm">No picks yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-1 text-sm">
      {ordered.map((p) => (
        <li key={p._id}>
          <span className="text-muted-foreground">#{p.overall + 1}</span>{" "}
          {memberName(p.membershipId)} →{" "}
          <span className="font-medium">{playerName(p.playerId)}</span>
        </li>
      ))}
    </ol>
  );
}
