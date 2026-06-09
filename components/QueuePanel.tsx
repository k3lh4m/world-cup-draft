"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function QueuePanel({ leagueId }: { leagueId: Id<"leagues"> }) {
  const queue = useQuery(api.queue.getMyQueue, { leagueId }) ?? [];
  const players = useQuery(api.players.listPlayers, {}) ?? [];
  const picks = useQuery(api.draft.listPicks, { leagueId }) ?? [];
  const removeFromMyQueue = useMutation(api.queue.removeFromMyQueue);

  const takenIds = useMemo(
    () => new Set(picks.map((p) => p.playerId as string)),
    [picks],
  );

  const playerName = useMemo(() => {
    const map = new Map(players.map((p) => [p._id as string, p.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [players]);

  async function remove(playerId: Id<"players">) {
    try {
      await removeFromMyQueue({ leagueId, playerId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove from queue");
    }
  }

  if (queue.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No players queued. Use &ldquo;＋ Queue&rdquo; to add players to your pre-draft queue.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1 text-sm">
      {queue.map((playerId, idx) => {
        const taken = takenIds.has(playerId as string);
        return (
          <li
            key={playerId as string}
            className="flex items-center justify-between gap-2"
          >
            <span className={taken ? "line-through text-muted-foreground" : ""}>
              <span className="text-muted-foreground mr-1">{idx + 1}.</span>
              {playerName(playerId as string)}
              {taken && <span className="text-muted-foreground ml-1 text-xs">(taken)</span>}
            </span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => remove(playerId as Id<"players">)}
              aria-label={`Remove ${playerName(playerId as string)} from queue`}
            >
              ✕
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
