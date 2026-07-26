import { v } from "convex/values"

import { type Doc } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { searchResultValidator } from "./tmdb"

async function requireUserId(ctx: { auth: MutationCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    throw new Error("Not signed in")
  }
  return identity.tokenIdentifier
}

type Snapshot = {
  tmdbId: number
  mediaType: "movie" | "tv"
  title: string
  posterPath: string | null
  year: string | null
}

async function findItem(ctx: MutationCtx, userId: string, snapshot: Snapshot) {
  return await ctx.db
    .query("items")
    .withIndex("by_user_and_mediaType_and_tmdbId", (q) =>
      q
        .eq("userId", userId)
        .eq("mediaType", snapshot.mediaType)
        .eq("tmdbId", snapshot.tmdbId)
    )
    .unique()
}

// Cleanup rule: an item doc with no flags, no sentiment and no collection
// membership has no reason to exist — delete it.
async function deleteIfFullyUnset(ctx: MutationCtx, doc: Doc<"items">) {
  if (doc.inWatchlist || doc.watched || doc.sentiment !== undefined) {
    return
  }
  const membership = await ctx.db
    .query("collectionItems")
    .withIndex("by_item", (q) => q.eq("itemId", doc._id))
    .first()
  if (membership !== null) {
    return
  }
  await ctx.db.delete("items", doc._id)
}

// All the user's items in one small list; the client filters
// watchlist/watched and maps state onto search results (see project brief).
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("items"),
      _creationTime: v.number(),
      userId: v.string(),
      tmdbId: v.number(),
      mediaType: v.union(v.literal("movie"), v.literal("tv")),
      title: v.string(),
      posterPath: v.union(v.string(), v.null()),
      year: v.union(v.string(), v.null()),
      inWatchlist: v.boolean(),
      watched: v.boolean(),
      sentiment: v.optional(
        v.union(v.literal("liked"), v.literal("disliked"))
      ),
      updatedAt: v.number(),
    })
  ),
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
