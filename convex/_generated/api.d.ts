/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as blindDraft from "../blindDraft.js";
import type * as crons from "../crons.js";
import type * as draft from "../draft.js";
import type * as espn from "../espn.js";
import type * as http from "../http.js";
import type * as leagues from "../leagues.js";
import type * as lib_blindResolve from "../lib/blindResolve.js";
import type * as lib_clock from "../lib/clock.js";
import type * as lib_draftBoard from "../lib/draftBoard.js";
import type * as lib_draftView from "../lib/draftView.js";
import type * as lib_espnSummary from "../lib/espnSummary.js";
import type * as lib_live from "../lib/live.js";
import type * as lib_mailerSend from "../lib/mailerSend.js";
import type * as lib_matchday from "../lib/matchday.js";
import type * as lib_membership from "../lib/membership.js";
import type * as lib_playerFilter from "../lib/playerFilter.js";
import type * as lib_queue from "../lib/queue.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_snake from "../lib/snake.js";
import type * as live from "../live.js";
import type * as players from "../players.js";
import type * as queue from "../queue.js";
import type * as seed from "../seed.js";
import type * as standings from "../standings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  blindDraft: typeof blindDraft;
  crons: typeof crons;
  draft: typeof draft;
  espn: typeof espn;
  http: typeof http;
  leagues: typeof leagues;
  "lib/blindResolve": typeof lib_blindResolve;
  "lib/clock": typeof lib_clock;
  "lib/draftBoard": typeof lib_draftBoard;
  "lib/draftView": typeof lib_draftView;
  "lib/espnSummary": typeof lib_espnSummary;
  "lib/live": typeof lib_live;
  "lib/mailerSend": typeof lib_mailerSend;
  "lib/matchday": typeof lib_matchday;
  "lib/membership": typeof lib_membership;
  "lib/playerFilter": typeof lib_playerFilter;
  "lib/queue": typeof lib_queue;
  "lib/scoring": typeof lib_scoring;
  "lib/snake": typeof lib_snake;
  live: typeof live;
  players: typeof players;
  queue: typeof queue;
  seed: typeof seed;
  standings: typeof standings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
