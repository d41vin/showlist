import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import { normalizeDetails, normalizeSeasonEpisodes, tmdbFetch } from "./tmdb"
import { isRecent, isUpcoming, parseDayMs } from "./schedule_windows"

// Schedule computation. Reads the SAME cache entries the details drawer
// writes (details:tv:*), with a stricter freshness rule — air dates must be
// close to current for the schedule to mean anything. The client passes its
// local ISO date so "upcoming" and "recent" windows land in the user's own
// calendar day.

const DETAILS_TTL_MS = 6 * 60 * 60 * 1000
const SEASON_TTL_MS = 24 * 60 * 60 * 1000
// Full-season drops (Netflix-style) can put dozens of episodes in the
// window; the schedule list stays sane with a per-show cap.
const MAX_UPCOMING_PER_SHOW = 10
const FETCH_CHUNK = 6
// Hard cap on shows per schedule computation — protects TMDB rate limits
// and response size.
const SHOW_CAP = 200

const scheduleEpisodeValidator = v.object({
  season: v.number(),
  episode: v.number(),
  name: v.union(v.string(), v.null()),
  airDate: v.union(v.string(), v.null()),
})

export const get = action({
  args: { tmdbIds: v.array(v.number()), today: v.string() },
  returns: v.object({
    entries: v.array(
      v.object({
        tmdbId: v.number(),
        status: v.union(v.string(), v.null()),
        upcoming: v.array(scheduleEpisodeValidator),
        lastEpisode: v.union(scheduleEpisodeValidator, v.null()),
      })
    ),
    // True when more than SHOW_CAP shows were requested — the rest were
    // silently dropped, and the UI says so.
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const unique = [...new Set(args.tmdbIds)]
    const truncated = unique.length > SHOW_CAP
    const ids = unique.slice(0, SHOW_CAP)
    if (ids.length === 0) {
      return { entries: [], truncated: false }
    }
    const todayMs = parseDayMs(args.today)
    if (todayMs === null) {
      throw new Error("Invalid date")
    }

    // 1. Show summaries — shared cache keys with tmdb.details.
    const keys = ids.map((tmdbId) => `details:tv:${tmdbId}:v2`)
    const cached = (await ctx.runQuery(internal.tmdb_cache.getBatch, {
      keys,
    })) as { payload: unknown; fetchedAt: number }[]

    type Summary = ReturnType<typeof normalizeDetails>
    const summaries: (Summary | null)[] = new Array(ids.length).fill(null)
    const toWrite: { key: string; payload: unknown; fetchedAt: number }[] = []
    const staleIds: number[] = []
    for (let i = 0; i < ids.length; i++) {
      const entry = cached[i]
      if (
        entry?.payload != null &&
        Date.now() - entry.fetchedAt < DETAILS_TTL_MS
      ) {
        summaries[i] = entry.payload as Summary
      } else {
        staleIds.push(ids[i])
      }
    }

    // 2. Fetch stale summaries in bounded chunks.
    for (const chunk of chunks(staleIds, FETCH_CHUNK)) {
      const results = await Promise.all(
        chunk.map(async (tmdbId) => {
          try {
            const [data, images] = await Promise.all([
              tmdbFetch(`/tv/${tmdbId}`, { language: "en-US" }),
              tmdbFetch(`/tv/${tmdbId}/images`, {
                include_image_language: "en,null",
              }),
            ])
            return { tmdbId, data, images }
          } catch {
            return { tmdbId, data: null, images: null }
          }
        })
      )
      for (const { tmdbId, data, images } of results) {
        if (data === null) continue
        // Complete payload — these cache entries are shared with the
        // details drawer, so a logo-less one would blank the drawer header.
        const payload = normalizeDetails(data, images ?? {}, "tv")
        summaries[ids.indexOf(tmdbId)] = payload
        toWrite.push({
          key: `details:tv:${tmdbId}:v2`,
          payload,
          fetchedAt: Date.now(),
        })
      }
    }

    // 3. Which shows have episodes airing in the window? Their active season
    //    needs an episode list (double-episode weeks, full-season drops).
    const seasonNeeds: { tmdbId: number; season: number }[] = []
    for (let i = 0; i < ids.length; i++) {
      const summary = summaries[i]
      if (!summary || summary.nextEpisode === null) continue
      const airMs = parseDayMs(summary.nextEpisode.airDate)
      if (airMs !== null && isUpcoming(airMs, todayMs)) {
        seasonNeeds.push({
          tmdbId: ids[i],
          season: summary.nextEpisode.season,
        })
      }
    }

    const seasonCacheKeys = seasonNeeds.map(
      ({ tmdbId, season }) => `tv:${tmdbId}:season:${season}:v1`
    )
    const cachedSeasons =
      seasonCacheKeys.length > 0
        ? ((await ctx.runQuery(internal.tmdb_cache.getBatch, {
            keys: seasonCacheKeys,
          })) as { payload: unknown; fetchedAt: number }[])
        : []
    type Season = ReturnType<typeof normalizeSeasonEpisodes>
    const seasonEpisodes: (Season | null)[] = seasonNeeds.map((_, i) => {
      const entry = cachedSeasons[i]
      return entry?.payload != null &&
        Date.now() - entry.fetchedAt < SEASON_TTL_MS
        ? (entry.payload as Season)
        : null
    })
    const staleSeasonNeeds = seasonNeeds.filter(
      (_, i) => seasonEpisodes[i] === null
    )
    for (const chunk of chunks(staleSeasonNeeds, FETCH_CHUNK)) {
      const results = await Promise.all(
        chunk.map(async ({ tmdbId, season }) => {
          try {
            const data = await tmdbFetch(`/tv/${tmdbId}/season/${season}`, {
              language: "en-US",
            })
            return { tmdbId, season, data }
          } catch {
            return { tmdbId, season, data: null }
          }
        })
      )
      for (const { tmdbId, season, data } of results) {
        if (data === null) continue
        const payload = normalizeSeasonEpisodes(data)
        const i = seasonNeeds.findIndex(
          (need) => need.tmdbId === tmdbId && need.season === season
        )
        if (i !== -1) {
          seasonEpisodes[i] = payload
        }
        toWrite.push({
          key: `tv:${tmdbId}:season:${season}:v1`,
          payload,
          fetchedAt: Date.now(),
        })
      }
    }

    if (toWrite.length > 0) {
      await ctx.runMutation(internal.tmdb_cache.putBatch, {
        entries: toWrite,
      })
    }

    // 4. Build per-show entries: every episode of the active season airing in
    //    the upcoming window, plus the last aired episode for catch-up.
    const out = []
    for (let i = 0; i < ids.length; i++) {
      const summary = summaries[i]
      if (summary === null) continue
      const upcoming: {
        season: number
        episode: number
        name: string | null
        airDate: string | null
      }[] = []

      if (summary.nextEpisode !== null) {
        const next = summary.nextEpisode
        const needIndex = seasonNeeds.findIndex(
          (need) => need.tmdbId === ids[i] && need.season === next.season
        )
        const seasonData = needIndex !== -1 ? seasonEpisodes[needIndex] : null
        const candidates =
          seasonData !== null
            ? seasonData.episodes
            : [
                {
                  episode: next.episode,
                  name: next.name,
                  overview: null,
                  airDate: next.airDate,
                  runtime: null,
                  stillPath: null,
                },
              ]
        for (const ep of candidates) {
          const airMs = parseDayMs(ep.airDate)
          if (airMs === null || !isUpcoming(airMs, todayMs)) {
            continue
          }
          upcoming.push({
            season: next.season,
            episode: ep.episode,
            name: ep.name,
            airDate: ep.airDate,
          })
        }
        upcoming.sort(
          (a, b) =>
            (a.airDate ?? "").localeCompare(b.airDate ?? "") ||
            a.episode - b.episode
        )
      }

      // Only meaningful while it's still recent — old lastEpisodes are noise
      // for a schedule.
      let lastEpisode: {
        season: number
        episode: number
        name: string | null
        airDate: string | null
      } | null = null
      if (summary.lastEpisode !== null) {
        const airMs = parseDayMs(summary.lastEpisode.airDate)
        if (airMs !== null && isRecent(airMs, todayMs)) {
          lastEpisode = {
            season: summary.lastEpisode.season,
            episode: summary.lastEpisode.episode,
            name: summary.lastEpisode.name,
            airDate: summary.lastEpisode.airDate,
          }
        }
      }

      if (upcoming.length === 0 && lastEpisode === null) {
        continue
      }
      out.push({
        tmdbId: ids[i],
        status: summary.status,
        upcoming: upcoming.slice(0, MAX_UPCOMING_PER_SHOW),
        lastEpisode,
      })
    }
    return { entries: out, truncated }
  },
})

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size)
  }
}
