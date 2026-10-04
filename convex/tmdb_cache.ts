import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

// Internal read/write for the tmdbCache table. Actions use these via
// ctx.runQuery / ctx.runMutation (actions have no ctx.db). Cache entries are
// per normalized payload (one key = one fetch result), TTL is checked by the
// reader against fetchedAt so different payloads can use different TTLs.

export const getBatch = internalQuery({
  args: { keys: v.array(v.string()) },
  returns: v.array(v.object({ payload: v.any(), fetchedAt: v.number() })),
  handler: async (ctx, args) => {
    const out: { payload: unknown; fetchedAt: number }[] = []
    for (const key of args.keys) {
      const doc = await ctx.db
        .query("tmdbCache")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
      out.push(
        doc === null
          ? { payload: null, fetchedAt: 0 }
          : { payload: doc.payload, fetchedAt: doc.fetchedAt }
      )
    }
    return out
  },
})

// Upserts a batch of entries. Entries with payload null are skipped (nothing
// worth caching — e.g. a failed normalize).
export const putBatch = internalMutation({
  args: {
    entries: v.array(
      v.object({ key: v.string(), payload: v.any(), fetchedAt: v.number() })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const entry of args.entries) {
      if (entry.payload === null) continue
      const existing = await ctx.db
        .query("tmdbCache")
        .withIndex("by_key", (q) => q.eq("key", entry.key))
        .unique()
      if (existing === null) {
        await ctx.db.insert("tmdbCache", entry)
      } else {
        await ctx.db.patch("tmdbCache", existing._id, {
          payload: entry.payload,
          fetchedAt: entry.fetchedAt,
        })
      }
    }
    return null
  },
})
