import { v } from "convex/values"

import { type Doc } from "./_generated/dataModel"
import { type QueryCtx, type MutationCtx } from "./_generated/server"

// Shared helpers for items.ts and collections.ts. This file registers no
// Convex functions.

export async function requireUserId(ctx: { auth: QueryCtx["auth"] }) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    throw new Error("Not signed in")
  }
  return identity.tokenIdentifier
}

export type Snapshot = {
  tmdbId: number
  mediaType: "movie" | "tv"
  title: string
  posterPath: string | null
  year: string | null
}

export async function findItem(
  ctx: MutationCtx,
  userId: string,
  snapshot: Snapshot
) {
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
export async function deleteIfFullyUnset(ctx: MutationCtx, doc: Doc<"items">) {
  if (
    doc.inWatchlist ||
    doc.watched ||
    doc.watching === true ||
    doc.sentiment !== undefined
  ) {
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

// The full items doc shape, returned by items.listMine and
// collections.getItems.
export const itemDocValidator = v.object({
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
  watching: v.optional(v.boolean()),
  watchlistAt: v.optional(v.number()),
  watchedAt: v.optional(v.number()),
  watchingAt: v.optional(v.number()),
  sentiment: v.optional(v.union(v.literal("liked"), v.literal("disliked"))),
  updatedAt: v.number(),
})
