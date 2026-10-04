import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // One doc per user + TMDB title. Created lazily on first action and
  // deleted when fully unset (no flags, no sentiment, in no collection).
  items: defineTable({
    userId: v.string(),
    tmdbId: v.number(),
    mediaType: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterPath: v.union(v.string(), v.null()),
    year: v.union(v.string(), v.null()),
    inWatchlist: v.boolean(),
    watched: v.boolean(),
    // Optional because it was added after launch; undefined means false.
    watching: v.optional(v.boolean()),
    // When each status was last turned on — tabs sort by these so toggling
    // one status never reorders the other tabs. Unset while the status is
    // off (and on docs predating the fields).
    watchlistAt: v.optional(v.number()),
    watchedAt: v.optional(v.number()),
    watchingAt: v.optional(v.number()),
    sentiment: v.optional(v.union(v.literal("liked"), v.literal("disliked"))),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_mediaType_and_tmdbId", [
      "userId",
      "mediaType",
      "tmdbId",
    ]),

  collections: defineTable({
    userId: v.string(),
    name: v.string(),
  }).index("by_user", ["userId"]),

  collectionItems: defineTable({
    collectionId: v.id("collections"),
    itemId: v.id("items"),
  })
    .index("by_collection", ["collectionId"])
    .index("by_item", ["itemId"])
    .index("by_collection_and_item", ["collectionId", "itemId"]),

  // One tick per (user, show, episode). References the show by TMDB id (not
  // the item doc) so ticks survive item re-creation and the rewatch flow.
  episodeWatches: defineTable({
    userId: v.string(),
    tmdbId: v.number(),
    season: v.number(),
    episode: v.number(),
    watchedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_tmdbId", ["userId", "tmdbId"])
    .index("by_user_and_tmdbId_and_season", ["userId", "tmdbId", "season"]),

  // Cached TMDB responses, written only from actions (via internal helpers).
  // payload shape is per cacheKey; fetchedAt drives the TTL check on read.
  tmdbCache: defineTable({
    key: v.string(),
    payload: v.any(),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),
})
