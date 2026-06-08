/**
 * Seed the Convex `players` table from data/players.json, in batches.
 * Run: npx convex dev --once && npx tsx scripts/seedRun.ts
 * Requires NEXT_PUBLIC_CONVEX_URL (set by `convex dev` in .env.local).
 */
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { PoolPlayer } from "./buildPlayers";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set — run `npx convex dev --once` first.");
  process.exit(1);
}

const players: PoolPlayer[] = JSON.parse(
  readFileSync(new URL("../data/players.json", import.meta.url), "utf8"),
);

const client = new ConvexHttpClient(url);
const BATCH = 200;

async function main() {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < players.length; i += BATCH) {
    const batch = players.slice(i, i + BATCH);
    const res = await client.mutation(api.seed.seedPlayers, { players: batch });
    inserted += res.inserted;
    updated += res.updated;
    console.log(`  batch ${i / BATCH + 1}: +${res.inserted} new, ${res.updated} updated`);
  }
  console.log(`seeded players.json → ${inserted} inserted, ${updated} updated`);
}

main().then(() => process.exit(0));
