import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { type MutationCtx, mutation, query } from "./_generated/server"
import {
  deleteIfFullyUnset,
  findItem,
  requireUserId,
  type Snapshot,
} from "./helpers"
import { searchResultValidator } from "./tmdb"

// Per-episode watched ticks (PrimeWire-style). Rows reference the show by
// TMDB id, not the item doc, so progress survives the rewatch flow (item
// fully unset, later re-added).

// Every tick for one show — the drawer's Episodes section renders from this.
export const listForShow = query({
  args: { tmdbId: v.number() },
  returns: v.array(
    v.object({ season: v.number(), episode: v.number(), watchedAt: v.number() })
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user_and_tmdbId", (q) =>
        q.eq("userId", userId).eq("tmdbId", args.tmdbId)
      )
      .collect()
    return rows.map((row) => ({
      season: row.season,
      episode: row.episode,
      watchedAt: row.watchedAt,
    }))
  },
})

// All ticks across all shows — schedule rows check these to mark aired
// episodes the user already watched. User-scoped and small like items.listMine.
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      tmdbId: v.number(),
      season: v.number(),
      episode: v.number(),
      watchedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const rows = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    return rows.map((row) => ({
      tmdbId: row.tmdbId,
      season: row.season,
      episode: row.episode,
      watchedAt: row.watchedAt,
    }))
  },
})

// Marks the episode watched (lazy-creates the item doc and flips watching on
// — ticking episodes means you're watching the show) or, when already
// marked, un-marks it. Other flags are left untouched.
export const toggle = mutation({
  args: {
    item: searchResultValidator,
    season: v.number(),
    episode: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    validateSeason(args.item, args.season)
    validateEpisode(args.episode)
    const doc = await findItem(ctx, userId, args.item)
    const existing = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user_and_tmdbId_and_season", (q) =>
        q
          .eq("userId", userId)
          .eq("tmdbId", args.item.tmdbId)
          .eq("season", args.season)
      )
      .filter((row) => row.eq(row.field("episode"), args.episode))
      .take(MAX_SEASON_EPISODES + 1)
    validateRowCount(existing.length)
    if (existing.length > 0) {
      for (const row of existing) {
        await ctx.db.delete("episodeWatches", row._id)
      }
      if (doc !== null) await deleteIfFullyUnset(ctx, doc)
      return null
    }

    await ensureWatching(ctx, userId, args.item, doc)
    await ctx.db.insert("episodeWatches", {
      userId,
      tmdbId: args.item.tmdbId,
      season: args.season,
      episode: args.episode,
      watchedAt: Date.now(),
    })
    return null
  },
})

// Bulk mark/unmark a whole season's episodes in one transaction (the drawer's
// per-season "mark all" / "clear"). Episode rows must stay within one
// transaction's write budget, so oversized inputs fail with a clear message.
const MAX_SEASON_EPISODES = 2000

export const setSeason = mutation({
  args: {
    item: searchResultValidator,
    season: v.number(),
    episodes: v.array(v.number()),
    watched: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    validateSeason(args.item, args.season)
    if (args.episodes.length > MAX_SEASON_EPISODES) {
      throw new Error(
        `Too many episodes at once (${args.episodes.length}); limit is ${MAX_SEASON_EPISODES}`
      )
    }
    for (const episode of args.episodes) validateEpisode(episode)
    const doc = await findItem(ctx, userId, args.item)
    const episodes = new Set(args.episodes)
    if (episodes.size === 0) return null

    const seasonRows = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user_and_tmdbId_and_season", (q) =>
        q
          .eq("userId", userId)
          .eq("tmdbId", args.item.tmdbId)
          .eq("season", args.season)
      )
      .take(MAX_SEASON_EPISODES + 1)
    validateRowCount(seasonRows.length)
    if (args.watched) {
      await ensureWatching(ctx, userId, args.item, doc)
      // Repair only this season's legacy duplicates, keeping the original
      // watched date even if a later-created row has the older timestamp.
      const marked = new Set<number>()
      for (const row of seasonRows.sort((a, b) => a.watchedAt - b.watchedAt)) {
        if (marked.has(row.episode)) {
          await ctx.db.delete("episodeWatches", row._id)
        } else {
          marked.add(row.episode)
        }
      }
      const now = Date.now()
      for (const episode of episodes) {
        if (marked.has(episode)) continue
        await ctx.db.insert("episodeWatches", {
          userId,
          tmdbId: args.item.tmdbId,
          season: args.season,
          episode,
          watchedAt: now,
        })
      }
      return null
    }
    for (const row of seasonRows) {
      if (episodes.has(row.episode)) {
        await ctx.db.delete("episodeWatches", row._id)
      }
    }
    if (doc !== null) await deleteIfFullyUnset(ctx, doc)
    return null
  },
})

// Makes sure the item doc exists with watching turned on. A show whose
// episodes are being ticked is a show the user is watching — regardless of
// any earlier watched/watchlist state (the season-2-rewatch case).
async function ensureWatching(
  ctx: MutationCtx,
  userId: string,
  item: Snapshot,
  doc: Doc<"items"> | null
) {
  const now = Date.now()
  if (doc === null) {
    await ctx.db.insert("items", {
      userId,
      ...item,
      inWatchlist: false,
      watched: false,
      watching: true,
      watchingAt: now,
      updatedAt: now,
    })
    return
  }
  if (doc.watching !== true) {
    await ctx.db.patch("items", doc._id, {
      watching: true,
      watchingAt: now,
      updatedAt: now,
    })
  }
}

function validateSeason(item: Snapshot, season: number) {
  if (item.mediaType !== "tv") {
    throw new Error("Episode progress requires a TV item")
  }
  if (!Number.isSafeInteger(season) || season < 0) {
    throw new Error("Season number must be a safe integer >= 0")
  }
}

function validateEpisode(episode: number) {
  if (!Number.isSafeInteger(episode) || episode < 1) {
    throw new Error("Episode number must be a safe integer >= 1")
  }
}

function validateRowCount(count: number) {
  if (count > MAX_SEASON_EPISODES) {
    throw new Error(
      `Too many existing episode rows; limit is ${MAX_SEASON_EPISODES}`
    )
  }
}
