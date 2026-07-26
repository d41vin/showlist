"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useConvexAuth } from "convex/react"
import { useEffect, useRef, useState } from "react"

import { ShowCard } from "@/components/show-card"
import { Input } from "@/components/ui/input"
import { api } from "@/convex/_generated/api"
import type { MediaItem } from "@/lib/media"

const SEARCH_DEBOUNCE_MS = 400

export function AppShell() {
  const { isAuthenticated } = useConvexAuth()
  const search = useAction(api.tmdb.search)

  const [query, setQuery] = useState("")
  // Results/error are tagged with the query they belong to, so "searching"
  // is derived instead of tracked — stale responses simply never match.
  const [results, setResults] = useState<{
    query: string
    items: MediaItem[]
  } | null>(null)
  const [errorQuery, setErrorQuery] = useState<string | null>(null)
  // Guards against out-of-order responses from overlapping searches.
  const requestIdRef = useRef(0)

  const trimmedQuery = query.trim()
  const searchActive = trimmedQuery !== ""

  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!searchActive || !isAuthenticated) {
      return
    }
    const timeout = setTimeout(async () => {
      try {
        const items = await search({ query: trimmedQuery })
        if (requestIdRef.current === requestId) {
          setResults({ query: trimmedQuery, items })
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setErrorQuery(trimmedQuery)
        }
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [trimmedQuery, searchActive, isAuthenticated, search])

  const currentResults =
    results !== null && results.query === trimmedQuery ? results.items : null
  const currentError = errorQuery === trimmedQuery
  const searching = searchActive && currentResults === null && !currentError

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="relative mx-auto w-full max-w-xl">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search movies and shows..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search movies and shows"
        />
      </div>

      <div className="mt-8">
        {searchActive ? (
          <SearchResults
            results={currentResults}
            searching={searching}
            error={currentError}
            query={trimmedQuery}
          />
        ) : (
          /* Tabs (Watchlist / Watched / Collections) land in Session 2. */
          <div className="py-16 text-center text-sm text-muted-foreground">
            Your watchlist, watched list and collections will show up here.
          </div>
        )}
      </div>
    </main>
  )
}

function SearchResults({
  results,
  searching,
  error,
  query,
}: {
  results: MediaItem[] | null
  searching: boolean
  error: boolean
  query: string
}) {
  if (searching) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Searching…
      </p>
    )
  }
  if (error) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Something went wrong searching. Try again.
      </p>
    )
  }
  if (results === null) {
    return null
  }
  if (results.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No movies or shows found for &ldquo;{query}&rdquo;.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {results.map((item) => (
        <ShowCard key={`${item.mediaType}-${item.tmdbId}`} item={item} />
      ))}
    </div>
  )
}
