"use client";

import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { SignIn } from "@/components/SignIn";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">World Cup Draft</h1>
        <ThemeToggle />
      </header>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Dashboard />
      </Authenticated>
    </main>
  );
}

function Dashboard() {
  const leagues = useQuery(api.leagues.listMyLeagues) ?? [];
  const createLeague = useMutation(api.leagues.createLeague);
  const router = useRouter();
  const [name, setName] = useState("");
  const [display, setDisplay] = useState("");
  const [creating, setCreating] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { leagueId } = await createLeague({ name, displayName: display });
      router.push(`/league/${leagueId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create league");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 font-semibold">Your leagues</h2>
        {leagues.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No leagues yet — create one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leagues.map(({ league, membership }) =>
              league ? (
                <li key={league._id}>
                  <Link
                    className="font-medium underline underline-offset-4"
                    href={`/league/${league._id}`}
                  >
                    {league.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    — joined as {membership.displayName}
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Create a league</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onCreate}>
            <div className="space-y-2">
              <Label htmlFor="league-name">League name</Label>
              <Input
                id="league-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Group Chat Cup"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display-name">Your display name</Label>
              <Input
                id="display-name"
                value={display}
                onChange={(e) => setDisplay(e.target.value)}
                placeholder="e.g. Sam"
                required
              />
            </div>
            <Button type="submit" disabled={creating || !name || !display}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
