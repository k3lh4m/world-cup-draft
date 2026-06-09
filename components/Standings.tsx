"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";

export function Standings({ leagueId }: { leagueId: Id<"leagues"> }) {
  const rows = useQuery(api.standings.leagueStandings, { leagueId });

  if (rows === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No members yet.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2 font-medium">#</th>
          <th className="p-2 font-medium">Member</th>
          <th className="p-2 text-right font-medium">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.membershipId} className="border-b last:border-0">
            <td className="text-muted-foreground p-2">{i + 1}</td>
            <td className="p-2">{r.displayName}</td>
            <td className="p-2 text-right font-semibold tabular-nums">
              {r.points}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
