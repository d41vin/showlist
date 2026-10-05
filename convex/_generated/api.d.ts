/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as collections from "../collections.js"
import type * as crons from "../crons.js"
import type * as episodes from "../episodes.js"
import type * as helpers from "../helpers.js"
import type * as items from "../items.js"
import type * as schedule from "../schedule.js"
import type * as schedule_windows from "../schedule_windows.js"
import type * as stats from "../stats.js"
import type * as tmdb from "../tmdb.js"
import type * as tmdb_cache from "../tmdb_cache.js"

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server"

declare const fullApi: ApiFromModules<{
  collections: typeof collections
  crons: typeof crons
  episodes: typeof episodes
  helpers: typeof helpers
  items: typeof items
  schedule: typeof schedule
  schedule_windows: typeof schedule_windows
  stats: typeof stats
  tmdb: typeof tmdb
  tmdb_cache: typeof tmdb_cache
}>

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
>

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
>

export declare const components: {}
