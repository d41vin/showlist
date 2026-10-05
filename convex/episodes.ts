import { v } from "convex/values"

import { type MutationCtx, mutation, query } from "./_generated/server"
import { findItem, requireUserId } from "./helpers"
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
    const existing = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user_and_tmdbId_and_season", (q) =>
        q
          .eq("userId", userId)
          .eq("tmdbId", args.item.tmdbId)
          .eq("season", args.season)
      )
      .filter((row) => row.eq(row.field("episode"), args.episode))
      .first()
    if (existing !== null) {
      await ctx.db.delete("episodeWatches", existing._id)
      return null
    }

    await ensureWatching(ctx, userId, args.item)
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
    if (args.episodes.length > MAX_SEASON_EPISODES) {
      throw new Error(
        `Too many episodes at once (${args.episodes.length}); limit is ${MAX_SEASON_EPISODES}`
      )
    }
    const userId = await requireUserId(ctx)
    const seasonRows = await ctx.db
      .query("episodeWatches")
      .withIndex("by_user_and_tmdbId_and_season", (q) =>
        q
          .eq("userId", userId)
          .eq("tmdbId", args.item.tmdbId)
          .eq("season", args.season)
      )
      .collect()
    if (args.watched) {
      await ensureWatching(ctx, userId, args.item)
      const marked = new Set(seasonRows.map((row) => row.episode))
      const now = Date.now()
      for (const episode of args.episodes) {
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
    const toClear = new Set(args.episodes)
    for (const row of seasonRows) {
      if (toClear.has(row.episode)) {
        await ctx.db.delete("episodeWatches", row._id)
      }
    }
    return null
  },
})

// Makes sure the item doc exists with watching turned on. A show whose
// episodes are being ticked is a show the user is watching — regardless of
// any earlier watched/watchlist state (the season-2-rewatch case).
async function ensureWatching(
  ctx: MutationCtx,
  userId: string,
  item: {
    tmdbId: number
    mediaType: "movie" | "tv"
    title: string
    posterPath: string | null
    year: string | null
  }
) {
  const doc = await findItem(ctx, userId, item)
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
