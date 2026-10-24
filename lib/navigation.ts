export function parseMediaId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 && String(id) === value ? id : null
}

export function replaceSearchUrl(params: URLSearchParams) {
  window.history.replaceState(
    { showlistOrigin: window.history.state?.showlistOrigin },
    "",
    `/search${params.size ? `?${params}` : ""}`
  )
}
