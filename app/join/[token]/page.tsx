"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, use, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { AuthGate } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <AuthGate next={`/join/${token}`}>
      <main className="mx-auto w-full max-w-md flex-1 p-6">
        <h1 className="mb-4 text-xl font-bold">Join league</h1>
        <JoinForm token={token} />
      </main>
    </AuthGate>
  );
}

function JoinForm({ token }: { token: string }) {
  const me = useQuery(api.users.getMe);
  const join = useMutation(api.leagues.joinLeague);
  const router = useRouter();
  // Prefill from the global name (already cached by RequireName above).
  const [display, setDisplay] = useState(() => me?.name ?? "");
  const [joining, setJoining] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setJoining(true);
    try {
      const { leagueId } = await join({ inviteToken: token, displayName: display });
      router.push(`/league/${leagueId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join league");
      setJoining(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="join-display">Your display name</Label>
        <Input
          id="join-display"
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          placeholder="e.g. Sam"
          required
        />
      </div>
      <Button type="submit" disabled={joining || !display}>
        {joining ? "Joining…" : "Join"}
      </Button>
    </form>
  );
}
