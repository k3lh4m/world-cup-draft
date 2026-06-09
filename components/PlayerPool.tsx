"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { filterPlayers } from "@/convex/lib/playerFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POSITIONS = ["ALL", "GK", "DEF", "MID", "FWD"] as const;

export function PlayerPool({
  leagueId,
  myTurn,
}: {
  leagueId: Id<"leagues">;
  myTurn: boolean;
}) {
  const players = useQuery(api.players.listPlayers, {}) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const makePick = useMutation(api.draft.makePick);
  const addToQueue = useMutation(api.queue.addToQueue);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<string>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const takenIds = useMemo(
    () => new Set(picks.map((p) => p.playerId as string)),
    [picks],
  );
  const filtered = useMemo(
    () => filterPlayers(players, { query, position, takenIds }).slice(0, 200),
    [players, query, position, takenIds],
  );

  async function pick(playerId: Id<"players">) {
    setPendingId(playerId);
    try {
      await makePick({ leagueId, playerId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pick failed");
    } finally {
      setPendingId(null);
    }
  }

  async function queuePlayer(playerId: Id<"players">) {
    try {
      await addToQueue({ leagueId, playerId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to queue");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="Search name, country, or club"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="border-input bg-background focus-visible:ring-ring/50 rounded-md border px-3 text-sm outline-none focus-visible:ring-3"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          aria-label="Filter by position"
        >
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <ul className="max-h-[60vh] divide-y overflow-auto rounded-md border">
        {filtered.length === 0 ? (
          <li className="text-muted-foreground p-3 text-sm">No players match.</li>
        ) : (
          filtered.map((p) => (
            <li
              key={p._id}
              className="flex items-center justify-between px-3 py-1.5"
            >
              <span>
                {p.name}{" "}
                <span className="text-muted-foreground text-sm">
                  {p.position} · {p.country}
                </span>
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => queuePlayer(p._id)}
                  aria-label={`Add ${p.name} to queue`}
                >
                  ＋ Queue
                </Button>
                <Button
                  size="sm"
                  disabled={!myTurn || pendingId === p._id}
                  onClick={() => pick(p._id)}
                >
                  Draft
                </Button>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
