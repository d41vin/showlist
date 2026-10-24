export function parseMediaId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 && String(id) === value ? id : null
}

export function parseTitlePath(pathname: string) {
  const match = /^\/(movie|tv)\/([^/]+)(\/recommendations)?$/.exec(pathname)
  if (!match) return null
  const tmdbId = parseMediaId(match[2])
  if (tmdbId === null) return null
  return {
    mediaType: match[1] as "movie" | "tv",
    tmdbId,
    recommendations: Boolean(match[3]),
  }
}

export function replaceSearchUrl(params: URLSearchParams) {
  window.history.replaceState(
    { showlistOrigin: window.history.state?.showlistOrigin },
    "",
    `/search${params.size ? `?${params}` : ""}`
  )
}
