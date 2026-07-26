import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import {
  deleteIfFullyUnset,
  findItem,
  itemDocValidator,
  requireUserId,
} from "./helpers"
import { searchResultValidator } from "./tmdb"

// All the user's items in one small list; the client filters
// watchlist/watched and maps state onto search results (see project brief).
export const listMine = query({
  args: {},
  returns: v.array(itemDocValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    return await ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  },
})

export const toggleWatchlist = mutation({
  args: { item: searchResultValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await findItem(ctx, userId, args.item)
    if (doc === null) {
      await ctx.db.insert("items", {
        userId,
        ...args.item,
        inWatchlist: true,
        watched: false,
        updatedAt: Date.now(),
      })
      return null
    }
    await ctx.db.patch("items", doc._id, {
      inWatchlist: !doc.inWatchlist,
      updatedAt: Date.now(),
    })
    await deleteIfFullyUnset(ctx, { ...doc, inWatchlist: !doc.inWatchlist })
    return null
  },
})

export const toggleWatched = mutation({
  args: { item: searchResultValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await findItem(ctx, userId, args.item)
    if (doc === null) {
      await ctx.db.insert("items", {
        userId,
        ...args.item,
        inWatchlist: false,
        watched: true,
        updatedAt: Date.now(),
      })
      return null
    }
    await ctx.db.patch("items", doc._id, {
      watched: !doc.watched,
      updatedAt: Date.now(),
    })
    await deleteIfFullyUnset(ctx, { ...doc, watched: !doc.watched })
    return null
  },
})

// Toggles the given sentiment: sets it, replaces the opposite one, or clears
// it when it is already active (mutually exclusive pair).
export const setSentiment = mutation({
  args: {
    item: searchResultValidator,
    sentiment: v.union(v.literal("liked"), v.literal("disliked")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const doc = await findItem(ctx, userId, args.item)
    if (doc === null) {
      await ctx.db.insert("items", {
        userId,
        ...args.item,
        inWatchlist: false,
        watched: false,
        sentiment: args.sentiment,
        updatedAt: Date.now(),
      })
      return null
    }
    const next = doc.sentiment === args.sentiment ? undefined : args.sentiment
    await ctx.db.patch("items", doc._id, {
      sentiment: next,
      updatedAt: Date.now(),
    })
    await deleteIfFullyUnset(ctx, { ...doc, sentiment: next })
    return null
  },
})
