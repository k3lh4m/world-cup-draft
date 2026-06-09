"use client";

import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, use, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { SignIn } from "@/components/SignIn";
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
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <h1 className="mb-4 text-xl font-bold">Join league</h1>
      <Unauthenticated>
        <SignIn next={`/join/${token}`} />
      </Unauthenticated>
      <Authenticated>
        <JoinForm token={token} />
      </Authenticated>
    </main>
  );
}

function JoinForm({ token }: { token: string }) {
  const join = useMutation(api.leagues.joinLeague);
  const router = useRouter();
  const [display, setDisplay] = useState("");
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
