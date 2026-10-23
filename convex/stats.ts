import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import { normalizeDetails, normalizeSeasonEpisodes, tmdbFetch } from "./tmdb"

// Watch-time estimation for the stats page. Runtime data comes from the
// SAME cache entries the details drawer writes (details:movie:* for movie
// runtimes, tv:*:season:* for episode runtimes), so a warm library costs
// almost nothing. The client derives everything else (counts) reactively.

const DETAILS_TTL_MS = 6 * 60 * 60 * 1000
const SEASON_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_CHUNK = 6
const CAP = 300

type CacheEntry = { payload: unknown; fetchedAt: number }
type SeasonSelection = {
  tmdbId: number
  season: number
  episodes: Set<number>
}

export const get = action({
  args: {
    movieIds: v.array(v.number()),
    tvSeasons: v.array(
      v.object({
        tmdbId: v.number(),
        season: v.number(),
        episodes: v.array(v.number()),
      })
    ),
  },
  returns: v.object({
    movieMinutes: v.number(),
    moviesWithRuntime: v.number(),
    episodeMinutes: v.number(),
    episodesWithRuntime: v.number(),
    limited: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }

    // Merge before capping so duplicates cannot consume coverage or drop selections.
    for (const id of args.movieIds) {
      validateInteger(id, "Movie ID", 1)
    }
    const uniqueMovieIds = [...new Set(args.movieIds)]
    const uniqueSeasons = new Map<string, SeasonSelection>()
    for (const { tmdbId, season, episodes } of args.tvSeasons) {
      validateInteger(tmdbId, "TV ID", 1)
      validateInteger(season, "Season number", 0)
      const key = `${tmdbId}:${season}`
      const selection = uniqueSeasons.get(key) ?? {
        tmdbId,
        season,
        episodes: new Set<number>(),
      }
      for (const episode of episodes) {
        validateInteger(episode, "Episode number", 1)
        selection.episodes.add(episode)
      }
      uniqueSeasons.set(key, selection)
    }
    const limited = uniqueMovieIds.length > CAP || uniqueSeasons.size > CAP
    const movieIds = uniqueMovieIds.slice(0, CAP)
    const seasons = [...uniqueSeasons.values()]
      .slice(0, CAP)
      .filter(({ episodes }) => episodes.size > 0)
    let movieMinutes = 0
    let moviesWithRuntime = 0
    let episodeMinutes = 0
    let episodesWithRuntime = 0

    const toWrite: { key: string; payload: unknown; fetchedAt: number }[] = []

    // Movies: runtime from the details payload (shared with the drawer).
    const movieKeys = movieIds.map((id) => `details:movie:${id}:v2`)
    const cachedMovies =
      movieKeys.length > 0
        ? ((await ctx.runQuery(internal.tmdb_cache.getBatch, {
            keys: movieKeys,
          })) as CacheEntry[])
        : []
    const staleMovieIds: number[] = []
    for (let i = 0; i < movieIds.length; i++) {
      const entry = cachedMovies[i]
      if (
        entry?.payload != null &&
        Date.now() - entry.fetchedAt < DETAILS_TTL_MS
      ) {
        const runtime = (entry.payload as { runtime?: unknown }).runtime
        if (hasRuntime(runtime)) {
          movieMinutes += runtime
          moviesWithRuntime += 1
        }
      } else {
        staleMovieIds.push(movieIds[i])
      }
    }
    for (const chunk of chunks(staleMovieIds, FETCH_CHUNK)) {
      const results = await Promise.all(
        chunk.map(async (id) => {
          try {
            const [data, images] = await Promise.all([
              tmdbFetch(`/movie/${id}`, {}),
              tmdbFetch(`/movie/${id}/images`, {
                include_image_language: "en,null",
              }),
            ])
            return { id, data, images }
          } catch {
            return { id, data: null, images: null }
          }
        })
      )
      for (const { id, data, images } of results) {
        if (data === null) continue
        // Full normalized payload — this key is shared with the details
        // drawer; a runtime-only entry would blank the drawer header.
        const payload = normalizeDetails(data, images ?? {}, "movie")
        toWrite.push({
          key: `details:movie:${id}:v2`,
          payload,
          fetchedAt: Date.now(),
        })
        if (hasRuntime(payload.runtime)) {
          movieMinutes += payload.runtime
          moviesWithRuntime += 1
        }
      }
    }

    // Seasons: only selected episodes with usable runtimes contribute.
    const seasonKeys = seasons.map(
      ({ tmdbId, season }) => `tv:${tmdbId}:season:${season}:v1`
    )
    const cachedSeasons =
      seasonKeys.length > 0
        ? ((await ctx.runQuery(internal.tmdb_cache.getBatch, {
            keys: seasonKeys,
          })) as CacheEntry[])
        : []
    const staleSeasons: SeasonSelection[] = []
    for (let i = 0; i < seasons.length; i++) {
      const entry = cachedSeasons[i]
      if (
        entry?.payload != null &&
        Date.now() - entry.fetchedAt < SEASON_TTL_MS
      ) {
        const totals = selectedEpisodeTotals(entry.payload, seasons[i].episodes)
        episodeMinutes += totals.minutes
        episodesWithRuntime += totals.count
      } else {
        staleSeasons.push(seasons[i])
      }
    }
    for (const chunk of chunks(staleSeasons, FETCH_CHUNK)) {
      const results = await Promise.all(
        chunk.map(async (selection) => {
          const { tmdbId, season } = selection
          try {
            return {
              selection,
              data: await tmdbFetch(`/tv/${tmdbId}/season/${season}`, {}),
            }
          } catch {
            return { selection, data: null }
          }
        })
      )
      for (const { selection, data } of results) {
        if (data === null) continue
        const { tmdbId, season, episodes } = selection
        // Cache the entire season, never a caller's filtered selection.
        const payload = normalizeSeasonEpisodes(data)
        toWrite.push({
          key: `tv:${tmdbId}:season:${season}:v1`,
          payload,
          fetchedAt: Date.now(),
        })
        const totals = selectedEpisodeTotals(payload, episodes)
        episodeMinutes += totals.minutes
        episodesWithRuntime += totals.count
      }
    }

    if (toWrite.length > 0) {
      await ctx.runMutation(internal.tmdb_cache.putBatch, {
        entries: toWrite,
      })
    }

    return {
      movieMinutes,
      moviesWithRuntime,
      episodeMinutes,
      episodesWithRuntime,
      limited,
    }
  },
})

function validateInteger(value: number, name: string, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer >= ${minimum}`)
  }
}

function hasRuntime(runtime: unknown): runtime is number {
  return typeof runtime === "number" && Number.isFinite(runtime) && runtime > 0
}

function selectedEpisodeTotals(
  payload: unknown,
  selected: ReadonlySet<number>
) {
  const totals = { minutes: 0, count: 0 }
  if (typeof payload !== "object" || payload === null) return totals
  const episodes = (payload as { episodes?: unknown }).episodes
  if (!Array.isArray(episodes)) return totals
  const remaining = new Set(selected)
  for (const ep of episodes) {
    if (typeof ep !== "object" || ep === null) continue
    const { episode, runtime } = ep as { episode?: unknown; runtime?: unknown }
    if (
      typeof episode === "number" &&
      remaining.has(episode) &&
      hasRuntime(runtime)
    ) {
      totals.minutes += runtime
      totals.count += 1
      remaining.delete(episode)
    }
  }
  return totals
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size)
  }
}
