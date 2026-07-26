import type { Id } from "@/convex/_generated/dataModel"

export type MediaType = "movie" | "tv"

// Minimal TMDB snapshot used by cards, search results and item mutations.
export type MediaItem = {
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath: string | null
  year: string | null
}

export function tmdbPosterUrl(posterPath: string) {
  return `https://image.tmdb.org/t/p/w342${posterPath}`
}

export function tmdbBackdropUrl(backdropPath: string) {
  return `https://image.tmdb.org/t/p/w780${backdropPath}`
}

export type Sentiment = "liked" | "disliked"

// A user collection as list/menu entries need it (from collections.listMine).
export type CollectionSummary = {
  _id: Id<"collections">
  name: string
}

// The user's saved state for one title (from items.listMine, joined with
// collection memberships client-side).
export type ItemState = {
  itemId: Id<"items">
  inWatchlist: boolean
  watched: boolean
  sentiment?: Sentiment
  collectionIds: ReadonlySet<Id<"collections">>
}

// Stable client-side key for one TMDB title (ids can collide across types).
export function mediaKey(item: Pick<MediaItem, "mediaType" | "tmdbId">) {
  return `${item.mediaType}:${item.tmdbId}`
}
