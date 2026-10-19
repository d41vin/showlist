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

export function tmdbBackdropUrl(
  backdropPath: string,
  size: "w780" | "w1280" | "original" = "w780"
) {
  return `https://image.tmdb.org/t/p/${size}${backdropPath}`
}

export function tmdbLogoUrl(logoPath: string) {
  return `https://image.tmdb.org/t/p/w300${logoPath}`
}

// Episode stills — small 16:9 thumbnails in episode lists.
export function tmdbStillUrl(stillPath: string) {
  return `https://image.tmdb.org/t/p/w185${stillPath}`
}

// Tiny poster thumbs (schedule rows, dense lists).
export function tmdbPosterThumbUrl(posterPath: string) {
  return `https://image.tmdb.org/t/p/w92${posterPath}`
}

// The user's local today as an ISO date string — the same form TMDB air
// dates use, so day grouping and "unaired" checks stay in the user's own
// calendar day.
export function localTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

// An ISO date shifted by N days in the user's local calendar — day math
// around localTodayISO (badge windows, week bounds).
export function localDateOffset(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(year, month - 1, day + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

// The Monday-start week containing the local today, shifted by weekOffset
// weeks (0 = this week, -1 = last week, …). Bounds are ISO dates in the
// user's own calendar days — the same form TMDB air dates use.
export function localWeekRange(weekOffset: number): {
  from: string
  to: string
} {
  const now = new Date()
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7
  )
  const from = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
  return { from, to: localDateOffset(from, 6) }
}

export type Sentiment = "liked" | "disliked"

// A user collection as list/menu entries need it (from collections.listMine).
export type CollectionSummary = {
  _id: Id<"collections">
  name: string
}

// What a collection card renders: summary plus count and the poster paths of
// the up-to-4 most recently added items (from collections.listMine).
export type CollectionPreview = CollectionSummary & {
  itemCount: number
  previewPosters: (string | null)[]
}

// The user's saved state for one title (from items.listMine, joined with
// collection memberships client-side).
export type ItemState = {
  itemId: Id<"items">
  inWatchlist: boolean
  watching: boolean
  watched: boolean
  sentiment?: Sentiment
  collectionIds: ReadonlySet<Id<"collections">>
}

// Stable client-side key for one TMDB title (ids can collide across types).
export function mediaKey(item: Pick<MediaItem, "mediaType" | "tmdbId">) {
  return `${item.mediaType}:${item.tmdbId}`
}
