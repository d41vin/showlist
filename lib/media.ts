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
