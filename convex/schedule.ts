import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import { normalizeDetails, normalizeSeasonEpisodes, tmdbFetch } from "./tmdb"
import { inRange, parseDayMs } from "./schedule_windows"

// Schedule computation. Reads the SAME cache entries the details drawer
// writes (details:tv:*), with a stricter freshness rule — air dates must be
// close to current for the schedule to mean anything. The client passes the
// ISO bounds of the week it is viewing (its own local calendar days); the
// action returns every episode of the user's shows airing inside [from, to].
//
// Which seasons can contain range episodes? Episodes air sequentially:
//   - unaired episodes start at next_episode_to_air, so that season is a
//     candidate when its next episode airs on or before `to`;
//   - aired episodes end at last_episode_to_air, so that season is a
//     candidate when it aired on or after `from`.
// Browsing far into the past can therefore land in seasons this never
// fetches (season changes, shows that ended long ago) — those weeks show
// fewer rows than reality, and the UI words that honestly.

const DETAILS_TTL_MS = 6 * 60 * 60 * 1000
const SEASON_TTL_MS = 24 * 60 * 60 * 1000
// Full-season drops (Netflix-style) can put a dozen-plus episodes in one
// week; the week list stays sane with a per-show cap.
const MAX_EPISODES_PER_SHOW = 20
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
  args: { tmdbIds: v.array(v.number()), from: v.string(), to: v.string() },
  returns: v.object({
    entries: v.array(
      v.object({
        tmdbId: v.number(),
        status: v.union(v.string(), v.null()),
        episodes: v.array(scheduleEpisodeValidator),
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
    const fromMs = parseDayMs(args.from)
    const toMs = parseDayMs(args.to)
    if (fromMs === null || toMs === null || fromMs > toMs) {
      throw new Error("Invalid date range")
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

    // 3. Which seasons could contain episodes airing in [from, to]? (See
    //    the header comment for the candidate rules.)
    const seasonNeeds: { tmdbId: number; season: number }[] = []
    const pushNeed = (tmdbId: number, season: number) => {
      if (
        !seasonNeeds.some(
          (need) => need.tmdbId === tmdbId && need.season === season
        )
      ) {
        seasonNeeds.push({ tmdbId, season })
      }
    }
    for (let i = 0; i < ids.length; i++) {
      const summary = summaries[i]
      if (!summary) continue
      if (summary.nextEpisode !== null) {
        const airMs = parseDayMs(summary.nextEpisode.airDate)
        if (airMs !== null && airMs <= toMs) {
          pushNeed(ids[i], summary.nextEpisode.season)
        }
      }
      if (summary.lastEpisode !== null) {
        const airMs = parseDayMs(summary.lastEpisode.airDate)
        if (airMs !== null && airMs >= fromMs) {
          pushNeed(ids[i], summary.lastEpisode.season)
        }
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

    // 4. Build per-show entries: every candidate-season episode airing in
    //    [from, to].
    const out = []
    for (let i = 0; i < ids.length; i++) {
      const summary = summaries[i]
      if (summary === null) continue
      const episodes: {
        season: number
        episode: number
        name: string | null
        airDate: string | null
      }[] = []
      for (let n = 0; n < seasonNeeds.length; n++) {
        if (seasonNeeds[n].tmdbId !== ids[i]) continue
        const seasonData = seasonEpisodes[n]
        if (seasonData === null) continue
        for (const ep of seasonData.episodes) {
          const airMs = parseDayMs(ep.airDate)
          if (airMs === null || !inRange(airMs, fromMs, toMs)) {
            continue
          }
          episodes.push({
            season: seasonNeeds[n].season,
            episode: ep.episode,
            name: ep.name,
            airDate: ep.airDate,
          })
        }
      }
      if (episodes.length === 0) continue
      episodes.sort(
        (a, b) =>
          (a.airDate ?? "").localeCompare(b.airDate ?? "") ||
          a.season - b.season ||
          a.episode - b.episode
      )
      out.push({
        tmdbId: ids[i],
        status: summary.status,
        episodes: episodes.slice(0, MAX_EPISODES_PER_SHOW),
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
