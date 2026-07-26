import { v } from "convex/values"

import { action } from "./_generated/server"

const TMDB_BASE = "https://api.themoviedb.org/3"

const mediaTypeValidator = v.union(v.literal("movie"), v.literal("tv"))

// A minimal TMDB snapshot — the shape cards render from and mutations store.
export const searchResultValidator = v.object({
  tmdbId: v.number(),
  mediaType: mediaTypeValidator,
  title: v.string(),
  posterPath: v.union(v.string(), v.null()),
  year: v.union(v.string(), v.null()),
})

// Supports both TMDB v4 read access tokens (JWT) and v3 API keys.
async function tmdbFetch(path: string, params: Record<string, string>) {
  const key = process.env.TMDB_API_KEY
  if (!key) {
    throw new Error("TMDB_API_KEY is not set on the Convex deployment")
  }
  const url = new URL(`${TMDB_BASE}${path}`)
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  const headers: Record<string, string> = { accept: "application/json" }
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`
  } else {
    url.searchParams.set("api_key", key)
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

function yearOf(date: unknown): string | null {
  return typeof date === "string" && date.length >= 4 ? date.slice(0, 4) : null
}

export const search = action({
  args: { query: v.string() },
  returns: v.array(searchResultValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const query = args.query.trim()
    if (query === "") {
      return []
    }
    const data = await tmdbFetch("/search/multi", {
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
    })
    const results = Array.isArray(data.results) ? data.results : []
    return results
      .filter(
        (r: Record<string, unknown>) =>
          r.media_type === "movie" || r.media_type === "tv"
      )
      .map((r: Record<string, unknown>) => ({
        tmdbId: r.id as number,
        mediaType: r.media_type as "movie" | "tv",
        title: String(r.media_type === "movie" ? r.title : r.name),
        posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
        year: yearOf(r.media_type === "movie" ? r.release_date : r.first_air_date),
      }))
  },
})

export const details = action({
  args: { mediaType: mediaTypeValidator, tmdbId: v.number() },
  returns: v.object({
    overview: v.union(v.string(), v.null()),
    tagline: v.union(v.string(), v.null()),
    genres: v.array(v.string()),
    runtime: v.union(v.number(), v.null()),
    numberOfSeasons: v.union(v.number(), v.null()),
    numberOfEpisodes: v.union(v.number(), v.null()),
    voteAverage: v.union(v.number(), v.null()),
    releaseDate: v.union(v.string(), v.null()),
    backdropPath: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not signed in")
    }
    const data = await tmdbFetch(`/${args.mediaType}/${args.tmdbId}`, {
      language: "en-US",
    })
    const genres = Array.isArray(data.genres)
      ? data.genres
          .map((g: Record<string, unknown>) => g.name)
          .filter((name): name is string => typeof name === "string")
      : []
    return {
      overview: typeof data.overview === "string" ? data.overview : null,
      tagline:
        typeof data.tagline === "string" && data.tagline !== ""
          ? data.tagline
          : null,
      genres,
      runtime: typeof data.runtime === "number" ? data.runtime : null,
      numberOfSeasons:
        typeof data.number_of_seasons === "number"
          ? data.number_of_seasons
          : null,
      numberOfEpisodes:
        typeof data.number_of_episodes === "number"
          ? data.number_of_episodes
          : null,
      voteAverage:
        typeof data.vote_average === "number" ? data.vote_average : null,
      backdropPath:
        typeof data.backdrop_path === "string" ? data.backdrop_path : null,
      releaseDate:
        typeof (args.mediaType === "movie"
          ? data.release_date
          : data.first_air_date) === "string"
          ? String(
              args.mediaType === "movie"
                ? data.release_date
                : data.first_air_date
            )
          : null,
    }
  },
})
