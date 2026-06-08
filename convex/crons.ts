import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Poll ESPN every minute. Outside match windows this is a cheap no-op
// (scoreboard returns only "pre" fixtures, which are skipped).
const crons = cronJobs();
crons.interval("poll espn scores", { minutes: 1 }, internal.espn.pollScores, {});
export default crons;
