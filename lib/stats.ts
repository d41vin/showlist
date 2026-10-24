import type { Doc } from "../convex/_generated/dataModel"

type StatsItem = Pick<
  Doc<"items">,
  "tmdbId" | "mediaType" | "title" | "watched" | "watchedAt"
>
export type EpisodeWatch = Pick<
  Doc<"episodeWatches">,
  "tmdbId" | "season" | "episode" | "watchedAt"
>

// Shared with the action so cap-only gaps never offer an ineffective retry.
export const RUNTIME_REQUEST_CAP = 300

type LibraryItem = Pick<
  Doc<"items">,
  | "tmdbId"
  | "mediaType"
  | "inWatchlist"
  | "watching"
  | "watched"
  | "sentiment"
  | "updatedAt"
>

export function getLibraryCounts(
  items: LibraryItem[],
  watches: EpisodeWatch[]
) {
  const distinct = new Map<string, LibraryItem>()
  for (const item of items) {
    const key = `${item.mediaType}:${item.tmdbId}`
    const previous = distinct.get(key)
    // Statuses are independent; a duplicated title contributes once to each.
    // Conflicting sentiments use the most recently updated document.
    distinct.set(
      key,
      previous
        ? {
            ...(previous.updatedAt > item.updatedAt ? previous : item),
            inWatchlist: previous.inWatchlist || item.inWatchlist,
            watching: previous.watching === true || item.watching === true,
            watched: previous.watched || item.watched,
          }
        : item
    )
  }
  const titles = [...distinct.values()]
  return {
    titles: titles.length,
    movies: titles.filter((item) => item.mediaType === "movie").length,
    shows: titles.filter((item) => item.mediaType === "tv").length,
    episodes: getDistinctEpisodeWatches(watches).length,
    watchlist: titles.filter((item) => item.inWatchlist).length,
    watching: titles.filter((item) => item.watching).length,
    watched: titles.filter((item) => item.watched).length,
    liked: titles.filter((item) => item.sentiment === "liked").length,
    disliked: titles.filter((item) => item.sentiment === "disliked").length,
  }
}

function hasDate(timestamp: number | undefined): timestamp is number {
  return (
    timestamp !== undefined && Number.isFinite(new Date(timestamp).getTime())
  )
}

// Legacy duplicate logs are one watch, not rewatches. Use the oldest known
// date, matching the bounded repair in episodes.setSeason.
function distinctLogs<T extends { watchedAt?: number }>(
  rows: T[],
  keyFor: (row: T) => string | number
) {
  const distinct = new Map<string | number, T>()
  for (const row of rows) {
    const key = keyFor(row)
    const previous = distinct.get(key)
    if (
      !previous ||
      (hasDate(row.watchedAt) &&
        (!hasDate(previous.watchedAt) || row.watchedAt < previous.watchedAt))
    ) {
      distinct.set(key, row)
    }
  }
  return [...distinct.values()]
}

export function getDistinctEpisodeWatches(watches: EpisodeWatch[]) {
  return distinctLogs(
    watches,
    (watch) => `${watch.tmdbId}:${watch.season}:${watch.episode}`
  )
}

function getWatchedMovies(items: StatsItem[]) {
  return distinctLogs(
    items.filter((item) => item.mediaType === "movie" && item.watched),
    (item) => item.tmdbId
  )
}

export function buildRuntimeRequest(
  items: StatsItem[],
  watches: EpisodeWatch[]
) {
  const movieIds = [
    ...new Set(
      items
        .filter((item) => item.mediaType === "movie" && item.watched)
        .map((item) => item.tmdbId)
    ),
  ].sort((a, b) => a - b)
  const seasons = new Map<
    string,
    { tmdbId: number; season: number; episodes: Set<number> }
  >()
  for (const watch of watches) {
    const key = `${watch.tmdbId}:${watch.season}`
    const entry = seasons.get(key) ?? {
      tmdbId: watch.tmdbId,
      season: watch.season,
      episodes: new Set<number>(),
    }
    entry.episodes.add(watch.episode)
    seasons.set(key, entry)
  }
  const tvSeasons = [...seasons.values()]
    .sort((a, b) => a.tmdbId - b.tmdbId || a.season - b.season)
    .map(({ tmdbId, season, episodes }) => ({
      tmdbId,
      season,
      episodes: [...episodes].sort((a, b) => a - b),
    }))
  return { movieIds, tvSeasons }
}

