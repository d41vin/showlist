import type { Doc } from "@/convex/_generated/dataModel"

type StatsItem = Pick<
  Doc<"items">,
  "tmdbId" | "mediaType" | "title" | "watched" | "watchedAt"
>
export type EpisodeWatch = Pick<
  Doc<"episodeWatches">,
  "tmdbId" | "season" | "episode" | "watchedAt"
>

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

export function getActivityYears(
  items: StatsItem[],
  watches: EpisodeWatch[],
  currentYear: number
) {
  const years = new Set([currentYear])
  for (const item of items) {
    if (
      item.mediaType === "movie" &&
      item.watched &&
      item.watchedAt !== undefined
    ) {
      years.add(new Date(item.watchedAt).getFullYear())
    }
  }
  for (const watch of watches) {
    years.add(new Date(watch.watchedAt).getFullYear())
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
  for (const item of items) {
    if (item.mediaType !== "movie" || !item.watched) continue
    if (item.watchedAt === undefined) {
      undatedMovies += 1
    } else {
      record(item.watchedAt, "movies")
    }
  }
  for (const watch of watches) record(watch.watchedAt, "episodes")
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
