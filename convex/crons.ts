import { v } from "convex/values"

import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

// Keeps the tmdbCache table bounded: entries older than 30 days are deleted
// in batches; if a batch fills, the mutation reschedules itself so a big
// backlog drains across transactions instead of blowing the limits. An
// actively-refreshed entry whose _creationTime is old simply gets refetched
// on next read — eviction is correctness-neutral.

const BATCH_SIZE = 500
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const crons = cronJobs()

crons.interval(
  "evict stale tmdb cache entries",
  { hours: 24 * 7 },
  internal.crons.evictBatch,
  {}
)

export default crons

export const evictBatch = internalMutation({
  args: { maxAgeMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.maxAgeMs ?? MAX_AGE_MS)
    const stale = await ctx.db
      .query("tmdbCache")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(BATCH_SIZE)
    for (const doc of stale) {
      await ctx.db.delete("tmdbCache", doc._id)
    }
    if (stale.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.crons.evictBatch, args)
    }
    return null
  },
})
