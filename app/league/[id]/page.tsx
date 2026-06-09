"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LeagueHome({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const leagueId = id as Id<"leagues">;
  const league = useQuery(api.leagues.getLeague, { leagueId });
  const members = useQuery(api.leagues.listMembers, { leagueId }) ?? [];
  const draft = useQuery(api.draft.getDraft, { leagueId });
  const startDraft = useMutation(api.draft.startDraft);

  // Build invite URL after mount to avoid a server/client hydration mismatch.
  const [inviteUrl, setInviteUrl] = useState("");
  useEffect(() => {
    if (league) {
      setInviteUrl(`${window.location.origin}/join/${league.inviteToken}`);
    }
  }, [league]);

  if (league === undefined) return <main className="p-6">Loading…</main>;
  if (league === null) return <main className="p-6">League not found.</main>;

  async function onStart() {
    try {
      await startDraft({ leagueId, order: members.map((m) => m._id) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start draft");
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{league.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite friends</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <code className="bg-muted flex-1 truncate rounded px-2 py-1 text-sm">
            {inviteUrl || "…"}
          </code>
          <Button variant="outline" size="sm" onClick={copyInvite} disabled={!inviteUrl}>
            Copy
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 font-semibold">Members ({members.length})</h2>
        <ul className="flex flex-col gap-1">
          {members.map((m) => (
            <li key={m._id} className="text-sm">
              {m.displayName}{" "}
              <span className="text-muted-foreground">({m.role})</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/league/${id}/draft`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Draft room
        </Link>
        <Link
          href={`/league/${id}/leaderboard`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Leaderboard
        </Link>
        {!draft && (
          <Button onClick={onStart} disabled={members.length === 0}>
            Start draft
          </Button>
        )}
      </div>
    </main>
  );
}
