"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MatchdayBreakdown({ leagueId }: { leagueId: Id<"leagues"> }) {
  const rows = useQuery(api.standings.matchdayBreakdown, { leagueId });

  if (rows === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No members yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((member) => (
        <Card key={member.membershipId}>
          <CardHeader>
            <CardTitle>{member.displayName}</CardTitle>
          </CardHeader>
          <CardContent>
            {member.matchdays.length === 0 ? (
              <p className="text-muted-foreground text-sm">No points yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {member.matchdays.map((md) => (
                  <span
                    key={md.date}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums"
                  >
                    <span className="text-muted-foreground">{md.date}:</span>
                    <span>{md.points}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
