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
import type * as crons from "../crons.js";
import type * as draft from "../draft.js";
import type * as espn from "../espn.js";
import type * as http from "../http.js";
import type * as leagues from "../leagues.js";
import type * as lib_espnSummary from "../lib/espnSummary.js";
import type * as lib_membership from "../lib/membership.js";
import type * as lib_scoring from "../lib/scoring.js";
import type * as lib_snake from "../lib/snake.js";
import type * as players from "../players.js";
import type * as seed from "../seed.js";
import type * as standings from "../standings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  draft: typeof draft;
  espn: typeof espn;
  http: typeof http;
  leagues: typeof leagues;
  "lib/espnSummary": typeof lib_espnSummary;
  "lib/membership": typeof lib_membership;
  "lib/scoring": typeof lib_scoring;
  "lib/snake": typeof lib_snake;
  players: typeof players;
  seed: typeof seed;
  standings: typeof standings;
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
