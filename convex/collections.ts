import { v } from "convex/values"

import { type Doc, type Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import {
  deleteIfFullyUnset,
  findItem,
  itemDocValidator,
  requireUserId,
} from "./helpers"
import { searchResultValidator } from "./tmdb"

// Throws unless the collection exists and belongs to the caller.
async function requireCollection(
  ctx: MutationCtx,
  userId: string,
  collectionId: Id<"collections">
): Promise<Doc<"collections">> {
  const collection = await ctx.db.get("collections", collectionId)
  if (collection === null || collection.userId !== userId) {
    throw new Error("Collection not found")
  }
  return collection
}

// Collections plus what their cards need: item count and the poster paths
// of the up-to-4 most recently added items (null = item has no poster).
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("collections"),
      _creationTime: v.number(),
      userId: v.string(),
      name: v.string(),
      itemCount: v.number(),
      previewPosters: v.array(v.union(v.string(), v.null())),
    })
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    const result = []
    for (const collection of collections) {
      const rows = await ctx.db
        .query("collectionItems")
        .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
        .order("desc")
        .collect()
      const previewPosters: (string | null)[] = []
      for (const row of rows.slice(0, 4)) {
        const item = await ctx.db.get("items", row.itemId)
        if (item !== null) {
          previewPosters.push(item.posterPath)
        }
      }
      result.push({ ...collection, itemCount: rows.length, previewPosters })
    }
    return result
  },
})

// Every (collectionId, itemId) pair across the user's collections, so the
// card popover can mark checkboxes without a per-item query. Small for the
// same reason items.listMine is.
export const listMemberships = query({
  args: {},
  returns: v.array(
    v.object({
      collectionId: v.id("collections"),
      itemId: v.id("items"),
    })
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    const memberships: {
      collectionId: Id<"collections">
      itemId: Id<"items">
    }[] = []
    for (const collection of collections) {
      const rows = await ctx.db
        .query("collectionItems")
        .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
        .collect()
      for (const row of rows) {
        memberships.push({ collectionId: row.collectionId, itemId: row.itemId })
      }
    }
    return memberships
  },
})

// Items in one collection, most recently added first.
export const getItems = query({
  args: { collectionId: v.id("collections") },
  returns: v.array(itemDocValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const collection = await ctx.db.get("collections", args.collectionId)
    if (collection === null || collection.userId !== userId) {
      throw new Error("Collection not found")
    }
    const rows = await ctx.db
      .query("collectionItems")
      .withIndex("by_collection", (q) =>
        q.eq("collectionId", args.collectionId)
      )
      .order("desc")
      .collect()
    const items: Doc<"items">[] = []
    for (const row of rows) {
      const item = await ctx.db.get("items", row.itemId)
      if (item !== null) {
        items.push(item)
      }
    }
    return items
  },
})

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("collections"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const name = args.name.trim()
    if (name === "") {
      throw new Error("Collection name cannot be empty")
    }
    return await ctx.db.insert("collections", { userId, name })
  },
})

// Lazy-creates the item doc (like the toggles do) before adding it.
// Idempotent: adding an item that is already in the collection is a no-op.
export const addItem = mutation({
  args: { collectionId: v.id("collections"), item: searchResultValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireCollection(ctx, userId, args.collectionId)
    const doc = await findItem(ctx, userId, args.item)
    const itemId =
      doc?._id ??
      (await ctx.db.insert("items", {
        userId,
        ...args.item,
        inWatchlist: false,
        watched: false,
        updatedAt: Date.now(),
      }))
    const existing = await ctx.db
      .query("collectionItems")
      .withIndex("by_collection_and_item", (q) =>
        q.eq("collectionId", args.collectionId).eq("itemId", itemId)
      )
      .unique()
    if (existing === null) {
      await ctx.db.insert("collectionItems", {
        collectionId: args.collectionId,
        itemId,
      })
    }
    return null
  },
})

export const removeItem = mutation({
  args: { collectionId: v.id("collections"), itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireCollection(ctx, userId, args.collectionId)
    const item = await ctx.db.get("items", args.itemId)
    if (item === null || item.userId !== userId) {
      throw new Error("Item not found")
    }
    const membership = await ctx.db
      .query("collectionItems")
      .withIndex("by_collection_and_item", (q) =>
        q.eq("collectionId", args.collectionId).eq("itemId", args.itemId)
      )
      .unique()
    if (membership !== null) {
      await ctx.db.delete("collectionItems", membership._id)
    }
    await deleteIfFullyUnset(ctx, item)
    return null
  },
})

// Renames a collection. Empty names are rejected like create.
export const rename = mutation({
  args: { collectionId: v.id("collections"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireCollection(ctx, userId, args.collectionId)
    const name = args.name.trim()
    if (name === "") {
      throw new Error("Collection name cannot be empty")
    }
    await ctx.db.patch("collections", args.collectionId, { name })
    return null
  },
})

// Deletes a collection and its memberships. Items whose only tie was this
// collection run through the cleanup rule — with a cap: pathological
// collections keep their items (they become invisible, no flags lost).
const CLEANUP_ITEM_CAP = 500

export const remove = mutation({
  args: { collectionId: v.id("collections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await requireCollection(ctx, userId, args.collectionId)
    const memberships = await ctx.db
      .query("collectionItems")
      .withIndex("by_collection", (q) =>
        q.eq("collectionId", args.collectionId)
      )
      .collect()
    if (memberships.length <= CLEANUP_ITEM_CAP) {
      for (const membership of memberships) {
        const item = await ctx.db.get("items", membership.itemId)
        await ctx.db.delete("collectionItems", membership._id)
        if (item !== null) {
          await deleteIfFullyUnset(ctx, item)
        }
      }
    } else {
      for (const membership of memberships) {
        await ctx.db.delete("collectionItems", membership._id)
      }
    }
    await ctx.db.delete("collections", args.collectionId)
    return null
  },
})
