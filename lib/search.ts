import type { Doc } from "@/convex/_generated/dataModel"
import { mediaKey, type ItemState, type MediaItem } from "./media"

export type SearchType = "all" | "movie" | "tv"
export type SearchStatus = "all" | "watchlist" | "watching" | "watched"
export type SearchSort =
  "relevance" | "popularity" | "newest" | "rating" | "title" | "year" | "added"
export type SortOrder = "asc" | "desc"
export type EntitySort = "popularity" | "newest"
export type TitleSort =
  "relevance" | "popularity" | "newest" | "rating" | "title"
export type SearchSentiment = "all" | "liked" | "disliked" | "none"

export function defaultSortOrder(sort: SearchSort | EntitySort | TitleSort) {
  return sort === "title" ? "asc" : "desc"
}

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

export function matchesTitle(title: string, query: string) {
  const normalized = normalizeSearch(title)
  return normalizeSearch(query)
    .split(" ")
    .every((word) => normalized.includes(word))
}

function relevance(title: string, query: string) {
  const normalized = normalizeSearch(title)
  const q = normalizeSearch(query)
  return normalized === q
    ? 0
    : normalized.startsWith(q)
      ? 1
      : normalized.includes(q)
        ? 2
        : 3
}

export function searchLibrary(
  items: Doc<"items">[],
  states: Map<string, ItemState>,
  filters: {
    query: string
    type: SearchType
    status?: SearchStatus
    sentiment?: SearchSentiment
    collection?: string
    sort?: SearchSort
    order?: SortOrder
  }
) {
  const {
    query,
    type,
    status = "all",
    sentiment = "all",
    collection = "all",
    sort = "relevance",
    order = defaultSortOrder(sort),
  } = filters
  const filtered = items.filter(
    (item) =>
      matchesTitle(item.title, query) &&
      (type === "all" || item.mediaType === type) &&
      (status === "all" ||
        (status === "watchlist" ? item.inWatchlist : item[status])) &&
      (sentiment === "all" ||
        (sentiment === "none"
          ? item.sentiment === undefined
          : item.sentiment === sentiment)) &&
      (collection === "all" ||
        [...(states.get(mediaKey(item))?.collectionIds ?? [])].some(
          (id) => id === collection
        ))
  )
  const addedAt = (item: Doc<"items">) =>
    (status === "watchlist"
      ? item.watchlistAt
      : status === "watching"
        ? item.watchingAt
        : status === "watched"
          ? item.watchedAt
          : undefined) ?? item._creationTime
  const direction = order === "asc" ? 1 : -1
  return filtered.sort((a, b) => {
    const delta =
      sort === "title"
        ? a.title.localeCompare(b.title) * direction
        : sort === "year"
          ? a.year === null && b.year === null
            ? 0
            : a.year === null
              ? 1
              : b.year === null
                ? -1
                : a.year.localeCompare(b.year) * direction
          : sort === "added"
            ? (addedAt(a) - addedAt(b)) * direction
            : sort === "relevance"
              ? relevance(a.title, query) - relevance(b.title, query)
              : 0
    return (
      delta ||
      a.title.localeCompare(b.title) ||
      mediaKey(a).localeCompare(mediaKey(b))
    )
  })
}

export function uniqueMedia(items: MediaItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = mediaKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function searchHref(query: string, type: SearchType = "all") {
  const params = new URLSearchParams()
  if (query.trim()) params.set("q", query.trim().slice(0, 200))
  if (type !== "all") params.set("type", type)
  return `/search${params.size ? `?${params}` : ""}`
}

export function savedLabels(state: ItemState | undefined) {
  if (!state) return []
  const labels = [
    ...(state.inWatchlist ? ["Watchlist"] : []),
    ...(state.watching ? ["Watching"] : []),
    ...(state.watched ? ["Watched"] : []),
    ...(state.sentiment === "liked"
      ? ["Liked"]
      : state.sentiment === "disliked"
        ? ["Disliked"]
        : []),
  ]
  return labels.length ? labels : ["In library"]
}
