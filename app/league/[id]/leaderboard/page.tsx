"use client";

import { use } from "react";

import { type Id } from "@/convex/_generated/dataModel";
import { Standings } from "@/components/Standings";

export default function Leaderboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-4 text-xl font-bold">Leaderboard</h1>
      <Standings leagueId={id as Id<"leagues">} />
    </main>
  );
}
