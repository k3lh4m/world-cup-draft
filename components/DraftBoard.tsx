"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { buildDraftBoard } from "@/convex/lib/draftBoard";

export function DraftBoard({ leagueId }: { leagueId: Id<"leagues"> }) {
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const league = useQuery(api.leagues.getLeague, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers, {}) ?? [];

  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p._id as string, p.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [players]);

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m._id as string, m.displayName]));
    return (id: string) => map.get(id) ?? "—";
  }, [members]);

  const grid = useMemo(() => {
    if (!draft || !league) return null;
    const order = draft.order ?? [];
    const rounds = league.rosterSize ?? 0;
    const boardPicks = picks.map((p) => ({
      membershipId: p.membershipId as string,
      playerId: p.playerId as string,
      round: p.round,
      overall: p.overall,
    }));
    return buildDraftBoard(order as string[], rounds, boardPicks);
  }, [draft, league, picks]);

  if (draft === undefined || league === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (draft === null) {
    return <p className="text-muted-foreground text-sm">Draft hasn&apos;t started yet.</p>;
  }

  if (!grid || grid.length === 0) {
    return <p className="text-muted-foreground text-sm">No rounds to display.</p>;
  }

  const order = draft.order ?? [];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap">
              Round
            </th>
            {order.map((membId) => (
              <th
                key={membId as string}
                className="px-3 py-2 text-left font-medium whitespace-nowrap"
              >
                {memberName(membId as string)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr key={roundIdx} className="border-b last:border-0 odd:bg-muted/20">
              <td className="text-muted-foreground px-3 py-1.5 font-medium whitespace-nowrap">
                {roundIdx + 1}
              </td>
              {row.map((cell, seatIdx) => (
                <td key={seatIdx} className="px-3 py-1.5 whitespace-nowrap">
                  {cell ? (
                    <span className="font-medium">{playerName(cell.playerId)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
