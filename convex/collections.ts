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

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("collections"),
      _creationTime: v.number(),
      userId: v.string(),
      name: v.string(),
    })
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    return await ctx.db
      .query("collections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
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
