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

export const get = action({
  args: {
    movieIds: v.array(v.number()),
    tvSeasons: v.array(v.object({ tmdbId: v.number(), season: v.number() })),
  },
  returns: v.object({
    movieMinutes: v.number(),
    moviesWithRuntime: v.number(),
    episodeMinutes: v.number(),
    episodesWithRuntime: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const movieIds = [...new Set(args.movieIds)].slice(0, CAP)
    const seasons = args.tvSeasons.slice(0, CAP)
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
        if (typeof runtime === "number") {
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
        if (payload.runtime !== null) {
          movieMinutes += payload.runtime
          moviesWithRuntime += 1
        }
      }
    }

    // Seasons: sum of episode runtimes.
    const seasonKeys = seasons.map(
      ({ tmdbId, season }) => `tv:${tmdbId}:season:${season}:v1`
    )
    const cachedSeasons =
      seasonKeys.length > 0
        ? ((await ctx.runQuery(internal.tmdb_cache.getBatch, {
            keys: seasonKeys,
          })) as CacheEntry[])
        : []
    const staleSeasons: { tmdbId: number; season: number }[] = []
    for (let i = 0; i < seasons.length; i++) {
      const entry = cachedSeasons[i]
      if (
        entry?.payload != null &&
        Date.now() - entry.fetchedAt < SEASON_TTL_MS
      ) {
        episodeMinutes += sumSeasonMinutes(entry.payload)
        episodesWithRuntime += episodeCount(entry.payload)
      } else {
        staleSeasons.push(seasons[i])
      }
    }
    for (const chunk of chunks(staleSeasons, FETCH_CHUNK)) {
      const results = await Promise.all(
        chunk.map(async ({ tmdbId, season }) => {
          try {
            return {
              tmdbId,
              season,
              data: await tmdbFetch(`/tv/${tmdbId}/season/${season}`, {}),
            }
          } catch {
            return { tmdbId, season, data: null }
          }
        })
      )
      for (const { tmdbId, season, data } of results) {
        if (data === null) continue
        const payload = normalizeSeasonEpisodes(data)
        toWrite.push({
          key: `tv:${tmdbId}:season:${season}:v1`,
          payload,
          fetchedAt: Date.now(),
        })
        episodeMinutes += sumSeasonMinutes(payload)
        episodesWithRuntime += episodeCount(payload)
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
    }
  },
})

function sumSeasonMinutes(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0
  const episodes = (payload as { episodes?: unknown }).episodes
  if (!Array.isArray(episodes)) return 0
  return episodes.reduce((sum, ep) => {
    const runtime = (ep as { runtime?: unknown }).runtime
    return typeof runtime === "number" ? sum + runtime : sum
  }, 0)
}

function episodeCount(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0
  const episodes = (payload as { episodes?: unknown }).episodes
  return Array.isArray(episodes) ? episodes.length : 0
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size)
  }
}
