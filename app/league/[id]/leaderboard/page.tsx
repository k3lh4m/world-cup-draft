"use client";

import { use } from "react";

import { type Id } from "@/convex/_generated/dataModel";
import { Standings } from "@/components/Standings";
import { MatchdayBreakdown } from "@/components/MatchdayBreakdown";
import { LiveTicker } from "@/components/LiveTicker";

export default function Leaderboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-bold">Leaderboard</h1>
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Playing now</h2>
        <LiveTicker leagueId={id as Id<"leagues">} />
      </section>
      <Standings leagueId={id as Id<"leagues">} />
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">By matchday</h2>
        <MatchdayBreakdown leagueId={id as Id<"leagues">} />
      </section>
    </main>
  );
}