export function getRuntimeCoverage(
  request: ReturnType<typeof buildRuntimeRequest>,
  data: { moviesWithRuntime: number; episodesWithRuntime: number }
) {
  const movieCount = request.movieIds.length
  const episodeCount = request.tvSeasons.reduce(
    (total, season) => total + season.episodes.length,
    0
  )
  const eligibleCount =
    Math.min(movieCount, RUNTIME_REQUEST_CAP) +
    request.tvSeasons
      .slice(0, RUNTIME_REQUEST_CAP)
      .reduce((total, season) => total + season.episodes.length, 0)
  const known = data.moviesWithRuntime + data.episodesWithRuntime
  return {
    movieCount,
    episodeCount,
    missing: Math.max(0, movieCount + episodeCount - known),
    retryableMissing: Math.max(0, eligibleCount - known),
    capped: movieCount + episodeCount - eligibleCount,
  }
}

export function getActivityYears(
  items: StatsItem[],
  watches: EpisodeWatch[],
  currentYear: number
) {
  const years = new Set([currentYear])
  for (const row of [
    ...getWatchedMovies(items),
    ...getDistinctEpisodeWatches(watches),
  ]) {
    if (hasDate(row.watchedAt)) {
      years.add(new Date(row.watchedAt).getFullYear())
    }
  }
  return [...years].sort((a, b) => b - a)
}

export function getMonthlyActivity(
  items: StatsItem[],
  watches: EpisodeWatch[],
  year: number
) {
  const months = Array.from({ length: 12 }, (_, month) => ({
    month: new Date(year, month, 1).toLocaleDateString("en", {
      month: "short",
    }),
    movies: 0,
    episodes: 0,
  }))
  const days = new Set<string>()
  const record = (timestamp: number, type: "movies" | "episodes") => {
    const date = new Date(timestamp)
    if (date.getFullYear() !== year) return
    months[date.getMonth()][type] += 1
    days.add(`${date.getMonth()}:${date.getDate()}`)
  }
  let undatedMovies = 0
  for (const item of getWatchedMovies(items)) {
    if (!hasDate(item.watchedAt)) {
      undatedMovies += 1
    } else {
      record(item.watchedAt, "movies")
    }
  }
  for (const watch of getDistinctEpisodeWatches(watches)) {
    if (hasDate(watch.watchedAt)) record(watch.watchedAt, "episodes")
  }
  return {
    months,
    movies: months.reduce((total, month) => total + month.movies, 0),
    episodes: months.reduce((total, month) => total + month.episodes, 0),
    activeDays: days.size,
    undatedMovies,
  }
}

export function getTopShows(items: StatsItem[], watches: EpisodeWatch[]) {
  const titles = new Map(
    items
      .filter((item) => item.mediaType === "tv")
      .map((item) => [item.tmdbId, item.title])
  )
  const episodesByShow = new Map<number, Set<string>>()
  for (const watch of watches) {
    const episodes = episodesByShow.get(watch.tmdbId) ?? new Set<string>()
    episodes.add(`${watch.season}:${watch.episode}`)
    episodesByShow.set(watch.tmdbId, episodes)
  }
  return [...episodesByShow]
    .map(([tmdbId, episodes]) => ({
      tmdbId,
      title: titles.get(tmdbId) ?? `Show #${tmdbId}`,
      episodes: episodes.size,
    }))
    .sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title))
    .slice(0, 5)
}

export function formatWatchTime(minutes: number) {
  const rounded = Math.round(minutes)
  const days = Math.floor(rounded / 1440)
  const hours = Math.floor((rounded % 1440) / 60)
  const remainder = rounded % 60
  return (
    [
      days ? `${days}d` : "",
      hours ? `${hours}h` : "",
      remainder ? `${remainder}m` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0m"
  )
}

export function csvField(value: string | number | boolean) {
  const text = String(value)
  // Quoting alone does not stop spreadsheet apps from evaluating formulas.
  const safe =
    typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)
      ? `'${text}`
      : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
