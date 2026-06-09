"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { distinct, filterPlayers } from "@/convex/lib/playerFilter";

export function BlindDraftRoom({ leagueId }: { leagueId: Id<"leagues"> }) {
  const state = useQuery(api.blindDraft.blindRoundState, { leagueId });
  const available = useQuery(api.blindDraft.availablePlayers, { leagueId }) ?? [];
  const allPlayers = useQuery(api.players.listPlayers, {}) ?? [];
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const myLeagues = useQuery(api.leagues.listMyLeagues);

  const setSelection = useMutation(api.blindDraft.setSelection);
  const lockIn = useMutation(api.blindDraft.lockIn);
  const forceReveal = useMutation(api.blindDraft.forceReveal);
  const nextRound = useMutation(api.blindDraft.nextRound);

  const [q, setQ] = useState("");
  const [position, setPosition] = useState("ALL");
  const [country, setCountry] = useState("ALL");
  const [club, setClub] = useState("ALL");

  const myMembership = myLeagues?.find((l) => l.league?._id === leagueId)?.membership;
  const isCommissioner = myMembership?.role === "commissioner";
  const memberName = (id: string) => members.find((m) => m._id === id)?.displayName ?? "?";
  const playerName = (id: string) => allPlayers.find((p) => p._id === id)?.name ?? id;

  const countries = useMemo(() => distinct(available, "country"), [available]);
  const clubs = useMemo(() => distinct(available, "club"), [available]);
  const filtered = useMemo(
    () => filterPlayers(available, { query: q, position, country, club }).slice(0, 200),
    [available, q, position, country, club],
  );

  if (state === undefined) return <p className="text-muted-foreground">Loading…</p>;
  if (state === null) return <p>This league is not running a blind draft.</p>;

  const selected = state.mySelection as string[];
  const X = state.picksPerRound;
  const iAmLocked =
    state.participants.find((p) => p.membershipId === myMembership?._id)?.lockedIn ?? false;
  const wiped = new Set(state.reveal?.wiped ?? []);

  async function toggle(playerId: string) {
    const next = selected.includes(playerId)
      ? selected.filter((id) => id !== playerId)
      : [...selected, playerId];
    if (next.length > X) {
      toast.error(`You may pick at most ${X} players`);
      return;
    }
    try {
      await setSelection({ leagueId, playerIds: next as Id<"players">[] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save selection");
    }
  }

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fallback);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          Round {state.currentRound + 1} of {state.rounds} —{" "}
          <span className="capitalize">{state.roundState}</span>
        </p>
        {isCommissioner && state.roundState === "selecting" && (
          <Button variant="outline" size="sm"
            onClick={() => run(() => forceReveal({ leagueId }), "Could not force reveal")}>
            Force reveal
          </Button>
        )}
        {isCommissioner && state.roundState === "revealing" && (
          <Button size="sm"
            onClick={() => run(() => nextRound({ leagueId }), "Could not advance")}>
            Next round
          </Button>
        )}
      </div>

      {/* Status bar: who is locked. */}
      <ul className="flex flex-wrap gap-3 text-sm">
        {state.participants.map((p) => (
          <li key={p.membershipId}>
            {p.lockedIn ? "✓" : "…"} {memberName(p.membershipId)}
          </li>
        ))}
      </ul>

      {state.roundState === "selecting" && (
        <>
          <p className="text-sm">
            Selected <b>{selected.length}</b>/{X}
            {iAmLocked && " — locked in"}
          </p>
          <div className="flex flex-wrap gap-2">
            <input className="flex-1 min-w-[10rem] rounded border px-2 py-1"
              placeholder="Search name / country / club"
              value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="rounded border px-2 py-1" value={position}
              onChange={(e) => setPosition(e.target.value)}>
              {["ALL", "GK", "DEF", "MID", "FWD"].map((p) => <option key={p}>{p}</option>)}
            </select>
            <select className="rounded border px-2 py-1" value={country}
              onChange={(e) => setCountry(e.target.value)}>
              {["ALL", ...countries].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="rounded border px-2 py-1" value={club}
              onChange={(e) => setClub(e.target.value)}>
              {["ALL", ...clubs].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <ul className="max-h-[55vh] divide-y overflow-auto rounded border">
            {filtered.map((p) => {
              const isSel = selected.includes(p._id);
              return (
                <li key={p._id} className="flex items-center justify-between px-3 py-1">
                  <span>
                    {p.name}{" "}
                    <span className="text-muted-foreground text-sm">
                      {p.position} · {p.country} · {p.club}
                    </span>
                  </span>
                  <Button size="sm" variant={isSel ? "default" : "outline"}
                    disabled={iAmLocked}
                    onClick={() => toggle(p._id)}>
                    {isSel ? "Selected" : "Pick"}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button disabled={iAmLocked || selected.length < 1}
            onClick={() => run(() => lockIn({ leagueId }), "Could not lock in")}>
            Lock in
          </Button>
        </>
      )}

      {state.roundState === "revealing" && state.reveal && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Reveal</h3>
          {state.reveal.selections.map((s) => (
            <div key={s.membershipId}>
              <p className="text-sm font-medium">{memberName(s.membershipId)}</p>
              <ul className="flex flex-wrap gap-x-3 text-sm">
                {s.playerIds.map((pid) => (
                  <li key={pid}
                    className={wiped.has(pid) ? "text-red-600 line-through" : "text-green-700"}>
                    {playerName(pid)}
                  </li>
                ))}
                {s.playerIds.length === 0 && <li className="text-muted-foreground">(no pick)</li>}
              </ul>
            </div>
          ))}
          {state.reveal.wiped.length > 0 && (
            <p className="text-sm text-red-600">
              ⚰ Graveyard: {state.reveal.wiped.map(playerName).join(", ")}
            </p>
          )}
        </div>
      )}

      {state.roundState === "complete" && (
        <p className="font-semibold">Blind draft complete.</p>
      )}
    </div>
  );
}
