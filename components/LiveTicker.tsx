"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";

export function LiveTicker({ leagueId }: { leagueId: Id<"leagues"> }) {
  const players = useQuery(api.live.myLivePlayers, { leagueId });

  if (players === undefined) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-muted-foreground text-sm">
          None of your players are on the pitch right now.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={`${p.name}-${p.country}`} className="flex items-center justify-between text-sm">
            <span>
              🟢{" "}
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                {" "}
                ({p.position} · {p.country})
              </span>
            </span>
            <span className="tabular-nums">
              {p.goals}G {p.assists}A
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
